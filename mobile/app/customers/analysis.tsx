import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, FlatList, TouchableOpacity } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { collectionRate } from '../../../src/lib/reports';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function CustomerAnalysisScreen() {
  const t = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'debt' | 'clear'>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [customerData, orderData] = await Promise.all([
        api.customers.list(),
        api.orders.list(),
      ]);
      setCustomers(customerData || []);
      setOrders(orderData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate analytics
  const customerDebt = customers.map(c => {
    const customerOrders = orders.filter(o => o.customer_id === c.id && o.status !== 'cancelled');
    const totalSpent = customerOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    const pendingDebt = customerOrders.reduce((sum, o) => sum + o.summary.balance, 0);
    const paidAmount = customerOrders.reduce((sum, o) => sum + o.summary.paid, 0);

    return {
      ...c,
      total_orders: customerOrders.length,
      total_spent: totalSpent,
      pending_debt: pendingDebt,
      paid_amount: paidAmount,
    };
  }).sort((a, b) => b.pending_debt - a.pending_debt);

  const totalClients = customers.length;
  const clientsWithDebt = customerDebt.filter(c => c.pending_debt > 0).length;
  const totalDebt = customerDebt.reduce((sum, c) => sum + c.pending_debt, 0);
  // Tasa de cobro via shared contract (excludes adjustments, web clientes/analisis.astro)
  const rate = collectionRate(orders);

  // Cartera filters (web clientes/analisis.astro)
  const filteredClients = customerDebt.filter(c =>
    filter === 'debt' ? c.pending_debt > 0 : filter === 'clear' ? c.pending_debt === 0 : true
  );

  if (loading) {
    return (
      <SecondaryLayout title="Análisis de Clientes 📊" scrollable={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      </SecondaryLayout>
    );
  }

  return (
    <SecondaryLayout title="Análisis de Clientes 📊" scrollable={false}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>

        {/* KPI Cards */}
        <View className="flex-row flex-wrap gap-3 mb-8">
          <View className="flex-1 min-w-[45%] bg-surface-container-lowest p-4 rounded-3xl shadow-sm border border-outline-variant/10">
            <Text className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Clientes</Text>
            <Text className="text-3xl font-bold text-on-surface">{totalClients}</Text>
            <View className="flex-row items-center gap-1 mt-1">
              <MaterialIcons name="group" size={12} color={t.secondary} />
              <Text className="text-xs text-secondary font-medium">Cartera activa</Text>
            </View>
          </View>
          <View className="flex-1 min-w-[45%] bg-surface-container-lowest p-4 rounded-3xl shadow-sm border border-outline-variant/10">
            <Text className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Con saldo</Text>
            <Text className="text-3xl font-bold text-primary">{clientsWithDebt}</Text>
            <View className="flex-row items-center gap-1 mt-1">
              <MaterialIcons name="warning" size={12} color={t.primary} />
              <Text className="text-xs text-primary font-medium">Requieren seguimiento</Text>
            </View>
          </View>
          <View className="flex-1 min-w-[45%] bg-surface-container-lowest p-4 rounded-3xl shadow-sm border border-outline-variant/10">
            <Text className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total por Cobrar</Text>
            <Text className="text-3xl font-bold text-error">${totalDebt.toFixed(0)}</Text>
            <Text className="text-xs text-on-surface-variant mt-1">Saldo pendiente</Text>
          </View>
          <View className="flex-1 min-w-[45%] bg-secondary/5 p-4 rounded-3xl shadow-sm border border-secondary/10">
            <Text className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Tasa de Cobro</Text>
            <Text className="text-3xl font-bold text-secondary">{rate.toFixed(0)}%</Text>
            <View className="flex-row items-center gap-1 mt-1">
              <MaterialIcons name="trending-up" size={12} color={t.secondary} />
              <Text className="text-xs text-secondary font-medium">Este mes</Text>
            </View>
          </View>
        </View>

        {/* Client Debt Ranking */}
        <View className="flex-row items-center justify-between mb-3 ml-1">
          <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">Ranking de Deuda por Cliente</Text>
        </View>
        <View className="flex-row gap-2 mb-3">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'debt', label: 'Con saldo' },
            { key: 'clear', label: 'Al Día' },
          ] as const).map(f => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-full ${active ? 'bg-primary' : 'bg-surface-container'}`}
              >
                <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-on-surface-variant'}`}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden mb-8">
          {filteredClients.length === 0 ? (
            <View className="p-8 items-center">
              <MaterialIcons name="sentiment-satisfied" size={48} color={t.surfaceContainerHighest} />
              <Text className="text-on-surface-variant mt-3 text-center">No hay clientes con deuda pendiente.</Text>
            </View>
          ) : (
            filteredClients.slice(0, 15).map((client, idx) => (
              <View key={client.id} className={`p-4 flex-row items-center justify-between ${idx < Math.min(filteredClients.length, 15) - 1 ? 'border-b border-outline-variant/10' : ''}`}>
                <View className="flex-row items-center gap-3 flex-1">
                  <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: client.pending_debt > 0 ? t.error + '1A' : t.secondary + '1A' }}>
                    <Text className="font-bold text-xs" style={{ color: client.pending_debt > 0 ? t.error : t.secondary }}>
                      {client.full_name?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                  <View className="flex-1 pr-2">
                    <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{client.full_name}</Text>
                    <Text className="text-[10px] text-on-surface-variant">
                      {client.total_orders} órdenes · Pagado: ${client.paid_amount.toFixed(0)}
                    </Text>
                  </View>
                </View>
                <View className="items-end">
                  {client.pending_debt > 0 ? (
                    <>
                      <Text className="font-bold text-error text-sm">${client.pending_debt.toFixed(0)}</Text>
                      <Text className="text-[10px] text-error">Pendiente</Text>
                    </>
                  ) : (
                    <>
                      <Text className="font-bold text-secondary text-sm">Al día ✓</Text>
                      <Text className="text-[10px] text-on-surface-variant">${client.total_spent.toFixed(0)} total</Text>
                    </>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Top Spenders (web: Mejores Clientes del Mes, top 3) */}
        <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Mejores Clientes del Mes</Text>
        <View className="bg-primary p-5 rounded-3xl shadow-lg mb-8 relative overflow-hidden" style={{ shadowColor: t.primary }}>
          <MaterialIcons name="emoji-events" size={80} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', right: -5, top: -5 }} />
          {[...customerDebt]
            .sort((a, b) => b.total_spent - a.total_spent)
            .slice(0, 3)
            .map((client, idx) => (
              <View key={client.id} className={`flex-row items-center justify-between py-3 ${idx > 0 ? 'border-t border-white/15' : ''}`}>
                <View className="flex-row items-center gap-3">
                  <Text className="text-white/60 font-bold text-lg w-6">{['🥇', '🥈', '🥉'][idx]}</Text>
                  <View>
                    <Text className="text-white font-bold" numberOfLines={1}>{client.full_name}</Text>
                    <Text className="text-white/70 text-xs">{client.total_orders} compras</Text>
                  </View>
                </View>
                <Text className="text-white font-bold">${client.total_spent.toFixed(0)}</Text>
              </View>
            ))}
        </View>

      </ScrollView>
    </SecondaryLayout>
  );
}
