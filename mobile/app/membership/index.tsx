import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { supabase } from '../../lib/supabase';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function MembershipScreen() {
  const t = useThemeColors();
  const [profile, setProfile] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [profData, subData] = await Promise.all([
        api.consultant.getProfile(),
        api.consultant.getSubscription()
      ]);
      setProfile(profData);
      setSubscription(subData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const getPlanName = (plan: string) => {
    if (plan === 'trial') return 'Prueba Gratuita';
    if (plan === 'pro') return 'Suscripción Pro';
    return 'Plan Básico';
  };

  const getStatusColor = (status: string) => {
    if (status === 'trialing' || status === 'active') return 'text-primary';
    if (status === 'canceled') return 'text-error';
    return 'text-on-surface-variant';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Desconocido';
    return new Date(dateString).toLocaleDateString('es-MX', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const handleLogout = async () => {
    Alert.alert(
      "Cerrar Sesión",
      "¿Estás seguro que deseas salir de tu cuenta?",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Salir", 
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) Alert.alert("Error", "No se pudo cerrar sesión");
          }
        }
      ]
    );
  };

  return (
    <SecondaryLayout title="Mi Perfil 💎">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color={t.primary} />
          </View>
        ) : (
          <>
            {/* Perfil */}
            <View className="items-center mb-8">
              <View className="w-24 h-24 rounded-full bg-primary-container flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
                <Text className="font-serif font-bold text-4xl text-primary">
                  {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'C'}
                </Text>
              </View>
              <Text className="text-2xl font-bold font-serif text-on-surface">{profile?.full_name || 'Consultor Natura'}</Text>
              <Text className="text-on-surface-variant font-mono mt-1">Natura ID: {profile?.natura_code || '---'}</Text>
            </View>

            {/* Membresía Card */}
            <View className="bg-surface-container-highest p-6 rounded-3xl mb-8 relative overflow-hidden shadow-sm">
              <View className="absolute -right-6 -top-6 w-32 h-32 bg-primary/5 rounded-full" />
              <Text className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant mb-1">Plan Actual</Text>
              <Text className={`text-2xl font-serif font-bold mb-1 ${getStatusColor(subscription?.status)}`}>
                {getPlanName(subscription?.plan)}
              </Text>
              <View className="bg-surface-container w-24 rounded-full py-0.5 items-center mb-3">
                <Text className="text-[10px] font-bold text-on-surface uppercase">{subscription?.status || 'Inactivo'}</Text>
              </View>

              <Text className="text-sm text-on-surface-variant mb-4">
                Acceso total a inventario, catálogo ilimitado y métricas avanzadas.
              </Text>
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="event" size={16} color={t.muted} />
                <Text className="text-xs font-bold text-on-surface-variant">
                  {subscription?.status === 'trialing' ? 'Prueba finaliza: ' : 'Próximo cobro: '}
                  {formatDate(subscription?.current_period_end || subscription?.trial_ends_at)}
                </Text>
              </View>
            </View>

            {/* Settings Links */}
            <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden">
              <TouchableOpacity className="flex-row items-center justify-between p-4 border-b border-outline-variant/10">
                <View className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <MaterialIcons name="credit-card" size={18} color={t.onSurfaceVariant} />
                  </View>
                  <Text className="font-bold text-on-surface">Actualizar Pago</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={t.muted} />
              </TouchableOpacity>
              
              <TouchableOpacity className="flex-row items-center justify-between p-4" onPress={handleLogout}>
                <View className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center">
                    <MaterialIcons name="logout" size={18} color={t.error} />
                  </View>
                  <Text className="font-bold text-error">Cerrar Sesión de Natura</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={t.muted} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SecondaryLayout>
  );
}
