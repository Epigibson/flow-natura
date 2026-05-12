import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image, Modal, TextInput, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import api from '../../../src/lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useSidebar } from '../../components/SidebarContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../hooks/use-theme-colors';
import React from 'react';

export default function DashboardScreen() {
  const t = useThemeColors();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [greeting, setGreeting] = useState('¡Hola!');
  const { openSidebar } = useSidebar();
  
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [naturaEmail, setNaturaEmail] = useState('');
  const [naturaPassword, setNaturaPassword] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      loadData();
      calculateGreeting();
    }, [])
  );

  function calculateGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Buenos días');
    else if (hour < 18) setGreeting('Buenas tardes');
    else setGreeting('Buenas noches');
  }

  async function loadData() {
    try {
      const [result, profileResult] = await Promise.all([
        api.dashboard.getData(),
        api.consultant.getProfile().catch(() => null)
      ]);
      setData(result);
      setUserProfile(profileResult);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  const username = userProfile?.full_name?.split(' ')[0] || 'Consultora';
  
  const now = new Date();
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Scrollable Container with exact white styling from screenshot */}
      <ScrollView className="flex-1 bg-surface mx-auto w-full max-w-lg">
        <View className="px-6 pt-6 pb-20">
          
          {/* Header */}
          <View className="mb-6">
            <TouchableOpacity onPress={openSidebar} className="w-12 h-12 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant flex items-center justify-center mb-4">
              <Text className="text-on-surface text-2xl">≡</Text>
            </TouchableOpacity>
            <Text className="text-4xl font-serif text-on-surface">{greeting},</Text>
            <Text className="text-4xl font-serif text-on-surface mb-2">{username}! ✨</Text>
            <Text className="text-on-surface-variant text-sm">
              Faltan {daysLeft} días para cerrar el ciclo. {data?.kpis?.total_orders || 0} ventas este mes.
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="flex-row items-center gap-3 mb-8">
            <TouchableOpacity onPress={() => setGoalModalVisible(true)} className="flex-row items-center gap-2 py-2 px-5 rounded-full border border-primary bg-surface-container-lowest" style={{ shadowColor: t.primary, elevation: 2, shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
              <Text className="text-primary font-bold text-sm">🏳️ Mi Meta</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setExportModalVisible(true)} className="flex-row items-center gap-2 py-2 px-5 rounded-full bg-secondary">
              <Text className="text-white font-bold text-sm">⬇️ Exportar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} className="w-10 h-10 rounded-full overflow-hidden border border-primary ml-auto" style={{ backgroundColor: t.primaryContainer }}>
              <Image source={{ uri: userProfile?.avatar_url || `https://api.dicebear.com/8.x/micah/png?seed=${username}` }} className="w-full h-full" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="py-20 items-center justify-center">
              <ActivityIndicator size="large" color={t.primary} />
            </View>
          ) : (
            <>
              {/* Growth Widget */}
              <View className="bg-surface-container-lowest rounded-[2rem] p-6 mb-6 border border-outline-variant shadow-sm relative overflow-hidden">
                {!userProfile?.is_natura_connected ? (
                  <View className="items-center py-4">
                    <Text className="text-3xl mb-2 text-primary">🔗</Text>
                    <Text className="text-xl font-serif text-on-surface mb-2">Conecta tu cuenta Natura</Text>
                    <Text className="text-xs text-on-surface-variant text-center mb-6">Ingresa tus datos de Mi Negocio para sincronizar tus puntos.</Text>
                    
                    <TextInput 
                      className="w-full bg-surface-container rounded-xl px-4 py-3 mb-3 text-on-surface"
                      placeholder="Correo de Mi Negocio"
                      value={naturaEmail} onChangeText={setNaturaEmail}
                      keyboardType="email-address" autoCapitalize="none"
                    />
                    <TextInput 
                      className="w-full bg-surface-container rounded-xl px-4 py-3 mb-4 text-on-surface"
                      placeholder="Contraseña"
                      value={naturaPassword} onChangeText={setNaturaPassword}
                      secureTextEntry
                    />
                    <TouchableOpacity 
                      onPress={() => Alert.alert('Aviso', 'Sincronización en proceso...')}
                      className="w-full py-3 bg-primary rounded-xl flex-row justify-center items-center gap-2">
                      <Text className="text-white font-bold">Vincular ➡️</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View className="flex-row justify-between items-center mb-4">
                      <View className="px-3 py-1 rounded-full flex-row items-center" style={{ backgroundColor: t.primaryContainer + '33' }}>
                        <Text className="text-primary text-[10px] font-bold tracking-widest uppercase">⭐ Camino de Crecimiento</Text>
                      </View>
                      {userProfile?.latest_growth_data?.period?.daysFinalDate <= 7 && (
                        <Text className="text-error text-xs font-bold">⏰ ¡Cierre inminente!</Text>
                      )}
                    </View>
                    
                    <Text className="text-4xl font-serif text-on-surface">{userProfile?.latest_growth_data?.level?.description || 'Consultor'}</Text>
                    <Text className="text-sm font-bold text-on-surface-variant mb-6">{userProfile?.latest_growth_data?.nextLevelProgress?.currentValue?.toLocaleString() || 0} <Text className="font-normal">pts acumulados</Text></Text>

                    <View className="flex-row justify-between items-end mb-2">
                      <Text className="text-sm font-bold text-on-surface-variant">Próximo: <Text className="text-on-surface">{userProfile?.latest_growth_data?.nextLevel || '?'}</Text></Text>
                      <Text className="text-xs font-bold text-secondary">{Math.min(100, userProfile?.latest_growth_data?.nextLevelProgress?.progressPercentage || 0)}%</Text>
                    </View>
                    <View className="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden mb-2">
                      <View className="h-full bg-secondary rounded-full" style={{ width: `${Math.min(100, userProfile?.latest_growth_data?.nextLevelProgress?.progressPercentage || 0)}%` }} />
                    </View>
                    <View className="flex-row justify-between items-center mb-6">
                      <Text className="text-xs text-on-surface-variant">Faltan <Text className="font-bold text-on-surface">{userProfile?.latest_growth_data?.nextLevelProgress?.gap?.toLocaleString() || 0} pts</Text></Text>
                      <Text className="text-xs text-on-surface-variant">{userProfile?.latest_growth_data?.period?.daysFinalDate || 0} días para cerrar</Text>
                    </View>

                    <TouchableOpacity className="w-full py-4 bg-surface-container-highest rounded-2xl flex-row justify-center items-center gap-2 border border-outline-variant">
                      <Text className="text-on-surface font-bold">☁️ Sincronización Silenciosa</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* KPI Cards (Vertical List) */}
              <View className="gap-4 mb-8">
                <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm">
                  <Text className="text-xs font-bold tracking-widest uppercase text-secondary">Ventas del Ciclo</Text>
                  <Text className="text-4xl font-serif mt-2 text-on-surface">$173.00</Text>
                  <Text className="text-xs text-on-surface-variant mt-4 text-right">Definir meta →</Text>
                </View>

                <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm">
                  <Text className="text-xs font-bold tracking-widest uppercase text-primary">Ventas del Mes</Text>
                  <Text className="text-4xl font-serif mt-2 text-on-surface">{data?.kpis?.total_orders || 0}</Text>
                  <Text className="text-xs font-bold text-primary-container mt-4">Ver todas →</Text>
                </View>

                <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm">
                  <Text className="text-xs font-bold tracking-widest uppercase text-error">Cobranza Pendiente</Text>
                  <Text className="text-4xl font-serif mt-2 text-error">${data?.kpis?.pending_debt?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) || '0.00'}</Text>
                  <Text className="text-xs font-bold text-error mt-4">Gestionar →</Text>
                </View>

                <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm">
                  <Text className="text-xs font-bold tracking-widest uppercase text-on-surface-variant">Stock Agotado</Text>
                  <Text className="text-4xl font-serif mt-2 text-on-surface">{data?.kpis?.out_of_stock || 0}</Text>
                  <Text className="text-xs font-bold text-on-surface-variant mt-4">Ver Inventario →</Text>
                </View>
              </View>

              {/* Recent Orders */}
              <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm mb-6">
                <View className="flex-row justify-between items-center mb-6 border-b border-surface-container pb-4">
                  <Text className="text-xl font-serif font-bold text-primary">📄 Ventas Recientes</Text>
                  <TouchableOpacity onPress={() => router.push('/sales/new')} className="bg-primary-container py-2 px-4 rounded-full flex-row items-center gap-1">
                    <Text className="text-white font-bold text-xs">+ Nueva Venta</Text>
                  </TouchableOpacity>
                </View>
                
                {data?.recent_orders?.length > 0 ? (
                  <View className="gap-0">
                    {data.recent_orders.slice(0, 3).map((order: any, idx: number) => (
                      <View key={order.id} className={`flex-row justify-between items-center py-4 ${idx > 0 ? 'border-t border-surface-container' : ''}`}>
                        <View className="flex-row items-center flex-1 pr-2">
                          <View className="w-10 h-10 rounded-full flex items-center justify-center mr-3 border border-primary" style={{ backgroundColor: t.primaryContainer + '33' }}>
                            <Text className="font-bold text-primary">{order.customer_name?.charAt(0) || 'C'}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{order.customer_name}</Text>
                            <Text className="text-on-surface-variant text-[10px] mt-0.5 uppercase" numberOfLines={1}>{order.items_summary}</Text>
                          </View>
                        </View>
                        <View className="items-end shrink-0">
                          <Text className="font-bold text-on-surface text-sm">${Number(order.total_amount).toFixed(2)}</Text>
                          <Text className={`text-[10px] font-bold mt-0.5 capitalize ${order.status === 'cancelled' ? 'text-error' : 'text-primary'}`}>
                            {order.status === 'cancelled' ? 'Cancelada' : order.payment_method}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View className="items-center py-6"><Text className="text-on-surface-variant">Sin ventas</Text></View>
                )}
              </View>

              {/* Acciones Rápidas */}
              <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm mb-6">
                <Text className="text-lg font-serif font-bold text-primary mb-6">⚡ Acciones Rápidas</Text>
                <View className="flex-row flex-wrap justify-between">
                  <TouchableOpacity onPress={() => router.push('/sales/new')} className="w-[48%] p-4 rounded-2xl items-center mb-4 border border-outline-variant" style={{ backgroundColor: t.primaryContainer + '1A' }}>
                    <Text className="text-primary text-xl mb-1">🛎️</Text>
                    <Text className="text-primary font-bold text-xs text-center">Nueva Venta</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/inventory/new')} className="w-[48%] p-4 rounded-2xl items-center mb-4 border border-outline-variant" style={{ backgroundColor: t.secondaryContainer + '1A' }}>
                    <Text className="text-secondary text-xl mb-1">📦</Text>
                    <Text className="text-secondary font-bold text-xs text-center">Alta Stock</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/customers')} className="w-[48%] p-4 rounded-2xl items-center border border-outline-variant" style={{ backgroundColor: t.primaryContainer + '1A' }}>
                    <Text className="text-primary text-xl mb-1">👤+</Text>
                    <Text className="text-primary font-bold text-xs text-center">Nuevo Cliente</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => router.push('/inventory/adjustments')} className="w-[48%] bg-surface-container p-4 rounded-2xl items-center">
                    <Text className="text-on-surface-variant text-xl mb-1">⚙️</Text>
                    <Text className="text-on-surface-variant font-bold text-xs text-center">Ajuste Stock</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Top Clientes */}
              <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm mb-6">
                <View className="flex-row justify-between items-center mb-6">
                  <Text className="text-lg font-serif font-bold text-secondary">⭐ Top Clientes</Text>
                  <Text className="text-primary text-xs font-bold">Ver todos</Text>
                </View>
                {data?.top_clients?.map((c: any, idx: number) => (
                  <View key={idx} className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-3">
                      <Text className="text-lg">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</Text>
                      <Text className="font-bold text-sm text-on-surface">{c.name}</Text>
                    </View>
                    <Text className="font-bold text-primary text-sm">${Number(c.total).toFixed(2)}</Text>
                  </View>
                ))}
              </View>

              {/* Alertas de Stock */}
              <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm mb-6">
                <Text className="text-xl font-serif font-bold text-error mb-6">⚠️ Alertas de Stock</Text>
                {data?.stock_alerts?.length > 0 ? (
                  data.stock_alerts.map((item: any, idx: number) => (
                    <View key={idx} className={`flex-row justify-between items-center py-3 ${idx > 0 ? 'border-t border-surface-container' : ''}`}>
                      <Text className="flex-1 font-bold text-on-surface text-sm pr-2" numberOfLines={1}>{item.product_name}</Text>
                      <Text className="text-error font-bold text-sm px-2 py-1 rounded-md" style={{ backgroundColor: t.error + '1A' }}>{item.quantity} rest</Text>
                    </View>
                  ))
                ) : (
                  <View className="items-center py-4"><Text className="text-on-surface-variant">Sin alertas de stock bajo</Text></View>
                )}
              </View>

              {/* Productos Más Vendidos */}
              <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm mb-6">
                <Text className="text-xl font-serif font-bold text-primary mb-6">📈 Más Vendidos</Text>
                {data?.top_products?.length > 0 ? (
                  data.top_products.map((item: any, idx: number) => (
                    <View key={idx} className={`flex-row justify-between items-center py-3 ${idx > 0 ? 'border-t border-surface-container' : ''}`}>
                      <Text className="flex-1 font-bold text-on-surface text-sm pr-2" numberOfLines={1}>{item.product_name}</Text>
                      <Text className="text-primary font-bold text-sm">{item.units_sold} ud</Text>
                    </View>
                  ))
                ) : (
                  <View className="items-center py-4"><Text className="text-on-surface-variant">Sin datos suficientes</Text></View>
                )}
              </View>

              {/* Próximos Cobros */}
              <View className="bg-surface-container-lowest rounded-[2rem] p-6 shadow-sm mb-6">
                <Text className="text-xl font-serif font-bold text-secondary mb-6 flex-row items-center">⏳ Próximos Cobros</Text>
                {data?.upcoming_payments?.length > 0 ? (
                  data.upcoming_payments.map((item: any, idx: number) => (
                    <View key={idx} className={`flex-row justify-between items-center py-3 ${idx > 0 ? 'border-t border-surface-container' : ''}`}>
                      <View className="flex-1 pr-2">
                        <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{item.customer_name}</Text>
                        <Text className="text-on-surface-variant text-[10px] mt-1">{item.items_summary}</Text>
                      </View>
                      <View className="items-end shrink-0">
                        <Text className="font-bold text-secondary text-sm">${Number(item.total_amount).toFixed(2)}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <View className="items-center py-4"><Text className="text-on-surface-variant">Sin cobros pendientes</Text></View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Modals placed outside ScrollView but inside SafeAreaView */}
      <Modal visible={goalModalVisible} animationType="fade" transparent={true}>
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-surface rounded-[2rem] p-8 w-full border border-outline-variant">
            <Text className="text-2xl font-serif font-bold mb-4 text-on-surface">🎯 Meta del Ciclo</Text>
            <Text className="text-sm text-on-surface-variant mb-6">Define tu meta de ventas para este ciclo y hazle seguimiento.</Text>
            <TextInput 
              className="w-full bg-surface-container-highest rounded-xl py-4 px-4 text-center text-3xl font-bold mb-6 text-on-surface"
              placeholder="Ej: 6000" keyboardType="numeric"
              value={goalInput} onChangeText={setGoalInput}
            />
            <TouchableOpacity onPress={() => {Alert.alert('Éxito', 'Meta guardada correctamente.'); setGoalModalVisible(false);}} className="w-full py-4 bg-primary rounded-xl mb-3">
              <Text className="text-white font-bold text-center">Guardar Meta</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setGoalModalVisible(false)} className="w-full py-3">
              <Text className="text-on-surface-variant font-bold text-center">Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={exportModalVisible} animationType="slide" transparent={true}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-surface rounded-t-[2rem] p-8 w-full border-t border-outline-variant">
            <Text className="text-2xl font-serif font-bold mb-6 text-on-surface">⬇️ Exportar Datos</Text>
            
            <TouchableOpacity onPress={() => {Alert.alert('Exportando...', 'En una implementación futura, esto descargará un CSV con Expo File System.'); setExportModalVisible(false);}} className="flex-row items-center gap-4 bg-surface-container-low p-4 rounded-2xl mb-3">
              <Text className="text-3xl">📊</Text>
              <View className="flex-1">
                <Text className="font-bold text-on-surface text-base">Ventas (CSV)</Text>
                <Text className="text-xs text-on-surface-variant mt-0.5">Todas las ventas del ciclo en formato Excel.</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => {Alert.alert('Exportando...', 'En una implementación futura, esto descargará un CSV con Expo File System.'); setExportModalVisible(false);}} className="flex-row items-center gap-4 bg-surface-container-low p-4 rounded-2xl mb-3">
              <Text className="text-3xl">👥</Text>
              <View className="flex-1">
                <Text className="font-bold text-on-surface text-base">Clientes (CSV)</Text>
                <Text className="text-xs text-on-surface-variant mt-0.5">Lista completa de tus clientes registrados.</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => {Alert.alert('Exportando...', 'En una implementación futura, esto descargará un CSV con Expo File System.'); setExportModalVisible(false);}} className="flex-row items-center gap-4 bg-surface-container-low p-4 rounded-2xl mb-6">
              <Text className="text-3xl">📦</Text>
              <View className="flex-1">
                <Text className="font-bold text-on-surface text-base">Inventario (CSV)</Text>
                <Text className="text-xs text-on-surface-variant mt-0.5">Stock actual con precios y categorías.</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => setExportModalVisible(false)} className="w-full py-4 bg-surface-container-highest rounded-xl">
              <Text className="text-on-surface font-bold text-center">Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
