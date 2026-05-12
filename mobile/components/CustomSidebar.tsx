import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Animated, StyleSheet, Dimensions, ScrollView, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { supabase } from '../lib/supabase';
import api from '../../src/lib/api';
import { useColorScheme } from 'nativewind';

interface SidebarProps {
  visible: boolean;
  onClose: () => void;
}

const { width } = Dimensions.get('window');
const DRAWER_WIDTH = width * 0.75 > 300 ? 300 : width * 0.75;

export default function CustomSidebar({ visible, onClose }: SidebarProps) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pathname = usePathname();
  const [profile, setProfile] = useState<any>(null);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = {
    bg: isDark ? '#151210' : '#fef7ff',
    text: isDark ? '#e9e1dd' : '#1d1a22',
    textSecondary: isDark ? '#d3c4bc' : '#564336',
    active: isDark ? '#ffb783' : '#964900',
    activeBg: isDark ? 'rgba(255,183,131,0.15)' : 'rgba(244,129,32,0.15)',
    cardBg: isDark ? 'rgba(255,183,131,0.08)' : 'rgba(244,129,32,0.05)',
    cardBorder: isDark ? 'rgba(255,183,131,0.15)' : 'rgba(244,129,32,0.1)',
    brandBg: isDark ? '#1c1917' : '#ffffff',
    brandBorder: isDark ? '#38322e' : '#ddc1b0',
    logoutBg: isDark ? 'rgba(255,180,171,0.15)' : 'rgba(186,26,26,0.1)',
    logoutColor: isDark ? '#ffb4ab' : '#ba1a1a',
    sectionLabel: isDark ? 'rgba(209,196,188,0.6)' : 'rgba(86,67,54,0.6)',
    primaryLetter: isDark ? '#ffb783' : '#964900',
  };

  useEffect(() => {
    if (visible) {
      loadProfileData();
    }
  }, [visible]);

  const loadProfileData = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        // Set email immediately as fallback
        setProfile({ email: data.session.user.email });
        
        try {
          const fullProfile = await api.consultant.getProfile();
          if (fullProfile) {
            setProfile({ email: data.session.user.email, ...fullProfile });
          }
        } catch (profileErr) {
          console.log('No profile found or error fetching:', profileErr);
        }
      }
    } catch (err) {
      console.log('Error loading session in sidebar:', err);
    }
  };

  const username = profile?.full_name || profile?.email?.split('@')[0] || 'Consultora';
  const avatarUrl = profile?.avatar_url || `https://api.dicebear.com/8.x/micah/png?seed=${username}`;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const handleNavigate = (path: any) => {
    onClose();
    router.push(path);
  };

  const handleLogout = async () => {
    onClose();
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (!visible && slideAnim.setOffset === undefined) return null;

  const NavItem = ({ icon, label, path }: { icon: any, label: string, path: string }) => {
    const isActive = pathname === path || (path !== '/' && pathname.startsWith(path));
    return (
      <TouchableOpacity 
        onPress={() => handleNavigate(path)}
        style={[
          { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 4 },
          isActive && { backgroundColor: colors.activeBg }
        ]}
      >
        <MaterialIcons name={icon} size={24} color={isActive ? colors.active : colors.textSecondary} />
        <Text style={{ fontWeight: '700', fontSize: 14, color: isActive ? colors.active : colors.textSecondary }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        </Animated.View>

        {/* Drawer */}
        <Animated.View 
          style={{ 
            width: DRAWER_WIDTH, 
            height: '100%', 
            backgroundColor: colors.bg,
            transform: [{ translateX: slideAnim }],
            shadowColor: '#000',
            shadowOffset: { width: 5, height: 0 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingTop: 32 }} showsVerticalScrollIndicator={false}>
            {/* Brand */}
            <View style={{ marginBottom: 32, marginTop: 16, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.brandBg, borderWidth: 1, borderColor: colors.brandBorder, alignItems: 'center', justifyContent: 'center' }}>
                 <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primaryLetter }}>N</Text>
              </View>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Natura Manager</Text>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 2 }}>Business Suite</Text>
              </View>
            </View>

            {/* User Card */}
            <View style={{ marginBottom: 24, paddingHorizontal: 12, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.activeBg, borderWidth: 1, borderColor: colors.cardBorder }}>
                <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }} numberOfLines={1}>{username}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? '#a3d961' : '#3c6a00' }} />
                  <Text style={{ fontSize: 10, color: colors.active, fontWeight: '700' }}>Online</Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleLogout} style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.logoutBg }}>
                <MaterialIcons name="logout" size={18} color={colors.logoutColor} />
              </TouchableOpacity>
            </View>

            {/* Navigation */}
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.sectionLabel, marginBottom: 8, paddingHorizontal: 16 }}>Negocio</Text>
              <NavItem icon="dashboard" label="Dashboard" path="/" />
              <NavItem icon="inventory-2" label="Inventario" path="/inventory" />
              <NavItem icon="people" label="Mis Clientes" path="/customers" />
              <NavItem icon="point-of-sale" label="Ventas" path="/sales" />
              <NavItem icon="insights" label="Reportes" path="/reports" />

              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.sectionLabel, marginBottom: 8, paddingHorizontal: 16, marginTop: 24 }}>Experiencia</Text>
              <NavItem icon="forum" label="Comunidad" path="/community" />
              <NavItem icon="school" label="Mentoría" path="/mentoring" />
              <NavItem icon="card-membership" label="Membresía" path="/membership" />
              <NavItem icon="emoji-events" label="Logros" path="/achievements" />

              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.sectionLabel, marginBottom: 8, paddingHorizontal: 16, marginTop: 24 }}>Herramientas</Text>
              <NavItem icon="storefront" label="Catálogo" path="/catalog" />
              <NavItem icon="support-agent" label="Soporte" path="/support" />
              <NavItem icon="settings" label="Ajustes" path="/settings" />
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
