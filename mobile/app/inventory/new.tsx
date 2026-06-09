import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import api from '../../../src/lib/api';
import { calculateConsultantPrice, type ConsultantLevel } from '../../../src/lib/camino-crecimiento';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { supabase } from '../../lib/supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://flow-natura.vercel.app';

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

  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [aiGeneratedImage, setAiGeneratedImage] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);

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
  
  // ═══════════ AI ANALYSIS ═══════════

  async function getAuthToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  }

  async function takePhotoForAI() {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permiso denegado', 'Se requiere acceso a la cámara.');
        return;
      }
    }

    // Option 1: Use ImagePicker for gallery or camera
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]?.base64) {
      const base64 = result.assets[0].base64;
      setCapturedPhoto(`data:image/jpeg;base64,${base64}`);
      analyzeWithAI(base64);
    }
  }

  async function pickImageForAI() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]?.base64) {
      const base64 = result.assets[0].base64;
      setCapturedPhoto(`data:image/jpeg;base64,${base64}`);
      analyzeWithAI(base64);
    }
  }

  async function analyzeWithAI(base64: string) {
    setAiLoading(true);
    setAiStatus('Analizando producto con IA...');
    setAiConfidence(null);

    try {
      const token = await getAuthToken();

      // 1. Analyze product with Gemini
      const analyzeRes = await fetch(`${API_BASE_URL}/api/gemini-analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      if (!analyzeRes.ok) {
        throw new Error('Error al analizar la imagen');
      }

      const data = await analyzeRes.json();

      // Fill form with AI data
      if (data.name) setName(data.name);
      if (data.brand) setBrand(data.brand);
      if (data.category) {
        const matched = CATEGORIES.find(c => c.toLowerCase() === data.category?.toLowerCase());
        setCategory(matched || data.category);
      }
      if (data.code) setCode(data.code);
      if (data.price) {
        const p = String(data.price);
        setPrice(p);
        handlePriceChange(p);
      }
      if (data.points) setPoints(String(data.points));

      setAiConfidence(data.confidence || 'medium');
      setAiStatus('¡Datos extraídos con IA! ✨');

      // 2. Generate clean product image
      setAiStatus('Generando imagen profesional...');
      try {
        const genRes = await fetch(`${API_BASE_URL}/api/gemini-generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            imageBase64: base64,
            productName: data.name || name,
          }),
        });

        if (genRes.ok) {
          const genData = await genRes.json();
          if (genData.imageUrl) {
            setAiGeneratedImage(genData.imageUrl);
            setImageUrl(genData.imageUrl);
            setAiStatus('¡Imagen profesional generada! ✨');
          } else {
            setAiStatus('Datos extraídos ✅ (imagen no disponible)');
          }
        }
      } catch {
        // Image generation is optional, don't fail
        setAiStatus('Datos extraídos ✅ (imagen no disponible)');
      }

    } catch (err: any) {
      console.error('AI error:', err);
      setAiStatus('');
      Alert.alert('Error IA', err.message || 'No se pudo analizar la imagen.');
    } finally {
      setAiLoading(false);
    }
  }

  // ═══════════ BARCODE SCANNING ═══════════
  
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

  // ═══════════ PRICING & PROFIT ═══════════

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

  // ═══════════ SAVE ═══════════

  const handleSave = async () => {
    if (!code || !name || parsedPrice <= 0 || parsedCost <= 0 || parseInt(stock) < 1) {
      Alert.alert('Datos incompletos', 'Por favor llena Código, Nombre, Precio, Costo y Stock.');
      return;
    }

    setLoading(true);
    try {
      const existingProduct = await api.products.list({ search: code });
      let productId;

      if (existingProduct && existingProduct.length > 0) {
        productId = existingProduct[0].id;
      } else {
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
        
        const newProduct = await api.products.create(productPayload);
        productId = newProduct.id;
      }

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

        {/* ═══════ AI SCAN SECTION ═══════ */}
        <View className="mb-6 bg-surface-container-lowest rounded-3xl p-5 border border-outline-variant/10 shadow-sm">
          <View className="flex-row items-center gap-2 mb-3">
            <MaterialIcons name="auto-awesome" size={20} color={t.primary} />
            <Text className="text-sm font-bold text-primary uppercase tracking-widest">Escanear con IA</Text>
          </View>
          <Text className="text-xs text-on-surface-variant mb-4">
            Toma una foto del producto y Gemini extraerá nombre, categoría, marca y más.
          </Text>

          {/* Photo preview */}
          {capturedPhoto && (
            <View className="mb-4 items-center">
              <Image 
                source={{ uri: capturedPhoto }} 
                className="w-32 h-32 rounded-2xl" 
                resizeMode="cover" 
              />
              {aiGeneratedImage && (
                <View className="mt-2 items-center">
                  <Text className="text-[10px] text-on-surface-variant mb-1">Imagen Generada por IA:</Text>
                  <Image 
                    source={{ uri: aiGeneratedImage }} 
                    className="w-24 h-24 rounded-xl border border-primary/20" 
                    resizeMode="contain" 
                  />
                </View>
              )}
            </View>
          )}

          {/* AI Status */}
          {aiLoading && (
            <View className="flex-row items-center gap-2 mb-3 bg-primary/5 p-3 rounded-xl">
              <ActivityIndicator size="small" color={t.primary} />
              <Text className="text-xs font-bold text-primary">{aiStatus}</Text>
            </View>
          )}

          {!aiLoading && aiStatus !== '' && (
            <View className="flex-row items-center gap-2 mb-3 bg-secondary/5 p-3 rounded-xl">
              <MaterialIcons name="check-circle" size={16} color={t.secondary} />
              <Text className="text-xs font-bold text-secondary">{aiStatus}</Text>
              {aiConfidence && (
                <View className={`px-2 py-0.5 rounded-full ml-auto ${aiConfidence === 'high' ? 'bg-green-100' : aiConfidence === 'medium' ? 'bg-yellow-100' : 'bg-red-100'}`}>
                  <Text className={`text-[10px] font-bold ${aiConfidence === 'high' ? 'text-green-800' : aiConfidence === 'medium' ? 'text-yellow-800' : 'text-red-800'}`}>
                    {aiConfidence === 'high' ? 'Alta confianza' : aiConfidence === 'medium' ? 'Media' : 'Baja'}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action buttons */}
          <View className="flex-row gap-3">
            <TouchableOpacity 
              className="flex-1 bg-primary py-3.5 rounded-2xl flex-row items-center justify-center gap-2"
              onPress={takePhotoForAI}
              disabled={aiLoading}
            >
              <MaterialIcons name="camera-alt" size={18} color="#fff" />
              <Text className="text-white font-bold text-sm">
                {capturedPhoto ? 'Otra Foto' : 'Tomar Foto'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              className="flex-1 py-3.5 rounded-2xl flex-row items-center justify-center gap-2 border-2 border-primary/20"
              onPress={pickImageForAI}
              disabled={aiLoading}
            >
              <MaterialIcons name="photo-library" size={18} color={t.primary} />
              <Text className="text-primary font-bold text-sm">Galería</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider */}
        <View className="flex-row items-center mb-6">
          <View className="flex-1 h-[1px] bg-outline-variant/20" />
          <Text className="mx-3 text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">o llena manual</Text>
          <View className="flex-1 h-[1px] bg-outline-variant/20" />
        </View>

        {/* ═══════ MANUAL FORM ═══════ */}
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

        {/* Image Preview */}
        <View className="mb-6">
          <Text className="text-sm font-bold text-on-surface-variant mb-1 ml-1">Imagen del Producto</Text>
          {imageUrl ? (
            <View className="mt-2 items-center">
              <Image source={{ uri: imageUrl }} className="w-32 h-32 rounded-2xl bg-surface-container-highest" resizeMode="contain" />
              <TouchableOpacity className="mt-2" onPress={() => { setImageUrl(''); setAiGeneratedImage(null); }}>
                <Text className="text-xs text-error font-bold">Quitar imagen</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TextInput 
              className="bg-surface-container-highest rounded-xl px-4 py-4 text-on-surface text-base"
              placeholder="https://... (Opcional o usa IA)"
              value={imageUrl} onChangeText={setImageUrl}
            />
          )}
        </View>

        {/* Pricing */}
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
