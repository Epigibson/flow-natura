import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';

export default function ReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [weeklyData, setWeeklyData] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const dashboardData = await api.dashboard.getData();
      setData(dashboardData);

      // Compute real weekly activity from orders
      try {
        const orders = await api.orders.list();
        const now = new Date();
        const dayBuckets = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);

        (orders || []).forEach((o: any) => {
          const d = new Date(o.created_at);
          if (d >= weekAgo) {
            const day = d.getDay(); // 0=Sun
            const idx = day === 0 ? 6 : day - 1; // Map to Mon=0...Sun=6
            dayBuckets[idx] += (o.total_amount || 0);
          }
        });

        const maxVal = Math.max(...dayBuckets, 1);
        setWeeklyData(dayBuckets.map(v => Math.round((v / maxVal) * 100)));
      } catch {
        // Fallback: keep zeros
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return (
      <SecondaryLayout title="Reportes 📊">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#476810" />
        </View>
      </SecondaryLayout>
    );
  }

  const { kpis, top_products, top_clients } = data;

  return (
    <SecondaryLayout title="Reportes 📊">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        
        {/* Resumen Financiero */}
        <Text className="font-serif font-bold text-xl text-on-surface mb-4">Resumen Mensual</Text>
        
        <View className="bg-primary p-6 rounded-3xl mb-6 shadow-lg shadow-primary/30 relative overflow-hidden">
          <MaterialIcons name="trending-up" size={100} color="rgba(255,255,255,0.1)" style={{position: 'absolute', right: -10, top: -10}} />
          <Text className="text-white/80 text-sm font-bold uppercase tracking-widest mb-1">Ingresos Totales</Text>
          <Text className="text-white font-display font-extrabold text-4xl mb-4">${kpis.total_revenue.toFixed(2)}</Text>
          
          <View className="flex-row items-center justify-between border-t border-white/20 pt-4">
            <View>
              <Text className="text-white/70 text-xs">Ventas (Órdenes)</Text>
              <Text className="text-white font-bold text-lg">{kpis.total_orders}</Text>
            </View>
            <View className="items-end">
              <Text className="text-white/70 text-xs">Por Cobrar (Deuda)</Text>
              <Text className="text-white font-bold text-lg">${kpis.pending_debt.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Gráfico Real */}
        <View className="bg-surface-container-lowest p-6 rounded-3xl mb-8 shadow-sm border border-outline-variant/10">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="font-bold text-on-surface">Actividad (Semana)</Text>
            <View className="bg-secondary-container px-3 py-1 rounded-full">
              <Text className="text-on-secondary-container text-xs font-bold">Últimos 7 días</Text>
            </View>
          </View>
          
          <View className="flex-row items-end justify-between h-32 pt-4">
            {weeklyData.map((h, i) => (
              <View key={i} className="items-center w-8">
                <View className="w-6 bg-primary/20 rounded-t-sm" style={{ height: '100%', justifyContent: 'flex-end' }}>
                  <View className="w-full bg-primary rounded-t-sm rounded-b-sm" style={{ height: `${Math.max(h, 2)}%` }} />
                </View>
                <Text className="text-[10px] text-on-surface-variant mt-2 font-bold">{['L', 'M', 'M', 'J', 'V', 'S', 'D'][i]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Mejores Productos */}
        <Text className="font-serif font-bold text-xl text-on-surface mb-4">Productos Estrella</Text>
        <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 mb-8 overflow-hidden">
          {top_products.length === 0 ? (
            <View className="p-6 items-center justify-center">
              <Text className="text-on-surface-variant text-sm text-center">No hay datos suficientes de ventas para mostrar productos estrella.</Text>
            </View>
          ) : (
            top_products.map((prod: any, idx: number) => (
              <View key={idx} className={`p-4 flex-row items-center justify-between ${idx !== top_products.length - 1 ? 'border-b border-outline-variant/10' : ''}`}>
                <View className="flex-row items-center gap-4 flex-1">
                  <View className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Text className="font-bold text-primary">{idx + 1}</Text>
                  </View>
                  <View className="flex-1 pr-4">
                    <Text className="font-bold text-on-surface" numberOfLines={1}>{prod.product_name}</Text>
                    <Text className="text-on-surface-variant text-xs">{prod.units_sold} uds vendidas</Text>
                  </View>
                </View>
                <Text className="font-bold text-primary">${prod.revenue.toFixed(2)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Mejores Clientes */}
        <Text className="font-serif font-bold text-xl text-on-surface mb-4">Mejores Clientes</Text>
        <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 mb-4 overflow-hidden">
          {top_clients.length === 0 ? (
            <View className="p-6 items-center justify-center">
              <Text className="text-on-surface-variant text-sm text-center">No hay clientes con compras registradas aún.</Text>
            </View>
          ) : (
            top_clients.map((client: any, idx: number) => (
              <View key={idx} className={`p-4 flex-row items-center justify-between ${idx !== top_clients.length - 1 ? 'border-b border-outline-variant/10' : ''}`}>
                <View className="flex-row items-center gap-4 flex-1">
                  <View className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                    <MaterialIcons name="person" size={20} color="#564336" />
                  </View>
                  <View className="flex-1 pr-4">
                    <Text className="font-bold text-on-surface" numberOfLines={1}>{client.name}</Text>
                  </View>
                </View>
                <Text className="font-bold text-secondary">${client.total.toFixed(2)}</Text>
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </SecondaryLayout>
  );
}
