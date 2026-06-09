import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, FlatList } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function CustomerAnalysisScreen() {
  const t = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

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
    const customerOrders = orders.filter(o => o.customer_id === c.id);
    const totalSpent = customerOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const pendingOrders = customerOrders.filter(o => o.status === 'pending');
    const pendingDebt = pendingOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const deliveredOrders = customerOrders.filter(o => o.status === 'delivered');
    const paidAmount = deliveredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

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
  const totalPaid = customerDebt.reduce((sum, c) => sum + c.paid_amount, 0);
  const collectionRate = (totalPaid + totalDebt) > 0 ? ((totalPaid / (totalPaid + totalDebt)) * 100) : 100;

  if (loading) {
    return (
      <SecondaryLayout title="Análisis de Clientes 📊">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      </SecondaryLayout>
    );
  }

  return (
    <SecondaryLayout title="Análisis de Clientes 📊">
      <ScrollView className="flex-1 p-6 pb-24" showsVerticalScrollIndicator={false}>

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
            <Text className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Con Deuda</Text>
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
            <Text className="text-3xl font-bold text-secondary">{collectionRate.toFixed(0)}%</Text>
            <View className="flex-row items-center gap-1 mt-1">
              <MaterialIcons name="trending-up" size={12} color={t.secondary} />
              <Text className="text-xs text-secondary font-medium">Este mes</Text>
            </View>
          </View>
        </View>

        {/* Client Debt Ranking */}
        <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Ranking de Deuda por Cliente</Text>
        <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden mb-8">
          {customerDebt.length === 0 ? (
            <View className="p-8 items-center">
              <MaterialIcons name="sentiment-satisfied" size={48} color={t.surfaceContainerHighest} />
              <Text className="text-on-surface-variant mt-3 text-center">No hay clientes registrados.</Text>
            </View>
          ) : (
            customerDebt.slice(0, 15).map((client, idx) => (
              <View key={client.id} className={`p-4 flex-row items-center justify-between ${idx < customerDebt.length - 1 ? 'border-b border-outline-variant/10' : ''}`}>
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

        {/* Top Spenders */}
        <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Top Clientes por Gasto</Text>
        <View className="bg-primary p-5 rounded-3xl shadow-lg mb-8 relative overflow-hidden" style={{ shadowColor: t.primary }}>
          <MaterialIcons name="emoji-events" size={80} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', right: -5, top: -5 }} />
          {customerDebt
            .sort((a, b) => b.total_spent - a.total_spent)
            .slice(0, 5)
            .map((client, idx) => (
              <View key={client.id} className={`flex-row items-center justify-between py-3 ${idx > 0 ? 'border-t border-white/15' : ''}`}>
                <View className="flex-row items-center gap-3">
                  <Text className="text-white/60 font-bold text-lg w-6">#{idx + 1}</Text>
                  <Text className="text-white font-bold" numberOfLines={1}>{client.full_name}</Text>
                </View>
                <Text className="text-white font-bold">${client.total_spent.toFixed(0)}</Text>
              </View>
            ))}
        </View>

      </ScrollView>
    </SecondaryLayout>
  );
}
