import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, ActivityIndicator, Image, TouchableOpacity, Share, Alert } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { inventory } from '../../../src/lib/api';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function CatalogScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUserId();
  }, []);

  async function loadUserId() {
    const { data: { session } } = await supabase.auth.getSession();
    setUserId(session?.user?.id || null);
  }

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      try {
        const data = await inventory.list({ search });
        setItems(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [search]);

  async function handleShare() {
    try {
      const catalogUrl = userId 
        ? `https://flow-natura.vercel.app/catalogo?id=${userId}`
        : 'https://flow-natura.vercel.app/catalogo';
      
      await Share.share({
        title: 'Mi Catálogo Natura',
        message: `🌿 ¡Mira mi catálogo de productos Natura!\n\n${catalogUrl}`,
        url: catalogUrl,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        Alert.alert('Error', 'No se pudo compartir el catálogo');
      }
    }
  }

  const renderProduct = ({ item }: { item: any }) => {
    const brandLabel = "Natura"; // Simulando marca por defecto
    const isOutOfStock = item.quantity <= 0;

    return (
      <View className="flex-1 bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/20 m-2 mb-4">
        {/* Imagen y badges */}
        <View className="h-40 bg-gradient-to-br from-primary-container/10 to-secondary-container/10 flex items-center justify-center overflow-hidden relative">
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} className="w-full h-full" resizeMode="contain" />
          ) : (
            <MaterialIcons name="spa" size={48} color="#e7e0eb" />
          )}
          <View className="absolute top-2 left-2 px-2 py-0.5 bg-[#e8f5e9] rounded-full">
            <Text className="text-[#2e7d32] text-[10px] font-bold">{brandLabel}</Text>
          </View>
          <View className="absolute top-2 right-2 px-2 py-0.5 bg-white/90 rounded-full shadow-sm">
            <Text className="text-on-surface-variant text-[10px] font-bold">{item.quantity} uds</Text>
          </View>
        </View>

        {/* Info */}
        <View className="p-3">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-primary/70">{item.category || 'General'}</Text>
          <Text className="font-bold text-on-surface text-sm mt-0.5" numberOfLines={2}>{item.product_name}</Text>
          <Text className="text-[10px] text-on-surface-variant/50 font-mono mt-1">#{item.product_code || '00000'}</Text>
          
          <View className="flex-row items-center justify-between mt-3">
            <Text className="text-lg font-serif font-bold text-primary">${Number(item.price || 0).toFixed(2)}</Text>
            <TouchableOpacity 
              disabled={isOutOfStock}
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${isOutOfStock ? 'bg-surface-container' : 'bg-primary'}`}
            >
              <MaterialIcons name="add-shopping-cart" size={16} color={isOutOfStock ? '#888' : '#fff'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SecondaryLayout title="Catálogo Digital" scrollable={false}>
      {/* Buscador */}
      <View className="mb-4 bg-surface-container-highest rounded-xl flex-row items-center px-4 py-3 shadow-sm">
        <MaterialIcons name="search" size={20} color="#564336" />
        <TextInput
          className="flex-1 ml-3 text-sm text-on-surface font-sans"
          placeholder="Buscar por nombre, código..."
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View className="flex-row items-center justify-between mb-4 px-1">
        <Text className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">
          {items.length} productos
        </Text>
        <TouchableOpacity className="flex-row items-center gap-1 bg-secondary px-3 py-1.5 rounded-lg shadow-sm" onPress={handleShare}>
          <MaterialIcons name="share" size={16} color="#fff" />
          <Text className="text-white text-xs font-bold">Compartir</Text>
        </TouchableOpacity>
      </View>

      {/* Grid de Productos */}
      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#476810" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => item.product_id + index}
          renderItem={renderProduct}
          numColumns={2}
          contentContainerClassName="pb-20"
          columnWrapperClassName="justify-between"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center mt-20">
              <MaterialIcons name="search-off" size={64} color="#e7e0eb" />
              <Text className="text-on-surface-variant mt-4 text-lg font-bold">No se encontraron productos</Text>
            </View>
          }
        />
      )}
    </SecondaryLayout>
  );
}
