import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, TextInput, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback, useEffect } from 'react';
import api from '../../../src/lib/api';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { PaymentModal } from '../../components/PaymentModal';
import { OrderStatusChips } from '../../components/OrderStatusChips';
import { formatFolio } from '../../../src/lib/orders';
import { ErrorState } from '../../components/ErrorState';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function SalesScreen() {
  const t = useThemeColors();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<'all' | 'pending'>(params.filter === 'pending' ? 'pending' : 'all');
  const [collectOrder, setCollectOrder] = useState<any>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (params.filter === 'pending') setFilter('pending');
  }, [params.filter]);

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      setLoadError(null);
      const data = await api.orders.list();
      
      const processed = data.map((o: any) => ({
        ...o,
        _debt: o.summary.balance,
        _isAbonos: o.summary.isAbonos
      }));

      setOrders(processed);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Error de conexión');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders(true);
  };

  // Calculate KPIs
  const validOrders = orders.filter(o => o.status !== 'cancelled');
  const totalVentas = validOrders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalCobrar = validOrders.reduce((sum, o) => sum + (o._debt > 0 ? o._debt : 0), 0);
  const abonosActivos = validOrders.filter(o => o._isAbonos && o._debt > 0).length;

  const filteredOrders = orders.filter(o => {
    const term = search.toLowerCase();
    const matchesSearch = !term || (o.customer_name || '').toLowerCase().includes(term) || o.id.includes(term);
    const matchesFilter = filter === 'all' || (filter === 'pending' && o._debt > 0.01);
    const matchesStatus = showCancelled ? true : o.status !== 'cancelled';
    return matchesSearch && matchesFilter && matchesStatus;
  });

  const handleStatusChange = (orderId: string, action: 'deliver' | 'cancel') => {
    Alert.alert(
      action === 'deliver' ? 'Entregar Pedido' : 'Cancelar Pedido',
      action === 'deliver' ? '¿Marcar este pedido como entregado?' : '¿Cancelar este pedido? Los productos volverán a tu inventario.',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Sí', 
          style: action === 'cancel' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              if (action === 'deliver') await api.orders.deliver(orderId);
              if (action === 'cancel') await api.orders.cancel(orderId);
              loadOrders();
            } catch (e: any) {
              Alert.alert('No se pudo actualizar el estado', e?.message || 'Error desconocido');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const isFullyPaid = item._debt <= 0.01;
    const isCancelled = item.status === 'cancelled';
    const cName = item.customer_name || 'Cliente Mostrador';
    const initials = cName.split(' ').map((n:string)=>n[0]).join('').substring(0,2).toUpperCase();
    
    return (
      <TouchableOpacity 
        onPress={() => router.push(`/sales/${item.id}` as any)}
        className="bg-surface-container-lowest p-5 rounded-3xl mb-4 shadow-sm border border-outline-variant"
        activeOpacity={0.7}
      >
        <View className="flex-row justify-between items-start mb-4">
          <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 rounded-full flex items-center justify-center mr-3" style={{ backgroundColor: item._isAbonos ? t.primaryContainer + '33' : t.primary + '33' }}>
              <Text className="font-bold" style={{ color: item._isAbonos ? t.primaryContainer : t.primary }}>{initials}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-bold text-base text-on-surface" numberOfLines={1}>{cName}</Text>
              <Text className="text-[10px] text-on-surface-variant font-mono">{formatFolio(item.id)}</Text>
            </View>
          </View>
          
        </View>

        <View className="mb-4">
          <OrderStatusChips order={item} />
        </View>

        <View className="flex-row justify-between items-end mb-4">
          <View>
            <Text className="text-on-surface-variant text-xs mb-0.5">{new Date(item.created_at).toLocaleDateString('es-MX')}</Text>
            <View className="self-start px-2 py-0.5 rounded-md" style={{ backgroundColor: item._isAbonos ? t.primaryContainer + '1A' : t.surfaceContainerHighest }}>
              <Text className="text-[10px] font-bold" style={{ color: item._isAbonos ? t.primaryContainer : t.onSurfaceVariant }}>
                {item._isAbonos ? 'ABONOS' : 'CONTADO'}
              </Text>
            </View>
          </View>
          
          <View className="items-end">
            <Text className="text-on-surface font-serif font-bold text-xl">${Number(item.total_amount).toFixed(2)}</Text>
            {item._debt > 0.01 && !isCancelled && (
              <Text className="text-[10px] text-primary font-bold uppercase mt-0.5">Pendiente: ${item._debt.toFixed(2)}</Text>
            )}
          </View>
        </View>

        {!isCancelled && (item.status === 'pending' || item._debt > 0.01) && (
          <View className="flex-row gap-2 mt-2 pt-4 border-t border-surface-container">
            {item._debt > 0.01 && (
              <TouchableOpacity
                className="flex-1 bg-primary py-2.5 rounded-xl items-center flex-row justify-center gap-1"
                onPress={() => setCollectOrder(item)}
              >
                <MaterialIcons name="payments" size={16} color="#fff" />
                <Text className="text-white font-bold text-sm">Cobrar</Text>
              </TouchableOpacity>
            )}
            {item.status === 'pending' && (
              <>
                <TouchableOpacity
                  className="flex-1 bg-surface-container py-2.5 rounded-xl items-center flex-row justify-center gap-1"
                  onPress={() => handleStatusChange(item.id, 'deliver')}
                >
                  <MaterialIcons name="local-shipping" size={16} color={t.onSurfaceVariant} />
                  <Text className="text-on-surface font-bold text-sm">Entregar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="py-2.5 px-4 rounded-xl items-center flex-row justify-center"
                  style={{ backgroundColor: t.error + '1A' }}
                  onPress={() => handleStatusChange(item.id, 'cancel')}
                  accessibilityLabel="Cancelar venta"
                >
                  <MaterialIcons name="cancel" size={16} color={t.error} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View className="mb-6">
      <View className="mb-6">
        <Text className="text-primary-container font-bold tracking-widest text-xs uppercase mb-1">Management Hub</Text>
        <Text className="text-4xl font-serif font-bold text-on-surface">Ventas</Text>
        <Text className="text-on-surface-variant mt-2 text-sm">Monitorea tu flujo de ingresos y gestiona abonos.</Text>
      </View>

      {/* KPI Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 overflow-visible">
        <View className="bg-surface-container-lowest p-5 rounded-3xl mr-4 w-64 shadow-sm relative overflow-hidden border border-outline-variant">
          <Text className="text-on-surface-variant font-medium text-xs mb-1">Ventas Totales</Text>
          <Text className="text-3xl font-serif font-bold text-on-surface">
            ${totalVentas.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </Text>
          <MaterialIcons name="payments" size={80} color={t.primary + '1A'} style={{position: 'absolute', bottom: -10, right: -10}} />
        </View>
        
        <TouchableOpacity activeOpacity={0.8} onPress={() => setFilter('pending')} className="bg-surface-container-highest p-5 rounded-3xl mr-4 w-64 shadow-sm relative overflow-hidden border border-outline-variant">
          <Text className="text-on-surface-variant font-medium text-xs mb-1">Por Cobrar</Text>
          <Text className="text-3xl font-serif font-bold text-primary">
            ${totalCobrar.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </Text>
          <Text className="text-on-surface-variant text-[10px] font-medium mt-1">{abonosActivos} abonos activos</Text>
          <MaterialIcons name="schedule" size={80} color={t.primary + '1A'} style={{position: 'absolute', bottom: -10, right: -10}} />
        </TouchableOpacity>

        <TouchableOpacity 
          className="bg-secondary-container p-5 rounded-3xl mr-4 w-48 shadow-sm justify-center items-start relative overflow-hidden border border-outline-variant"
          onPress={() => router.push('/sales/new')}
        >
          <Text className="text-on-surface font-medium text-xs mb-1">Nueva Venta</Text>
          <View className="px-4 py-2 mt-2 rounded-full flex-row items-center gap-1 border border-outline-variant" style={{ backgroundColor: t.surfaceContainerLowest + '80' }}>
            <MaterialIcons name="add-circle" size={16} color={t.onSurface} />
            <Text className="text-on-surface font-bold text-xs">Registrar</Text>
          </View>
          <MaterialIcons name="point-of-sale" size={80} color={t.onSurface + '1A'} style={{position: 'absolute', bottom: -10, right: -10}} />
        </TouchableOpacity>
      </ScrollView>

      {/* Buscador y Filtros */}
      <View className="bg-surface-container-highest border border-outline-variant rounded-xl flex-row items-center px-4 py-3 shadow-sm mb-4">
        <MaterialIcons name="search" size={20} color={t.onSurfaceVariant} />
        <TextInput
          className="flex-1 ml-3 text-sm text-on-surface font-sans"
          placeholder="Buscar por cliente o folio..."
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View className="flex-row gap-2">
        <TouchableOpacity 
          className={`px-4 py-1.5 rounded-xl ${filter === 'all' ? 'bg-primary shadow-sm' : 'bg-surface-container'}`}
          onPress={() => setFilter('all')}
        >
          <Text className={`text-xs font-bold ${filter === 'all' ? 'text-white' : 'text-on-surface-variant'}`}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          className={`px-4 py-1.5 rounded-xl ${filter === 'pending' ? 'bg-primary shadow-sm' : 'bg-surface-container'}`}
          onPress={() => setFilter('pending')}
        >
          <Text className={`text-xs font-bold ${filter === 'pending' ? 'text-white' : 'text-on-surface-variant'}`}>Con Deuda</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity 
        className="mt-4 flex-row items-center gap-2 self-start px-3 py-1.5 rounded-full border border-outline-variant"
        style={{ backgroundColor: showCancelled ? t.surfaceContainerHighest : t.surfaceContainerLowest }}
        onPress={() => setShowCancelled(!showCancelled)}
      >
        <MaterialIcons name={showCancelled ? "visibility" : "visibility-off"} size={16} color={t.onSurfaceVariant} />
        <Text className="text-xs font-bold text-on-surface-variant">Mostrar Ventas Canceladas</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {loading && orders.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerClassName="p-6 pb-24"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.primary]} tintColor={t.primary} />}
          ListEmptyComponent={
            loadError ? <ErrorState message={loadError} onRetry={() => loadOrders()} /> :
            <View className="items-center justify-center py-16">
              <MaterialIcons name="receipt-long" size={64} color={t.surfaceContainerHighest} />
              <Text className="text-on-surface mt-4 font-bold text-lg">No hay ventas registradas</Text>
              <Text className="text-on-surface-variant mt-1 text-center text-sm px-10">No pudimos encontrar ventas que coincidan con tu búsqueda.</Text>
            </View>
          }
        />
      )}
      {collectOrder && (
        <PaymentModal
          visible
          orderId={collectOrder.id}
          customerName={collectOrder.customer_name || 'Cliente Mostrador'}
          balance={collectOrder._debt}
          suggested={collectOrder.summary.suggestedPayment}
          onClose={() => setCollectOrder(null)}
          onSaved={() => loadOrders(true)}
        />
      )}
    </SafeAreaView>
  );
}
