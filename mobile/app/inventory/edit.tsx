import React, { useState, useEffect } from 'react';
import { formatMoney } from '../../../src/lib/orders';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import api from '../../../src/lib/api';
import type { ConsultantLevel } from '../../../src/lib/camino-crecimiento';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { supabase } from '../../lib/supabase';
import { SITE_URL } from '../../lib/config';

const CATEGORIES = [
  'Perfumería', 'Maquillaje', 'Cuerpo', 'Cabello',
  'Rostro', 'Cuidado Personal', 'Accesorios'
];

async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
}

async function uploadProductImage(base64: string, fileName: string, mimeType: string): Promise<string> {
  const token = await getAuthToken();
  const res = await fetch(`${SITE_URL}/api/upload-product-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ imageBase64: base64, fileName, mimeType }),
  });
  const data = await res.json();
  if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo subir la imagen.');
  return data.url;
}

export default function EditProductScreen() {
  const t = useThemeColors();
  const { productId, productName: initialName } = useLocalSearchParams<{ productId: string; productName?: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [points, setPoints] = useState('0');
  const [level, setLevel] = useState<ConsultantLevel>('Bronce');
  const [stock, setStock] = useState('0');

  // Detect consultant level from profile (same as web), fallback 'Bronce'
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        const { data: profile } = await supabase
          .from('consultant_profiles')
          .select('latest_growth_data')
          .eq('id', session.user.id)
          .single();
        const desc: string | undefined = profile?.latest_growth_data?.level?.description;
        if (desc) {
          const levelMap: Record<string, ConsultantLevel> = {
            'Bronce': 'Bronce', 'Plata': 'Plata', 'Oro': 'Oro',
            'Zafiro': 'Zafiro', 'Diamante': 'Diamante',
            'BRONCE': 'Bronce', 'PLATA': 'Plata', 'ORO': 'Oro',
            'ZAFIRO': 'Zafiro', 'DIAMANTE': 'Diamante',
          };
          const detected = Object.entries(levelMap).find(([key]) => desc.includes(key));
          if (detected && !cancelled) setLevel(detected[1]);
        }
      } catch {
        // fallback: keep 'Bronce'
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Image management
  const [imageBusy, setImageBusy] = useState(false);
  const [imageBusyText, setImageBusyText] = useState('');
  const [aiResult, setAiResult] = useState<{ preview: string; url: string | null; base64: string | null; name: string; label: string } | null>(null);

  useEffect(() => {
    if (productId) loadProduct();
  }, [productId]);

  async function loadProduct() {
    setLoading(true);
    try {
      // Catalog product with MY price/cost and stock
      const product = await api.products.getForMe(productId!);
      setCode(product.code || '');
      setName(product.name || '');
      setCategory(product.category || '');
      setBrand(product.brand || 'Natura');
      setImageUrl(product.image_url || '');
      setDescription(product.description || '');
      setPrice(String(product.price || ''));
      setCost(String(product.cost || ''));
      setPoints(String(product.points || '0'));
      setStock(String(product.stock || 0));
    } catch (err: any) {
      Alert.alert('Error', 'No se pudo cargar el producto.');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  const parsedPrice = parseFloat(price) || 0;
  const parsedCost = parseFloat(cost) || 0;
  const profit = parsedPrice - parsedCost;

  // Web editar.astro: cost is edited manually only — no auto-calc from price/level
  const handlePriceChange = (text: string) => {
    setPrice(text);
  };

  const handleLevelSelect = (newLevel: ConsultantLevel) => {
    setLevel(newLevel);
  };

  // ──────────────────────────────────────────────
  // IMAGE: upload (camera/gallery) + AI enhance
  // ──────────────────────────────────────────────
  async function pickAndUploadImage(source: 'camera' | 'library') {
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permiso denegado', 'Se requiere acceso a la cámara.');
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });

      if (result.canceled || !result.assets[0]?.base64) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const ext = mimeType.includes('png') ? 'png' : 'jpg';

      setImageBusy(true);
      setImageBusyText('Subiendo imagen...');
      setAiResult(null);
      const url = await uploadProductImage(asset.base64!, `${source === 'camera' ? 'cam' : 'edit'}_${Date.now()}.${ext}`, mimeType);
      setImageUrl(url);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo subir la imagen.');
    } finally {
      setImageBusy(false);
      setImageBusyText('');
    }
  }

  async function handleEnhanceImage() {
    if (!name && !code && !description && !imageUrl) {
      Alert.alert('Sin datos', 'Necesitas ingresar un nombre, código, descripción o tener una foto actual para procesar la imagen de estudio.');
      return;
    }
    setImageBusy(true);
    setImageBusyText('Buscando imagen de estudio con IA...');
    setAiResult(null);
    try {
      const token = await getAuthToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${SITE_URL}/api/enhance-product-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          productName: name,
          productCode: code,
          productDesc: description,
          imageBase64: null,
          imageUrl: imageUrl || null,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.suggested_image_url && !data.image_base64) {
        throw new Error('La IA no pudo procesar la imagen. Intenta con otra foto.');
      }
      const strategy = data.strategy === 'imagen_bkg_removal' ? '🎯 Fondo removido'
        : (data.strategy || '').startsWith('gemini_image_gen') ? '✨ Generada por IA'
        : data.strategy === 'text_catalog_search' ? '📂 Catálogo oficial' : 'IA';
      const confText = data.confidence === 'high' ? 'Alta confianza' : data.confidence === 'medium' ? 'Confianza media' : 'Baja confianza';
      setAiResult({
        preview: data.image_base64 || data.suggested_image_url || '',
        url: data.suggested_image_url || null,
        base64: data.suggested_image_url ? null : (data.image_base64 || null),
        name: data.identified_name || name || 'Producto AI',
        label: `${strategy} • ${confText} • ${data.notes || ''}`,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        Alert.alert('Error', 'La solicitud tardó demasiado (30s). Intenta de nuevo.');
      } else {
        Alert.alert('Error', 'Error conectando con IA: ' + (err.message || err));
      }
    } finally {
      setImageBusy(false);
      setImageBusyText('');
    }
  }

  async function applyAiImage() {
    if (!aiResult) return;
    try {
      setImageBusy(true);
      setImageBusyText('Aplicando imagen...');
      if (aiResult.url) {
        setImageUrl(aiResult.url);
      } else if (aiResult.base64) {
        const clean = aiResult.base64.replace(/^data:image\/\w+;base64,/, '');
        const url = await uploadProductImage(clean, `ai_${Date.now()}.png`, 'image/png');
        setImageUrl(url);
      }
      setAiResult(null);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo usar la imagen.');
    } finally {
      setImageBusy(false);
      setImageBusyText('');
    }
  };

  async function handleSave() {
    if (!name.trim() || !code.trim()) {
      Alert.alert('Datos incompletos', 'Nombre y código son requeridos.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.products.updateForMe(productId!, {
        price: parsedPrice,
        cost: parsedCost,
        catalog: {
          code: code.trim(),
          name,
          category,
          brand,
          description,
          points: parseInt(points) || 0,
          image_url: imageUrl,
        },
      });

      Alert.alert(
        '✅ Producto actualizado',
        result.catalog_blocked
          ? 'Tu precio y costo se guardaron. Los datos del catálogo no cambiaron porque otras consultoras usan este producto.'
          : 'Los cambios se guardaron correctamente.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      'Quitar de mi inventario',
      `¿Quitar "${name}" de tu inventario? Se borra tu stock (${stock} uds) y tu precio. El catálogo y tus ventas anteriores no cambian.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.inventory.removeProduct(productId!);
              Alert.alert('Listo', 'El producto se quitó de tu inventario.', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'No se pudo eliminar.');
            }
          }
        }
      ]
    );
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={t.primary} />
        <Text className="text-on-surface-variant mt-4 text-sm">Cargando {initialName || 'producto'}...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-4 py-4 border-b border-outline-variant/10 bg-surface">
        <TouchableOpacity
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full items-center justify-center border mr-2"
          style={{ backgroundColor: t.surfaceContainerHighest, borderColor: t.outlineVariant }}
        >
          <MaterialIcons name="arrow-back" size={24} color={t.onSurface} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-on-surface ml-2">Editar Producto</Text>
          <Text className="text-[10px] text-on-surface-variant ml-2 font-mono">{code || 'Sin código'}</Text>
        </View>
        <TouchableOpacity onPress={handleDelete} accessibilityLabel="Quitar de mi inventario" className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: t.error + '1A' }}>
          <MaterialIcons name="remove-shopping-cart" size={20} color={t.error} />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>

        {/* ── Imagen del producto ── */}
        <Text className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Imagen del Producto</Text>

        {imageUrl ? (
          <View className="items-center mb-4">
            <Image source={{ uri: imageUrl }} className="w-32 h-32 rounded-2xl bg-white border border-outline-variant/20" resizeMode="contain" />
            <TouchableOpacity className="mt-2" onPress={() => { setImageUrl(''); setAiResult(null); }}>
              <Text className="text-xs text-error font-bold">Quitar imagen</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View className="flex-row gap-2 mb-3">
          <TouchableOpacity
            className="flex-1 flex-col items-center gap-1 py-3 px-2 rounded-xl bg-surface-container-highest border border-outline-variant/20"
            onPress={() => pickAndUploadImage('camera')}
            disabled={imageBusy}
          >
            <MaterialIcons name="photo-camera" size={20} color={t.primary} />
            <Text className="text-[10px] font-bold text-on-surface-variant">Tomar foto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 flex-col items-center gap-1 py-3 px-2 rounded-xl bg-surface-container-highest border border-outline-variant/20"
            onPress={() => pickAndUploadImage('library')}
            disabled={imageBusy}
          >
            <MaterialIcons name="upload-file" size={20} color={t.primary} />
            <Text className="text-[10px] font-bold text-on-surface-variant">Galería</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 flex-col items-center gap-1 py-3 px-2 rounded-xl border border-primary/30 bg-primary/5"
            onPress={handleEnhanceImage}
            disabled={imageBusy}
          >
            <MaterialIcons name="auto-awesome" size={20} color={t.primary} />
            <Text className="text-[10px] font-bold text-primary">Mejorar con IA</Text>
          </TouchableOpacity>
        </View>

        {(imageBusy || imageBusyText) ? (
          <View className="flex-row items-center gap-2 mb-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
            <ActivityIndicator size="small" color={t.primary} />
            <Text className="text-xs font-bold text-primary">{imageBusyText || 'Procesando...'}</Text>
          </View>
        ) : null}

        {aiResult && !imageBusy ? (
          <View className="mb-3 p-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20">
            <View className="flex-row items-center gap-1 mb-2">
              <MaterialIcons name="check-circle" size={14} color={t.secondary} />
              <Text className="text-xs font-bold text-secondary">Imagen encontrada</Text>
            </View>
            <View className="flex-row gap-3 items-center">
              <Image source={{ uri: aiResult.preview }} className="w-16 h-16 rounded-lg bg-white border border-outline-variant/20" resizeMode="contain" />
              <View className="flex-1">
                <Text className="text-xs text-on-surface font-bold" numberOfLines={1}>{aiResult.name}</Text>
                <Text className="text-[9px] text-on-surface-variant" numberOfLines={2}>{aiResult.label}</Text>
                <View className="flex-row gap-2 mt-2">
                  <TouchableOpacity className="bg-secondary px-3 py-1.5 rounded-full" onPress={applyAiImage}>
                    <Text className="text-[10px] font-bold text-white">Usar esta imagen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="px-3 py-1.5 rounded-full border border-outline-variant" onPress={() => setAiResult(null)}>
                    <Text className="text-[10px] font-bold text-on-surface-variant">Mantener original</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        <View className="mb-6">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">URL de Imagen</Text>
          <TextInput
            className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
            placeholder="https://..."
            autoCapitalize="none"
            value={imageUrl} onChangeText={setImageUrl}
          />
        </View>

        {/* Basic Info */}
        <Text className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Información Principal</Text>

        <View className="mb-4">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Código / SKU</Text>
          <TextInput
            className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
            placeholder="Ej. 123456"
            value={code} onChangeText={setCode}
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Nombre del Producto *</Text>
          <TextInput
            className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
            placeholder="Ej. Ekos Castanha"
            value={name} onChangeText={setName}
          />
        </View>

        <View className="flex-row gap-4 mb-4">
          <View className="flex-1">
            <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Marca</Text>
            <TextInput
              className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
              placeholder="Natura"
              value={brand} onChangeText={setBrand}
            />
          </View>
          <View className="w-24">
            <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Puntos</Text>
            <TextInput
              className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base text-center"
              placeholder="0" keyboardType="numeric"
              value={points} onChangeText={setPoints}
            />
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Descripción</Text>
          <TextInput
            className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base h-20"
            placeholder="Descripción del producto..."
            multiline textAlignVertical="top"
            value={description} onChangeText={setDescription}
          />
        </View>

        <View className="mb-6">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Categoría</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="py-1">
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                onPress={() => setCategory(cat)}
                className={`mr-2 px-4 py-2.5 rounded-full border-2 ${category === cat ? 'border-primary bg-primary/10' : 'border-outline-variant/20 bg-surface-container-lowest'}`}
              >
                <Text className={`font-bold ${category === cat ? 'text-primary' : 'text-on-surface-variant'}`}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Pricing */}
        <Text className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Finanzas</Text>

        <View className="mb-4">
          <Text className="text-sm font-bold text-on-surface-variant mb-2 ml-1">Tu Nivel de Consultora</Text>
          <View className="flex-row flex-wrap gap-2">
            {(['Bronce', 'Plata', 'Oro', 'Zafiro', 'Diamante'] as ConsultantLevel[]).map(lvl => (
              <TouchableOpacity
                key={lvl}
                onPress={() => handleLevelSelect(lvl)}
                className={`px-3 py-2 rounded-lg border-2 ${level === lvl ? 'border-primary bg-primary/10' : 'border-outline-variant/20 bg-surface-container-highest'}`}
              >
                <Text className={`text-xs font-bold ${level === lvl ? 'text-primary' : 'text-on-surface-variant'}`}>{lvl}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="flex-row gap-4 mb-6">
          <View className="flex-1">
            <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Precio Venta *</Text>
            <View className="relative justify-center">
              <Text className="absolute left-4 font-bold text-primary text-lg z-10">$</Text>
              <TextInput
                className="bg-surface-container-highest rounded-xl pl-8 pr-4 py-4 text-on-surface text-lg font-bold"
                placeholder="0.00" keyboardType="numeric"
                value={price} onChangeText={handlePriceChange}
              />
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Tu Costo</Text>
            <View className="relative justify-center">
              <Text className="absolute left-4 font-bold text-on-surface-variant text-lg z-10">$</Text>
              <TextInput
                className="bg-surface-container-highest rounded-xl pl-8 pr-4 py-4 text-on-surface text-lg font-bold"
                placeholder="0.00" keyboardType="numeric"
                value={cost}
                onChangeText={setCost}
              />
            </View>
          </View>
        </View>

        {/* Margin indicator — thresholds 30/15 like web editar.astro */}
        {parsedPrice > 0 && parsedCost > 0 && (() => {
          const marginPct = Math.round((profit / parsedPrice) * 100);
          const tone = marginPct >= 30
            ? { bg: 'bg-green-50 border-green-200', strong: 'text-green-800', mid: 'text-green-700', soft: 'text-green-600', icon: 'trending-up', color: '#15803d' }
            : marginPct >= 15
            ? { bg: 'bg-amber-50 border-amber-200', strong: 'text-amber-800', mid: 'text-amber-700', soft: 'text-amber-600', icon: 'trending-up', color: '#b45309' }
            : { bg: 'bg-red-50 border-red-200', strong: 'text-red-800', mid: 'text-red-700', soft: 'text-red-600', icon: 'trending-down', color: '#b91c1c' };
          return (
            <View className={`p-4 rounded-2xl mb-6 flex-row justify-between items-center border ${tone.bg}`}>
              <View className="flex-row items-center gap-3">
                <MaterialIcons name={tone.icon as any} size={24} color={tone.color} />
                <View>
                  <Text className={`text-xs font-bold ${tone.strong}`}>Ganancia</Text>
                  <Text className={`text-xl font-bold ${tone.mid}`}>{formatMoney(Number(Math.abs(profit)))}</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className={`text-sm font-bold ${tone.mid}`}>{marginPct}%</Text>
                <Text className={`text-[10px] ${tone.soft}`}>Margen</Text>
              </View>
            </View>
          );
        })()}

        {/* Stock info (read-only, adjust in inventory adjustments) */}
        <View className="bg-surface-container-highest p-4 rounded-2xl flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3">
            <MaterialIcons name="inventory-2" size={20} color={t.onSurfaceVariant} />
            <Text className="text-on-surface font-bold">Stock Actual</Text>
          </View>
          <Text className="text-on-surface font-bold text-xl">{stock} uds</Text>
        </View>
        <Text className="text-[10px] text-on-surface-variant text-center mb-6">
          Para ajustar stock, usa Inventario → Ajustes
        </Text>

      </ScrollView>

      {/* Save Button */}
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-surface border-t border-outline-variant/10">
        <TouchableOpacity
          className="bg-primary py-4 rounded-full flex-row items-center justify-center shadow-lg"
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color="#fff" />
              <Text className="text-white font-bold text-base ml-2">Guardar Cambios</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
