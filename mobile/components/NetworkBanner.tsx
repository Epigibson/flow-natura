import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

interface NetworkBannerProps {
  /** Called when user taps Reintentar */
  onRetry?: () => void;
}

/**
 * Displays a sleek warning banner when device is offline.
 * Auto-hides with animation when connection is restored.
 */
export function NetworkBanner({ onRetry }: NetworkBannerProps) {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
      Animated.spring(slideAnim, {
        toValue: offline ? 0 : -60,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }).start();
    });

    return () => unsubscribe();
  }, [slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View
      style={{
        transform: [{ translateY: slideAnim }],
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#7c2d12',
        paddingVertical: 10,
        paddingHorizontal: 16,
        gap: 8,
      }}>
        <MaterialIcons name="wifi-off" size={16} color="#fed7aa" />
        <Text style={{ color: '#fed7aa', fontWeight: '700', fontSize: 12 }}>
          Sin conexión a internet
        </Text>
        {onRetry && (
          <TouchableOpacity
            onPress={onRetry}
            style={{
              backgroundColor: 'rgba(254,215,170,0.2)',
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 12,
              marginLeft: 8,
            }}
          >
            <Text style={{ color: '#fed7aa', fontWeight: '700', fontSize: 11 }}>Reintentar</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}
