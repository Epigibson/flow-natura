import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import SecondaryLayout from '../../components/SecondaryLayout';
import { ErrorState } from '../../components/ErrorState';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { loadReport, REPORT_PERIODS, type ReportData, type ReportPeriod } from '../../../src/lib/reports';
import { formatMoney } from '../../../src/lib/orders';

/** Same report, same numbers and sections as /reportes on the web. */
export default function ReportsScreen() {
  const t = useThemeColors();
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      setData(await loadReport(period));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Error de conexión');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 mb-6 p-5">{children}</View>
  );
  const Title = ({ children }: { children: string }) => (
    <Text className="font-serif font-bold text-xl text-on-surface mb-3">{children}</Text>
  );
  const Bar = ({ pct, color }: { pct: number; color: string }) => (
    <View className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: t.surfaceContainerHighest }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color, borderRadius: 999 }} />
    </View>
  );

  return (
    <SecondaryLayout title="Reportes 📊" scrollable={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} colors={[t.primary]} tintColor={t.primary} />}
      >
        {/* Period selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
          {REPORT_PERIODS.map(p => (
            <TouchableOpacity
              key={p.value}
              onPress={() => setPeriod(p.value)}
              className="px-4 py-2 rounded-full mr-2 border"
              style={{
                backgroundColor: period === p.value ? t.primary : t.surfaceContainerLowest,
                borderColor: period === p.value ? t.primary : t.outlineVariant,
              }}
            >
              <Text style={{ color: period === p.value ? '#fff' : t.onSurfaceVariant, fontWeight: '700', fontSize: 12 }}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loading ? (
          <View className="py-20 items-center"><ActivityIndicator size="large" color={t.primary} /></View>
        ) : error || !data ? (
          <ErrorState message={error || undefined} onRetry={() => load()} />
        ) : (
          <>
            {/* KPIs */}
            <View className="bg-primary p-6 rounded-3xl mb-6 shadow-lg relative overflow-hidden">
              <MaterialIcons name="trending-up" size={100} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', right: -10, top: -10 }} />
              <Text className="text-white/80 text-sm font-bold uppercase tracking-widest mb-1">Ventas del periodo</Text>
              <Text className="text-white font-extrabold text-4xl mb-4">{formatMoney(data.kpis.revenue)}</Text>
              <View className="flex-row justify-between border-t border-white/20 pt-4">
                <View>
                  <Text className="text-white/70 text-xs">Ventas</Text>
                  <Text className="text-white font-bold text-lg">{data.kpis.orders}</Text>
                </View>
                <View>
                  <Text className="text-white/70 text-xs">Ticket promedio</Text>
                  <Text className="text-white font-bold text-lg">{formatMoney(data.kpis.avgTicket)}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-white/70 text-xs">Clientes nuevos</Text>
                  <Text className="text-white font-bold text-lg">{data.kpis.newClients}</Text>
                </View>
              </View>
            </View>

            <View className="flex-row gap-3 mb-6">
              <View className="flex-1 bg-surface-container-lowest rounded-3xl p-4 border border-outline-variant/10">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Cobrado</Text>
                <Text className="text-xl font-bold mt-1" style={{ color: t.secondary }}>{formatMoney(data.kpis.collected)}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push({ pathname: '/sales', params: { filter: 'pending' } } as any)}
                className="flex-1 bg-surface-container-lowest rounded-3xl p-4 border border-outline-variant/10"
              >
                <Text className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Por cobrar →</Text>
                <Text className="text-xl font-bold mt-1" style={{ color: t.error }}>{formatMoney(data.kpis.pending)}</Text>
              </TouchableOpacity>
              <View className="flex-1 bg-surface-container-lowest rounded-3xl p-4 border border-outline-variant/10">
                <Text className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Tasa cobro</Text>
                <Text className="text-xl font-bold mt-1 text-on-surface">{data.kpis.collectionRate.toFixed(0)}%</Text>
              </View>
            </View>

            {/* Daily */}
            <Card>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="font-bold text-on-surface">Ventas por día</Text>
                {data.daily.length > 0 && (() => {
                  const best = data.daily.reduce((a, b) => (a.amount > b.amount ? a : b));
                  return <Text className="text-xs text-on-surface-variant font-bold">Mejor: {best.label} ({formatMoney(best.amount)})</Text>;
                })()}
              </View>
              {data.daily.length === 0 ? (
                <Text className="text-on-surface-variant text-sm text-center py-6">Sin ventas en este periodo.</Text>
              ) : (
                <View className="flex-row items-end h-32">
                  {(() => {
                    const max = Math.max(...data.daily.map(d => d.amount), 1);
                    return data.daily.map((d, i) => (
                      <View key={i} className="flex-1 items-center" style={{ height: '100%', justifyContent: 'flex-end', paddingHorizontal: 1 }}>
                        <View style={{ width: '80%', height: `${Math.max((d.amount / max) * 100, 4)}%`, backgroundColor: t.secondary, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                        <Text className="text-[9px] text-on-surface-variant mt-1 font-bold" numberOfLines={1}>{d.label.split(' ')[0]}</Text>
                      </View>
                    ));
                  })()}
                </View>
              )}
            </Card>

            {/* Categories */}
            <Title>Ventas por categoría</Title>
            <Card>
              {data.categories.length === 0 ? (
                <Text className="text-on-surface-variant text-sm text-center py-4">Sin datos de categorías.</Text>
              ) : data.categories.map((c, i) => (
                <View key={c.name} className={i > 0 ? 'mt-4' : ''}>
                  <View className="flex-row justify-between mb-1.5">
                    <Text className="font-bold text-on-surface text-sm flex-1 pr-2" numberOfLines={1}>{c.name}</Text>
                    <Text className="text-on-surface-variant font-bold text-sm">{formatMoney(c.amount)} ({c.pct.toFixed(0)}%)</Text>
                  </View>
                  <Bar pct={(c.amount / data.categories[0].amount) * 100} color={t.primary} />
                </View>
              ))}
            </Card>

            {/* Payment methods */}
            <Title>Contado vs. abonos</Title>
            <Card>
              {data.methods.map((m, i) => (
                <View key={m.name} className={i > 0 ? 'mt-4' : ''}>
                  <View className="flex-row justify-between mb-1.5">
                    <Text className="font-bold text-on-surface text-sm">{m.name} <Text className="text-on-surface-variant font-normal">· {m.count} ventas</Text></Text>
                    <Text className="text-on-surface-variant font-bold text-sm">{formatMoney(m.amount)} ({m.pct.toFixed(0)}%)</Text>
                  </View>
                  <Bar pct={m.pct} color={m.name === 'Contado' ? t.secondary : t.primary} />
                </View>
              ))}
            </Card>

            {/* Reorder */}
            <Title>Reabastecer</Title>
            <Card>
              {data.reorder.length === 0 ? (
                <View className="items-center py-2">
                  <MaterialIcons name="check-circle" size={32} color={t.secondary} />
                  <Text className="font-bold mt-2" style={{ color: t.secondary }}>Stock saludable</Text>
                  <Text className="text-on-surface-variant text-xs mt-1 text-center">Todos tus productos tienen inventario suficiente.</Text>
                </View>
              ) : data.reorder.map((p, i) => (
                <View key={p.productId} className={`flex-row items-center ${i > 0 ? 'mt-3 pt-3 border-t border-outline-variant/20' : ''}`}>
                  <View className="flex-1 pr-3">
                    <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{p.name}</Text>
                    <Text className="text-xs text-on-surface-variant">Vendidos: {p.sold} · Stock: {p.stock}</Text>
                  </View>
                  <View className="px-3 py-1 rounded-full" style={{ backgroundColor: (p.stock <= 0 ? t.error : t.primary) + '1A' }}>
                    <Text style={{ color: p.stock <= 0 ? t.error : t.primary, fontSize: 11, fontWeight: '700' }}>{p.stock <= 0 ? 'Agotado' : 'Reabastecer'}</Text>
                  </View>
                </View>
              ))}
            </Card>

            {/* Client predictions */}
            <Title>Clientes por volver a comprar</Title>
            <Card>
              {data.clientPredictions.length === 0 ? (
                <Text className="text-on-surface-variant text-sm text-center py-2">Se necesitan más datos históricos de ventas.</Text>
              ) : data.clientPredictions.map((c, i) => (
                <TouchableOpacity
                  key={c.customerId}
                  className={`flex-row items-center ${i > 0 ? 'mt-3 pt-3 border-t border-outline-variant/20' : ''}`}
                  onPress={() => router.push('/customers' as any)}
                >
                  <View className="flex-1 pr-3">
                    <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{c.name}</Text>
                    <Text className="text-xs text-on-surface-variant">Hace {Math.round(c.daysSince)} días (promedio {Math.round(c.avgDays)})</Text>
                  </View>
                  <View className="px-3 py-1 rounded-full" style={{ backgroundColor: (c.overdue ? t.error : t.primary) + '1A' }}>
                    <Text style={{ color: c.overdue ? t.error : t.primary, fontSize: 11, fontWeight: '700' }}>{c.overdue ? 'Vencido' : 'Pronto'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          </>
        )}
        <View className="h-10" />
      </ScrollView>
    </SecondaryLayout>
  );
}
