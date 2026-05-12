import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Image, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import api from '../../../src/lib/api';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function AdjustmentsScreen() {
  const t = useThemeColors();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal state
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [adjType, setAdjType] = useState<'increase'|'decrease'|'correction'>('increase');
  const [adjQty, setAdjQty] = useState('1');
  const [adjReason, setAdjReason] = useState('other');
  const [adjNotes, setAdjNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invData, adjData] = await Promise.all([
        api.inventory.list(),
        api.inventory.getAdjustments(20)
      ]);
      setInventory(invData);
      setAdjustments(adjData);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }

  const filteredInventory = inventory.filter(i => 
    i.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.product_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleApplyAdjustment = async () => {
    if (!selectedProduct) return;
    const qty = parseInt(adjQty) || 0;
    const cur = selectedProduct.quantity;
    let rq: number;

    if (adjType === 'increase') {
      if (qty < 1) return Alert.alert('Error', 'La cantidad debe ser mayor a 0');
      rq = qty;
    } else if (adjType === 'decrease') {
      if (qty < 1) return Alert.alert('Error', 'La cantidad debe ser mayor a 0');
      if (qty > cur) return Alert.alert('Error', `Solo hay ${cur} unidades disponibles`);
      rq = -qty;
    } else {
      if (qty < 0) return Alert.alert('Error', 'La cantidad no puede ser negativa');
      rq = qty - cur;
    }

    setIsSubmitting(true);
    try {
      await api.inventory.applyAdjustment({
        product_id: selectedProduct.product_id,
        adjustment_type: adjType,
        quantity: rq,
        previous_quantity: cur,
        reason: adjReason,
        notes: adjNotes
      });
      Alert.alert('Éxito', 'Ajuste registrado correctamente');
      setSelectedProduct(null);
      setAdjQty('1');
      setAdjNotes('');
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al aplicar el ajuste');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReasonLabel = (r: string) => {
    const labels: Record<string, string> = {
      restock: 'Reposición', return: 'Devolución', damaged: 'Dañado',
      demo: 'Demostración', personal: 'Uso personal', count: 'Conteo cíclico',
      expired: 'Vencido', other: 'Otro'
    };
    return labels[r] || r;
  };

  return (
    <SafeAreaView className="flex-1 bg-surface">
      {/* Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-outline-variant bg-surface">
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="w-10 h-10 rounded-full flex items-center justify-center mr-4 border"
          style={{ backgroundColor: t.surfaceContainerHighest, borderColor: t.outlineVariant, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={t.onSurface} />
        </TouchableOpacity>
        <View>
          <Text className="font-bold text-lg text-on-surface">Ajustes de Stock</Text>
          <Text className="text-xs text-on-surface-variant">Modifica inventario manualmente</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-6">
        {/* Search */}
        <View className="bg-surface-container rounded-2xl flex-row items-center px-4 mb-6">
          <Text className="text-xl mr-2">🔍</Text>
          <TextInput
            placeholder="Buscar producto por nombre..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 py-4 text-on-surface font-medium"
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#8b5a2b" className="mt-10" />
        ) : (
          <>
            {/* Products List */}
            <Text className="font-serif font-bold text-lg mb-4 text-primary">Selecciona un producto</Text>
            <View className="bg-surface-container-lowest rounded-3xl border border-outline-variant overflow-hidden mb-8">
              {filteredInventory.slice(0, 10).map((item, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  onPress={() => setSelectedProduct(item)}
                  className={`flex-row items-center p-4 ${idx > 0 ? 'border-t border-outline-variant' : ''}`}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} className="w-12 h-12 rounded-xl bg-white mr-4" resizeMode="contain" />
                  ) : (
                    <View className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center mr-4">
                      <Text className="text-xl opacity-50">🧴</Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="font-bold text-sm text-on-surface mb-1" numberOfLines={1}>{item.product_name}</Text>
                    <Text className="text-[10px] text-on-surface-variant">{item.category} • #{item.product_code}</Text>
                  </View>
                  <View className="items-end shrink-0 ml-2">
                    <Text className="text-[10px] uppercase font-bold text-on-surface-variant">Stock</Text>
                    <Text className={`font-bold ${item.quantity > 0 ? 'text-primary' : 'text-error'}`}>{item.quantity}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {filteredInventory.length === 0 && (
                <View className="p-8 items-center">
                  <Text className="text-on-surface-variant">No hay productos en inventario.</Text>
                </View>
              )}
            </View>

            {/* Recent Adjustments */}
            <Text className="font-serif font-bold text-lg mb-4 text-secondary">Últimos Ajustes</Text>
            <View className="mb-10">
              {adjustments.map((adj, idx) => {
                const isPos = adj.quantity > 0;
                return (
                  <View key={idx} className={`flex-row items-center py-3 ${idx > 0 ? 'border-t border-surface-container' : ''}`}>
                    <View className="w-10 h-10 rounded-full flex items-center justify-center mr-3" style={{ backgroundColor: isPos ? t.secondary + '33' : t.error + '33' }}>
                      <Text className="text-lg">{isPos ? '➕' : '➖'}</Text>
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{adj.product_name}</Text>
                      <Text className="text-[10px] text-on-surface-variant mt-0.5">{getReasonLabel(adj.reason)}</Text>
                    </View>
                    <View className="items-end">
                      <Text className={`font-bold ${isPos ? 'text-green-600' : 'text-red-500'}`}>
                        {isPos ? '+' : ''}{adj.quantity}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {adjustments.length === 0 && (
                <Text className="text-on-surface-variant text-center py-4">No hay historial de ajustes.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Adjustment Modal */}
      <Modal visible={!!selectedProduct} animationType="slide" transparent={true}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-surface rounded-t-[2rem] p-6 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-serif font-bold text-on-surface">Ajustar Stock</Text>
              <TouchableOpacity onPress={() => setSelectedProduct(null)} className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center">
                <Text>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="flex-row items-center p-4 rounded-2xl border mb-6" style={{ backgroundColor: t.primary + '1A', borderColor: t.primary + '33' }}>
                  {selectedProduct.image_url ? (
                    <Image source={{ uri: selectedProduct.image_url }} className="w-12 h-12 rounded-xl bg-white mr-4" resizeMode="contain" />
                  ) : (
                    <View className="w-12 h-12 rounded-xl bg-surface-container mr-4" />
                  )}
                  <View className="flex-1">
                    <Text className="font-bold text-on-surface" numberOfLines={1}>{selectedProduct.product_name}</Text>
                    <Text className="text-xs text-on-surface-variant">Stock actual: <Text className="font-bold text-primary">{selectedProduct.quantity}</Text></Text>
                  </View>
                </View>

                {/* Type Selection */}
                <Text className="font-bold text-sm text-on-surface-variant mb-2">Tipo de Ajuste</Text>
                <View className="flex-row gap-2 mb-6">
                  <TouchableOpacity 
                    onPress={() => setAdjType('increase')}
                    className="flex-1 py-3 rounded-xl border"
                    style={{ backgroundColor: adjType === 'increase' ? t.secondary + '1A' : t.surfaceContainer, borderColor: adjType === 'increase' ? t.secondary : 'transparent' }}
                  >
                    <Text className="text-center font-bold text-on-surface-variant" style={{ color: adjType === 'increase' ? t.secondary : t.onSurfaceVariant }}>Entrada</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setAdjType('decrease')}
                    className="flex-1 py-3 rounded-xl border"
                    style={{ backgroundColor: adjType === 'decrease' ? t.error + '1A' : t.surfaceContainer, borderColor: adjType === 'decrease' ? t.error : 'transparent' }}
                  >
                    <Text className="text-center font-bold text-on-surface-variant" style={{ color: adjType === 'decrease' ? t.error : t.onSurfaceVariant }}>Salida</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setAdjType('correction')}
                    className="flex-1 py-3 rounded-xl border"
                    style={{ backgroundColor: adjType === 'correction' ? t.primary + '1A' : t.surfaceContainer, borderColor: adjType === 'correction' ? t.primary : 'transparent' }}
                  >
                    <Text className="text-center font-bold text-on-surface-variant" style={{ color: adjType === 'correction' ? t.primary : t.onSurfaceVariant }}>Exacto</Text>
                  </TouchableOpacity>
                </View>

                {/* Quantity */}
                <Text className="font-bold text-sm text-on-surface-variant mb-2">
                  {adjType === 'increase' ? 'Cantidad a sumar' : adjType === 'decrease' ? 'Cantidad a restar' : 'Nuevo stock total'}
                </Text>
                <TextInput 
                  className="w-full bg-surface-container rounded-xl py-4 px-4 text-center text-3xl font-bold mb-6 text-on-surface"
                  placeholder="0"
                  keyboardType="numeric"
                  value={adjQty}
                  onChangeText={setAdjQty}
                />

                {/* Reason Selection (simplified for mobile) */}
                <Text className="font-bold text-sm text-on-surface-variant mb-2">Motivo</Text>
                <View className="flex-row flex-wrap gap-2 mb-6">
                  {['restock', 'return', 'damaged', 'personal', 'count', 'other'].map((r) => (
                    <TouchableOpacity 
                      key={r}
                      onPress={() => setAdjReason(r)}
                      className="px-4 py-2 rounded-full border"
                      style={{ backgroundColor: adjReason === r ? t.primary + '1A' : t.surfaceContainer, borderColor: adjReason === r ? t.primary : 'transparent' }}
                    >
                      <Text className="text-xs font-bold" style={{ color: adjReason === r ? t.primary : t.onSurfaceVariant }}>{getReasonLabel(r)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Notes */}
                <Text className="font-bold text-sm text-on-surface-variant mb-2">Notas (opcional)</Text>
                <TextInput 
                  className="w-full bg-surface-container rounded-xl p-4 mb-6 text-on-surface"
                  placeholder="Detalles del ajuste..."
                  value={adjNotes}
                  onChangeText={setAdjNotes}
                />

                <TouchableOpacity 
                  onPress={handleApplyAdjustment}
                  disabled={isSubmitting}
                  className={`w-full py-4 rounded-xl flex-row items-center justify-center ${isSubmitting ? 'bg-outline' : 'bg-primary'}`}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-lg">Confirmar Ajuste</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
