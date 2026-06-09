import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput, Linking, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import api from '../../../src/lib/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { supabase } from '../../../src/lib/supabase';
import { haptic } from '../../lib/haptics';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams();
  const t = useThemeColors();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [abonoAmount, setAbonoAmount] = useState('');
  
  // Notes
  const [notesModalVisible, setNotesModalVisible] = useState(false);
  const [editingNotes, setEditingNotes] = useState('');
  
  // Change Client
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedNewClient, setSelectedNewClient] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    if (id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      const data = await api.orders.get(id as string);
      
      if (data.payment_method?.toLowerCase() === 'abonos' && data.notes) {
        try {
          data._parsedNotes = JSON.parse(data.notes);
        } catch {}
      }
      setOrder(data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la venta.');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  if (loading || !order) {
    return (
      <SafeAreaView className="flex-1 bg-surface justify-center items-center">
        <ActivityIndicator size="large" color={t.primary} />
      </SafeAreaView>
    );
  }

  let debtRemaining = 0;
  let totalPaid = 0;
  const isAbonos = order.payment_method?.toLowerCase() === 'abonos';
  const terms = order._parsedNotes;

  if (isAbonos && terms) {
    const enganche = Number(terms.enganche || 0);
    const historial = terms.historial_abonos || [];
    const totalAbonado = historial.reduce((acc: number, curr: any) => acc + Number(curr.monto || 0), 0);
    totalPaid = enganche + totalAbonado;
    debtRemaining = Number(order.total_amount) - totalPaid;
  } else if (order.status === 'pending') {
    debtRemaining = Number(order.total_amount);
  }
  
  const isFullyPaid = isAbonos ? debtRemaining <= 0.01 : true;
  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';

  const cName = order.customers?.full_name || 'Cliente Mostrador';
  const initials = cName.split(' ').map((n:string)=>n[0]).join('').substring(0,2).toUpperCase();
  const folio = order.id.split('-')[0].toUpperCase();

  const handleAbono = async () => {
    const amount = Number(abonoAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Por favor ingresa un monto mayor a 0.');
      return;
    }

    try {
      const historial = terms.historial_abonos || [];
      historial.push({ monto: amount, fecha: new Date().toISOString() });
      const pagosCompletados = Number(terms.pagos_completados || 0) + 1;
      
      const newTerms = { ...terms, historial_abonos: historial, pagos_completados: pagosCompletados };
      
      await supabase.from('orders').update({ notes: JSON.stringify(newTerms) }).eq('id', id);
      
      setModalVisible(false);
      setAbonoAmount('');
      loadData();
      haptic.success();
      Alert.alert('Éxito', 'Abono registrado correctamente.');
    } catch {
      haptic.error();
      Alert.alert('Error', 'Hubo un problema al registrar el abono.');
    }
  };

  const handleStatusChange = (action: 'deliver' | 'cancel') => {
    Alert.alert(
      action === 'deliver' ? 'Entregar Pedido' : 'Cancelar Pedido',
      `¿Estás seguro de que quieres ${action === 'deliver' ? 'marcar como entregado' : 'cancelar este pedido'}?`,
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Sí', 
          style: action === 'cancel' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              if (action === 'deliver') await api.orders.deliver(id as string);
              if (action === 'cancel') await api.orders.cancel(id as string);
              action === 'deliver' ? haptic.success() : haptic.warning();
              loadData();
            } catch {
              Alert.alert('Error', 'No se pudo actualizar el estado.');
            }
          }
        }
      ]
    );
  };

  // ── Send WhatsApp Ticket ──
  const sendTicketWhatsApp = () => {
    const phone = order.customers?.phone?.replace(/\D/g, '');
    if (!phone) {
      Alert.alert('Sin teléfono', 'Este cliente no tiene número de teléfono registrado.');
      return;
    }

    const items = order.order_items || [];
    const itemsText = items.map((item: any) => 
      `  • ${item.products?.name || 'Producto'} x${item.quantity} — $${(item.quantity * Number(item.unit_price)).toFixed(2)}`
    ).join('\n');

    const msg = `🧾 *TICKET DE VENTA — Flow Natura*\n\n` +
      `📋 Folio: *#NF-${folio}*\n` +
      `📅 Fecha: ${new Date(order.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
      `👤 Cliente: ${cName}\n\n` +
      `─────────────────\n` +
      `*PRODUCTOS:*\n${itemsText}\n` +
      `─────────────────\n\n` +
      `💰 *Total: $${Number(order.total_amount).toFixed(2)} MXN*\n` +
      `📦 Método: ${isAbonos ? 'Abonos' : 'Contado'}\n` +
      (debtRemaining > 0 ? `⚠️ *Saldo pendiente: $${debtRemaining.toFixed(2)} MXN*\n` : '') +
      `\n¡Gracias por tu compra! 🌿💚`;

    Linking.openURL(`whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`).catch(() => {
      Alert.alert('Error', 'No se pudo abrir WhatsApp.');
    });
  };

  // ── Save Notes ──
  const handleSaveNotes = async () => {
    try {
      // Parse existing notes or create new obj
      let notesObj: any = {};
      try { notesObj = order.notes ? JSON.parse(order.notes) : {}; } catch { notesObj = {}; }
      notesObj.notas_internas = editingNotes;

      await supabase.from('orders').update({ notes: JSON.stringify(notesObj) }).eq('id', id);
      setNotesModalVisible(false);
      haptic.success();
      loadData();
    } catch {
      haptic.error();
      Alert.alert('Error', 'No se pudieron guardar las notas.');
    }
  };

  // ── Change Client ──
  const openClientModal = async () => {
    try {
      const data = await api.customers.list();
      setCustomers(data || []);
      setSelectedNewClient(order.customer_id);
      setClientModalVisible(true);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar los clientes.');
    }
  };

  const handleSaveClient = async () => {
    if (!selectedNewClient || selectedNewClient === order.customer_id) {
      setClientModalVisible(false);
      return;
    }
    setSavingClient(true);
    try {
      await supabase.from('orders').update({ customer_id: selectedNewClient }).eq('id', id);
      setClientModalVisible(false);
      haptic.success();
      loadData();
    } catch {
      haptic.error();
      Alert.alert('Error', 'No se pudo cambiar el cliente.');
    } finally {
      setSavingClient(false);
    }
  };

  // Parse internal notes for display
  let internalNotes = '';
  try {
    const parsed = order.notes ? JSON.parse(order.notes) : {};
    internalNotes = parsed.notas_internas || '';
  } catch {}

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center justify-between border-b border-surface-container">
        <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 items-center justify-center rounded-full bg-surface-container">
          <MaterialIcons name="arrow-back" size={24} color={t.onSurface} />
        </TouchableOpacity>
        <Text className="text-xl font-bold font-serif text-on-surface">Detalle de Venta</Text>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1 px-6 pt-6 pb-24" showsVerticalScrollIndicator={false}>
        
        {/* Folio and Status */}
        <View className="flex-row items-start justify-between mb-8">
          <View>
            <Text className="text-on-surface-variant font-mono text-xs uppercase mb-1">Folio #NF-{folio}</Text>
            <Text className="text-2xl font-bold font-serif text-on-surface">{new Date(order.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
          </View>
          <View className="px-3 py-1.5 rounded-full flex-row items-center gap-1.5" style={{ backgroundColor: isCancelled ? t.error + '1A' : (isDelivered ? t.secondary + '1A' : t.primary + '1A') }}>
            <View className={`w-2 h-2 rounded-full ${isCancelled ? 'bg-error' : (isDelivered ? 'bg-secondary' : 'bg-primary')}`} />
            <Text className={`text-xs font-bold ${isCancelled ? 'text-error' : (isDelivered ? 'text-secondary' : 'text-primary')}`}>
              {isCancelled ? 'Cancelado' : (isDelivered ? 'Entregado' : 'Pendiente')}
            </Text>
          </View>
        </View>

        {/* Client Info — with Change Client button */}
        <View className="bg-surface-container-low p-6 rounded-3xl mb-6 flex-row items-center gap-4 border border-outline-variant">
          <View className="w-16 h-16 rounded-full flex items-center justify-center bg-primary-container">
            <Text className="text-2xl font-bold text-on-primary-container">{initials}</Text>
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-2 mb-1">
              <Text className="text-primary font-bold text-xs uppercase tracking-widest">Cliente</Text>
              {!isCancelled && (
                <TouchableOpacity onPress={openClientModal}>
                  <MaterialIcons name="edit" size={14} color={t.primary + '80'} />
                </TouchableOpacity>
              )}
            </View>
            <Text className="text-xl font-bold text-on-surface mb-0.5">{cName}</Text>
            {order.customers?.phone && (
              <Text className="text-sm text-on-surface-variant flex-row items-center">
                <MaterialIcons name="phone" size={14} /> {order.customers.phone}
              </Text>
            )}
          </View>
        </View>

        {/* Financial Summary */}
        <View className="bg-surface-container-lowest p-6 rounded-3xl mb-6 shadow-sm border border-outline-variant">
          <Text className="text-lg font-bold font-serif text-on-surface mb-4 flex-row items-center">
            <MaterialIcons name="receipt" size={20} color={t.primary} /> Resumen de Venta
          </Text>
          
          <View className="flex-row justify-between mb-4 pb-4 border-b border-surface-container">
            <Text className="text-on-surface-variant font-medium">Subtotal ({order.order_items?.length || 0} productos)</Text>
            <Text className="text-on-surface font-bold text-lg">${Number(order.total_amount).toFixed(2)}</Text>
          </View>
          
          <View className="flex-row justify-between items-center mb-6">
            <View className="px-3 py-1 rounded-full flex-row items-center gap-1" style={{ backgroundColor: isAbonos ? t.primaryContainer + '1A' : t.secondaryContainer + '1A' }}>
              <View className={`w-2 h-2 rounded-full ${isAbonos ? 'bg-primary' : 'bg-secondary'}`} />
              <Text className={`text-xs font-bold ${isAbonos ? 'text-primary' : 'text-secondary'}`}>
                {isAbonos ? 'EN ABONOS' : 'AL CONTADO'}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-sm text-on-surface-variant uppercase tracking-tighter">Total a Pagar</Text>
              <Text className="text-3xl font-black text-primary">${Number(order.total_amount).toFixed(2)}</Text>
            </View>
          </View>

          {isAbonos && (
            <View className="bg-surface-container p-4 rounded-2xl">
              <Text className="text-sm font-bold uppercase tracking-widest text-on-surface-variant mb-4">Cronograma de Pagos</Text>
              
              <View className="flex-row justify-between mb-3 items-center">
                <Text className="text-on-surface font-medium text-sm"><MaterialIcons name="check-circle" size={14} color={t.secondary} /> Enganche</Text>
                <Text className="text-secondary font-bold">${Number(terms?.enganche || 0).toFixed(2)}</Text>
              </View>

              {terms?.historial_abonos?.map((abono: any, idx: number) => (
                <View key={idx} className="flex-row justify-between mb-3 items-center">
                  <View>
                    <Text className="text-on-surface font-medium text-sm"><MaterialIcons name="check-circle" size={14} color={t.secondary} /> Abono</Text>
                    <Text className="text-[10px] text-on-surface-variant">{new Date(abono.fecha).toLocaleDateString('es-MX')}</Text>
                  </View>
                  <Text className="text-secondary font-bold">${Number(abono.monto).toFixed(2)}</Text>
                </View>
              ))}

              {!isFullyPaid && !isCancelled && (
                <View className="flex-row justify-between mt-3 pt-3 border-t border-outline-variant/20 items-center">
                  <Text className="text-on-surface font-bold text-sm"><MaterialIcons name="schedule" size={14} color={t.primary} /> Saldo Pendiente</Text>
                  <Text className="text-primary font-black text-lg">${debtRemaining.toFixed(2)}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Action Buttons */}
        {!isCancelled && (
          <View className="mb-6 space-y-3">
            {isAbonos && !isFullyPaid && (
              <TouchableOpacity 
                className="w-full bg-primary py-4 rounded-xl items-center shadow-sm flex-row justify-center gap-2 mb-3"
                onPress={() => setModalVisible(true)}
              >
                <MaterialIcons name="payments" size={20} color="#fff" />
                <Text className="text-white font-bold text-base">Registrar Abono</Text>
              </TouchableOpacity>
            )}

            {/* WhatsApp cobrar button */}
            {debtRemaining > 0 && order.customers?.phone && (
              <TouchableOpacity 
                className="w-full bg-green-600 py-4 rounded-xl items-center shadow-sm flex-row justify-center gap-2 mb-3"
                onPress={() => {
                  const phone = order.customers.phone.replace(/\D/g, '');
                  const msg = `¡Hola ${cName}! 🌿\n\nTe escribo sobre tu pedido #${folio}.\nEl saldo pendiente es de *$${debtRemaining.toFixed(2)} MXN*.\n\n¿Cuándo te es posible realizar el pago? ¡Gracias! 💚`;
                  Linking.openURL(`whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`).catch(() => {
                    Alert.alert('Error', 'No se pudo abrir WhatsApp.');
                  });
                }}
              >
                <MaterialIcons name="chat" size={20} color="#fff" />
                <Text className="text-white font-bold text-base">Cobrar por WhatsApp</Text>
              </TouchableOpacity>
            )}

            {!isDelivered && (
              <TouchableOpacity 
                className="w-full bg-surface-container py-4 rounded-xl items-center flex-row justify-center gap-2 mb-3 border border-outline-variant"
                onPress={() => handleStatusChange('deliver')}
              >
                <MaterialIcons name="local-shipping" size={20} color={t.onSurface} />
                <Text className="text-on-surface font-bold text-base">Marcar como Entregado</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              className="w-full py-4 items-center"
              onPress={() => handleStatusChange('cancel')}
            >
              <Text className="text-error font-bold text-sm">Cancelar Venta</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Products List */}
        <View className="bg-surface-container-lowest p-6 rounded-3xl mb-6 shadow-sm border border-outline-variant">
          <Text className="text-lg font-bold font-serif text-on-surface mb-6 flex-row items-center">
            <MaterialIcons name="shopping-bag" size={20} color={t.primary} /> Desglose de Productos
          </Text>

          {order.order_items?.map((item: any, idx: number) => (
            <View key={item.id} className={`flex-row items-center gap-4 ${idx > 0 ? 'pt-4 mt-4 border-t border-surface-container' : ''}`}>
              <View className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center">
                <MaterialIcons name="spa" size={20} color={t.primaryContainer} />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-on-surface text-base">{item.products?.name}</Text>
                <Text className="text-xs text-on-surface-variant">{item.quantity} x ${Number(item.unit_price).toFixed(2)}</Text>
              </View>
              <Text className="font-bold text-on-background">${(item.quantity * Number(item.unit_price)).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Internal Notes Section */}
        <View className="bg-surface-container-lowest p-6 rounded-3xl mb-6 shadow-sm border border-outline-variant">
          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-row items-center gap-2">
              <MaterialIcons name="description" size={20} color={t.primary} />
              <Text className="text-lg font-bold font-serif text-on-surface">Notas de la Venta</Text>
            </View>
            <TouchableOpacity 
              onPress={() => { setEditingNotes(internalNotes); setNotesModalVisible(true); }}
              className="flex-row items-center gap-1"
            >
              <MaterialIcons name="edit-note" size={16} color={t.primary} />
              <Text className="text-primary font-bold text-sm">Editar</Text>
            </TouchableOpacity>
          </View>
          <View className="bg-surface-container-low p-4 rounded-2xl border border-dashed border-outline-variant">
            <Text className="text-on-surface-variant text-sm italic">
              {internalNotes || 'No hay notas adicionales para esta venta.'}
            </Text>
          </View>
        </View>

        {/* WhatsApp Ticket Button */}
        {order.customers?.phone && (
          <TouchableOpacity 
            className="w-full py-4 rounded-2xl items-center flex-row justify-center gap-3 mb-8"
            style={{ backgroundColor: '#25D36615', borderWidth: 1, borderColor: '#25D36630' }}
            onPress={sendTicketWhatsApp}
          >
            <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: '#25D366' }}>
              <MaterialIcons name="send" size={18} color="#fff" />
            </View>
            <View>
              <Text className="font-bold text-on-surface">Ticket Digital</Text>
              <Text className="text-xs text-on-surface-variant">Envía el recibo al cliente por WhatsApp</Text>
            </View>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Abono Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center px-4">
          <View className="bg-surface-container-lowest rounded-3xl w-full p-6 border border-outline-variant shadow-2xl">
            <View className="w-16 h-16 bg-primary-container rounded-full items-center justify-center self-center mb-4">
              <MaterialIcons name="payments" size={32} color={t.onPrimaryContainer} />
            </View>
            <Text className="text-xl font-bold text-center text-on-surface mb-2">Registrar Abono</Text>
            <Text className="text-sm text-center text-on-surface-variant mb-6">Ingresa el monto que el cliente está pagando en este momento.</Text>

            <View className="bg-surface-container p-4 rounded-2xl mb-6">
              <Text className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mb-2">Monto a cobrar (MXN)</Text>
              <View className="flex-row items-center border-b-2 border-primary pb-2">
                <Text className="text-2xl font-black text-primary mr-1">$</Text>
                <TextInput
                  value={abonoAmount}
                  onChangeText={setAbonoAmount}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={t.onSurfaceVariant + '80'}
                  className="flex-1 text-2xl font-black text-primary p-0 m-0"
                />
              </View>
            </View>

            <View className="space-y-3">
              <TouchableOpacity className="bg-primary py-4 rounded-xl items-center shadow-sm mb-3" onPress={handleAbono}>
                <Text className="text-white font-bold text-base">Confirmar Cobro</Text>
              </TouchableOpacity>
              <TouchableOpacity className="bg-surface-container py-4 rounded-xl items-center" onPress={() => setModalVisible(false)}>
                <Text className="text-on-surface font-bold">Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notes Edit Modal */}
      <Modal visible={notesModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center px-4">
          <View className="bg-surface-container-lowest rounded-3xl w-full p-6 border border-outline-variant shadow-2xl">
            <View className="w-16 h-16 bg-primary-container/20 rounded-full items-center justify-center self-center mb-4">
              <MaterialIcons name="edit-note" size={32} color={t.primary} />
            </View>
            <Text className="text-xl font-bold text-center text-on-surface mb-2">Notas de la Venta</Text>
            <Text className="text-sm text-center text-on-surface-variant mb-6">Añade observaciones o comentarios internos.</Text>

            <TextInput
              value={editingNotes}
              onChangeText={setEditingNotes}
              multiline
              numberOfLines={4}
              placeholder="Escribe notas aquí..."
              placeholderTextColor={t.onSurfaceVariant + '60'}
              className="bg-surface-container rounded-2xl p-4 text-on-surface text-base mb-6 min-h-[120px]"
              textAlignVertical="top"
              style={{ color: t.onSurface }}
            />

            <View className="space-y-3">
              <TouchableOpacity className="bg-primary py-4 rounded-xl items-center shadow-sm mb-3" onPress={handleSaveNotes}>
                <Text className="text-white font-bold text-base">Guardar Notas</Text>
              </TouchableOpacity>
              <TouchableOpacity className="bg-surface-container py-4 rounded-xl items-center" onPress={() => setNotesModalVisible(false)}>
                <Text className="text-on-surface font-bold">Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Client Modal */}
      <Modal visible={clientModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center px-4">
          <View className="bg-surface-container-lowest rounded-3xl w-full p-6 border border-outline-variant shadow-2xl max-h-[80%]">
            <View className="w-16 h-16 bg-primary-container/20 rounded-full items-center justify-center self-center mb-4">
              <MaterialIcons name="switch-account" size={32} color={t.primary} />
            </View>
            <Text className="text-xl font-bold text-center text-on-surface mb-2">Cambiar Cliente</Text>
            <Text className="text-sm text-center text-on-surface-variant mb-6">Reasigna esta venta a otro cliente registrado.</Text>

            <ScrollView className="max-h-[300px] mb-6">
              {customers.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  className={`flex-row items-center gap-3 p-4 rounded-2xl mb-2 border ${selectedNewClient === c.id ? 'border-primary bg-primary/5' : 'border-outline-variant/30 bg-surface-container'}`}
                  onPress={() => { setSelectedNewClient(c.id); haptic.selection(); }}
                >
                  <View className={`w-10 h-10 rounded-full items-center justify-center ${selectedNewClient === c.id ? 'bg-primary' : 'bg-surface-container-highest'}`}>
                    <Text className={`font-bold text-sm ${selectedNewClient === c.id ? 'text-white' : 'text-on-surface-variant'}`}>
                      {c.full_name?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className={`font-bold ${selectedNewClient === c.id ? 'text-primary' : 'text-on-surface'}`}>{c.full_name}</Text>
                    {c.phone && <Text className="text-xs text-on-surface-variant">{c.phone}</Text>}
                  </View>
                  {selectedNewClient === c.id && (
                    <MaterialIcons name="check-circle" size={22} color={t.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View className="space-y-3">
              <TouchableOpacity 
                className="bg-primary py-4 rounded-xl items-center shadow-sm mb-3 flex-row justify-center gap-2" 
                onPress={handleSaveClient}
                disabled={savingClient}
              >
                {savingClient ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-base">Guardar Cambios</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity className="bg-surface-container py-4 rounded-xl items-center" onPress={() => setClientModalVisible(false)}>
                <Text className="text-on-surface font-bold">Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
