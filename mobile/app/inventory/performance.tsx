import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import { loadInventoryPerformance, type InventoryPerformance } from '../../../src/lib/inventory-performance';
import { ErrorState } from '../../components/ErrorState';
import { formatMoney } from '../../../src/lib/orders';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function InventoryPerformanceScreen() {
  const t = useThemeColors();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<InventoryPerformance | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      setPerf(await loadInventoryPerformance());
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <SecondaryLayout title="Rendimiento de Inventario 📦">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      </SecondaryLayout>
    );
  }

  if (error || !perf) {
    return (
      <SecondaryLayout title="Rendimiento 📦">
        <ErrorState message={error || undefined} onRetry={loadData} />
      </SecondaryLayout>
    );
  }

  const { sales, stock } = perf;
  const totalProducts = stock.products;
  const totalUnits = stock.units;
  const totalValue = stock.retailValue;
  const totalCostValue = stock.costValue;
  const potentialProfit = stock.potentialProfit;
  const outOfStock = stock.outOfStock.map(i => ({ product_id: i.productId, product_name: i.name, quantity: 0 }));
  const lowStock = stock.lowStock.map(i => ({ product_id: i.productId, product_name: i.name, quantity: i.quantity }));

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

        {/* What actually sold (same as the web) */}
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1 bg-surface-container-lowest p-4 rounded-3xl shadow-sm border border-outline-variant/10">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Unidades vendidas</Text>
            <Text className="text-2xl font-bold text-on-surface mt-1">{sales.totalSold.toLocaleString('es-MX')}</Text>
          </View>
          <View className="flex-1 bg-surface-container-lowest p-4 rounded-3xl shadow-sm border border-outline-variant/10">
            <Text className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Ingresos por productos</Text>
            <Text className="text-2xl font-bold mt-1" style={{ color: t.secondary }}>{formatMoney(sales.totalRevenue)}</Text>
          </View>
        </View>

        <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Productos más vendidos</Text>
        <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden mb-6">
          {sales.products.length === 0 ? (
            <Text className="text-on-surface-variant text-sm text-center p-6">Registra ventas para ver el análisis de rendimiento.</Text>
          ) : sales.products.slice(0, 10).map((p, idx) => (
            <View key={p.id} className={`p-4 ${idx < Math.min(sales.products.length, 10) - 1 ? 'border-b border-outline-variant/10' : ''}`}>
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-3 flex-1 pr-2">
                  <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
                    <Text className="font-bold text-primary text-xs">{idx + 1}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{p.name}</Text>
                    <Text className="text-[10px] text-on-surface-variant">{p.qtySold} unidades · {p.category}</Text>
                  </View>
                </View>
                <Text className="font-bold" style={{ color: t.secondary }}>{formatMoney(p.revenue)}</Text>
              </View>
              <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: t.surfaceContainerHighest }}>
                <View style={{ width: `${sales.products[0].revenue > 0 ? (p.revenue / sales.products[0].revenue) * 100 : 0}%`, height: '100%', backgroundColor: t.primary, borderRadius: 999 }} />
              </View>
            </View>
          ))}
        </View>

        {sales.categories.length > 0 && (
          <>
            <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3 ml-1">Por categoría</Text>
            <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 p-4 mb-6">
              {sales.categories.map((c, idx) => (
                <View key={c.name} className={idx > 0 ? 'mt-4' : ''}>
                  <View className="flex-row justify-between mb-1">
                    <Text className="font-bold text-on-surface text-sm">{c.name}</Text>
                    <Text className="font-bold text-on-surface-variant text-sm">{c.pct.toFixed(0)}%</Text>
                  </View>
                  <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: t.surfaceContainerHighest }}>
                    <View style={{ width: `${c.pct}%`, height: '100%', backgroundColor: t.secondary, borderRadius: 999 }} />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {sales.unsold.length > 0 && (
          <>
            <Text className="text-xs font-bold uppercase tracking-widest mb-3 ml-1" style={{ color: t.error }}>Sin movimiento</Text>
            <View className="bg-surface-container-lowest rounded-3xl border border-outline-variant/10 overflow-hidden mb-6">
              {sales.unsold.slice(0, 6).map((u, idx) => (
                <View key={u.productId} className={`p-4 flex-row items-center justify-between ${idx < Math.min(sales.unsold.length, 6) - 1 ? 'border-b border-outline-variant/10' : ''}`}>
                  <View className="flex-1 pr-3">
                    <Text className="text-on-surface font-medium" numberOfLines={1}>{u.name}</Text>
                    <Text className="text-[10px] text-on-surface-variant">{u.category} · Stock: {u.stock}</Text>
                  </View>
                  <Text className="text-on-surface-variant text-xs font-bold">Nunca vendido</Text>
                </View>
              ))}
            </View>
          </>
        )}

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
