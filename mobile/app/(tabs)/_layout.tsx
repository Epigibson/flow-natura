import { Tabs } from 'expo-router';
import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { HapticTab } from '@/components/haptic-tab';
import { useSidebar } from '../../components/SidebarContext';
import { useColorScheme } from 'nativewind';

function TabsLayout() {
  const { openSidebar } = useSidebar();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = {
    bg: isDark ? '#151210' : '#fef7ff',
    border: isDark ? '#38322e' : '#e7e0eb',
    active: isDark ? '#ffb783' : '#964900',
    inactive: isDark ? '#d3c4bc' : '#564336',
    fab: isDark ? '#ffb783' : '#f48120',
    fabShadow: isDark ? '#ffb783' : '#f48120',
    focusBg: isDark ? 'rgba(255,183,131,0.15)' : 'rgba(244,129,32,0.15)',
  };
  
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
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
          tabBarIcon: ({ color, focused }) => (
            <View style={[{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }, focused && { backgroundColor: colors.focusBg }]}>
              <MaterialIcons size={24} name="dashboard" color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ color, focused }) => (
            <View style={[{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }, focused && { backgroundColor: colors.focusBg }]}>
              <MaterialIcons size={24} name="inventory-2" color={color} />
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
                  backgroundColor: colors.fab,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 20, 
                  shadowColor: colors.fabShadow,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 5,
                }}>
                <MaterialIcons name="add" size={30} color={isDark ? '#151210' : '#ffffff'} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ color, focused }) => (
            <View style={[{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }, focused && { backgroundColor: colors.focusBg }]}>
              <MaterialIcons size={24} name="people" color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'Más',
          tabBarButton: (props) => (
             <TouchableOpacity 
                activeOpacity={0.7}
                onPress={() => openSidebar()} 
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
               <View style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }}>
                 <MaterialIcons size={24} name="menu" color={colors.inactive} />
               </View>
               <Text style={{ fontSize: 10, fontWeight: '700', marginTop: 2, color: colors.inactive }}>Menú</Text>
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
