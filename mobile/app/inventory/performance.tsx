import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function InventoryPerformanceScreen() {
  const t = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invData, orderData] = await Promise.all([
        api.inventory.list(),
        api.orders.list(),
      ]);
      setInventory(invData || []);
      setOrders(orderData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Compute metrics
  const totalProducts = inventory.length;
  const totalUnits = inventory.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const totalValue = inventory.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 0)), 0);
  const totalCostValue = inventory.reduce((sum, i) => sum + ((i.cost || 0) * (i.quantity || 0)), 0);
  const potentialProfit = totalValue - totalCostValue;

  const outOfStock = inventory.filter(i => (i.quantity || 0) <= 0);
  const lowStock = inventory.filter(i => (i.quantity || 0) > 0 && (i.quantity || 0) <= 2);

  // Top by value
  const topByValue = [...inventory]
    .map(i => ({ ...i, total_value: (i.price || 0) * (i.quantity || 0) }))
    .sort((a, b) => b.total_value - a.total_value)
    .slice(0, 5);

  if (loading) {
    return (
      <SecondaryLayout title="Rendimiento de Inventario 📦">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      </SecondaryLayout>
    );
  }

  return (
    <SecondaryLayout title="Rendimiento 📦">
      <ScrollView className="flex-1 p-6 pb-24" showsVerticalScrollIndicator={false}>

        {/* Hero KPI */}
        <View className="bg-primary p-6 rounded-3xl mb-6 shadow-lg relative overflow-hidden" style={{ shadowColor: t.primary }}>
          <MaterialIcons name="inventory-2" size={100} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', right: -10, top: -10 }} />
          <Text className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">Valor Total en Inventario</Text>
          <Text className="text-white font-bold text-4xl mb-4">${totalValue.toFixed(0)}</Text>
          <View className="flex-row items-center justify-between border-t border-white/20 pt-4">
            <View>
              <Text className="text-white/70 text-xs">Productos</Text>
              <Text className="text-white font-bold text-lg">{totalProducts}</Text>
            </View>
            <View>
              <Text className="text-white/70 text-xs">Unidades</Text>
              <Text className="text-white font-bold text-lg">{totalUnits}</Text>
            </View>
            <View className="items-end">
              <Text className="text-white/70 text-xs">Ganancia Potencial</Text>
              <Text className="text-white font-bold text-lg">${potentialProfit.toFixed(0)}</Text>
            </View>
          </View>
        </View>

        {/* KPI Grid */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-surface-container-lowest p-4 rounded-3xl shadow-sm border border-outline-variant/10 items-center">
            <MaterialIcons name="remove-shopping-cart" size={24} color={t.error} style={{ marginBottom: 4 }} />
            <Text className="text-3xl font-bold text-error">{outOfStock.length}</Text>
            <Text className="text-[10px] text-on-surface-variant font-bold text-center">Sin Stock</Text>
          </View>
          <View className="flex-1 bg-surface-container-lowest p-4 rounded-3xl shadow-sm border border-outline-variant/10 items-center">
            <MaterialIcons name="warning" size={24} color="#d97706" style={{ marginBottom: 4 }} />
            <Text className="text-3xl font-bold" style={{ color: '#d97706' }}>{lowStock.length}</Text>
            <Text className="text-[10px] text-on-surface-variant font-bold text-center">Stock Bajo (≤2)</Text>
          </View>
          <View className="flex-1 bg-secondary/5 p-4 rounded-3xl shadow-sm border border-secondary/10 items-center">
            <MaterialIcons name="paid" size={24} color={t.secondary} style={{ marginBottom: 4 }} />
            <Text className="text-3xl font-bold text-secondary">${totalCostValue.toFixed(0)}</Text>
            <Text className="text-[10px] text-on-surface-variant font-bold text-center">Costo Total</Text>
          </View>
        </View>

        {/* Top Products by Value */}
        <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Top Productos por Valor</Text>
        <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden mb-6">
          {topByValue.map((item, idx) => (
            <View key={item.product_id || idx} className={`p-4 flex-row items-center justify-between ${idx < topByValue.length - 1 ? 'border-b border-outline-variant/10' : ''}`}>
              <View className="flex-row items-center gap-3 flex-1">
                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="font-bold text-primary">{idx + 1}</Text>
                </View>
                <View className="flex-1 pr-2">
                  <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{item.product_name}</Text>
                  <Text className="text-[10px] text-on-surface-variant">{item.quantity} uds × ${(item.price || 0).toFixed(0)}</Text>
                </View>
              </View>
              <Text className="font-bold text-primary">${item.total_value.toFixed(0)}</Text>
            </View>
          ))}
        </View>

        {/* Out of Stock Alert */}
        {outOfStock.length > 0 && (
          <>
            <Text className="text-xs font-bold text-error uppercase tracking-widest mb-3 ml-1">⚠️ Sin Stock</Text>
            <View className="bg-error/5 rounded-3xl border border-error/20 overflow-hidden mb-6">
              {outOfStock.slice(0, 10).map((item, idx) => (
                <View key={item.product_id || idx} className={`p-4 flex-row items-center gap-3 ${idx < outOfStock.length - 1 ? 'border-b border-error/10' : ''}`}>
                  <MaterialIcons name="error-outline" size={20} color={t.error} />
                  <Text className="text-on-surface font-medium flex-1" numberOfLines={1}>{item.product_name}</Text>
                  <Text className="text-error font-bold text-xs">0 uds</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Low Stock Warning */}
        {lowStock.length > 0 && (
          <>
            <Text className="text-xs font-bold uppercase tracking-widest mb-3 ml-1" style={{ color: '#d97706' }}>⚡ Stock Bajo</Text>
            <View className="rounded-3xl border overflow-hidden mb-6" style={{ backgroundColor: '#fef3c7', borderColor: '#fcd34d33' }}>
              {lowStock.slice(0, 10).map((item, idx) => (
                <View key={item.product_id || idx} className={`p-4 flex-row items-center gap-3 ${idx < lowStock.length - 1 ? 'border-b' : ''}`} style={{ borderColor: '#fcd34d33' }}>
                  <MaterialIcons name="inventory" size={20} color="#d97706" />
                  <Text className="text-on-surface font-medium flex-1" numberOfLines={1}>{item.product_name}</Text>
                  <Text className="font-bold text-xs" style={{ color: '#d97706' }}>{item.quantity} uds</Text>
                </View>
              ))}
            </View>
          </>
        )}

      </ScrollView>
    </SecondaryLayout>
  );
}
