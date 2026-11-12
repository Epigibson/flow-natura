import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import api from '../../../src/lib/api';
import { supabase } from '../../lib/supabase';
import { formatMoney } from '../../../src/lib/orders';
import { calculateConsultantPrice, type ConsultantLevel } from '../../../src/lib/camino-crecimiento';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { ErrorState } from '../../components/ErrorState';

const CATEGORIES = ['Perfumería', 'Maquillaje', 'Cuerpo', 'Cabello', 'Rostro', 'Hogar', 'Accesorios'];
const LEVELS: ConsultantLevel[] = ['Bronce', 'Plata', 'Oro', 'Zafiro', 'Diamante'];

async function detectLevel(): Promise<ConsultantLevel> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from('consultant_profiles')
        .select('latest_growth_data')
        .eq('id', session.user.id)
        .single();
      const desc: string | undefined = profile?.latest_growth_data?.level?.description;
      if (desc) {
        const hit = LEVELS.find(l => desc.toUpperCase().includes(l.toUpperCase()));
        if (hit) return hit;
      }
    }
  } catch {
    // fallback below
  }
  return 'Bronce';
}

export default function CatalogScreen() {
  const t = useThemeColors();

  const [products, setProducts] = useState<any[]>([]);
  const [myStock, setMyStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);

  // Detail modal
  const [detailProduct, setDetailProduct] = useState<any>(null);
  const [detailVariants, setDetailVariants] = useState<any[]>([]);
  const [detailVariantsLoading, setDetailVariantsLoading] = useState(false);

  // Edit modal
  const [editProduct, setEditProduct] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editCategory, setEditCategory] = useState('Perfumería');
  const [editCost, setEditCost] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editPoints, setEditPoints] = useState('0');
  const [editImage, setEditImage] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const userLevel = await detectLevel();
      let data: any[] = [];
      try {
        data = await api.products.listAll(true);
      } catch {
        // Fallback to regular list if listAll not deployed yet (same as web)
        data = await api.products.list({ limit: 5000 });
      }
      const mapped = (data || []).map((item: any) => {
        let price = parseFloat(item.price) || 0;
        let cost = parseFloat(item.cost) || 0;
        if (cost === 0 && price > 0) {
          cost = calculateConsultantPrice(price, userLevel, item.brand, item.category);
        }
        return { ...item, cost, price };
      });
      setProducts(mapped);

      // My stock (for the "Con stock" KPI) — non-fatal if it fails
      try {
        const inv = await api.inventory.list();
        const stock: Record<string, number> = {};
        (inv || []).forEach((row: any) => {
          if (row.product_id && row.quantity > 0) stock[row.product_id] = row.quantity;
        });
        setMyStock(stock);
      } catch {
        setMyStock({});
      }
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ── Filters (same rules as web: name/code/brand search + brand & category filters) ──
  const brands = useMemo(() => {
    const active = products.filter(p => !p.deleted_at);
    return [...new Set(active.map(p => p.brand).filter(Boolean))].sort() as string[];
  }, [products]);

  const categories = useMemo(() => {
    const active = products.filter(p => !p.deleted_at);
    return [...new Set(active.map(p => p.category).filter(Boolean))].sort() as string[];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter(p => {
      if (!showDeleted && p.deleted_at) return false;
      const matchesSearch = !q
        || (p.name || '').toLowerCase().includes(q)
        || (p.code || '').toLowerCase().includes(q)
        || (p.brand || '').toLowerCase().includes(q);
      const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      return matchesSearch && matchesBrand && matchesCategory;
    });
  }, [products, search, brandFilter, categoryFilter, showDeleted]);

  // ── KPIs ──
  const activeProducts = useMemo(() => products.filter(p => !p.deleted_at), [products]);
  const deletedCount = products.length - activeProducts.length;
  const inStockCount = activeProducts.filter(p => (myStock[p.id] || 0) > 0).length;

  // ── Detail modal ──
  const openDetail = async (product: any) => {
    setDetailProduct(product);
    setDetailVariants([]);
    if (product.has_variants || (product.variant_count || 0) > 0) {
      setDetailVariantsLoading(true);
      try {
        const { data: variants } = await supabase
          .from('product_variants')
          .select('id, code, variant_label, variant_type, price, points, image_url, sort_order')
          .eq('product_id', product.id)
          .is('deleted_at', null)
          .order('sort_order', { ascending: true });
        setDetailVariants(variants || []);
      } catch (e) {
        console.warn('Error loading variants', e);
        setDetailVariants([]);
      } finally {
        setDetailVariantsLoading(false);
      }
    }
  };

  // ── Edit modal ──
  const openEdit = (product: any) => {
    setEditProduct(product);
    setEditName(product.name || '');
    setEditCode(product.code || '');
    setEditBrand(product.brand || '');
    setEditCategory(product.category || 'Perfumería');
    setEditCost(product.cost != null ? String(product.cost) : '');
    setEditPrice(product.price != null ? String(product.price) : '');
    setEditPoints(product.points != null ? String(product.points) : '0');
    setEditImage(product.image_url || '');
    setEditDescription(product.description || '');
    setEditError(null);
  };

  const handleSave = async () => {
    const name = editName.trim();
    const code = editCode.trim();
    const cost = parseFloat(editCost);
    const price = parseFloat(editPrice);
    if (!name || !code || !cost || !price) {
      setEditError('Nombre, código, costo y precio son requeridos.');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      // Same endpoint the web catalog page (productos.astro) uses for editing
      await api.products.update(editProduct.id, {
        name,
        code,
        brand: editBrand.trim(),
        category: editCategory,
        cost,
        price,
        points: parseInt(editPoints) || 0,
        image_url: editImage.trim() || null,
        description: editDescription.trim() || null,
      });
      setEditProduct(null);
      Alert.alert('✅ Listo', '¡Producto actualizado!');
      loadProducts();
    } catch (e: any) {
      setEditError('Error: ' + (e?.message || 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete / restore ──
  const handleDelete = (product: any) => {
    Alert.alert(
      'Eliminar producto',
      `"${product.name}" será removido del catálogo activo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, desactivar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.products.delete(product.id);
              setDetailProduct(null);
              Alert.alert('✅ Listo', 'Producto desactivado correctamente');
              loadProducts();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'No se pudo eliminar.');
            }
          },
        },
      ]
    );
  };

  const handleRestore = async (product: any) => {
    try {
      await api.products.restore(product.id);
      setDetailProduct(null);
      Alert.alert('✅ Listo', '¡Producto restaurado!');
      loadProducts();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo restaurar.');
    }
  };

  // ── Render ──
  const renderProduct = ({ item }: { item: any }) => {
    const isDeleted = !!item.deleted_at;
    const margin = Number(item.price) && Number(item.cost)
      ? ((Number(item.price) - Number(item.cost)) / Number(item.price) * 100).toFixed(0)
      : null;

    return (
      <View className={`bg-surface-container-lowest p-4 rounded-2xl mb-3 shadow-sm border border-outline-variant/10 ${isDeleted ? 'opacity-60' : ''}`}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => openDetail(item)}>
          <View className="flex-row items-start gap-3">
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} className="w-16 h-16 rounded-xl bg-surface-container-highest" resizeMode="contain" />
            ) : (
              <View className="w-16 h-16 rounded-xl items-center justify-center" style={{ backgroundColor: t.primary + '1A' }}>
                <MaterialIcons name="spa" size={24} color={t.onSurfaceVariant} />
              </View>
            )}
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="font-bold text-on-surface text-sm flex-1" numberOfLines={1}>{item.name}</Text>
                {isDeleted ? (
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: t.error + '1A' }}>
                    <Text className="text-[9px] font-bold" style={{ color: t.error }}>Eliminado</Text>
                  </View>
                ) : (
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: t.secondary + '1A' }}>
                    <Text className="text-[9px] font-bold" style={{ color: t.secondary }}>Activo</Text>
                  </View>
                )}
              </View>
              <Text className="text-[10px] text-on-surface-variant mt-0.5">
                {item.brand || 'Natura'} · {item.category || 'Sin categoría'} · {item.code || 's/código'}
              </Text>
              <View className="flex-row items-center gap-3 mt-1.5">
                <Text className="text-primary font-bold text-base">{formatMoney(Number(item.price || 0))}</Text>
                {margin != null && (
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: parseInt(margin) >= 30 ? t.secondary : parseInt(margin) >= 15 ? t.accent : t.error }}
                  >
                    Margen {margin}%
                  </Text>
                )}
                {!!item.points && <Text className="text-[10px] font-bold text-on-surface-variant">{item.points} pts</Text>}
                {(item.variant_count || 0) > 0 && (
                  <View className="flex-row items-center gap-0.5 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: t.primaryContainer + '33' }}>
                    <MaterialIcons name="palette" size={10} color={t.primary} />
                    <Text className="text-[9px] font-bold text-primary">{item.variant_count}</Text>
                  </View>
                )}
              </View>
              {(myStock[item.id] || 0) > 0 && (
                <Text className="text-[9px] font-bold mt-1" style={{ color: t.secondary }}>
                  Mi stock: {myStock[item.id]}
                </Text>
              )}
            </View>
          </View>
        </TouchableOpacity>

        <View className="flex-row gap-2 mt-3">
          <TouchableOpacity
            className="flex-1 py-2 rounded-xl flex-row items-center justify-center gap-1"
            style={{ backgroundColor: t.primary + '1A' }}
            onPress={() => openDetail(item)}
          >
            <MaterialIcons name="visibility" size={14} color={t.primary} />
            <Text className="text-primary font-bold text-xs">Ver</Text>
          </TouchableOpacity>
          {!isDeleted && (
            <TouchableOpacity
              className="flex-1 py-2 rounded-xl flex-row items-center justify-center gap-1"
              style={{ backgroundColor: t.surfaceContainerHighest }}
              onPress={() => openEdit(item)}
            >
              <MaterialIcons name="edit" size={14} color={t.onSurfaceVariant} />
              <Text className="text-on-surface-variant font-bold text-xs">Editar</Text>
            </TouchableOpacity>
          )}
          {isDeleted ? (
            <TouchableOpacity
              className="flex-1 py-2 rounded-xl flex-row items-center justify-center gap-1"
              style={{ backgroundColor: t.secondary + '1A' }}
              onPress={() => handleRestore(item)}
            >
              <MaterialIcons name="undo" size={14} color={t.secondary} />
              <Text className="font-bold text-xs" style={{ color: t.secondary }}>Restaurar</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="flex-1 py-2 rounded-xl flex-row items-center justify-center gap-1"
              style={{ backgroundColor: t.error + '1A' }}
              onPress={() => handleDelete(item)}
            >
              <MaterialIcons name="delete" size={14} color={t.error} />
              <Text className="font-bold text-xs" style={{ color: t.error }}>Eliminar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View className="mb-2">
      {/* KPIs */}
      <View className="flex-row gap-3 mb-6">
        <View className="flex-1 bg-surface-container-lowest p-4 rounded-2xl flex-row items-center gap-3 shadow-sm border border-outline-variant">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.primary + '1A' }}>
            <MaterialIcons name="inventory-2" size={20} color={t.primary} />
          </View>
          <View>
            <Text className="text-xl font-serif font-bold text-on-surface">{activeProducts.length}</Text>
            <Text className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">Productos</Text>
          </View>
        </View>
        <View className="flex-1 bg-surface-container-lowest p-4 rounded-2xl flex-row items-center gap-3 shadow-sm border border-outline-variant">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.secondary + '1A' }}>
            <MaterialIcons name="check-circle" size={20} color={t.secondary} />
          </View>
          <View>
            <Text className="text-xl font-serif font-bold text-on-surface">{inStockCount}</Text>
            <Text className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">Con stock</Text>
          </View>
        </View>
        <View className="flex-1 bg-surface-container-lowest p-4 rounded-2xl flex-row items-center gap-3 shadow-sm border border-outline-variant">
          <View className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.error + '1A' }}>
            <MaterialIcons name="delete-sweep" size={20} color={t.error} />
          </View>
          <View>
            <Text className="text-xl font-serif font-bold text-on-surface">{deletedCount}</Text>
            <Text className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">Eliminados</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View className="bg-surface-container-highest rounded-xl flex-row items-center px-4 py-3 mb-3">
        <MaterialIcons name="search" size={20} color={t.onSurfaceVariant} />
        <TextInput
          className="flex-1 ml-3 text-sm text-on-surface"
          placeholder="Buscar por nombre, código o marca..."
          placeholderTextColor={t.muted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialIcons name="close" size={20} color={t.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>

      {/* Brand filter */}
      <Text className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2 ml-1">Marca</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <View className="flex-row gap-2">
          {[{ label: 'Todas', value: 'all' }, ...brands.map(b => ({ label: b, value: b }))].map(opt => {
            const active = brandFilter === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setBrandFilter(opt.value)}
                className="px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: active ? t.primary + '1A' : t.surfaceContainerHighest,
                  borderColor: active ? t.primary : 'transparent',
                }}
              >
                <Text className="text-[11px] font-bold" style={{ color: active ? t.primary : t.onSurfaceVariant }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Category filter */}
      <Text className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2 ml-1">Categoría</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
        <View className="flex-row gap-2">
          {[{ label: 'Todas', value: 'all' }, ...categories.map(c => ({ label: c, value: c }))].map(opt => {
            const active = categoryFilter === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setCategoryFilter(opt.value)}
                className="px-3 py-1.5 rounded-full border"
                style={{
                  backgroundColor: active ? t.primary + '1A' : t.surfaceContainerHighest,
                  borderColor: active ? t.primary : 'transparent',
                }}
              >
                <Text className="text-[11px] font-bold" style={{ color: active ? t.primary : t.onSurfaceVariant }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Toggle deleted + result count */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">
          {filteredProducts.length} productos{showDeleted ? ' (incluyendo eliminados)' : ''}
        </Text>
        <TouchableOpacity
          onPress={() => setShowDeleted(v => !v)}
          className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border"
          style={{
            backgroundColor: showDeleted ? t.accent + '1A' : t.surfaceContainerHighest,
            borderColor: showDeleted ? t.accent : 'transparent',
          }}
        >
          <MaterialIcons name="visibility" size={14} color={showDeleted ? t.accent : t.onSurfaceVariant} />
          <Text className="text-[10px] font-bold" style={{ color: showDeleted ? t.accent : t.onSurfaceVariant }}>
            {showDeleted ? 'Ocultar Eliminados' : 'Mostrar Eliminados'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

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
          <Text className="text-xl font-bold text-on-surface ml-2">Catálogo de Productos</Text>
          <Text className="text-[10px] text-on-surface-variant ml-2">Gestiona tu catálogo global: edita, elimina y restaura</Text>
        </View>
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
          ListHeaderComponent={renderHeader}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            loadError ? (
              <ErrorState message={loadError} onRetry={() => loadProducts()} />
            ) : (
              <View className="items-center justify-center py-16">
                <MaterialIcons name="inventory-2" size={64} color={t.surfaceContainerHighest} />
                <Text className="text-on-surface mt-4 font-bold text-lg">No se encontraron productos.</Text>
                <Text className="text-on-surface-variant mt-1 text-center text-sm px-10">
                  Prueba con otro término o ajusta los filtros.
                </Text>
              </View>
            )
          }
        />
      )}

      {/* ── Detail Modal ── */}
      <Modal visible={!!detailProduct} animationType="slide" transparent onRequestClose={() => setDetailProduct(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-surface rounded-t-[2rem] p-6 max-h-[88%]">
            {detailProduct && (
              <>
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-xl font-serif font-bold text-on-surface flex-1 mr-2" numberOfLines={1}>
                    {detailProduct.name}
                  </Text>
                  <TouchableOpacity onPress={() => setDetailProduct(null)} className="w-8 h-8 rounded-full bg-surface-container items-center justify-center">
                    <MaterialIcons name="close" size={18} color={t.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Image + status */}
                  <View className="flex-row items-center gap-4 mb-4">
                    {detailProduct.image_url ? (
                      <Image source={{ uri: detailProduct.image_url }} className="w-24 h-24 rounded-2xl bg-surface-container-highest" resizeMode="contain" />
                    ) : (
                      <View className="w-24 h-24 rounded-2xl items-center justify-center" style={{ backgroundColor: t.primaryContainer + '33' }}>
                        <MaterialIcons name="spa" size={40} color={t.primary} />
                      </View>
                    )}
                    <View className="flex-1">
                      <View
                        className="self-start px-2.5 py-1 rounded-full mb-2"
                        style={{ backgroundColor: detailProduct.deleted_at ? t.error + '1A' : t.secondary + '1A' }}
                      >
                        <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: detailProduct.deleted_at ? t.error : t.secondary }}>
                          {detailProduct.deleted_at ? 'Eliminado' : 'Activo'}
                        </Text>
                      </View>
                      <Text className="text-sm font-bold text-on-surface">{detailProduct.brand || 'Natura'}</Text>
                      <Text className="text-xs text-on-surface-variant">{detailProduct.category || 'Sin categoría'}</Text>
                      <Text className="text-xs font-mono text-on-surface-variant mt-1">#{detailProduct.code}</Text>
                    </View>
                  </View>

                  {!!detailProduct.description && (
                    <Text className="text-sm text-on-surface-variant mb-4 leading-5">{detailProduct.description}</Text>
                  )}

                  {/* Financials */}
                  {(() => {
                    const cost = parseFloat(detailProduct.cost) || 0;
                    const price = parseFloat(detailProduct.price) || 0;
                    const margin = price > 0 ? ((price - cost) / price * 100) : 0;
                    const marginColor = margin >= 25 ? t.secondary : margin >= 15 ? t.accent : t.error;
                    return (
                      <View className="flex-row gap-3 mb-4">
                        <View className="flex-1 bg-surface-container rounded-xl p-3">
                          <Text className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Costo</Text>
                          <Text className="text-base font-bold text-on-surface mt-1">{formatMoney(cost)}</Text>
                        </View>
                        <View className="flex-1 bg-surface-container rounded-xl p-3">
                          <Text className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Precio</Text>
                          <Text className="text-base font-bold text-primary mt-1">{formatMoney(price)}</Text>
                        </View>
                        <View className="flex-1 rounded-xl p-3" style={{ backgroundColor: marginColor + '1A' }}>
                          <Text className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider">Margen</Text>
                          <Text className="text-base font-bold mt-1" style={{ color: marginColor }}>
                            {price > 0 ? `${margin.toFixed(1)}%` : '—'}
                          </Text>
                          <Text className="text-[9px] font-bold" style={{ color: marginColor }}>
                            {price > 0 ? `+${formatMoney(price - cost)}` : ''}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                  {!!detailProduct.points && (
                    <View className="flex-row items-center gap-2 mb-4">
                      <MaterialIcons name="stars" size={16} color={t.accent} />
                      <Text className="text-sm font-bold text-on-surface">{detailProduct.points} puntos</Text>
                    </View>
                  )}

                  {/* Variants */}
                  {(detailProduct.has_variants || (detailProduct.variant_count || 0) > 0) && (
                    <View className="mb-4">
                      <Text className="text-sm font-bold text-on-surface mb-2">
                        Variantes ({detailVariantsLoading ? 'cargando...' : `${detailVariants.length} opciones`})
                      </Text>
                      {detailVariantsLoading ? (
                        <ActivityIndicator size="small" color={t.primary} style={{ marginVertical: 12 }} />
                      ) : (
                        detailVariants.map(v => {
                          const vPrice = v.price || detailProduct.price;
                          return (
                            <View key={v.id} className="flex-row items-center gap-3 p-2.5 rounded-xl bg-surface-container mb-2">
                              {v.image_url ? (
                                <Image source={{ uri: v.image_url }} className="w-9 h-9 rounded-lg bg-white" resizeMode="contain" />
                              ) : (
                                <View className="w-9 h-9 rounded-lg bg-surface-container-highest items-center justify-center">
                                  <MaterialIcons name="spa" size={14} color={t.onSurfaceVariant} />
                                </View>
                              )}
                              <View className="flex-1">
                                <Text className="text-xs font-bold text-on-surface" numberOfLines={1}>{v.variant_label}</Text>
                                <Text className="text-[10px] text-on-surface-variant font-mono">#{v.code} · {v.variant_type || 'tono'}</Text>
                              </View>
                              <View className="items-end">
                                <Text className="text-xs font-bold text-primary">{formatMoney(Number(vPrice || 0))}</Text>
                                {!!v.points && <Text className="text-[9px] font-bold text-on-surface-variant">{v.points} pts</Text>}
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  )}
                </ScrollView>

                {/* Footer actions */}
                <View className="flex-row gap-3 mt-2">
                  {!detailProduct.deleted_at && (
                    <TouchableOpacity
                      className="flex-1 py-3.5 rounded-xl flex-row items-center justify-center gap-2"
                      style={{ backgroundColor: t.primary }}
                      onPress={() => {
                        setDetailProduct(null);
                        openEdit(detailProduct);
                      }}
                    >
                      <MaterialIcons name="edit" size={16} color="#fff" />
                      <Text className="text-white font-bold text-sm">Editar</Text>
                    </TouchableOpacity>
                  )}
                  {detailProduct.deleted_at ? (
                    <TouchableOpacity
                      className="flex-1 py-3.5 rounded-xl flex-row items-center justify-center gap-2"
                      style={{ backgroundColor: t.secondary }}
                      onPress={() => handleRestore(detailProduct)}
                    >
                      <MaterialIcons name="undo" size={16} color="#fff" />
                      <Text className="text-white font-bold text-sm">Restaurar</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      className="flex-1 py-3.5 rounded-xl flex-row items-center justify-center gap-2 border"
                      style={{ borderColor: t.error, backgroundColor: t.error + '1A' }}
                      onPress={() => handleDelete(detailProduct)}
                    >
                      <MaterialIcons name="delete" size={16} color={t.error} />
                      <Text className="font-bold text-sm" style={{ color: t.error }}>Eliminar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal visible={!!editProduct} animationType="slide" transparent onRequestClose={() => setEditProduct(null)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-surface rounded-t-[2rem] p-6 max-h-[92%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-xl font-serif font-bold text-on-surface">Editar Producto</Text>
              <TouchableOpacity onPress={() => setEditProduct(null)} className="w-8 h-8 rounded-full bg-surface-container items-center justify-center">
                <MaterialIcons name="close" size={18} color={t.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Nombre *</Text>
              <TextInput
                className="w-full bg-surface-container-highest rounded-xl py-3 px-4 text-sm text-on-surface mb-4"
                value={editName}
                onChangeText={setEditName}
                placeholder="Nombre del producto"
                placeholderTextColor={t.muted}
              />

              <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Código *</Text>
              <TextInput
                className="w-full bg-surface-container-highest rounded-xl py-3 px-4 text-sm text-on-surface font-mono mb-4"
                value={editCode}
                onChangeText={setEditCode}
                placeholder="Código Natura"
                placeholderTextColor={t.muted}
              />

              <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Marca</Text>
              <TextInput
                className="w-full bg-surface-container-highest rounded-xl py-3 px-4 text-sm text-on-surface mb-4"
                value={editBrand}
                onChangeText={setEditBrand}
                placeholder="Natura"
                placeholderTextColor={t.muted}
              />

              <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Categoría</Text>
              <View className="flex-row flex-wrap gap-2 mb-4">
                {CATEGORIES.map(cat => {
                  const active = editCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setEditCategory(cat)}
                      className="px-3 py-2 rounded-full border"
                      style={{
                        backgroundColor: active ? t.primary + '1A' : t.surfaceContainerHighest,
                        borderColor: active ? t.primary : 'transparent',
                      }}
                    >
                      <Text className="text-xs font-bold" style={{ color: active ? t.primary : t.onSurfaceVariant }}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View className="flex-row gap-3 mb-2">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Costo *</Text>
                  <TextInput
                    className="w-full bg-surface-container-highest rounded-xl py-3 px-4 text-sm text-on-surface"
                    value={editCost}
                    onChangeText={setEditCost}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={t.muted}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Precio *</Text>
                  <TextInput
                    className="w-full bg-surface-container-highest rounded-xl py-3 px-4 text-sm text-on-surface"
                    value={editPrice}
                    onChangeText={setEditPrice}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={t.muted}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Puntos</Text>
                  <TextInput
                    className="w-full bg-surface-container-highest rounded-xl py-3 px-4 text-sm text-on-surface"
                    value={editPoints}
                    onChangeText={setEditPoints}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={t.muted}
                  />
                </View>
              </View>

              {/* Margin preview (same as web) */}
              {(() => {
                const cost = parseFloat(editCost) || 0;
                const price = parseFloat(editPrice) || 0;
                if (price > 0 && cost > 0) {
                  const margin = ((price - cost) / price) * 100;
                  const isGood = margin >= 25;
                  const color = isGood ? t.secondary : t.accent;
                  return (
                    <View className="flex-row items-center gap-4 rounded-xl p-4 mb-4 border" style={{ backgroundColor: color + '1A', borderColor: color + '33' }}>
                      <Text className="text-base font-bold" style={{ color: color }}>{margin.toFixed(1)}%</Text>
                      <Text className="text-base font-bold" style={{ color: color }}>{formatMoney(price - cost)}</Text>
                      <Text className="text-[9px] uppercase font-bold text-on-surface-variant tracking-wider flex-1 text-right">Margen / Ganancia</Text>
                    </View>
                  );
                }
                return null;
              })()}

              <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Imagen URL</Text>
              <TextInput
                className="w-full bg-surface-container-highest rounded-xl py-3 px-4 text-sm text-on-surface mb-4"
                value={editImage}
                onChangeText={setEditImage}
                placeholder="https://..."
                placeholderTextColor={t.muted}
                autoCapitalize="none"
              />

              <Text className="text-xs font-bold text-on-surface-variant mb-1.5">Descripción</Text>
              <TextInput
                className="w-full bg-surface-container-highest rounded-xl p-4 text-sm text-on-surface mb-4"
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Descripción del producto"
                placeholderTextColor={t.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {!!editError && (
                <View className="py-2.5 px-4 rounded-xl mb-4" style={{ backgroundColor: t.errorContainer + '33' }}>
                  <Text className="text-xs font-bold" style={{ color: t.error }}>{editError}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                className="w-full py-4 rounded-xl flex-row items-center justify-center"
                style={{ backgroundColor: saving ? t.muted : t.primary }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="save" size={16} color="#fff" />
                    <Text className="text-white font-bold text-sm ml-2">Guardar Cambios</Text>
                  </>
                )}
              </TouchableOpacity>
              <View className="h-6" />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
