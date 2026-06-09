import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import api from '../../../src/lib/api';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function ScanSearchScreen() {
  const t = useThemeColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [foundProduct, setFoundProduct] = useState<any>(null);
  const [isInInventory, setIsInInventory] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (!scanning || loading) return;
    setScanning(false);
    setScannedCode(data);
    setLoading(true);
    setFoundProduct(null);
    setIsInInventory(false);

    try {
      // Search in catalog
      const products = await api.products.list({ search: data });
      const match = products?.find((p: any) =>
        p.code?.toLowerCase() === data.toLowerCase()
      );

      if (match) {
        setFoundProduct(match);

        // Check if in inventory
        const inv = await api.inventory.list();
        const invMatch = inv?.find((i: any) => i.product_id === match.id);
        setIsInInventory(!!invMatch);
        if (invMatch) {
          setFoundProduct({ ...match, _stock: invMatch.quantity });
        }
      } else {
        setFoundProduct(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  async function handleAddToInventory() {
    if (!foundProduct) return;
    setAdding(true);
    try {
      await api.inventory.add([{ product_id: foundProduct.id, quantity: 1 }]);
      setIsInInventory(true);
      Alert.alert('✅ Agregado', `${foundProduct.name} fue agregado a tu inventario.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo agregar.');
    } finally {
      setAdding(false);
    }
  }

  function resetScanner() {
    setScanning(true);
    setScannedCode('');
    setFoundProduct(null);
    setIsInInventory(false);
  }

  // Permission request
  if (!permission?.granted) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center px-8">
        <Stack.Screen options={{ headerShown: false }} />
        <MaterialIcons name="camera-alt" size={64} color={t.primary} />
        <Text className="text-xl font-bold text-on-surface mt-4 text-center">Permiso de Cámara</Text>
        <Text className="text-on-surface-variant text-center mt-2 mb-6">
          Se necesita acceso a la cámara para escanear códigos de barras.
        </Text>
        <TouchableOpacity className="bg-primary py-3 px-8 rounded-full" onPress={requestPermission}>
          <Text className="text-white font-bold">Conceder Permiso</Text>
        </TouchableOpacity>
        <TouchableOpacity className="py-3 mt-2" onPress={() => router.back()}>
          <Text className="text-on-surface-variant font-bold">Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Camera view */}
      {scanning && (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr", "ean13", "ean8", "code128", "upc_a", "upc_e"]
          }}
        />
      )}

      {/* Overlay header */}
      <View className="absolute top-0 left-0 right-0 z-10 pt-12 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          >
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg">Escanear Código</Text>
          <View className="w-10" />
        </View>
      </View>

      {/* Scanning guide */}
      {scanning && !loading && (
        <View className="absolute bottom-10 left-0 right-0 items-center z-10">
          <View className="bg-black/70 px-6 py-3 rounded-full">
            <Text className="text-white font-bold text-sm">📷 Apunta al código de barras</Text>
          </View>
        </View>
      )}

      {/* Loading */}
      {loading && (
        <View className="absolute inset-0 bg-black/80 items-center justify-center z-20">
          <ActivityIndicator size="large" color={t.primary} />
          <Text className="text-white font-bold mt-4">Buscando "{scannedCode}"...</Text>
        </View>
      )}

      {/* Results panel */}
      {!scanning && !loading && (
        <View className="absolute inset-0 bg-surface z-20">
          <SafeAreaView className="flex-1">
            {/* Header */}
            <View className="flex-row items-center px-4 py-4 border-b border-outline-variant/10">
              <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full items-center justify-center bg-surface-container-highest mr-2">
                <MaterialIcons name="arrow-back" size={24} color={t.onSurface} />
              </TouchableOpacity>
              <View className="flex-1">
                <Text className="text-lg font-bold text-on-surface ml-2">Resultado del Escaneo</Text>
                <Text className="text-[10px] text-on-surface-variant ml-2 font-mono">Código: {scannedCode}</Text>
              </View>
            </View>

            <ScrollView className="flex-1 p-6">
              {foundProduct ? (
                <>
                  {/* Product card */}
                  <View className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm border border-outline-variant/10 mb-6">
                    <View className="flex-row items-start gap-4 mb-4">
                      {foundProduct.image_url ? (
                        <Image source={{ uri: foundProduct.image_url }} className="w-24 h-24 rounded-2xl bg-surface-container-highest" resizeMode="contain" />
                      ) : (
                        <View className="w-24 h-24 rounded-2xl bg-primary/10 items-center justify-center">
                          <MaterialIcons name="spa" size={36} color={t.primary} />
                        </View>
                      )}
                      <View className="flex-1">
                        <Text className="text-xl font-bold text-on-surface">{foundProduct.name}</Text>
                        <Text className="text-xs text-on-surface-variant mt-1">
                          {foundProduct.brand || 'Natura'} · {foundProduct.category || 'Sin categoría'}
                        </Text>
                        <Text className="text-2xl font-bold text-primary mt-2">
                          ${Number(foundProduct.price || 0).toFixed(2)}
                        </Text>
                      </View>
                    </View>

                    {foundProduct.description && (
                      <Text className="text-sm text-on-surface-variant mb-4">{foundProduct.description}</Text>
                    )}

                    {/* Info chips */}
                    <View className="flex-row flex-wrap gap-2">
                      {foundProduct.code && (
                        <View className="px-3 py-1 rounded-full bg-surface-container-highest">
                          <Text className="text-[10px] font-bold text-on-surface-variant">SKU: {foundProduct.code}</Text>
                        </View>
                      )}
                      {foundProduct.points > 0 && (
                        <View className="px-3 py-1 rounded-full bg-primary/10">
                          <Text className="text-[10px] font-bold text-primary">{foundProduct.points} pts</Text>
                        </View>
                      )}
                      {isInInventory && foundProduct._stock !== undefined && (
                        <View className="px-3 py-1 rounded-full bg-secondary/10">
                          <Text className="text-[10px] font-bold text-secondary">Stock: {foundProduct._stock}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Actions */}
                  {isInInventory ? (
                    <View className="bg-secondary/10 p-4 rounded-2xl flex-row items-center gap-3 mb-4">
                      <MaterialIcons name="check-circle" size={24} color={t.secondary} />
                      <View className="flex-1">
                        <Text className="text-secondary font-bold">Ya está en tu inventario</Text>
                        <Text className="text-xs text-on-surface-variant">Puedes editarlo o ajustar el stock.</Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      className="bg-primary py-4 rounded-full flex-row items-center justify-center gap-2 mb-4 shadow-lg"
                      style={{ shadowColor: t.primary }}
                      onPress={handleAddToInventory}
                      disabled={adding}
                    >
                      {adding ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <MaterialIcons name="add-shopping-cart" size={20} color="#fff" />
                          <Text className="text-white font-bold text-base">Agregar a Mi Inventario</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}

                  {isInInventory && (
                    <TouchableOpacity
                      className="bg-surface-container-highest py-3 rounded-full flex-row items-center justify-center gap-2 border border-outline-variant mb-4"
                      onPress={() => {
                        router.replace({ pathname: '/inventory/edit', params: { productId: foundProduct.id, productName: foundProduct.name } } as any);
                      }}
                    >
                      <MaterialIcons name="edit" size={18} color={t.onSurface} />
                      <Text className="text-on-surface font-bold">Editar Producto</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                /* Not found */
                <View className="items-center py-16">
                  <View className="w-20 h-20 rounded-full bg-surface-container-highest items-center justify-center mb-4">
                    <MaterialIcons name="search-off" size={40} color={t.onSurfaceVariant} />
                  </View>
                  <Text className="text-xl font-bold text-on-surface text-center">Producto No Encontrado</Text>
                  <Text className="text-on-surface-variant text-center mt-2 mb-6 px-4">
                    El código "{scannedCode}" no existe en el catálogo. ¿Deseas crear un producto nuevo con este código?
                  </Text>
                  <TouchableOpacity
                    className="bg-primary py-4 px-8 rounded-full flex-row items-center gap-2"
                    onPress={() => router.replace({ pathname: '/inventory/new', params: { code: scannedCode } } as any)}
                  >
                    <MaterialIcons name="add" size={20} color="#fff" />
                    <Text className="text-white font-bold">Crear Producto Nuevo</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Scan again button */}
              <TouchableOpacity
                className="py-3 items-center mt-2"
                onPress={resetScanner}
              >
                <Text className="text-primary font-bold">📷 Escanear Otro Código</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}
    </SafeAreaView>
  );
}
