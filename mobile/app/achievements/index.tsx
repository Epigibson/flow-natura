import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function AchievementsScreen() {
  const t = useThemeColors();
  const [profile, setProfile] = useState<any>(null);
  const [salesTotal, setSalesTotal] = useState(0);
  const [customersCount, setCustomersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [profData, ordersData, customersData] = await Promise.all([
        api.consultant.getProfile(),
        api.orders.list(),
        api.customers.list()
      ]);
      setProfile(profData);
      
      const total = (ordersData || []).reduce((acc: number, curr: any) => acc + Number(curr.total_amount || 0), 0);
      setSalesTotal(total);
      setCustomersCount((customersData || []).length);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Dynamic calculation
  const level = profile?.level || 'Semilla'; // Default
  const isBronce = salesTotal >= 5000 || level === 'Bronce' || level === 'Plata' || level === 'Oro';
  const isPlata = salesTotal >= 10000 || level === 'Plata' || level === 'Oro';
  const hasFirstOrder = salesTotal > 0;
  const hasFirstCustomer = customersCount > 0;

  const achievements = [
    { title: 'Primeros Pasos', desc: 'Realiza tu primer pedido de Natura.', icon: 'star-outline', done: hasFirstOrder },
    { title: 'Red de Apoyo', desc: 'Añade a tu primer cliente al directorio.', icon: 'group-add', done: hasFirstCustomer },
    { title: 'Vendedor Bronce', desc: 'Acumula $5,000 en ventas este ciclo.', icon: 'military-tech', done: isBronce },
    { title: 'Vendedor Plata', desc: 'Acumula $10,000 en ventas este ciclo.', icon: 'military-tech', done: isPlata },
  ];

  // Logic for the top banner
  let nextGoal = 5000;
  let nextLevelName = 'Bronce';
  if (isPlata) { nextGoal = 20000; nextLevelName = 'Oro'; }
  else if (isBronce) { nextGoal = 10000; nextLevelName = 'Plata'; }

  const remaining = Math.max(0, nextGoal - salesTotal);
  const percent = Math.min(100, (salesTotal / nextGoal) * 100).toFixed(0);

  return (
    <SecondaryLayout title="Mis Logros 🏆">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color={t.primary} />
          </View>
        ) : (
          <>
            {/* Banner de nivel */}
            <View className="rounded-3xl p-6 items-center mb-8 shadow-sm border" style={{ backgroundColor: t.primaryContainer, borderColor: t.outlineVariant }}>
              <MaterialIcons name="emoji-events" size={64} color={t.primary} />
              <Text className="font-serif font-bold text-2xl mt-4" style={{ color: t.onPrimaryContainer }}>Nivel {level}</Text>
              
              {remaining > 0 ? (
                <Text className="text-sm mt-1 mb-4 text-center" style={{ color: t.onPrimaryContainer }}>
                  ¡Estás a ${remaining.toFixed(2)} de alcanzar el Nivel {nextLevelName} y desbloquear mejores comisiones!
                </Text>
              ) : (
                <Text className="text-sm mt-1 mb-4 text-center" style={{ color: t.onPrimaryContainer }}>
                  ¡Felicidades! Has superado todas las metas de ventas de este ciclo.
                </Text>
              )}
              
              <View className="w-full rounded-full h-3 mb-2 overflow-hidden" style={{ backgroundColor: t.surfaceContainerHighest }}>
                <View className="h-full rounded-full" style={{ width: `${percent}%` as any, backgroundColor: t.primary }} />
              </View>
              <Text className="font-bold text-xs uppercase tracking-widest w-full text-right" style={{ color: t.primary }}>{percent}%</Text>
            </View>

            <Text className="font-serif font-bold text-xl mb-4" style={{ color: t.onSurface }}>Insignias y Metas</Text>

            {achievements.map((item, idx) => (
              <View key={idx} className="flex-row items-center p-4 rounded-2xl mb-3 shadow-sm border" style={{ backgroundColor: item.done ? t.surfaceContainerLowest : t.surfaceContainer, borderColor: item.done ? t.primary + '33' : t.outlineVariant + '1A', opacity: item.done ? 1 : 0.7 }}>
                <View className="w-12 h-12 rounded-full flex items-center justify-center mr-4" style={{ backgroundColor: item.done ? t.primary + '1A' : t.surfaceContainerHighest }}>
                  <MaterialIcons name={item.icon as any} size={24} color={item.done ? t.primary : t.onSurfaceVariant} />
                </View>
                <View className="flex-1 pr-4">
                  <Text className="font-bold text-base" style={{ color: item.done ? t.onSurface : t.onSurfaceVariant }}>{item.title}</Text>
                  <Text className="text-sm mt-0.5" style={{ color: t.onSurfaceVariant }}>{item.desc}</Text>
                </View>
                {item.done && (
                  <MaterialIcons name="check-circle" size={20} color={t.primary} />
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SecondaryLayout>
  );
}
