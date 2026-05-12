import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, Alert, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import api from '../../../src/lib/api';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function SalesScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending'>('all');

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const data = await api.orders.list();
      
      // Process orders for debt and payment details similar to web
      const processed = data.map((o: any) => {
        let debt = 0;
        let isAbonos = o.payment_method?.toLowerCase() === 'abonos';
        
        if (isAbonos && o.notes) {
          try {
            const terms = JSON.parse(o.notes);
            const remaining = Number(o.total_amount) - Number(terms.enganche || 0);
            const montoCuota = remaining / Number(terms.pagos || 1);
            debt = remaining - (montoCuota * Number(terms.pagos_completados || 0));
          } catch(e) {}
        } else if (o.status === 'pending') {
          debt = Number(o.total_amount);
        }
        
        return { ...o, _debt: debt, _isAbonos: isAbonos };
      });
      
      setOrders(processed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Calculate KPIs
  const totalVentas = orders.reduce((sum, o) => sum + Number(o.total_amount), 0);
  const totalCobrar = orders.reduce((sum, o) => sum + (o._debt > 0 ? o._debt : 0), 0);
  const abonosActivos = orders.filter(o => o._isAbonos && o._debt > 0).length;

  const filteredOrders = orders.filter(o => {
    const term = search.toLowerCase();
    const matchesSearch = !term || (o.customer_name || '').toLowerCase().includes(term) || o.id.includes(term);
    const matchesFilter = filter === 'all' || (filter === 'pending' && o._debt > 0.01);
    return matchesSearch && matchesFilter;
  });

  const handleStatusChange = (orderId: string, action: 'deliver' | 'cancel') => {
    Alert.alert(
      action === 'deliver' ? 'Entregar Pedido' : 'Cancelar Pedido',
      `¿Estás seguro de que quieres ${action === 'deliver' ? 'marcar como entregado' : 'cancelar este pedido'}?`,
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
            } catch (err) {
              Alert.alert('Error', 'No se pudo actualizar el estado.');
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
      <View className="bg-surface-container-lowest p-5 rounded-3xl mb-4 shadow-sm border border-outline-variant/10">
        <View className="flex-row justify-between items-start mb-4">
          <View className="flex-row items-center flex-1">
            <View className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${item._isAbonos ? 'bg-tertiary/20' : 'bg-primary/20'}`}>
              <Text className={`font-bold ${item._isAbonos ? 'text-tertiary' : 'text-primary'}`}>{initials}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-bold text-base text-on-surface" numberOfLines={1}>{cName}</Text>
              <Text className="text-[10px] text-on-surface-variant font-mono">ID: {item.id.split('-')[0].toUpperCase()}</Text>
            </View>
          </View>
          
          <View className={`px-3 py-1 rounded-full flex-row items-center gap-1 ${
            isCancelled ? 'bg-error/10' : (isFullyPaid ? 'bg-secondary/10' : 'bg-primary-container/30')
          }`}>
            <View className={`w-2 h-2 rounded-full ${
              isCancelled ? 'bg-error' : (isFullyPaid ? 'bg-secondary' : 'bg-primary')
            }`} />
            <Text className={`text-xs font-bold ${
              isCancelled ? 'text-error' : (isFullyPaid ? 'text-secondary' : 'text-primary')
            }`}>
              {isCancelled ? 'Cancelado' : (isFullyPaid ? 'Pagado' : 'Con Deuda')}
            </Text>
          </View>
        </View>

        <View className="flex-row justify-between items-end mb-4">
          <View>
            <Text className="text-on-surface-variant text-xs mb-0.5">{new Date(item.created_at).toLocaleDateString('es-MX')}</Text>
            <View className={`self-start px-2 py-0.5 rounded-md ${item._isAbonos ? 'bg-tertiary/10' : 'bg-surface-container'}`}>
              <Text className={`text-[10px] font-bold ${item._isAbonos ? 'text-tertiary' : 'text-on-surface-variant'}`}>
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

        {item.status === 'pending' && (
          <View className="flex-row gap-2 mt-2 pt-4 border-t border-surface-container">
            <TouchableOpacity 
              className="flex-1 bg-surface-container py-2.5 rounded-xl items-center flex-row justify-center gap-1"
              onPress={() => handleStatusChange(item.id, 'deliver')}
            >
              <MaterialIcons name="local-shipping" size={16} color="#564336" />
              <Text className="text-on-surface font-bold text-sm">Entregar</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="bg-error/10 py-2.5 px-4 rounded-xl items-center flex-row justify-center"
              onPress={() => handleStatusChange(item.id, 'cancel')}
            >
              <MaterialIcons name="cancel" size={16} color="#ba1a1a" />
            </TouchableOpacity>
          </View>
        )}
      </View>
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
        <View className="bg-surface-container-low p-5 rounded-3xl mr-4 w-64 shadow-sm relative overflow-hidden">
          <Text className="text-on-surface-variant font-medium text-xs mb-1">Ventas Totales</Text>
          <Text className="text-3xl font-serif font-bold text-on-surface">
            ${totalVentas.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </Text>
          <MaterialIcons name="payments" size={80} color="rgba(139,90,43,0.05)" style={{position: 'absolute', bottom: -10, right: -10}} />
        </View>
        
        <View className="bg-surface-container-high p-5 rounded-3xl mr-4 w-64 shadow-sm relative overflow-hidden">
          <Text className="text-on-surface-variant font-medium text-xs mb-1">Por Cobrar</Text>
          <Text className="text-3xl font-serif font-bold text-primary">
            ${totalCobrar.toLocaleString('es-MX', {minimumFractionDigits: 2})}
          </Text>
          <Text className="text-on-surface-variant text-[10px] font-medium mt-1">{abonosActivos} abonos activos</Text>
          <MaterialIcons name="schedule" size={80} color="rgba(139,90,43,0.05)" style={{position: 'absolute', bottom: -10, right: -10}} />
        </View>

        <TouchableOpacity 
          className="bg-secondary-container p-5 rounded-3xl mr-4 w-48 shadow-sm justify-center items-start relative overflow-hidden"
          onPress={() => router.push('/sales/new')}
        >
          <Text className="text-on-secondary-container font-medium text-xs mb-1">Nueva Venta</Text>
          <View className="bg-white/50 px-4 py-2 mt-2 rounded-full flex-row items-center gap-1 border border-white/40">
            <MaterialIcons name="add-circle" size={16} color="#3e4d2b" />
            <Text className="text-on-secondary-container font-bold text-xs">Registrar</Text>
          </View>
          <MaterialIcons name="point-of-sale" size={80} color="rgba(62,77,43,0.1)" style={{position: 'absolute', bottom: -10, right: -10}} />
        </TouchableOpacity>
      </ScrollView>

      {/* Buscador y Filtros */}
      <View className="bg-surface-container-highest rounded-xl flex-row items-center px-4 py-3 shadow-sm mb-4">
        <MaterialIcons name="search" size={20} color="#564336" />
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
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {loading && orders.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#476810" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerClassName="p-6 pb-24"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialIcons name="receipt-long" size={64} color="#e7e0eb" />
              <Text className="text-on-surface mt-4 font-bold text-lg">No hay ventas registradas</Text>
              <Text className="text-on-surface-variant mt-1 text-center text-sm px-10">No pudimos encontrar ventas que coincidan con tu búsqueda.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
