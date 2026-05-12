import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { SidebarProvider } from '@/components/SidebarContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const inAuthGroup = segments[0] !== 'login';
      
      if (!session && inAuthGroup) {
        // Redirect to the login page.
        router.replace('/login');
      } else if (session && segments[0] === 'login') {
        // Redirect away from the login page.
        router.replace('/(tabs)');
      }
      setSessionChecked(true);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      const inAuthGroup = segments[0] !== 'login';
      if (!session && inAuthGroup) {
        router.replace('/login');
      } else if (session && segments[0] === 'login') {
        router.replace('/(tabs)');
      }
    });
  }, [segments]);

  if (!sessionChecked) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View className={`flex-1 ${colorScheme === 'dark' ? 'dark bg-surface' : 'bg-surface'}`}>
        <SidebarProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            {/* We will register secondary routes here to ensure they don't have default headers */}
            <Stack.Screen name="reports/index" options={{ headerShown: false }} />
            <Stack.Screen name="community/index" options={{ headerShown: false }} />
            <Stack.Screen name="mentoring/index" options={{ headerShown: false }} />
            <Stack.Screen name="membership/index" options={{ headerShown: false }} />
            <Stack.Screen name="achievements/index" options={{ headerShown: false }} />
            <Stack.Screen name="catalog/index" options={{ headerShown: false }} />
            <Stack.Screen name="support/index" options={{ headerShown: false }} />
            <Stack.Screen name="settings/index" options={{ headerShown: false }} />
            <Stack.Screen name="sales/new" options={{ headerShown: false }} />
            <Stack.Screen name="inventory/new" options={{ headerShown: false }} />
            <Stack.Screen name="inventory/adjustments" options={{ headerShown: false }} />
          </Stack>
        </SidebarProvider>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </View>
    </ThemeProvider>
  );
}
