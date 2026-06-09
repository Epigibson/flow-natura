import { Tabs, router } from 'expo-router';
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="dashboard" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="inventory-2" color={color} />
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
                activeOpacity={0.9}
                style={{
                  width: 56,
                  height: 56,
                  backgroundColor: t.primary,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20, 
                  shadowColor: t.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 6,
                  elevation: 5,
                }}>
                <MaterialIcons name="add" size={30} color={t.isDark ? '#09090B' : '#ffffff'} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ color }) => (
            <MaterialIcons size={24} name="people" color={color} />
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
                 <MaterialIcons size={24} name="menu" color={t.onSurfaceVariant} />
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
