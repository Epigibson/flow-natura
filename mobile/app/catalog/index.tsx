import React, { useState, useEffect } from 'react';
import { formatMoney } from '../../../src/lib/orders';
import { View, Text, FlatList, TextInput, ActivityIndicator, Image, TouchableOpacity, Share, Alert, Modal, ScrollView } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { ErrorState } from '../../components/ErrorState';
import { inventory } from '../../../src/lib/api';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { SITE_URL } from '../../lib/config';
import { catalogUrl as buildCatalogUrl } from '../../../src/lib/links';

export default function CatalogScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<any | null>(null);
  const [detailVariants, setDetailVariants] = useState<any[]>([]);

  useEffect(() => {
    loadUserId();
  }, []);

  async function loadUserId() {
    const { data: { session } } = await supabase.auth.getSession();
    setUserId(session?.user?.id || null);
  }

  async function loadCatalog() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await inventory.list({ search });
      setItems(data);
    } catch (err) {
      console.error(err);
      setLoadError('No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(loadCatalog, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleShare() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const id = userId || session?.user?.id;
      if (!id) {
        Alert.alert('Inicia sesión', 'Necesitas sesión activa para compartir tu catálogo.');
        return;
      }
      const catalogUrl = buildCatalogUrl(SITE_URL, id);
      
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

  async function openDetail(item: any) {
    setDetailProduct(item);
    setDetailVariants([]);
    if (item.has_variants) {
      try {
        const { data } = await supabase
          .from('product_variants')
          .select('id, code, variant_label, variant_type, price, image_url')
          .eq('product_id', item.product_id)
          .is('deleted_at', null)
          .order('sort_order');
        setDetailVariants(data || []);
      } catch {
        setDetailVariants([]);
      }
    }
  }

  async function shareProduct(item: any) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const id = userId || session?.user?.id;
      const link = id ? `\n\nMira mi catálogo completo: ${buildCatalogUrl(SITE_URL, id)}` : '';
      const message = `🌿 ${item.product_name}\n` +
        `${item.category || 'General'} · ${item.brand || 'Natura'}\n` +
        `💰 ${formatMoney(Number(item.price || 0))}\n` +
        `📦 ${item.quantity > 0 ? `${item.quantity} disponibles` : 'Agotado'}\n` +
        (item.description ? `\n${item.description}\n` : '') +
        link;
      await Share.share({ title: item.product_name, message });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        Alert.alert('Error', 'No se pudo compartir el producto');
      }
    }
  }

  const renderProduct = ({ item }: { item: any }) => {
    const brandLabel = item.brand || 'General';
    const isOutOfStock = item.quantity <= 0;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => openDetail(item)}
        className="flex-1 bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/20 m-2 mb-4"
      >
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
            <Text className="text-lg font-serif font-bold text-primary">{formatMoney(Number(Number(item.price || 0)))}</Text>
            <TouchableOpacity
              onPress={() => openDetail(item)}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary"
            >
              <MaterialIcons name="visibility" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
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
            loadError ? <ErrorState message={loadError} onRetry={() => loadCatalog()} /> : (
            <View className="flex-1 items-center justify-center mt-20">
              <MaterialIcons name="search-off" size={64} color="#e7e0eb" />
              <Text className="text-on-surface-variant mt-4 text-lg font-bold">No se encontraron productos</Text>
            </View>)
          }
        />
      )}

      {/* Detalle de producto (alineado con el catálogo web público) */}
      <Modal visible={!!detailProduct} animationType="slide" transparent onRequestClose={() => setDetailProduct(null)}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-surface-container-lowest rounded-t-3xl max-h-[88%]">
            {detailProduct && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Imagen + cerrar + marca */}
                <View className="h-64 bg-gradient-to-br from-primary-container/10 to-secondary-container/10 items-center justify-center relative">
                  {detailProduct.image_url ? (
                    <Image source={{ uri: detailProduct.image_url }} className="w-full h-full" resizeMode="contain" />
                  ) : (
                    <MaterialIcons name="spa" size={72} color="#e7e0eb" />
                  )}
                  <View className="absolute top-4 left-4 px-2.5 py-1 bg-[#e8f5e9] rounded-full">
                    <Text className="text-[#2e7d32] text-[10px] font-bold">{detailProduct.brand || 'General'}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDetailProduct(null)}
                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 items-center justify-center"
                  >
                    <MaterialIcons name="close" size={20} color="#564336" />
                  </TouchableOpacity>
                </View>

                <View className="p-6">
                  <Text className="text-xs font-bold uppercase tracking-wider text-primary/70">{detailProduct.category || 'General'}</Text>
                  <Text className="text-2xl font-serif font-bold text-on-surface mt-1">{detailProduct.product_name}</Text>
                  {detailProduct.product_code ? (
                    <Text className="text-xs text-on-surface-variant/50 font-mono mt-1">#{detailProduct.product_code}</Text>
                  ) : null}

                  <View className="flex-row items-center gap-3 mt-3">
                    <Text className="text-3xl font-serif font-bold text-primary">{formatMoney(Number(detailProduct.price || 0))}</Text>
                    <View className={`px-2.5 py-1 rounded-full ${detailProduct.quantity > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                      <Text className={`text-xs font-bold ${detailProduct.quantity > 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {detailProduct.quantity > 0 ? `${detailProduct.quantity} disponibles` : 'Agotado'}
                      </Text>
                    </View>
                  </View>

                  <Text className={`text-sm mt-4 leading-6 ${detailProduct.description ? 'text-on-surface-variant' : 'text-on-surface-variant/50 italic'}`}>
                    {detailProduct.description || 'Sin descripción disponible.'}
                  </Text>

                  {detailVariants.length > 0 && (
                    <View className="mt-5">
                      <Text className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">Opciones disponibles</Text>
                      <View className="space-y-2">
                        {detailVariants.map((v: any) => (
                          <View key={v.id} className="flex-row items-center gap-3 p-3 rounded-xl bg-surface-container border border-outline-variant/10">
                            {v.image_url ? (
                              <Image source={{ uri: v.image_url }} className="w-12 h-12 rounded-lg bg-white" resizeMode="contain" />
                            ) : (
                              <View className="w-12 h-12 rounded-lg bg-surface-container-highest items-center justify-center">
                                <MaterialIcons name="spa" size={20} color="#c9c2ce" />
                              </View>
                            )}
                            <View className="flex-1 min-w-0">
                              <Text className="font-bold text-on-surface text-sm">{v.variant_label}</Text>
                              <Text className="text-[10px] text-on-surface-variant font-mono">#{v.code}</Text>
                            </View>
                            <Text className="font-bold text-primary text-sm">{formatMoney(Number(v.price || detailProduct.price || 0))}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => { const p = detailProduct; setDetailProduct(null); shareProduct(p); }}
                    className="flex-row items-center justify-center gap-2 py-4 rounded-xl bg-primary mt-6 mb-4"
                  >
                    <MaterialIcons name="share" size={20} color="#fff" />
                    <Text className="text-white font-bold text-base">Compartir producto</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SecondaryLayout>
  );
}
