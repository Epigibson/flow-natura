import { View, Text, FlatList, TextInput, ActivityIndicator, Image, TouchableOpacity, ScrollView, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import api from '../../../src/lib/api';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { haptic } from '../../lib/haptics';

export default function InventoryScreen() {
  const t = useThemeColors();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const loadInventory = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const data = await api.inventory.list({ search });
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search]);

  // One-time cleanup of duplicate inventory records
  const hasCleanedUp = React.useRef(false);

  // Reload when screen gains focus (coming back from edit/add)
  useFocusEffect(
    useCallback(() => {
      // Run cleanup once per session, then load
      if (!hasCleanedUp.current) {
        hasCleanedUp.current = true;
        api.inventory.cleanupDuplicates().then((cleaned) => {
          if (cleaned > 0) console.log(`Cleaned up ${cleaned} duplicate inventory records`);
          loadInventory();
        }).catch(() => loadInventory());
      } else {
        loadInventory();
      }
    }, [loadInventory])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadInventory(true);
  };

  // KPIs
  const totalProducts = items.length;
  const categoriesCount = new Set(items.map(i => i.category || 'General')).size;
  const inStock = items.filter(i => i.quantity > 0).length;

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleAdjustQuantity = async (productId: string, currentQuantity: number, delta: number) => {
    const newQuantity = Math.max(0, currentQuantity + delta);
    if (newQuantity === currentQuantity) return; // No negative quantities

    setUpdatingId(productId);
    haptic.light();
    try {
      // Optimistic update
      setItems(prev => prev.map(item => item.product_id === productId ? { ...item, quantity: newQuantity } : item));
      
      // Real API call
      await api.inventory.applyAdjustment({
        product_id: productId,
        adjustment_type: delta > 0 ? 'addition' : 'subtraction',
        quantity: Math.abs(delta),
        previous_quantity: currentQuantity,
        reason: delta > 0 ? 'Ajuste manual (Mobile +)' : 'Ajuste manual (Mobile -)'
      });
    } catch (e: any) {
      console.error(e);
      // Revert on error
      setItems(prev => prev.map(item => item.product_id === productId ? { ...item, quantity: currentQuantity } : item));
      haptic.error();
      Alert.alert('Error', 'No se pudo actualizar el inventario');
    } finally {
      setUpdatingId(null);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isOutOfStock = item.quantity <= 0;
    const brandLabel = item.brand || "Natura";
    const isUpdating = updatingId === item.product_id;

    return (
      <View className="flex-1 bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant m-2 mb-4">
        {/* Tappable area: Image + Info → navigates to edit */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push({ pathname: '/inventory/edit', params: { productId: item.product_id, productName: item.product_name } } as any)}
        >
          {/* Imagen y badges */}
          <View className="h-32 flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: t.primaryContainer + '1A' }}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} className="w-full h-full" resizeMode="contain" />
            ) : (
              <MaterialIcons name="spa" size={36} color={t.surfaceContainerHighest} />
            )}
            <View className="absolute top-2 left-2 px-2 py-0.5 rounded-full backdrop-blur-md" style={{ backgroundColor: t.primary + '1A' }}>
              <Text className="text-primary text-[10px] font-bold">{brandLabel}</Text>
            </View>
          </View>

          {/* Info */}
          <View className="p-3 pb-1">
            <View className="flex-row justify-between items-start mb-1">
              <Text className="text-[9px] font-bold uppercase tracking-wider text-primary opacity-80">{item.category || 'General'}</Text>
              <Text className="text-[9px] text-on-surface-variant opacity-70 font-mono bg-surface-container-highest px-1.5 py-0.5 rounded">
                {item.product_code || '00000'}
              </Text>
            </View>
            <Text className="font-bold text-on-surface text-xs leading-tight mb-2 h-8" numberOfLines={2}>{item.product_name}</Text>
          </View>
        </TouchableOpacity>

        {/* Quantity controls — OUTSIDE the navigation touchable to prevent event conflicts */}
        <View className="px-3 pb-3">
          <View className="flex-row justify-between items-center pt-2 border-t border-outline-variant">
            <View>
              <Text className="text-[9px] text-on-surface-variant uppercase font-bold tracking-wide">Precio</Text>
              <Text className="text-sm font-bold text-primary">${Number(item.price || 0).toFixed(0)}</Text>
            </View>
            
            <View className={`flex-row items-center bg-surface-container-highest rounded-lg p-0.5 ${isUpdating ? 'opacity-50' : ''}`}>
              <TouchableOpacity 
                className="w-8 h-8 rounded-md flex items-center justify-center bg-surface-container"
                onPress={() => handleAdjustQuantity(item.product_id, item.quantity, -1)}
                disabled={isUpdating || isOutOfStock}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
              >
                <MaterialIcons name="remove" size={14} color={isOutOfStock ? t.muted : t.onSurfaceVariant} />
              </TouchableOpacity>
              
              <View className="w-8 items-center justify-center">
                {isUpdating ? (
                  <ActivityIndicator size="small" color={t.primary} />
                ) : (
                  <Text className="text-center text-sm font-bold" style={{ color: isOutOfStock ? t.onSurfaceVariant : t.secondary }}>
                    {item.quantity}
                  </Text>
                )}
              </View>

              <TouchableOpacity 
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ backgroundColor: t.primary + '1A' }}
                onPress={() => handleAdjustQuantity(item.product_id, item.quantity, 1)}
                disabled={isUpdating}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              >
                <MaterialIcons name="add" size={14} color={t.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View className="mb-4">
      <View className="mb-6 flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-4xl font-serif font-bold text-on-surface">Inventario 📦</Text>
          <Text className="text-on-surface-variant mt-1 text-sm">Controla tus productos en stock.</Text>
        </View>
      </View>

      {/* KPI Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6 overflow-visible">
        <View className="bg-surface-container-lowest p-4 rounded-2xl mr-3 w-40 flex-row items-center gap-3 shadow-sm border border-outline-variant">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.primary + '1A' }}>
            <MaterialIcons name="inventory-2" size={20} color={t.onSurfaceVariant} />
          </View>
          <View>
            <Text className="text-xl font-serif font-bold text-on-surface">{totalProducts}</Text>
            <Text className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">Productos</Text>
          </View>
        </View>
        
        <View className="bg-surface-container-lowest p-4 rounded-2xl mr-3 w-36 flex-row items-center gap-3 shadow-sm border border-outline-variant">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.secondary + '1A' }}>
            <MaterialIcons name="check-circle" size={20} color={t.onSurfaceVariant} />
          </View>
          <View>
            <Text className="text-xl font-serif font-bold text-on-surface">{inStock}</Text>
            <Text className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">En Stock</Text>
          </View>
        </View>

        <View className="bg-surface-container-lowest p-4 rounded-2xl mr-3 w-36 flex-row items-center gap-3 shadow-sm border border-outline-variant">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.primaryContainer + '1A' }}>
            <MaterialIcons name="category" size={20} color={t.onSurfaceVariant} />
          </View>
          <View>
            <Text className="text-xl font-serif font-bold text-on-surface">{categoriesCount}</Text>
            <Text className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">Categorías</Text>
          </View>
        </View>
      </ScrollView>

      {/* Buscador */}
      <View className="bg-surface-container-lowest border border-outline-variant rounded-xl flex-row items-center px-4 py-3 shadow-sm mb-4">
        <MaterialIcons name="search" size={20} color={t.onSurfaceVariant} />
        <TextInput
          className="flex-1 ml-3 text-sm text-on-surface font-sans"
          placeholder="Buscar por nombre, código..."
          placeholderTextColor={t.muted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Quick Actions */}
      <View className="flex-row flex-wrap justify-between mb-2">
        <TouchableOpacity
          className="w-[48%] p-3 rounded-2xl items-center border border-outline-variant/20 mb-3 flex-row gap-2"
          style={{ backgroundColor: t.primaryContainer + '1A' }}
          onPress={() => router.push('/inventory/scan-search')}
        >
          <MaterialIcons name="qr-code-scanner" size={18} color={t.primary} />
          <Text className="text-primary font-bold text-xs">Escanear</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="w-[48%] p-3 rounded-2xl items-center border border-outline-variant/20 mb-3 flex-row gap-2"
          style={{ backgroundColor: t.secondaryContainer + '1A' }}
          onPress={() => router.push('/inventory/quick-add')}
        >
          <MaterialIcons name="playlist-add" size={18} color={t.secondary} />
          <Text className="text-secondary font-bold text-xs">Alta Rápida</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="w-[48%] p-3 rounded-2xl items-center border border-outline-variant/20 flex-row gap-2"
          style={{ backgroundColor: t.surfaceContainerHighest }}
          onPress={() => router.push('/inventory/adjustments')}
        >
          <MaterialIcons name="tune" size={18} color={t.onSurfaceVariant} />
          <Text className="text-on-surface-variant font-bold text-xs">Ajustes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="w-[48%] p-3 rounded-2xl items-center border border-outline-variant/20 flex-row gap-2"
          style={{ backgroundColor: t.surfaceContainerHighest }}
          onPress={() => router.push('/inventory/performance')}
        >
          <MaterialIcons name="analytics" size={18} color={t.onSurfaceVariant} />
          <Text className="text-on-surface-variant font-bold text-xs">Rendimiento</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.product_id}
          renderItem={renderItem}
          numColumns={2}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.primary]} tintColor={t.primary} />}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialIcons name="inventory-2" size={64} color={t.surfaceContainerHighest} />
              <Text className="text-on-surface mt-4 font-bold text-lg">Tu inventario está vacío</Text>
              <Text className="text-on-surface-variant mt-1 text-center text-sm px-10">Carga productos desde la web para verlos aquí.</Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button for New Product */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-16 h-16 bg-primary rounded-full items-center justify-center elevation-5"
        style={{ shadowColor: t.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
        onPress={() => router.push('/inventory/new')}
      >
        <MaterialIcons name="add" size={32} color={t.isDark ? '#09090B' : '#ffffff'} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
