import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import api from '../../../src/lib/api';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function QuickAddScreen() {
  const t = useThemeColors();
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Already in inventory
  const [myInventory, setMyInventory] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [allProducts, inv] = await Promise.all([
        api.products.list({ search: '' }),
        api.inventory.list(),
      ]);
      setProducts(allProducts || []);
      const invIds = new Set((inv || []).map((i: any) => i.product_id));
      setMyInventory(invIds as Set<string>);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter(p => {
    const term = search.toLowerCase();
    if (!term) return true;
    return (
      (p.name || '').toLowerCase().includes(term) ||
      (p.code || '').toLowerCase().includes(term) ||
      (p.brand || '').toLowerCase().includes(term) ||
      (p.category || '').toLowerCase().includes(term)
    );
  });

  function getQuantity(id: string): number {
    return quantities[id] || 1;
  }

  function setQuantity(id: string, val: number) {
    setQuantities(prev => ({ ...prev, [id]: Math.max(1, val) }));
  }

  async function handleAddToInventory(product: any) {
    const qty = getQuantity(product.id);
    setAdding(product.id);
    try {
      await api.inventory.add([{
        product_id: product.id,
        quantity: qty,
      }]);
      setMyInventory(prev => new Set([...prev, product.id]));
      Alert.alert('✅ Agregado', `${product.name} (${qty} uds) fue agregado a tu inventario.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo agregar.');
    } finally {
      setAdding(null);
    }
  }

  const renderProduct = ({ item }: { item: any }) => {
    const isInInventory = myInventory.has(item.id);
    const qty = getQuantity(item.id);
    const isAdding = adding === item.id;

    return (
      <View className="bg-surface-container-lowest p-4 rounded-2xl mb-3 shadow-sm border border-outline-variant/10">
        <View className="flex-row items-start gap-3">
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} className="w-16 h-16 rounded-xl bg-surface-container-highest" resizeMode="contain" />
          ) : (
            <View className="w-16 h-16 rounded-xl bg-primary/10 items-center justify-center">
              <MaterialIcons name="spa" size={24} color={t.primary} />
            </View>
          )}
          <View className="flex-1">
            <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{item.name}</Text>
            <Text className="text-[10px] text-on-surface-variant mt-0.5">
              {item.brand || 'Natura'} · {item.category || 'Sin categoría'}
              {item.code ? ` · ${item.code}` : ''}
            </Text>
            <Text className="text-primary font-bold text-base mt-1">${Number(item.price || 0).toFixed(2)}</Text>
          </View>
        </View>

        {isInInventory ? (
          <View className="mt-3 bg-secondary/10 py-2 rounded-xl flex-row items-center justify-center gap-2">
            <MaterialIcons name="check-circle" size={16} color={t.secondary} />
            <Text className="text-secondary font-bold text-xs">Ya está en tu inventario</Text>
          </View>
        ) : (
          <View className="mt-3 flex-row items-center gap-2">
            {/* Quantity controls */}
            <View className="flex-row items-center bg-surface-container-highest rounded-xl overflow-hidden">
              <TouchableOpacity className="px-3 py-2" onPress={() => setQuantity(item.id, qty - 1)}>
                <MaterialIcons name="remove" size={18} color={t.onSurfaceVariant} />
              </TouchableOpacity>
              <Text className="px-3 font-bold text-on-surface text-base">{qty}</Text>
              <TouchableOpacity className="px-3 py-2" onPress={() => setQuantity(item.id, qty + 1)}>
                <MaterialIcons name="add" size={18} color={t.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              className="flex-1 bg-primary py-3 rounded-xl flex-row items-center justify-center gap-2"
              onPress={() => handleAddToInventory(item)}
              disabled={isAdding}
            >
              {isAdding ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <MaterialIcons name="add-shopping-cart" size={16} color="#fff" />
                  <Text className="text-white font-bold text-xs">Agregar al Inventario</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-4 border-b border-outline-variant/10">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center border mr-2"
          style={{ backgroundColor: t.surfaceContainerHighest, borderColor: t.outlineVariant }}
        >
          <MaterialIcons name="arrow-back" size={24} color={t.onSurface} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-on-surface ml-2">Alta Rápida</Text>
          <Text className="text-[10px] text-on-surface-variant ml-2">Busca en el catálogo global y agrega a tu inventario</Text>
        </View>
      </View>

      {/* Search */}
      <View className="px-4 py-3">
        <View className="bg-surface-container-highest border border-outline-variant rounded-xl flex-row items-center px-4 py-3">
          <MaterialIcons name="search" size={20} color={t.onSurfaceVariant} />
          <TextInput
            className="flex-1 ml-3 text-sm text-on-surface"
            placeholder="Buscar por nombre, código o marca..."
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialIcons name="close" size={20} color={t.onSurfaceVariant} />
            </TouchableOpacity>
          )}
        </View>
        <Text className="text-xs text-on-surface-variant mt-2 ml-1">
          {filteredProducts.length} productos encontrados
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={item => item.id}
          renderItem={renderProduct}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialIcons name="search-off" size={64} color={t.surfaceContainerHighest} />
              <Text className="text-on-surface mt-4 font-bold text-lg">No hay resultados</Text>
              <Text className="text-on-surface-variant mt-1 text-center text-sm px-10">
                Prueba con otro término de búsqueda.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
