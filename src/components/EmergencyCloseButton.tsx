import React, { useRef } from 'react';
import { Animated, BackHandler, PanResponder, Pressable, StyleSheet, View } from 'react-native';

/**
 * Panik butonu — sohbet/kişi ekranlarında her zaman görünen, sürüklenebilir
 * küçük bir buton. Tek dokunuşta uygulamayı komple kapatır (BackHandler.exitApp),
 * böylece ekranda hiçbir sohbet izi kalmadan anında ana ekrana dönülür; bir
 * sonraki açılışta uygulama zaten sahte oyun menüsüyle (GameHubScreen) başlar.
 * Kasıtlı olarak nötr/göze batmayan bir görünümde — bir "acil kapat" yazısı
 * yerine sade bir nokta/tutamaç gibi duruyor.
 */
function EmergencyCloseButton(): React.JSX.Element {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const dragged = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3,
      onPanResponderGrant: () => {
        dragged.current = false;
      },
      onPanResponderMove: (_evt, gesture) => {
        if (Math.abs(gesture.dx) > 3 || Math.abs(gesture.dy) > 3) {
          dragged.current = true;
        }
        pan.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: () => {
        pan.extractOffset();
      },
    }),
  ).current;

  const handlePress = () => {
    if (dragged.current) {
      // Bir sürükleme hareketinin sonundaki bırakma dokunuşunu kapatma
      // olarak saymayalım — yanlışlıkla taşırken uygulamanın kapanmasını
      // istemiyoruz.
      return;
    }
    BackHandler.exitApp();
  };

  return (
    <Animated.View
      style={[styles.wrap, { transform: pan.getTranslateTransform() }]}
      {...panResponder.panHandlers}>
      <Pressable style={styles.button} onPress={handlePress} hitSlop={14} accessibilityLabel="Kapat">
        <View style={styles.dot} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 14,
    bottom: 90,
    zIndex: 999,
    elevation: 999,
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
});

export default EmergencyCloseButton;
