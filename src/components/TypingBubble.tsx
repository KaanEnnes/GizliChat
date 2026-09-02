import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const DOT_DELAYS_MS = [0, 150, 300];

/** WhatsApp-style bouncing three-dot bubble, shown as the message list's footer while the contact is typing (see ChatRoomScreen's isContactTyping / TYPING_TIMEOUT_MS). */
function TypingBubble(): React.JSX.Element {
  const { theme } = useTheme();
  const dotValues = useRef(DOT_DELAYS_MS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = dotValues.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(DOT_DELAYS_MS[i]),
          Animated.timing(value, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 360, useNativeDriver: true }),
          Animated.delay(1200 - 720 - DOT_DELAYS_MS[i]),
        ]),
      ),
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, [dotValues]);

  return (
    <View style={styles.row}>
      <View style={[styles.bubble, { backgroundColor: theme.bubbleOther }]}>
        {dotValues.map((value, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: theme.bubbleOtherText,
                opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
                transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-start',
    marginVertical: 3,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
});

export default TypingBubble;
