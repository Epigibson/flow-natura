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
  const [detailImages, setDetailImages] = useState<{ url: string; label: string }[]>([]);
  const [detailImgIndex, setDetailImgIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [zoomed, setZoomed] = useState(false);

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
    setSelectedVariant(null);
    setDetailImgIndex(0);
    setZoomed(false);
    const imgs: { url: string; label: string }[] = [];
    if (item.image_url) imgs.push({ url: item.image_url, label: item.product_name });
    if (item.has_variants) {
      try {
        const { data } = await supabase
          .from('product_variants')
          .select('id, code, variant_label, variant_type, price, image_url')
          .eq('product_id', item.product_id)
          .is('deleted_at', null)
          .order('sort_order');
        const variants = data || [];
        setDetailVariants(variants);
        variants.forEach((v: any) => {
          if (v.image_url && !imgs.some(im => im.url === v.image_url)) imgs.push({ url: v.image_url, label: v.variant_label });
        });
      } catch {
        setDetailVariants([]);
      }
    }
    setDetailImages(imgs);
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

  // ---- Info estructurada del producto (átomos: Chip / NoteRow / SpecRow / HighlightBox) ----
  const Chip = ({ text, tone = 'primary' }: { text: string; tone?: 'primary' | 'muted' }) => (
    <View className={`px-3 py-1.5 rounded-full border ${tone === 'primary' ? 'bg-primary/5 border-primary/10' : 'bg-surface-container border-outline-variant/10'}`}>
      <Text className={`text-xs font-bold ${tone === 'primary' ? 'text-primary' : 'text-on-surface-variant'}`}>{text}</Text>
    </View>
  );

  const NoteRow = ({ icon, label, value }: { icon: any; label: string; value: string }) => (
    <View className="flex-row items-start gap-3 p-3 rounded-2xl bg-surface-container/60 border border-outline-variant/10">
      <MaterialIcons name={icon} size={20} color="#8a6d3b" style={{ marginTop: 2 }} />
      <View className="flex-1 min-w-0">
        <Text className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</Text>
        <Text className="text-sm text-on-surface mt-0.5 leading-6">{value}</Text>
      </View>
    </View>
  );

  const SpecRow = ({ label, value }: { label: string; value: string }) => (
    <View className="flex-row items-start justify-between gap-4 py-2.5 border-b border-outline-variant/10">
      <Text className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant pt-0.5">{label}</Text>
      <Text className="text-sm text-on-surface text-right flex-1 leading-6">{value}</Text>
    </View>
  );

  const Highlight = ({ text, icon = 'auto_awesome' }: { text: string; icon?: any }) => (
    <View className="flex-row items-start gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10">
      <MaterialIcons name={icon} size={20} color="#8a6d3b" style={{ marginTop: 2 }} />
      <Text className="text-sm text-on-surface flex-1 leading-6">{text}</Text>
    </View>
  );

  function renderDetails(data: any, fallbackText: string) {
    const d = data && typeof data === 'object' ? data : null;

    if (d && d.type === 'perfume') {
      const notas = d.notas || {};
      return (
        <View className="mt-5">
          <Text className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Pirámide olfativa</Text>
          <View className="gap-2.5 mt-3">
            {notas.salida ? <NoteRow icon="wb_sunny" label="Notas de salida" value={notas.salida} /> : null}
            {notas.corazon ? <NoteRow icon="local_florist" label="Notas de corazón" value={notas.corazon} /> : null}
            {notas.fondo ? <NoteRow icon="eco" label="Notas de fondo" value={notas.fondo} /> : null}
          </View>
          {d.sensacion ? <View className="mt-3"><Highlight text={d.sensacion} icon="spa" /></View> : null}
          <View className="flex-row flex-wrap gap-2 mt-4">
            {[d.family && `Familia ${d.family}`, d.publico, d.estilo && `Estilo: ${d.estilo}`, d.presentacion].filter(Boolean).map((c: string) => <Chip key={c} text={c} />)}
          </View>
        </View>
      );
    }

    if (d && d.type === 'care') {
      return (
        <View className="mt-5">
          <Text className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Detalles del producto</Text>
          {d.beneficio ? <View className="mt-3"><Highlight text={d.beneficio} icon="verified" /></View> : null}
          <View className="mt-3">
            {d.ingredientes ? <SpecRow label="Ingredientes clave" value={d.ingredientes} /> : null}
            {d.textura ? <SpecRow label="Textura" value={d.textura} /> : null}
            {d.resultado ? <SpecRow label="Resultado" value={d.resultado} /> : null}
            {d.uso ? <SpecRow label="Cómo usarlo" value={d.uso} /> : null}
          </View>
          <View className="flex-row flex-wrap gap-2 mt-4">
            {[d.category, d.presentacion].filter(Boolean).map((c: string) => <Chip key={c} text={c} />)}
          </View>
        </View>
      );
    }

    if (d && d.type === 'home') {
      return (
        <View className="mt-5">
          <Text className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Detalles del producto</Text>
          <View className="mt-3">
            {d.tipo ? <SpecRow label="Tipo" value={d.tipo} /> : null}
            {d.uso ? <SpecRow label="Uso" value={d.uso} /> : null}
            {d.material ? <SpecRow label="Material" value={d.material} /> : null}
            {d.cuidado ? <SpecRow label="Cuidado" value={d.cuidado} /> : null}
          </View>
          {d.highlight ? <View className="mt-3"><Highlight text={d.highlight} icon="star" /></View> : null}
          <View className="flex-row flex-wrap gap-2 mt-4">
            {[d.licencia, d.presentacion].filter(Boolean).map((c: string) => <Chip key={c} text={c} tone="muted" />)}
          </View>
        </View>
      );
    }

    if (d && d.type === 'kit') {
      return (
        <View className="mt-5">
          <Text className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Detalles del kit</Text>
          {d.components?.length ? (
            <View className="flex-row flex-wrap gap-2 mt-3">
              {d.components.map((c: string) => <Chip key={c} text={'Incluye ' + c} tone="muted" />)}
            </View>
          ) : null}
          {d.facts_text ? <View className="mt-3"><Highlight text={d.facts_text} icon="redeem" /></View> : null}
          {d.presentacion ? (
            <View className="flex-row flex-wrap gap-2 mt-4"><Chip text={d.presentacion} /></View>
          ) : null}
        </View>
      );
    }

    return (
      <Text className={`text-base mt-4 leading-7 ${fallbackText ? 'text-on-surface-variant' : 'text-on-surface-variant/50 italic'}`}>
        {fallbackText || 'Sin descripción disponible para este producto.'}
      </Text>
    );
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

      {/* PDP — vista de producto a pantalla completa (alineada con el catálogo web) */}
      <Modal visible={!!detailProduct} animationType="slide" onRequestClose={() => setDetailProduct(null)}>
        {detailProduct && (
          <View className="flex-1 bg-surface-container-lowest">
            {/* Barra superior */}
            <View className="flex-row items-center justify-between px-4 h-14 border-b border-outline-variant/10">
              <TouchableOpacity onPress={() => setDetailProduct(null)} className="flex-row items-center gap-1.5">
                <MaterialIcons name="arrow-back" size={20} color="#564336" />
                <Text className="text-on-surface-variant font-bold text-sm">Volver al catálogo</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setDetailProduct(null)} className="w-9 h-9 rounded-full items-center justify-center">
                <MaterialIcons name="close" size={22} color="#8a7b73" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {/* Galería */}
              <TouchableOpacity activeOpacity={0.9} onPress={() => { setZoomed(false); setLightbox(true); }}>
                <View className="h-[340px] bg-gradient-to-br from-primary-container/10 to-secondary-container/10 items-center justify-center relative">
                  {detailImages[detailImgIndex]?.url ? (
                    <Image source={{ uri: detailImages[detailImgIndex].url }} className="w-full h-full" resizeMode="contain" />
                  ) : (
                    <MaterialIcons name="spa" size={80} color="#e7e0eb" />
                  )}
                  <View className="absolute top-4 left-4 px-2.5 py-1 bg-[#e8f5e9] rounded-full">
                    <Text className="text-[#2e7d32] text-[10px] font-bold">{detailProduct.brand || 'General'}</Text>
                  </View>
                  <View className="absolute bottom-4 right-4 px-2.5 py-1 bg-white/85 rounded-full flex-row items-center gap-1">
                    <MaterialIcons name="zoom-in" size={14} color="#8a7b73" />
                    <Text className="text-[10px] font-bold text-on-surface-variant/70">Toca para ampliar</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Thumbnails */}
              {detailImages.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 mt-3">
                  {detailImages.map((im, idx) => (
                    <TouchableOpacity
                      key={im.url + idx}
                      onPress={() => setDetailImgIndex(idx)}
                      className={`w-16 h-16 rounded-xl overflow-hidden mr-2 border-2 ${idx === detailImgIndex ? 'border-primary' : 'border-outline-variant/20 opacity-60'}`}
                    >
                      <Image source={{ uri: im.url }} className="w-full h-full bg-white" resizeMode="contain" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Info */}
              <View className="px-5 pt-5">
                <Text className="text-[11px] font-bold uppercase tracking-widest text-primary/70">
                  {[detailProduct.category, detailProduct.brand].filter(Boolean).join(' · ') || 'Catálogo Natura'}
                </Text>
                <Text className="text-3xl font-serif font-bold text-on-surface mt-1.5 leading-tight">{detailProduct.product_name}</Text>
                {detailProduct.product_code ? (
                  <Text className="text-xs text-on-surface-variant/50 font-mono mt-1.5">Código #{detailProduct.product_code}</Text>
                ) : null}

                <View className="flex-row items-center gap-3 mt-4">
                  <Text className="text-4xl font-serif font-bold text-primary">
                    {formatMoney(Number(selectedVariant?.price ?? detailProduct.price ?? 0))}
                  </Text>
                  <View className={`px-2.5 py-1 rounded-full ${detailProduct.quantity > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Text className={`text-xs font-bold ${detailProduct.quantity > 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {detailProduct.quantity > 0 ? `${detailProduct.quantity} disponibles` : 'Agotado'}
                    </Text>
                  </View>
                </View>

                {renderDetails(detailProduct.description_data, detailProduct.description)}

                {detailVariants.length > 0 && (
                  <View className="mt-6">
                    <Text className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">Elige tu opción</Text>
                    <View className="flex-row flex-wrap gap-2.5">
                      {detailVariants.map((v: any) => {
                        const active = selectedVariant?.id === v.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            onPress={() => {
                              setSelectedVariant(v);
                              const idx = detailImages.findIndex(im => im.url === v.image_url);
                              if (idx >= 0) setDetailImgIndex(idx);
                            }}
                            className={`flex-row items-center gap-2 p-2 pr-3 rounded-2xl border ${active ? 'border-primary bg-primary/5' : 'border-outline-variant/15'}`}
                          >
                            {v.image_url ? (
                              <Image source={{ uri: v.image_url }} className="w-10 h-10 rounded-xl bg-white" resizeMode="contain" />
                            ) : (
                              <View className="w-10 h-10 rounded-xl bg-surface-container-highest items-center justify-center">
                                <MaterialIcons name="spa" size={18} color="#c9c2ce" />
                              </View>
                            )}
                            <Text className={`text-xs font-bold ${active ? 'text-primary' : 'text-on-surface'}`}>{v.variant_label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => { const p = detailProduct; setDetailProduct(null); shareProduct(p); }}
                  className="flex-row items-center justify-center gap-2 py-4 rounded-2xl bg-primary mt-7"
                >
                  <MaterialIcons name="share" size={20} color="#fff" />
                  <Text className="text-white font-bold text-base">Compartir producto</Text>
                </TouchableOpacity>
                <Text className="text-xs text-on-surface-variant/70 text-center mt-3">
                  Pide por WhatsApp — tu consultora confirma disponibilidad y entrega.
                </Text>
              </View>

              {/* Relacionados */}
              {(() => {
                const related = items.filter((x: any) => x.product_id !== detailProduct.product_id).slice(0, 4);
                if (!related.length) return null;
                return (
                  <View className="mt-8 px-5">
                    <View className="border-t border-outline-variant/10 pt-6">
                      <Text className="text-lg font-serif font-bold text-on-surface">También te puede interesar</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4">
                        {related.map((r: any) => (
                          <TouchableOpacity key={r.product_id} onPress={() => openDetail(r)} className="w-36 mr-3">
                            <View className="h-32 rounded-2xl bg-gradient-to-br from-primary-container/10 to-secondary-container/10 items-center justify-center overflow-hidden">
                              {r.image_url ? (
                                <Image source={{ uri: r.image_url }} className="w-full h-full" resizeMode="contain" />
                              ) : (
                                <MaterialIcons name="spa" size={36} color="#e7e0eb" />
                              )}
                            </View>
                            <Text className="text-xs font-bold text-on-surface mt-2" numberOfLines={2}>{r.product_name}</Text>
                            <Text className="text-sm font-bold text-primary mt-0.5">{formatMoney(Number(r.price || 0))}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                );
              })()}
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* Lightbox — imagen a pantalla completa */}
      <Modal visible={lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setLightbox(false)} className="flex-1 bg-black/95 items-center justify-center">
          <TouchableOpacity activeOpacity={1} onPress={() => setZoomed(z => !z)}>
            {detailImages[detailImgIndex]?.url ? (
              <Image
                source={{ uri: detailImages[detailImgIndex].url }}
                style={{ width: zoomed ? 800 : 380, height: zoomed ? 800 : 380 }}
                resizeMode="contain"
              />
            ) : null}
          </TouchableOpacity>
          <Text className="text-white/60 text-xs mt-4">{zoomed ? 'Toca la imagen para reducir' : 'Toca la imagen para ampliar'}</Text>
          <TouchableOpacity onPress={() => setLightbox(false)} className="absolute top-12 right-6 w-11 h-11 rounded-full bg-white/10 items-center justify-center">
            <MaterialIcons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SecondaryLayout>
  );
}
