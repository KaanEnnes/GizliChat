import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { type ChatMessage, subscribeToMessageById } from '../services/chatService';
import { buildMapsUrl } from '../services/locationService';

interface Props {
  roomId: string;
  message: ChatMessage;
  onClose: () => void;
}

/** Matches the RN app's LocationMapModal: how often the map re-centers and the freshness label re-computes. */
const MAP_REFRESH_INTERVAL_MS = 15_000;
/** Beyond this, the last fix is old enough to call out rather than quietly show as live. */
const STALE_AFTER_MS = 60_000;

const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

/**
 * Loads Leaflet from the CDN on first use instead of bundling it. Keeps the
 * main bundle (already ~1.1MB) from growing for a view most sessions never
 * open, and mirrors how the RN client pulls Leaflet into its WebView.
 */
let leafletPromise: Promise<unknown> | null = null;
function ensureLeaflet(): Promise<unknown> {
  if (leafletPromise) {
    return leafletPromise;
  }
  leafletPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { L?: unknown }).L) {
      resolve((window as unknown as { L: unknown }).L);
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve((window as unknown as { L: unknown }).L);
    script.onerror = () => reject(new Error('Harita yüklenemedi'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

/**
 * Full-screen in-app map for a 'location' message — the web counterpart of the
 * RN app's LocationMapModal, deliberately kept behaviourally identical: static
 * pin for a one-off location, and for an active "canlı konum" share a pin that
 * follows the sender's fixes, a trail of the path travelled, a periodic
 * re-center, and a freshness/countdown label that calls out a stale share.
 */
function LocationMapModal({ roomId, message, onClose }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Leaflet objects are plain mutable instances, not React state — keeping
  // them in refs avoids re-creating the map on every coordinate update.
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const trailRef = useRef<any>(null);

  const [coords, setCoords] = useState({ latitude: message.latitude ?? 0, longitude: message.longitude ?? 0 });
  const [isLive, setIsLive] = useState(message.liveLocation === true);
  const [expiresAt, setExpiresAt] = useState(message.liveExpiresAt);
  const [lastFixAt, setLastFixAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  // Build the map once per opened message.
  useEffect(() => {
    let cancelled = false;
    ensureLeaflet()
      .then(L2 => {
        const L = L2 as any;
        if (cancelled || !containerRef.current || mapRef.current) {
          return;
        }
        const lat = message.latitude ?? 0;
        const lng = message.longitude ?? 0;
        const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 16);
        // Esri's World Street Map, served key-free from ArcGIS Online — see
        // the RN LocationMapModal for why neither raw OSM tiles (hiking-map
        // look) nor CARTO basemaps (now key-gated, returns tiles stamped
        // "API KEY REQUIRED") work here. Note ArcGIS's {z}/{y}/{x} row-before-
        // column order rather than Leaflet's usual {z}/{x}/{y}. Kept light in
        // dark mode too, matching WhatsApp.
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: 'Tiles &copy; Esri',
        }).addTo(map);

        const icon = L.divIcon({
          className: '',
          html:
            '<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,0.3))">' +
            '<path d="M16 0C7.7 0 1 6.7 1 15c0 10.6 13.2 25.4 13.8 26a1.7 1.7 0 0 0 2.4 0C17.8 40.4 31 25.6 31 15 31 6.7 24.3 0 16 0z" fill="#EA4335"/>' +
            '<circle cx="16" cy="15" r="5.4" fill="#ffffff"/></svg>',
          iconSize: [32, 42],
          iconAnchor: [16, 41],
        });
        markerRef.current = L.marker([lat, lng], { icon }).addTo(map);
        trailRef.current = L.polyline([[lat, lng]], { color: '#1a73e8', weight: 4, opacity: 0.75 }).addTo(map);
        mapRef.current = map;
        // The container is sized by CSS after mount; without this Leaflet can
        // latch onto a zero/short height and render only a strip of tiles.
        setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Harita yüklenemedi — internet bağlantını kontrol et.');
        }
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        trailRef.current = null;
      }
    };
  }, [message.id, message.latitude, message.longitude]);

  // Only an active share needs a listener — a one-off pin never changes.
  useEffect(() => {
    if (message.liveLocation !== true) {
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
  }, [roomId, message.id, message.liveLocation]);

  // New fix -> move the pin immediately, without stealing the user's pan.
  useEffect(() => {
    if (markerRef.current && trailRef.current) {
      markerRef.current.setLatLng([coords.latitude, coords.longitude]);
      trailRef.current.addLatLng([coords.latitude, coords.longitude]);
    }
  }, [coords]);

  // The periodic refresh: re-center on the latest fix and re-tick the labels.
  useEffect(() => {
    if (!isLive) {
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
      if (mapRef.current) {
        mapRef.current.panTo([coords.latitude, coords.longitude]);
      }
    }, MAP_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isLive, coords]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
    <div className="location-map-overlay" style={{ background: theme.background }}>
      <div className="location-map-header" style={{ borderBottomColor: theme.border }}>
        <button type="button" className="location-map-close" style={{ color: theme.textMuted }} onClick={onClose}>
          ‹ Kapat
        </button>
        <div className="location-map-headtext">
          <div className="location-map-title" style={{ color: theme.text }}>
            {isLive && !isStale && <span className="location-map-livedot" style={{ background: theme.danger }} />}
            {isLive ? 'Canlı Konum' : 'Konum'}
          </div>
          <div className="location-map-subtitle" style={{ color: isStale ? theme.warning : theme.textMuted }}>
            {statusText}
          </div>
        </div>
      </div>

      <div className="location-map-canvas">
        <div ref={containerRef} className="location-map-leaflet" />
        {error && (
          <div className="location-map-error" style={{ color: theme.textMuted }}>
            {error}
          </div>
        )}
      </div>

      <div className="location-map-footer" style={{ borderTopColor: theme.border }}>
        <a
          className="location-map-open"
          style={{ background: theme.accent, color: theme.accentText }}
          href={buildMapsUrl(coords.latitude, coords.longitude)}
          target="_blank"
          rel="noopener noreferrer">
          Harita Uygulamasında Aç
        </a>
      </div>
    </div>
  );
}

export default LocationMapModal;
