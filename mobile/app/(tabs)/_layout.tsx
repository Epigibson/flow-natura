import { Tabs } from 'expo-router';
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { HapticTab } from '@/components/haptic-tab';
import { useSidebar } from '../../components/SidebarContext';
import { useColorScheme } from 'nativewind';

// Palette centralizada — single source of truth
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  return {
    isDark,
    primary: isDark ? '#ffb783' : '#964900',
    primaryContainer: isDark ? '#753800' : '#f48120',
    secondary: isDark ? '#a3d961' : '#3c6a00',
    error: isDark ? '#ffb4ab' : '#ba1a1a',
    surface: isDark ? '#151210' : '#fef7ff',
    surfaceContainer: isDark ? '#221e1a' : '#f9f1fd',
    surfaceContainerHighest: isDark ? '#38322e' : '#e7e0eb',
    surfaceContainerLowest: isDark ? '#1c1917' : '#ffffff',
    onSurface: isDark ? '#e9e1dd' : '#1d1a22',
    onSurfaceVariant: isDark ? '#d3c4bc' : '#564336',
    outlineVariant: isDark ? '#4f453e' : '#ddc1b0',
    muted: isDark ? '#5a534e' : '#cccccc',
  };
}

function TabsLayout() {
  const { openSidebar } = useSidebar();
  const t = useThemeColors();
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.outlineVariant,
          borderTopWidth: 0.5,
          height: 65,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarButton: HapticTab,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ focused }) => (
            <View style={[{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }, focused && { backgroundColor: t.primaryContainer + '26' }]}>
              <MaterialIcons size={24} name="dashboard" color={focused ? t.primary : t.onSurfaceVariant} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ focused }) => (
            <View style={[{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }, focused && { backgroundColor: t.primaryContainer + '26' }]}>
              <MaterialIcons size={24} name="inventory-2" color={focused ? t.primary : t.onSurfaceVariant} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: '',
          tabBarButton: (props) => (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <TouchableOpacity
                onPress={props.onPress}
                activeOpacity={0.9}
                style={{
                  width: 56,
                  height: 56,
                  backgroundColor: t.primaryContainer,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20, 
                  shadowColor: t.primaryContainer,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 5,
                }}>
                <MaterialIcons name="add" size={30} color={t.isDark ? '#151210' : '#ffffff'} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ focused }) => (
            <View style={[{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }, focused && { backgroundColor: t.primaryContainer + '26' }]}>
              <MaterialIcons size={24} name="people" color={focused ? t.primary : t.onSurfaceVariant} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Más',
          tabBarButton: () => (
             <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => openSidebar()} 
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
               <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }}>
                 <MaterialIcons size={24} name="menu" color={t.onSurfaceVariant} />
               </View>
               <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 2, color: t.onSurfaceVariant }}>Menú</Text>
             </TouchableOpacity>
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return <TabsLayout />;
}
