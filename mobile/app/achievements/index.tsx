import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { CAMINO_CRECIMIENTO } from '../../../src/lib/camino-crecimiento';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function AchievementsScreen() {
  const t = useThemeColors();
  const [profile, setProfile] = useState<any>(null);
  const [salesTotal, setSalesTotal] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
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
      setOrdersCount((ordersData || []).length);
      setCustomersCount((customersData || []).length);
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const levelDesc = profile?.latest_growth_data?.level?.description || 'Consultor';
  const currentPts = profile?.latest_growth_data?.nextLevelProgress?.currentValue || 0;
  const nextPts = profile?.latest_growth_data?.nextLevelProgress?.nextValueMin || 0;
  const gapPts = profile?.latest_growth_data?.nextLevelProgress?.gap || 0;
  const pctLevel = Math.min(100, profile?.latest_growth_data?.nextLevelProgress?.progressPercentage || 0);
  const nextLvlName = profile?.latest_growth_data?.nextLevel || 'Siguiente';
  const daysFinalDate = profile?.latest_growth_data?.period?.daysFinalDate || 0;

  const profit = CAMINO_CRECIMIENTO[levelDesc as keyof typeof CAMINO_CRECIMIENTO]?.profitPercentage || 25;
  const digitalProfit = profit > 30 ? profit - 5 : profit;

  const milestones = [
    { title: 'Primera Venta', desc: 'Registra tu primera venta', icon: 'shopping-cart', done: ordersCount >= 1, current: Math.min(ordersCount, 1), target: 1 },
    { title: '10 Ventas', desc: 'Alcanza 10 ventas', icon: 'local-fire-department', done: ordersCount >= 10, current: Math.min(ordersCount, 10), target: 10 },
    { title: '100 Club', desc: '100 ventas registradas', icon: 'workspace-premium', done: ordersCount >= 100, current: Math.min(ordersCount, 100), target: 100 },
    { title: 'Primer Cliente', desc: 'Registra tu primer cliente', icon: 'person-add', done: customersCount >= 1, current: Math.min(customersCount, 1), target: 1 },
    { title: 'Red Sólida', desc: '50 clientes registrados', icon: 'groups', done: customersCount >= 50, current: Math.min(customersCount, 50), target: 50 },
    { title: '$1,000+', desc: 'Genera $1,000 en ventas', icon: 'payments', done: salesTotal >= 1000, current: Math.min(salesTotal, 1000), target: 1000 },
    { title: '$10,000+', desc: 'Genera $10,000 en ventas', icon: 'monetization-on', done: salesTotal >= 10000, current: Math.min(salesTotal, 10000), target: 10000 },
    { title: 'Club 100K', desc: 'Genera $100,000 en ventas', icon: 'diamond', done: salesTotal >= 100000, current: Math.min(salesTotal, 100000), target: 100000 },
  ];

  return (
    <SecondaryLayout title="Hitos y Desempeño 📊">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color={t.primary} />
          </View>
        ) : (
          <>
            {/* Stats Bar */}
            <View className="flex-row gap-4 mb-6">
              <View className="flex-1 rounded-2xl p-5 items-center border" style={{ backgroundColor: t.primaryContainer + '33', borderColor: t.primaryContainer }}>
                <MaterialIcons name="payments" size={28} color={t.primary} />
                <Text className="text-2xl font-serif font-bold mt-2 text-primary">${salesTotal.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</Text>
                <Text className="text-[10px] font-bold uppercase tracking-widest mt-1 text-onSurfaceVariant">Ventas Históricas</Text>
              </View>
              <View className="flex-1 rounded-2xl p-5 items-center border" style={{ backgroundColor: t.secondaryContainer + '33', borderColor: t.secondaryContainer }}>
                <MaterialIcons name="groups" size={28} color={t.secondary} />
                <Text className="text-2xl font-serif font-bold mt-2 text-secondary">{customersCount}</Text>
                <Text className="text-[10px] font-bold uppercase tracking-widest mt-1 text-onSurfaceVariant">Clientes Activos</Text>
              </View>
            </View>

            {/* Camino de Crecimiento Card */}
            <View className="bg-surfaceContainerLowest rounded-3xl p-6 mb-6 shadow-sm border" style={{ borderColor: t.primary + '1A' }}>
              <View className="flex-row items-center gap-3 mb-4">
                <MaterialIcons name="stars" size={24} color={t.primary} />
                <View>
                  <Text className="text-[10px] font-bold tracking-widest uppercase text-onSurface">Camino de Crecimiento</Text>
                  <Text className="text-xs text-onSurfaceVariant font-bold">{levelDesc} → {nextLvlName}</Text>
                </View>
              </View>

              <View className="flex-row justify-between items-end mb-2">
                <Text className="text-4xl font-serif font-bold text-primary">{currentPts.toLocaleString()}</Text>
                <Text className="text-[10px] font-bold uppercase text-onSurfaceVariant mb-1">Puntos</Text>
              </View>

              <View className="w-full h-3 rounded-full overflow-hidden mb-2" style={{ backgroundColor: t.surfaceContainerHighest }}>
                <View className="h-full rounded-full" style={{ width: `${pctLevel}%` as any, backgroundColor: t.primary }} />
              </View>

              <View className="flex-row justify-between mb-4">
                <Text className="text-[10px] font-bold text-onSurfaceVariant">Faltan {gapPts.toLocaleString()} pts</Text>
                <Text className="text-[10px] font-bold text-onSurfaceVariant">Meta: {nextPts.toLocaleString()}</Text>
              </View>

              {daysFinalDate > 0 && (
                <View className="pt-4 border-t flex-row items-center gap-2" style={{ borderColor: t.outlineVariant + '33' }}>
                  <MaterialIcons name="calendar-clock" size={16} color={t.error} />
                  <Text className="text-xs text-onSurfaceVariant">Cierre de ciclo en <Text className="font-bold text-error">{daysFinalDate} días</Text></Text>
                </View>
              )}
            </View>

            {/* Beneficios Comerciales */}
            <View className="bg-surfaceContainerLowest rounded-3xl p-6 shadow-sm mb-8 border" style={{ borderColor: t.outlineVariant + '1A' }}>
              <View className="flex-row items-center gap-2 mb-4">
                <MaterialIcons name="workspace-premium" size={20} color={t.secondary} />
                <Text className="font-serif font-bold text-lg text-onSurface">Tus Beneficios Comerciales</Text>
              </View>
              
              <View className="flex-row flex-wrap justify-between gap-y-4">
                <View className="w-[48%] rounded-xl p-4 items-center border" style={{ backgroundColor: t.primaryContainer + '1A', borderColor: t.primaryContainer + '33' }}>
                  <MaterialIcons name="sell" size={24} color={t.primary} />
                  <Text className="text-2xl font-bold mt-1 text-primary">{profit}%</Text>
                  <Text className="text-[9px] font-bold uppercase mt-1 text-onSurfaceVariant">Venta Directa</Text>
                </View>
                <View className="w-[48%] rounded-xl p-4 items-center border" style={{ backgroundColor: t.secondaryContainer + '1A', borderColor: t.secondaryContainer + '33' }}>
                  <MaterialIcons name="language" size={24} color={t.secondary} />
                  <Text className="text-2xl font-bold mt-1 text-secondary">{digitalProfit}%</Text>
                  <Text className="text-[9px] font-bold uppercase mt-1 text-onSurfaceVariant">Natura Digital</Text>
                </View>
                <View className="w-[48%] rounded-xl p-4 items-center border" style={{ backgroundColor: t.tertiaryContainer + '1A', borderColor: t.tertiaryContainer + '33' }}>
                  <MaterialIcons name="home-repair-service" size={24} color={t.tertiary} />
                  <Text className="text-xl font-bold mt-1 text-tertiary">15-18%</Text>
                  <Text className="text-[9px] font-bold uppercase mt-1 text-onSurfaceVariant">Casa & Estilo</Text>
                </View>
                
                {(levelDesc === 'Zafiro' || levelDesc === 'Diamante') ? (
                  <View className="w-[48%] rounded-xl p-4 items-center border" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
                    <MaterialIcons name="credit-card" size={24} color="#d97706" />
                    <Text className="text-lg font-bold mt-1" style={{ color: '#b45309' }}>2 Cuotas</Text>
                    <Text className="text-[9px] font-bold uppercase mt-1" style={{ color: '#92400e' }}>30 días crédito</Text>
                  </View>
                ) : (
                  <View className="w-[48%] rounded-xl p-4 items-center border opacity-50" style={{ backgroundColor: t.surfaceContainer, borderColor: t.outlineVariant + '33' }}>
                    <MaterialIcons name="lock" size={24} color={t.onSurfaceVariant} />
                    <Text className="text-sm font-bold mt-1 text-center text-onSurfaceVariant">Crédito{'\n'}Plazos</Text>
                    <Text className="text-[9px] font-bold uppercase mt-1 text-onSurfaceVariant">Zafiro+</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Hitos Históricos */}
            <View className="flex-row items-center gap-2 mb-4">
              <MaterialIcons name="emoji-events" size={20} color={t.secondary} />
              <Text className="font-serif font-bold text-xl text-onSurface">Hitos Históricos</Text>
            </View>

            {milestones.map((item, idx) => (
              <View key={idx} className="flex-row items-center p-4 rounded-2xl mb-3 shadow-sm border" style={{ backgroundColor: item.done ? t.surfaceContainerLowest : t.surfaceContainer, borderColor: item.done ? t.secondary + '33' : t.outlineVariant + '1A', opacity: item.done ? 1 : 0.8 }}>
                <View className="w-12 h-12 rounded-full flex items-center justify-center mr-4" style={{ backgroundColor: item.done ? t.secondaryContainer : t.surfaceContainerHighest }}>
                  <MaterialIcons name={item.icon as any} size={24} color={item.done ? t.secondary : t.onSurfaceVariant} />
                </View>
                <View className="flex-1 pr-4">
                  <Text className="font-bold text-base" style={{ color: item.done ? t.onSurface : t.onSurfaceVariant }}>{item.title}</Text>
                  <Text className="text-xs mt-0.5" style={{ color: t.onSurfaceVariant }}>{item.desc}</Text>
                  
                  {!item.done && (
                    <View className="mt-2">
                      <View className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: t.surfaceContainerHighest }}>
                        <View className="h-full rounded-full" style={{ width: `${Math.min(100, (item.current / item.target) * 100)}%` as any, backgroundColor: t.primary + '80' }} />
                      </View>
                      <Text className="text-[9px] font-bold mt-1 text-onSurfaceVariant text-right">{item.current.toLocaleString()} / {item.target.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
                {item.done && (
                  <View className="bg-secondary px-2 py-1 rounded-full flex-row items-center gap-1">
                    <MaterialIcons name="check-circle" size={12} color="white" />
                    <Text className="text-[9px] font-bold text-white uppercase tracking-wider">Logrado</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SecondaryLayout>
  );
}
