import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api from '../../../src/lib/api';
import { calculateConsultantPrice, type ConsultantLevel } from '../../../src/lib/camino-crecimiento';
import { useThemeColors } from '../../hooks/use-theme-colors';

const CATEGORIES = [
  'Perfumería',
  'Maquillaje',
  'Cuerpo',
  'Cabello',
  'Rostro',
  'Cuidado Personal',
  'Accesorios'
];

export default function NewProductScreen() {
  const t = useThemeColors();
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('Natura');
  const [stock, setStock] = useState('1');
  const [imageUrl, setImageUrl] = useState('');
  const [description] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [points, setPoints] = useState('0');
  const [level, setLevel] = useState<ConsultantLevel>('Bronce');
  const [costManuallyEdited, setCostManuallyEdited] = useState(false);
  
  // Handlers
  const handleScanBarcode = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Se requiere acceso a la cámara para escanear el código.');
        return;
      }
    }
    setShowScanner(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setCode(data);
    setShowScanner(false);
  };

  // Pricing & Profit Math
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

  useEffect(() => {
    if (!costManuallyEdited && parsedPrice > 0) {
      setCost(calculateConsultantPrice(parsedPrice, level, brand, category).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand, category]);

  const handleSave = async () => {
    if (!code || !name || parsedPrice <= 0 || parsedCost <= 0 || parseInt(stock) < 1) {
      Alert.alert('Datos incompletos', 'Por favor llena Código, Nombre, Precio, Costo y Stock.');
      return;
    }

    setLoading(true);
    try {
      // 1. Verificar si el producto ya existe en el catálogo global
      const existingProduct = await api.products.list({ search: code });
      let productId;

      if (existingProduct && existingProduct.length > 0) {
        productId = existingProduct[0].id;
      } else {
        // 2. Si no existe, crearlo en el catálogo
        const productPayload: any = {
          code,
          name,
          category: category || null,
          brand: brand || null,
          description: description || null,
          price: parsedPrice,
          cost: parsedCost,
          points: parseInt(points) || 0,
        };
        if (imageUrl) productPayload.image_url = imageUrl;
        
        // El catálogo global no lleva stock ni consultant_id directamente, pero la API lo ignora o falla si lo mandamos
        // Dependiendo de la implementación de api.ts, puede que acepte data y solo pase lo necesario.
        // Hacemos el insert manual si api.products.create es problemático, o lo usamos directo.
        const newProduct = await api.products.create(productPayload);
        productId = newProduct.id;
      }

      // 3. Vincular el producto al inventario de la consultora con el stock inicial
      await api.inventory.add([{
        product_id: productId,
        quantity: parseInt(stock)
      }]);
      
      Alert.alert('¡Éxito!', 'El producto ha sido creado.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e.message || 'No se pudo guardar el producto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-4 border-b border-outline-variant/10 bg-surface">
        <TouchableOpacity 
          onPress={() => router.back()} 
          className="w-10 h-10 rounded-full items-center justify-center border mr-2"
          style={{ backgroundColor: t.surfaceContainerHighest, borderColor: t.outlineVariant, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={t.onSurface} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-on-surface ml-2 flex-1">Crear Producto</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {/* Detalles Base */}
        <Text className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Información Principal</Text>
        
        <View className="mb-4">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Código / SKU *</Text>
          <View className="relative justify-center">
            <TextInput 
              className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base pr-12"
              placeholder="Ej. 123456"
              value={code} onChangeText={setCode}
            />
            <TouchableOpacity 
              className="absolute right-2 w-10 h-10 bg-primary/10 rounded-lg items-center justify-center"
              onPress={handleScanBarcode}
            >
              <MaterialIcons name="qr-code-scanner" size={20} color="#3e4d2b" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Nombre del Producto *</Text>
          <TextInput 
            className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
            placeholder="Ej. Ekos Castanha Hidratante"
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
          <View className="w-24">
            <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Stock *</Text>
            <TextInput 
              className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base text-center"
              placeholder="1" keyboardType="numeric"
              value={stock} onChangeText={setStock}
            />
          </View>
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

        {/* Imagen URL */}
        <View className="mb-6">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">URL de Imagen</Text>
          <TextInput 
            className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
            placeholder="https://... (Opcional)"
            value={imageUrl} onChangeText={setImageUrl}
          />
          {imageUrl.length > 0 && (
            <View className="mt-3 w-24 h-24 rounded-xl bg-surface-container-highest overflow-hidden border border-outline-variant/10 self-center">
              <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="contain" />
            </View>
          )}
        </View>

        {/* Precios y Ganancias */}
        <Text className="text-xs font-bold uppercase tracking-widest text-primary mb-4">Finanzas y Rentabilidad</Text>

        <View className="mb-4">
          <Text className="text-sm font-bold text-on-surface-variant mb-2 ml-1">Tu Nivel de Consultora (Auto-Calcula Margen)</Text>
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
            <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Tu Costo *</Text>
            <View className="relative justify-center">
              <Text className="absolute left-4 font-bold text-on-surface-variant text-lg z-10">$</Text>
              <TextInput 
                className="bg-surface-container-highest rounded-xl pl-8 pr-4 py-4 text-on-surface text-lg font-bold"
                placeholder="0.00" keyboardType="numeric"
                value={cost} 
                onChangeText={(text) => {
                  setCost(text);
                  setCostManuallyEdited(true);
                }}
              />
            </View>
          </View>
        </View>

        {parsedPrice > 0 && parsedCost > 0 && (
          <View className={`p-4 rounded-2xl mb-6 flex-row justify-between items-center border ${profit > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <View className="flex-row items-center gap-3">
              <MaterialIcons name={profit > 0 ? "trending-up" : "trending-down"} size={24} color={profit > 0 ? "#15803d" : "#b91c1c"} />
              <View>
                <Text className={`text-xs font-bold ${profit > 0 ? 'text-green-800' : 'text-red-800'}`}>Ganancia Estimada</Text>
                <Text className={`text-xl font-bold ${profit > 0 ? 'text-green-700' : 'text-red-700'}`}>${Math.abs(profit).toFixed(2)}</Text>
              </View>
            </View>
            <View className="items-end">
              <Text className={`text-sm font-bold ${profit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                {((profit / parsedPrice) * 100).toFixed(0)}%
              </Text>
              <Text className={`text-[10px] ${profit > 0 ? 'text-green-600' : 'text-red-600'}`}>Margen Bruto</Text>
            </View>
          </View>
        )}

      </ScrollView>

      {/* Save Button Fixed Bottom */}
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-surface border-t border-outline-variant/10">
        <TouchableOpacity 
          className="bg-primary py-4 rounded-full flex-row items-center justify-center shadow-lg"
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons name="save" size={20} color="#fff" />
              <Text className="text-white font-bold text-base ml-2">Guardar Producto</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView className="flex-1 bg-black">
          <View className="flex-row justify-between items-center p-6 z-10 absolute top-0 w-full pt-12">
            <Text className="text-white font-bold text-xl drop-shadow-md">Escanear Código / SKU</Text>
            <TouchableOpacity onPress={() => setShowScanner(false)} className="bg-black/50 p-2 rounded-full">
              <MaterialIcons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          {showScanner && permission?.granted && (
            <CameraView 
              style={{ flex: 1 }} 
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "code128", "upc_a", "upc_e"]
              }}
            />
          )}
          <View className="absolute bottom-10 self-center bg-black/70 px-6 py-3 rounded-full">
            <Text className="text-white font-bold">Apunta la cámara al código de barras</Text>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}
