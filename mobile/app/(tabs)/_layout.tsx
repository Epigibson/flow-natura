import { Tabs, router } from 'expo-router';
import React from 'react';
import { View, TouchableOpacity, Text, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSidebar } from '../../components/SidebarContext';
import { useThemeColors } from '../../hooks/use-theme-colors';

function TabsLayout() {
  const { openSidebar } = useSidebar();
  const t = useThemeColors();
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : t.surface + 'F5',
          borderTopColor: t.outlineVariant + '40',
          borderTopWidth: 0.3,
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => 
          Platform.OS === 'ios' ? (
            <BlurView 
              intensity={80} 
              tint={t.isDark ? 'dark' : 'light'} 
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} 
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.3,
          marginTop: 2,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons size={focused ? 26 : 24} name="dashboard" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons size={focused ? 26 : 24} name="inventory-2" color={color} />
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
                onPress={() => router.push('/sales/new')}
                activeOpacity={0.85}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 24, 
                  shadowColor: '#8B5E3C',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.35,
                  shadowRadius: 12,
                  elevation: 8,
                  // Premium gradient effect via layered background
                  backgroundColor: t.isDark ? '#E8B88A' : '#8B5E3C',
                }}>
                {/* Inner glow overlay */}
                <View style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  borderRadius: 20,
                  backgroundColor: t.isDark ? '#D4A574' : '#A67B5B',
                  opacity: 0.5,
                }} />
                <MaterialIcons name="add" size={30} color={t.isDark ? '#121210' : '#FFFFFF'} />
              </TouchableOpacity>
              <Text style={{ 
                fontSize: 9, 
                fontWeight: '700', 
                color: t.primary,
                marginTop: -18,
                letterSpacing: 0.5,
              }}>
                VENTA
              </Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons size={focused ? 26 : 24} name="people" color={color} />
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
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                 <MaterialIcons size={24} name="menu" color={t.muted} />
               <Text style={{ fontSize: 10, fontWeight: '600', marginTop: 2, color: t.muted, letterSpacing: 0.3 }}>Menú</Text>
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
