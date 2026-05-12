import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../../../src/lib/supabase';
import api from '../../../src/lib/api';

export default function NewSaleScreen() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Data
  const [customers, setCustomers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  
  // Selection States
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [cart, setCart] = useState<any[]>([]);
  
  // Global Discount States
  const [globalDiscount, setGlobalDiscount] = useState('0');
  const [globalDiscountType, setGlobalDiscountType] = useState<'amount' | 'percentage'>('amount');

  // Payment States
  const [paymentMethod, setPaymentMethod] = useState<'contado' | 'abonos'>('contado');
  const [enganche, setEnganche] = useState('');
  const [pagos, setPagos] = useState('1');
  const [frecuencia, setFrecuencia] = useState('Quincenal');

  // Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Scanner
  const [permission, requestPermission] = useCameraPermissions();
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [custData, invData] = await Promise.all([
        api.customers.list(),
        api.inventory.list()
      ]);
      setCustomers(custData || []);
      // Solo inventario con stock
      setInventory((invData || []).filter(item => item.quantity > 0));
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(p => p.product_id === product.product_id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          Alert.alert('Stock insuficiente', 'No hay más unidades disponibles.');
          return prev;
        }
        return prev.map(p => p.product_id === product.product_id ? { ...p, quantity: p.quantity + 1 } : p);
      } else {
        return [...prev, { 
          ...product, 
          quantity: 1, 
          unit_price: Number(product.price),
          discount: 0,
          discount_type: 'amount',
        }];
      }
    });
    setShowProductModal(false);
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        const newQ = item.quantity + delta;
        if (newQ > item.quantity && newQ > item.max_quantity) return item; // limit to stock
        return { ...item, quantity: newQ };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const updateCartDiscount = (productId: string, type: 'amount' | 'percentage', value: string) => {
    setCart(prev => prev.map(item => {
      if (item.product_id === productId) {
        let val = Number(value) || 0;
        if (type === 'percentage' && val > 100) val = 100;
        if (type === 'amount' && val > item.unit_price) val = item.unit_price;
        return { ...item, discount_type: type, discount: val };
      }
      return item;
    }));
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) return Alert.alert('Permiso denegado', 'Necesitas dar acceso a la cámara.');
    }
    setShowScanner(true);
  };

  const handleBarcodeScanned = ({ type, data }: any) => {
    setShowScanner(false);
    // Allow a small timeout to prevent double scanning bugs
    setTimeout(() => {
      const found = inventory.find(i => i.product_code === data || i.product_id === data);
      if (found) {
        addToCart({ ...found, max_quantity: found.quantity });
        Alert.alert('Agregado al Carrito', `Se agregó ${found.product_name}.`);
      } else {
        Alert.alert('No encontrado', `El código ${data} no coincide con tu inventario actual.`);
      }
    }, 500);
  };

  // ──────────────────────────────────────────────
  // CALCULATIONS
  // ──────────────────────────────────────────────
  const { subtotal, totalItemDiscounts, cartWithCalcs } = useMemo(() => {
    let sub = 0;
    let itemDiscs = 0;
    const computedCart = cart.map(item => {
      let discountAmount = 0;
      if (item.discount_type === 'percentage') {
        discountAmount = item.unit_price * (item.discount / 100);
      } else {
        discountAmount = item.discount;
      }
      
      if (discountAmount > item.unit_price) discountAmount = item.unit_price;
      
      sub += (item.unit_price * item.quantity);
      itemDiscs += (discountAmount * item.quantity);
      
      return { ...item, _calculated_discount: discountAmount, _final_unit_price: Math.max(0, item.unit_price - discountAmount) };
    });
    
    return { subtotal: sub, totalItemDiscounts: itemDiscs, cartWithCalcs: computedCart };
  }, [cart]);

  const { calculatedGlobalDiscount, totalDiscount, finalTotal } = useMemo(() => {
    let globalDiscNum = Number(globalDiscount) || 0;
    let calculated = 0;

    if (globalDiscountType === 'percentage') {
      calculated = subtotal * (globalDiscNum / 100);
    } else {
      calculated = globalDiscNum;
    }

    const maxGlobalAllowed = Math.max(0, subtotal - totalItemDiscounts);
    if (calculated > maxGlobalAllowed) {
      calculated = maxGlobalAllowed;
    }

    const totDiscount = totalItemDiscounts + calculated;
    const final = Math.max(0, subtotal - totDiscount);

    return { calculatedGlobalDiscount: calculated, totalDiscount: totDiscount, finalTotal: final };
  }, [subtotal, totalItemDiscounts, globalDiscount, globalDiscountType]);

  // ──────────────────────────────────────────────
  // CHECKOUT
  // ──────────────────────────────────────────────
  const handleCheckout = async () => {
    if (cart.length === 0) return Alert.alert('Carrito vacío', 'Agrega productos a la venta.');
    
    setSubmitting(true);
    try {
      let customerId = selectedCustomer?.id;

      // Create "Cliente Mostrador" if none selected
      if (!customerId) {
        const userId = await api.getCurrentUserId();
        const { data: existing } = await supabase.from('customers').select('id').eq('consultant_id', userId).eq('full_name', 'Cliente Mostrador').maybeSingle();
        if (existing) {
          customerId = existing.id;
        } else {
          const { data: newCust } = await supabase.from('customers').insert({ consultant_id: userId, full_name: 'Cliente Mostrador', phone: '', email: '' }).select('id').single();
          customerId = newCust?.id;
        }
      }

      if (!customerId) throw new Error('No se pudo determinar el cliente.');

      const userId = await api.getCurrentUserId();
      let orderNotesObj: any = {};

      if (paymentMethod === 'abonos') {
        orderNotesObj = {
          tipo: 'Abonos',
          enganche: enganche || '0',
          frecuencia: frecuencia,
          pagos: pagos || '1'
        };
      }

      // Añadir descuentos al JSON (igual que en web)
      if (totalDiscount > 0) {
        orderNotesObj.descuentos = {
          global: {
            tipo: globalDiscountType,
            valor_original: Number(globalDiscount) || 0,
            monto_descontado: calculatedGlobalDiscount
          },
          productos: cartWithCalcs.filter(i => i._calculated_discount > 0).map(i => ({
            producto: i.product_name,
            precio_original: i.unit_price,
            tipo: i.discount_type,
            valor_original: i.discount,
            descuento_unitario: i._calculated_discount
          }))
        };
      }

      const orderNotes = Object.keys(orderNotesObj).length > 0 ? JSON.stringify(orderNotesObj) : null;

      // 1. Create Order
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        consultant_id: userId,
        customer_id: customerId,
        total_amount: finalTotal,
        payment_method: paymentMethod,
        notes: orderNotes,
        status: 'pending'
      }).select('id').single();

      if (orderError) throw orderError;

      // 2. Insert Items (Unit price here is the discounted price)
      const orderItems = cartWithCalcs.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item._final_unit_price
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // 3. Update Inventory Stock
      for (const item of cart) {
        const { data: inv } = await supabase.from('inventory').select('id, quantity').eq('product_id', item.product_id).eq('consultant_id', userId).single();
        if (inv) {
          await supabase.from('inventory').update({ quantity: Math.max(0, inv.quantity - item.quantity) }).eq('id', inv.id);
        }
      }

      Alert.alert('Éxito', 'Venta registrada correctamente.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/sales') }
      ]);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', err.message || 'No se pudo registrar la venta.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredInventory = inventory.filter(p => p.product_name?.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface items-center justify-center">
        <ActivityIndicator size="large" color="#476810" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-outline-variant/10 flex-row items-center justify-between z-10 bg-surface">
        <View className="flex-row items-center gap-4">
          <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 bg-surface-container rounded-full items-center justify-center">
            <MaterialIcons name="arrow-back" size={24} color="#564336" />
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-serif font-bold text-on-surface leading-tight">Punto de Venta</Text>
            <Text className="text-on-surface-variant text-xs">Nueva Venta</Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        
        {/* 1. Cliente */}
        <Text className="font-bold text-on-surface mb-3 ml-1 text-sm uppercase tracking-widest text-primary/80">1. Cliente</Text>
        <TouchableOpacity 
          className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/20 mb-6 flex-row items-center justify-between shadow-sm"
          onPress={() => setShowCustomerModal(true)}
        >
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-primary-container/40 flex items-center justify-center">
              <MaterialIcons name="person" size={20} color="#3e4d2b" />
            </View>
            <View>
              <Text className="font-bold text-on-surface text-base">{selectedCustomer ? selectedCustomer.full_name : 'Cliente Mostrador'}</Text>
              <Text className="text-xs text-on-surface-variant">Toca para cambiar</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#888" />
        </TouchableOpacity>

        {/* 2. Productos */}
        <View className="flex-row items-center justify-between mb-3 ml-1">
          <Text className="font-bold text-on-surface text-sm uppercase tracking-widest text-primary/80">2. Productos ({cartWithCalcs.length})</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity onPress={openScanner} className="bg-surface-container-high px-3 py-1.5 rounded-full flex-row items-center gap-1 border border-outline-variant/20">
              <MaterialIcons name="qr-code-scanner" size={16} color="#564336" />
              <Text className="text-on-surface font-bold text-xs">Escanear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowProductModal(true)} className="bg-primary/10 px-3 py-1.5 rounded-full flex-row items-center gap-1">
              <MaterialIcons name="add" size={16} color="#3e4d2b" />
              <Text className="text-primary font-bold text-xs">Añadir</Text>
            </TouchableOpacity>
          </View>
        </View>

        {cartWithCalcs.length === 0 ? (
          <View className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant/20 border-dashed items-center justify-center mb-6">
            <MaterialIcons name="shopping-basket" size={40} color="#ccc" />
            <Text className="text-on-surface-variant text-sm mt-2 text-center">El carrito está vacío</Text>
          </View>
        ) : (
          <View className="mb-6 space-y-3">
            {cartWithCalcs.map((item, idx) => {
              const isPerc = item.discount_type === 'percentage';
              const lineTotal = item._final_unit_price * item.quantity;
              
              return (
                <View key={idx} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm mb-3">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-row flex-1 pr-2 items-center gap-3">
                      <View className="w-12 h-12 rounded-xl bg-surface-container-high overflow-hidden items-center justify-center border border-outline-variant/10">
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} className="w-full h-full" resizeMode="contain" />
                        ) : (
                          <MaterialIcons name="image-not-supported" size={20} color="#888" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-bold text-on-surface" numberOfLines={1}>{item.product_name}</Text>
                        <View className="flex-row items-center gap-2 mt-1">
                          <Text className="text-primary font-bold text-sm">${lineTotal.toFixed(2)}</Text>
                          {item._calculated_discount > 0 && (
                            <Text className="text-on-surface-variant text-[10px] line-through">${(item.unit_price * item.quantity).toFixed(2)}</Text>
                          )}
                        </View>
                        <Text className="text-on-surface-variant text-[10px] mt-0.5">(${(item._final_unit_price).toFixed(2)} c/u)</Text>
                      </View>
                    </View>
                    <View className="flex-row items-center bg-surface-container-high rounded-full overflow-hidden self-center">
                      <TouchableOpacity onPress={() => updateCartQuantity(item.product_id, -1)} className="w-8 h-8 items-center justify-center">
                        <MaterialIcons name="remove" size={16} color="#564336" />
                      </TouchableOpacity>
                      <Text className="font-bold text-on-surface w-6 text-center">{item.quantity}</Text>
                      <TouchableOpacity onPress={() => updateCartQuantity(item.product_id, 1)} className="w-8 h-8 items-center justify-center bg-primary/10">
                        <MaterialIcons name="add" size={16} color="#3e4d2b" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  {/* Descuento por ítem */}
                  <View className="flex-row justify-end items-center mt-3 pt-3 border-t border-outline-variant/10">
                    <Text className="text-[10px] text-secondary mr-2">Desc.</Text>
                    <TouchableOpacity 
                      className="w-6 h-6 rounded bg-surface-container-high items-center justify-center mr-1"
                      onPress={() => updateCartDiscount(item.product_id, isPerc ? 'amount' : 'percentage', String(item.discount))}
                    >
                      <Text className="text-primary font-bold text-[10px]">{isPerc ? '%' : '$'}</Text>
                    </TouchableOpacity>
                    <TextInput 
                      className="bg-surface-container border border-outline-variant/20 rounded px-2 py-0.5 w-14 text-[10px] text-right text-secondary h-6"
                      keyboardType="numeric"
                      value={String(item.discount || '0')}
                      onChangeText={(val) => updateCartDiscount(item.product_id, item.discount_type, val)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 3. Pago */}
        <Text className="font-bold text-on-surface mb-3 ml-1 text-sm uppercase tracking-widest text-primary/80">3. Método de Pago</Text>
        
        {/* Opciones de Pago (Radio Buttons) */}
        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity 
            className={`flex-1 p-4 rounded-2xl border-2 flex-col justify-between ${paymentMethod === 'contado' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface-container-lowest'}`}
            onPress={() => setPaymentMethod('contado')}
          >
            <View className="flex-row justify-between items-start mb-2">
              <MaterialIcons name="payments" size={24} color={paymentMethod === 'contado' ? '#3e4d2b' : '#564336'} />
              <View className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'contado' ? 'border-primary' : 'border-outline-variant'}`}>
                {paymentMethod === 'contado' && <View className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </View>
            </View>
            <Text className="font-bold text-base text-on-surface mt-1">Contado</Text>
            <Text className="text-[10px] text-on-surface-variant leading-tight">Pago único inmediato</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            className={`flex-1 p-4 rounded-2xl border-2 flex-col justify-between ${paymentMethod === 'abonos' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface-container-lowest'}`}
            onPress={() => setPaymentMethod('abonos')}
          >
            <View className="flex-row justify-between items-start mb-2">
              <MaterialIcons name="calendar-month" size={24} color={paymentMethod === 'abonos' ? '#3e4d2b' : '#564336'} />
              <View className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'abonos' ? 'border-primary' : 'border-outline-variant'}`}>
                {paymentMethod === 'abonos' && <View className="w-2.5 h-2.5 rounded-full bg-primary" />}
              </View>
            </View>
            <Text className="font-bold text-base text-on-surface mt-1">Abonos</Text>
            <Text className="text-[10px] text-on-surface-variant leading-tight">Pagos diferidos programados</Text>
          </TouchableOpacity>
        </View>

        {/* Configuración de Abonos */}
        {paymentMethod === 'abonos' && (
          <View className="bg-surface-container-lowest p-5 rounded-3xl border border-outline-variant/20 mb-6 shadow-sm">
            <View className="flex-row flex-wrap gap-4">
              
              <View className="w-[45%]">
                <Text className="text-xs font-bold text-on-surface-variant mb-1">Enganche</Text>
                <View className="flex-row items-center bg-surface-container-high rounded-xl px-4 py-3">
                  <Text className="text-on-surface-variant font-bold mr-1">$</Text>
                  <TextInput 
                    className="flex-1 text-on-surface"
                    placeholder="0.00" keyboardType="numeric" value={enganche} onChangeText={setEnganche}
                  />
                </View>
              </View>

              <View className="w-[45%] flex-grow">
                <Text className="text-xs font-bold text-on-surface-variant mb-1">Frecuencia</Text>
                <View className="bg-surface-container-high rounded-xl overflow-hidden">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4 }}>
                    {['Semanal', 'Quincenal', 'Mensual'].map(f => (
                      <TouchableOpacity 
                        key={f} 
                        onPress={() => setFrecuencia(f)}
                        className={`px-3 py-2 rounded-lg mr-1 ${frecuencia === f ? 'bg-primary/20' : 'bg-transparent'}`}
                      >
                        <Text className={`text-xs font-bold ${frecuencia === f ? 'text-primary' : 'text-on-surface-variant'}`}>{f}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View className="w-full">
                <Text className="text-xs font-bold text-on-surface-variant mb-1">Número de pagos</Text>
                <TextInput 
                  className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface"
                  placeholder="4" keyboardType="numeric" value={pagos} onChangeText={setPagos}
                />
              </View>

            </View>
          </View>
        )}

        <View className="h-10" />
      </ScrollView>

      {/* Footer Checkout con Resumen Dinámico */}
      <View className="bg-surface-container-lowest border-t border-outline-variant/10 p-6 pt-4">
        
        {/* Resumen */}
        {cartWithCalcs.length > 0 && (
          <View className="mb-4 space-y-1">
            <View className="flex-row justify-between mb-1">
              <Text className="text-on-surface-variant text-xs">Subtotal</Text>
              <Text className="text-on-surface-variant text-xs font-bold">${subtotal.toFixed(2)}</Text>
            </View>

            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-on-surface-variant text-xs">Descuento Global</Text>
              <View className="flex-row items-center gap-1">
                <TouchableOpacity 
                  className="w-5 h-5 rounded bg-surface-container-high items-center justify-center"
                  onPress={() => {
                    setGlobalDiscountType(prev => prev === 'amount' ? 'percentage' : 'amount');
                    setGlobalDiscount('0');
                  }}
                >
                  <Text className="text-primary font-bold text-[10px]">{globalDiscountType === 'percentage' ? '%' : '$'}</Text>
                </TouchableOpacity>
                <TextInput 
                  className="bg-surface-container border border-outline-variant/20 rounded px-1 py-0 w-12 text-[10px] text-right text-secondary h-5"
                  keyboardType="numeric"
                  value={globalDiscount}
                  onChangeText={setGlobalDiscount}
                />
              </View>
            </View>

            <View className="flex-row justify-between mb-2 pb-2 border-b border-outline-variant/10">
              <Text className="text-secondary text-xs">Descuentos Aplicados</Text>
              <Text className="text-secondary text-xs font-bold">-${totalDiscount.toFixed(2)}</Text>
            </View>
          </View>
        )}

        <View className="flex-row justify-between items-end mb-4">
          <Text className="text-on-surface-variant font-bold uppercase tracking-widest text-xs">Total a Pagar</Text>
          <Text className="text-3xl font-display font-extrabold text-primary">${finalTotal.toFixed(2)}</Text>
        </View>

        <TouchableOpacity 
          className={`py-4 rounded-full flex-row items-center justify-center gap-2 shadow-lg ${cart.length === 0 ? 'bg-surface-container opacity-50' : 'bg-primary shadow-primary/30'}`}
          disabled={cart.length === 0 || submitting}
          onPress={handleCheckout}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : (
            <>
              <MaterialIcons name="receipt-long" size={24} color={cart.length === 0 ? '#888' : '#fff'} />
              <Text className={`font-bold text-lg ${cart.length === 0 ? 'text-on-surface-variant' : 'text-white'}`}>
                Completar Venta
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <Modal visible={showCustomerModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-surface p-6">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-serif font-bold text-on-surface">Seleccionar Cliente</Text>
            <TouchableOpacity onPress={() => setShowCustomerModal(false)}>
              <MaterialIcons name="close" size={28} color="#564336" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            className="p-4 bg-primary/10 rounded-2xl mb-4 border border-primary/20"
            onPress={() => { setSelectedCustomer(null); setShowCustomerModal(false); }}
          >
            <Text className="font-bold text-primary text-center">Usar Cliente Mostrador</Text>
          </TouchableOpacity>
          <FlatList
            data={customers}
            keyExtractor={c => c.id}
            renderItem={({item}) => (
              <TouchableOpacity 
                className="p-4 bg-surface-container-lowest rounded-2xl mb-2 border border-outline-variant/10"
                onPress={() => { setSelectedCustomer(item); setShowCustomerModal(false); }}
              >
                <Text className="font-bold text-on-surface text-lg">{item.full_name}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      <Modal visible={showProductModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-surface p-6">
          <View className="flex-row justify-between items-center mb-6">
            <Text className="text-2xl font-serif font-bold text-on-surface">Añadir Productos</Text>
            <TouchableOpacity onPress={() => setShowProductModal(false)}>
              <MaterialIcons name="close" size={28} color="#564336" />
            </TouchableOpacity>
          </View>
          <TextInput 
            className="bg-surface-container-high rounded-xl px-4 py-3 text-on-surface mb-4"
            placeholder="Buscar producto en inventario..."
            value={searchQuery} onChangeText={setSearchQuery}
          />
          <FlatList
            data={filteredInventory}
            keyExtractor={p => p.product_id}
            renderItem={({item}) => (
              <TouchableOpacity 
                className="p-4 bg-surface-container-lowest rounded-2xl mb-3 border border-outline-variant/10 flex-row justify-between items-center"
                onPress={() => addToCart({...item, max_quantity: item.quantity})}
              >
                <View className="w-14 h-14 rounded-xl bg-surface-container-high overflow-hidden items-center justify-center border border-outline-variant/10 mr-3">
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} className="w-full h-full" resizeMode="contain" />
                  ) : (
                    <MaterialIcons name="image-not-supported" size={24} color="#888" />
                  )}
                </View>
                <View className="flex-1 pr-2">
                  <Text className="font-bold text-on-surface text-base" numberOfLines={1}>{item.product_name}</Text>
                  <Text className="text-secondary text-xs">{item.quantity} disponibles</Text>
                </View>
                <View className="bg-primary/10 px-3 py-1.5 rounded-full">
                  <Text className="text-primary font-bold">${Number(item.price).toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView className="flex-1 bg-black">
          <View className="flex-row justify-between items-center p-6 z-10 absolute top-0 w-full pt-12">
            <Text className="text-white font-bold text-xl drop-shadow-md">Escanea un Producto</Text>
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
