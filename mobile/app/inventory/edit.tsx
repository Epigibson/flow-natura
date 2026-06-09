import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import api from '../../../src/lib/api';
import { calculateConsultantPrice, type ConsultantLevel } from '../../../src/lib/camino-crecimiento';
import { useThemeColors } from '../../hooks/use-theme-colors';

const CATEGORIES = [
  'Perfumería', 'Maquillaje', 'Cuerpo', 'Cabello',
  'Rostro', 'Cuidado Personal', 'Accesorios'
];

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
  const [costManuallyEdited, setCostManuallyEdited] = useState(false);
  const [stock, setStock] = useState('0');
  const [inventoryId, setInventoryId] = useState<string | null>(null);

  useEffect(() => {
    if (productId) loadProduct();
  }, [productId]);

  async function loadProduct() {
    setLoading(true);
    try {
      // Load product data
      const product = await api.products.get(productId!);
      setCode(product.code || '');
      setName(product.name || '');
      setCategory(product.category || '');
      setBrand(product.brand || 'Natura');
      setImageUrl(product.image_url || '');
      setDescription(product.description || '');
      setPrice(String(product.price || ''));
      setCost(String(product.cost || ''));
      setPoints(String(product.points || '0'));

      // Load inventory data for this product
      try {
        const inv = await api.inventory.list();
        const match = inv.find((i: any) => i.product_id === productId);
        if (match) {
          setStock(String(match.quantity || 0));
          setInventoryId(match.id);
        }
      } catch {}
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

  const handlePriceChange = (text: string) => {
    setPrice(text);
    if (!costManuallyEdited) {
      const numPrice = parseFloat(text) || 0;
      if (numPrice > 0) {
        setCost(calculateConsultantPrice(numPrice, level, brand, category).toFixed(2));
      } else {
        setCost('');
      }
    }
  };

  const handleLevelSelect = (newLevel: ConsultantLevel) => {
    setLevel(newLevel);
    setCostManuallyEdited(false);
    if (parsedPrice > 0) {
      setCost(calculateConsultantPrice(parsedPrice, newLevel, brand, category).toFixed(2));
    }
  };

  async function handleSave() {
    if (!name || parsedPrice <= 0) {
      Alert.alert('Datos incompletos', 'El nombre y precio son obligatorios.');
      return;
    }

    setSaving(true);
    try {
      // Update product in catalog
      await api.products.update(productId!, {
        code: code || null,
        name,
        category: category || null,
        brand: brand || null,
        description: description || null,
        price: parsedPrice,
        cost: parsedCost,
        points: parseInt(points) || 0,
        image_url: imageUrl || null,
      });

      Alert.alert('✅ Producto Actualizado', 'Los cambios se guardaron correctamente.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      '⚠️ Eliminar Producto',
      `¿Estás seguro de eliminar "${name}"? El producto será removido del catálogo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.products.delete(productId!);
              Alert.alert('Eliminado', 'El producto fue eliminado.', [
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
        <TouchableOpacity onPress={handleDelete} className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: t.error + '1A' }}>
          <MaterialIcons name="delete" size={20} color={t.error} />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>

        {/* Image preview */}
        {imageUrl ? (
          <View className="items-center mb-6">
            <Image source={{ uri: imageUrl }} className="w-28 h-28 rounded-2xl bg-surface-container-highest" resizeMode="contain" />
            <TouchableOpacity className="mt-2" onPress={() => setImageUrl('')}>
              <Text className="text-xs text-error font-bold">Quitar imagen</Text>
            </TouchableOpacity>
          </View>
        ) : null}

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

        {/* Image URL */}
        {!imageUrl && (
          <View className="mb-6">
            <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">URL de Imagen</Text>
            <TextInput
              className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
              placeholder="https://..."
              value={imageUrl} onChangeText={setImageUrl}
            />
          </View>
        )}

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
                onChangeText={(text) => { setCost(text); setCostManuallyEdited(true); }}
              />
            </View>
          </View>
        </View>

        {/* Profit indicator */}
        {parsedPrice > 0 && parsedCost > 0 && (
          <View className={`p-4 rounded-2xl mb-6 flex-row justify-between items-center border ${profit > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <View className="flex-row items-center gap-3">
              <MaterialIcons name={profit > 0 ? "trending-up" : "trending-down"} size={24} color={profit > 0 ? "#15803d" : "#b91c1c"} />
              <View>
                <Text className={`text-xs font-bold ${profit > 0 ? 'text-green-800' : 'text-red-800'}`}>Ganancia</Text>
                <Text className={`text-xl font-bold ${profit > 0 ? 'text-green-700' : 'text-red-700'}`}>${Math.abs(profit).toFixed(2)}</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className={`text-sm font-bold ${profit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {((profit / parsedPrice) * 100).toFixed(0)}%
              </Text>
              <Text className={`text-[10px] ${profit > 0 ? 'text-green-600' : 'text-red-600'}`}>Margen</Text>
            </View>
          </View>
        )}

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
