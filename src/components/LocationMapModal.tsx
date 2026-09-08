import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { ChatMessage, subscribeToMessageById } from '../services/chatService';
import { buildMapsUrl } from '../services/locationService';

interface Props {
  visible: boolean;
  roomId: string;
  message: ChatMessage;
  onClose: () => void;
}

/**
 * How often the map re-centers on the newest fix and the "son güncelleme"
 * label re-computes. Firestore already pushes each new fix the instant the
 * sender writes it, so this timer isn't what makes the pin move — it's the
 * periodic refresh that keeps the *view* honest: it re-centers if the user
 * has panned away, and keeps the freshness label ticking so a share that has
 * silently gone stale (sender backgrounded the app, lost GPS) is visible as
 * stale instead of looking current forever.
 */
const MAP_REFRESH_INTERVAL_MS = 15_000;

/** Beyond this, the last fix is old enough to call out rather than quietly show as live. */
const STALE_AFTER_MS = 60_000;

function buildMapHtml(latitude: number, longitude: number): string {
  // Esri's World Street Map, served key-free from ArcGIS Online. Two earlier
  // attempts failed and are worth not repeating:
  //   - raw openstreetmap.org: the stock style paints every footpath and
  //     boundary in saturated pink/red and reads as a hiking map, not the calm
  //     Google-Maps look expected of a pin shared in a chat.
  //   - CARTO basemaps: these now require an API key and silently return
  //     tiles stamped "API KEY REQUIRED" instead of failing outright.
  // Google's own tiles can't be used at all — their terms only allow serving
  // them through Google's SDKs/Maps API, which is the API key + billing this
  // whole approach avoids. Note the {z}/{y}/{x} (row before column) order,
  // which is ArcGIS's convention and NOT Leaflet's usual {z}/{x}/{y}.
  //
  // Deliberately the same light street map in dark mode too: WhatsApp also
  // shows a light map for a shared location regardless of app theme, and the
  // dark canvas alternatives drop most labels, which makes a pin harder to
  // place.
  const tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #eef1f5; }
  .pin { filter: drop-shadow(0 3px 4px rgba(0,0,0,0.3)); }
  /* Attribution is required by the tile licence, but kept tiny
     and muted so it reads as a footnote rather than map furniture. */
  .leaflet-control-attribution { font-size: 9px; opacity: 0.65; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([${latitude}, ${longitude}], 16);
  L.tileLayer('${tileUrl}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri',
  }).addTo(map);
  // Teardrop pin in the same spirit as the one WhatsApp drops on a shared
  // location, instead of the emoji glyph this used to render (which picked up
  // the system font and looked different on every device).
  var icon = L.divIcon({
    className: '',
    html: '<svg class="pin" width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M16 0C7.7 0 1 6.7 1 15c0 10.6 13.2 25.4 13.8 26a1.7 1.7 0 0 0 2.4 0C17.8 40.4 31 25.6 31 15 31 6.7 24.3 0 16 0z" fill="#EA4335"/>' +
          '<circle cx="16" cy="15" r="5.4" fill="#ffffff"/></svg>',
    iconSize: [32, 42],
    iconAnchor: [16, 41],
  });
  var marker = L.marker([${latitude}, ${longitude}], { icon: icon }).addTo(map);
  var trail = L.polyline([[${latitude}, ${longitude}]], { color: '#1a73e8', weight: 4, opacity: 0.75 }).addTo(map);

  // Called from React Native via injectJavaScript on every new fix and on
  // each refresh tick — moving the existing marker instead of reloading the
  // whole page keeps the user's zoom level and avoids re-fetching tiles.
  window.updatePosition = function (lat, lng, recenter) {
    marker.setLatLng([lat, lng]);
    trail.addLatLng([lat, lng]);
    if (recenter) {
      map.panTo([lat, lng]);
    }
  };
</script>
</body>
</html>`;
}

/**
 * Full-screen in-app map for a 'location' message. For a one-off pin this is
 * just a static map; for an active "canlı konum" share it subscribes to the
 * message doc so the pin moves as the sender's fixes land, draws the path
 * travelled so far, and re-centers on a timer (see MAP_REFRESH_INTERVAL_MS).
 * Opening the device's real maps app is still offered as a secondary action.
 */
function LocationMapModal({ visible, roomId, message, onClose }: Props): React.JSX.Element | null {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [coords, setCoords] = useState({ latitude: message.latitude ?? 0, longitude: message.longitude ?? 0 });
  const [isLive, setIsLive] = useState(message.liveLocation === true);
  const [expiresAt, setExpiresAt] = useState(message.liveExpiresAt);
  const [lastFixAt, setLastFixAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [mapReady, setMapReady] = useState(false);

  // Captured once per open: reloading the WebView on every incoming fix would
  // reset zoom/pan and re-download tiles, so the HTML is seeded with the
  // first position and every later fix is pushed in via injectJavaScript.
  const initialHtml = useMemo(
    () => buildMapHtml(message.latitude ?? 0, message.longitude ?? 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [message.id, visible],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setCoords({ latitude: message.latitude ?? 0, longitude: message.longitude ?? 0 });
    setIsLive(message.liveLocation === true);
    setExpiresAt(message.liveExpiresAt);
    setLastFixAt(Date.now());
    setMapReady(false);
  }, [visible, message.id, message.latitude, message.longitude, message.liveLocation, message.liveExpiresAt]);

  // Only an active share needs a listener — a one-off pin never changes, so
  // subscribing to it would just burn a Firestore listener for nothing.
  useEffect(() => {
    if (!visible || message.liveLocation !== true) {
      return;
    }
    return subscribeToMessageById(roomId, message.id, updated => {
      if (!updated || updated.latitude === undefined || updated.longitude === undefined) {
        return;
      }
      setCoords(previous => {
        if (previous.latitude === updated.latitude && previous.longitude === updated.longitude) {
          return previous;
        }
        setLastFixAt(Date.now());
        return { latitude: updated.latitude!, longitude: updated.longitude! };
      });
      setIsLive(updated.liveLocation === true);
      setExpiresAt(updated.liveExpiresAt);
    });
  }, [visible, roomId, message.id, message.liveLocation]);

  const pushPosition = useCallback((recenter: boolean) => {
    webViewRef.current?.injectJavaScript(
      `window.updatePosition && window.updatePosition(${coords.latitude}, ${coords.longitude}, ${recenter}); true;`,
    );
  }, [coords]);

  // New fix -> move the pin immediately (without stealing the user's pan).
  useEffect(() => {
    if (mapReady) {
      pushPosition(false);
    }
  }, [coords, mapReady, pushPosition]);

  // The periodic refresh itself: re-center on the latest fix and re-tick the
  // freshness/countdown labels. Runs only while a live share is actually open.
  useEffect(() => {
    if (!visible || !isLive) {
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
      pushPosition(true);
    }, MAP_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [visible, isLive, pushPosition]);

  if (!visible) {
    return null;
  }

  const secondsSinceFix = Math.round((now - lastFixAt) / 1000);
  const isStale = isLive && now - lastFixAt > STALE_AFTER_MS;
  const minutesLeft = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 60000)) : null;

  let statusText: string;
  if (!isLive) {
    statusText = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  } else if (isStale) {
    statusText = `Son güncelleme ${Math.round(secondsSinceFix / 60)} dk önce — konum güncellenmiyor olabilir`;
  } else {
    statusText = `${secondsSinceFix < 10 ? 'Az önce' : `${secondsSinceFix} sn önce`} güncellendi${
      minutesLeft !== null ? ` · ${minutesLeft} dk kaldı` : ''
    }`;
  }

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Haritayı kapat">
            <Text style={[styles.close, { color: theme.textMuted }]}>‹ Kapat</Text>
          </Pressable>
          <View style={styles.headerTextWrap}>
            <View style={styles.titleRow}>
              {isLive && !isStale && <View style={[styles.liveDot, { backgroundColor: theme.danger }]} />}
              <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                {isLive ? 'Canlı Konum' : 'Konum'}
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: isStale ? theme.warning : theme.textMuted }]} numberOfLines={1}>
              {statusText}
            </Text>
          </View>
        </View>

        <View style={styles.mapWrap}>
          <WebView
            ref={webViewRef}
            source={{ html: initialHtml }}
            originWhitelist={['*']}
            onLoadEnd={() => setMapReady(true)}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={[styles.loading, { backgroundColor: theme.background }]}>
                <ActivityIndicator color={theme.identity} />
              </View>
            )}
          />
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: theme.border }]}>
          <Pressable
            onPress={() => Linking.openURL(buildMapsUrl(coords.latitude, coords.longitude)).catch(() => undefined)}
            style={[styles.openButton, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Harita uygulamasında aç">
            <Text style={[styles.openButtonText, { color: theme.accentText }]}>Harita Uygulamasında Aç</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  close: {
    fontSize: 15,
    fontWeight: '600',
    marginRight: 14,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  mapWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  openButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  openButtonText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
});

export default LocationMapModal;
