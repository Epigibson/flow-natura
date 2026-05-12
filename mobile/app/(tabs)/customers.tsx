import { View, Text, FlatList, TextInput, ActivityIndicator, TouchableOpacity, Linking, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../src/lib/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function CustomersScreen() {
  const t = useThemeColors();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals & Forms
  const [showModal, setShowModal] = useState<'create' | 'edit' | 'detail' | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerStats, setCustomerStats] = useState<any>(null);
  const [formData, setFormData] = useState({ full_name: '', phone: '', email: '', preferences: '' });
  const [submitting, setSubmitting] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.customers.list(search);
      setCustomers(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleCall = (phone: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\D/g, '')}`).catch(() => {
      Alert.alert('Error', 'No se pudo abrir la aplicación de llamadas');
    });
  };

  const handleWhatsApp = (phone: string) => {
    if (!phone) return;
    Linking.openURL(`whatsapp://send?phone=${phone.replace(/\D/g, '')}`).catch(() => {
      Alert.alert('Error', 'No se pudo abrir WhatsApp');
    });
  };

  const openCreate = () => {
    setFormData({ full_name: '', phone: '', email: '', preferences: '' });
    setShowModal('create');
  };

  const openDetail = async (customer: any) => {
    setSelectedCustomer(customer);
    setCustomerStats(null);
    setShowModal('detail');
    try {
      const stats = await api.customers.getStats(customer.id);
      setCustomerStats(stats);
    } catch(e) {
      console.error('Error fetching stats', e);
    }
  };

  const openEdit = () => {
    setFormData({
      full_name: selectedCustomer.full_name || '',
      phone: selectedCustomer.phone || '',
      email: selectedCustomer.email || '',
      preferences: selectedCustomer.preferences || ''
    });
    setShowModal('edit');
  };

  const handleSave = async () => {
    if (!formData.full_name) {
      Alert.alert('Error', 'El nombre del cliente es obligatorio');
      return;
    }
    setSubmitting(true);
    try {
      if (showModal === 'create') {
        await api.customers.create(formData);
      } else if (showModal === 'edit' && selectedCustomer) {
        const updated = await api.customers.update(selectedCustomer.id, formData);
        setSelectedCustomer(updated);
        setShowModal('detail'); // volver al detalle
      }
      if (showModal === 'create') setShowModal(null);
      loadCustomers();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el cliente');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Confirmar Eliminación', `¿Estás seguro de eliminar a ${selectedCustomer?.full_name}? Esta acción no eliminará su historial de compras, pero lo ocultará del directorio.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try {
          await api.customers.delete(selectedCustomer.id);
          setShowModal(null);
          loadCustomers();
        } catch (e: any) {
          Alert.alert('Error', e.message || 'No se pudo eliminar');
        }
      }}
    ]);
  };

  const renderItem = ({ item }: { item: any }) => {
    const initial = item.full_name?.charAt(0).toUpperCase() || 'C';
    const date = new Date(item.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });

    return (
      <View className="bg-surface-container-lowest p-5 rounded-3xl mb-4 shadow-sm border border-outline-variant">
        <View className="flex-row items-start justify-between mb-4">
          <View className="flex-row items-center flex-1">
            <View className="w-12 h-12 rounded-full flex items-center justify-center mr-4" style={{ backgroundColor: t.primaryContainer + '4D' }}>
              <Text className="text-primary font-serif font-bold text-xl">{initial}</Text>
            </View>
            <View className="flex-1 pr-2">
              <Text className="font-bold text-on-surface text-lg" numberOfLines={1}>{item.full_name}</Text>
              <Text className="text-on-surface-variant text-xs mt-0.5">Cliente desde {date}</Text>
            </View>
          </View>
          
          <TouchableOpacity 
            className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center"
            onPress={() => openDetail(item)}
          >
            <MaterialIcons name="chevron-right" size={20} color={t.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        {(item.phone || item.email) && (
          <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: t.surfaceContainerHighest + '4D' }}>
            {item.phone && (
              <View className="flex-row items-center gap-2 mb-1.5">
                <MaterialIcons name="phone" size={14} color={t.muted} />
                <Text className="text-sm font-medium text-on-surface">{item.phone}</Text>
              </View>
            )}
            {item.email && (
              <View className="flex-row items-center gap-2">
                <MaterialIcons name="email" size={14} color={t.muted} />
                <Text className="text-xs text-on-surface-variant" numberOfLines={1}>{item.email}</Text>
              </View>
            )}
          </View>
        )}

        {item.preferences && (
          <View className="mb-4">
            <Text className="text-[10px] uppercase font-bold tracking-wider text-primary opacity-70 mb-1">Preferencias</Text>
            <Text className="text-sm text-on-surface-variant" numberOfLines={2}>{item.preferences}</Text>
          </View>
        )}

        <View className="flex-row gap-2 pt-3 border-t border-outline-variant">
          <TouchableOpacity 
            className="flex-1 bg-surface-container py-2.5 rounded-xl items-center flex-row justify-center gap-2"
            onPress={() => handleCall(item.phone)}
            disabled={!item.phone}
          >
            <MaterialIcons name="call" size={16} color={item.phone ? t.onSurfaceVariant : t.muted} />
            <Text className={`font-bold text-sm ${item.phone ? 'text-on-surface' : 'text-on-surface-variant opacity-50'}`}>Llamar</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            className="flex-1 bg-green-50 dark:bg-green-900/20 py-2.5 rounded-xl items-center flex-row justify-center gap-2 border border-green-200/50"
            onPress={() => handleWhatsApp(item.phone)}
            disabled={!item.phone}
          >
            <MaterialIcons name="chat" size={16} color={item.phone ? "#16a34a" : t.muted} />
            <Text className={`font-bold text-sm ${item.phone ? 'text-green-700' : 'text-on-surface-variant opacity-50'}`}>WhatsApp</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View className="mb-6">
      <View className="mb-6 flex-row justify-between items-center">
        <View className="flex-1">
          <Text className="text-4xl font-serif font-bold text-on-surface">Clientes 👥</Text>
          <Text className="text-on-surface-variant mt-1 text-sm">Administra a tus clientes.</Text>
        </View>
        <TouchableOpacity 
          className="bg-primary w-12 h-12 rounded-full items-center justify-center elevation-5"
          style={{ shadowColor: t.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
          onPress={openCreate}
        >
          <MaterialIcons name="person-add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View className="bg-surface-container-highest border border-outline-variant rounded-xl flex-row items-center px-4 py-3 shadow-sm mb-2">
        <MaterialIcons name="search" size={20} color={t.muted} />
        <TextInput
          className="flex-1 ml-3 text-sm text-on-surface font-sans"
          placeholder="Buscar por nombre o teléfono..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <Text className="text-xs font-bold text-on-surface-variant px-1 mb-2">Mostrando {customers.length} clientes</Text>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {loading && customers.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={t.primary} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          contentContainerClassName="p-6 pb-24"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialIcons name="group" size={64} color={t.surfaceContainerHighest} />
              <Text className="text-on-surface mt-4 font-bold text-lg">No hay clientes</Text>
              <Text className="text-on-surface-variant mt-1 text-center text-sm px-10">Agrega clientes para comenzar a llevar un registro.</Text>
            </View>
          }
        />
      )}

      {/* Form Modal (Create / Edit) */}
      <Modal visible={showModal === 'create' || showModal === 'edit'} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-surface">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
            <View className="px-6 py-4 border-b border-outline-variant flex-row justify-between items-center">
              <Text className="text-2xl font-serif font-bold text-on-surface">{showModal === 'create' ? 'Nuevo Cliente' : 'Editar Cliente'}</Text>
              <TouchableOpacity onPress={() => setShowModal(showModal === 'edit' ? 'detail' : null)}>
                <MaterialIcons name="close" size={28} color={t.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
              
              <View className="mb-4">
                <Text className="text-xs font-bold text-on-surface-variant mb-1 ml-1 uppercase tracking-widest">Nombre Completo *</Text>
                <TextInput 
                  className="bg-surface-container-highest border border-outline-variant rounded-xl px-4 py-3 text-on-surface"
                  placeholder="Ej. María López" placeholderTextColor={t.muted} value={formData.full_name} onChangeText={t => setFormData({...formData, full_name: t})}
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-bold text-on-surface-variant mb-1 ml-1 uppercase tracking-widest">Teléfono / WhatsApp</Text>
                <TextInput 
                  className="bg-surface-container-highest border border-outline-variant rounded-xl px-4 py-3 text-on-surface"
                  placeholder="Ej. 5512345678" placeholderTextColor={t.muted} keyboardType="phone-pad" value={formData.phone} onChangeText={t => setFormData({...formData, phone: t})}
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-bold text-on-surface-variant mb-1 ml-1 uppercase tracking-widest">Correo Electrónico</Text>
                <TextInput 
                  className="bg-surface-container-highest border border-outline-variant rounded-xl px-4 py-3 text-on-surface"
                  placeholder="ejemplo@correo.com" placeholderTextColor={t.muted} keyboardType="email-address" value={formData.email} onChangeText={t => setFormData({...formData, email: t})}
                />
              </View>

              <View className="mb-8">
                <Text className="text-xs font-bold text-on-surface-variant mb-1 ml-1 uppercase tracking-widest">Preferencias / Notas</Text>
                <TextInput 
                  className="bg-surface-container-highest border border-outline-variant rounded-xl px-4 py-3 text-on-surface h-24"
                  placeholder="Le gustan las fragancias florales, paga quincenalmente..." placeholderTextColor={t.muted} multiline textAlignVertical="top" value={formData.preferences} onChangeText={t => setFormData({...formData, preferences: t})}
                />
              </View>

              <TouchableOpacity 
                className="bg-primary py-4 rounded-full flex-row items-center justify-center gap-2 elevation-5"
                style={{ shadowColor: t.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}
                disabled={submitting} onPress={handleSave}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <MaterialIcons name="save" size={24} color="#fff" />
                    <Text className="font-bold text-lg text-white">Guardar Cliente</Text>
                  </>
                )}
              </TouchableOpacity>
              <View className="h-20" />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={showModal === 'detail'} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-surface">
          {selectedCustomer && (
            <>
              <View className="px-6 py-4 flex-row justify-between items-center" style={{ backgroundColor: t.primaryContainer + '33' }}>
                <TouchableOpacity onPress={() => setShowModal(null)} className="w-10 h-10 bg-surface-container rounded-full items-center justify-center border border-outline-variant">
                  <MaterialIcons name="arrow-back" size={24} color={t.onSurfaceVariant} />
                </TouchableOpacity>
                <View className="flex-row gap-2">
                  <TouchableOpacity onPress={openEdit} className="w-10 h-10 bg-surface-container rounded-full items-center justify-center border border-outline-variant">
                    <MaterialIcons name="edit" size={20} color={t.onSurfaceVariant} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleDelete} className="w-10 h-10 rounded-full items-center justify-center border border-error" style={{ backgroundColor: t.error + '1A' }}>
                    <MaterialIcons name="delete" size={20} color={t.error} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
                
                {/* Header Perfil */}
                <View className="items-center mb-8">
                  <View className="w-24 h-24 rounded-full flex items-center justify-center mb-4 border-4 border-surface" style={{ backgroundColor: t.primaryContainer + '80' }}>
                    <Text className="font-serif font-bold text-4xl text-primary">{selectedCustomer.full_name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text className="text-2xl font-bold font-serif text-on-surface text-center mb-1">{selectedCustomer.full_name}</Text>
                  <Text className="text-on-surface-variant font-mono text-xs">Añadido: {new Date(selectedCustomer.created_at).toLocaleDateString('es-MX')}</Text>
                </View>

                {/* Métricas Financieras */}
                <Text className="text-xs font-bold text-on-surface-variant mb-2 ml-1 uppercase tracking-widest">Estadísticas de Compra</Text>
                <View className="flex-row gap-3 mb-6">
                  <View className="flex-1 bg-surface-container-lowest p-4 rounded-3xl border border-outline-variant shadow-sm items-center">
                    <MaterialIcons name="shopping-bag" size={24} color={t.onSurfaceVariant} style={{marginBottom: 4}} />
                    <Text className="text-on-surface-variant text-xs mb-1">Órdenes Totales</Text>
                    <Text className="text-2xl font-bold text-on-surface">
                      {customerStats ? customerStats.total_orders : <ActivityIndicator size="small" />}
                    </Text>
                  </View>
                  <View className="flex-1 bg-surface-container-lowest p-4 rounded-3xl border border-outline-variant shadow-sm items-center">
                    <MaterialIcons name="payments" size={24} color={t.onSurfaceVariant} style={{marginBottom: 4}} />
                    <Text className="text-on-surface-variant text-xs mb-1">Gastado ($)</Text>
                    <Text className="text-2xl font-bold text-primary">
                      {customerStats ? `$${customerStats.total_spent.toFixed(2)}` : <ActivityIndicator size="small" />}
                    </Text>
                  </View>
                </View>

                {/* Información de Contacto */}
                <Text className="text-xs font-bold text-on-surface-variant mb-2 ml-1 uppercase tracking-widest">Información de Contacto</Text>
                <View className="bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-sm p-4 mb-6">
                  <View className="flex-row items-center justify-between py-2 border-b border-outline-variant">
                    <View className="flex-row items-center gap-3">
                      <MaterialIcons name="phone" size={20} color={t.muted} />
                      <Text className="text-on-surface">{selectedCustomer.phone || 'No registrado'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleCall(selectedCustomer.phone)} disabled={!selectedCustomer.phone} className={selectedCustomer.phone ? 'opacity-100' : 'opacity-30'}>
                      <MaterialIcons name="call" size={20} color={t.onSurfaceVariant} />
                    </TouchableOpacity>
                  </View>
                  <View className="flex-row items-center justify-between py-2 pt-4">
                    <View className="flex-row items-center gap-3">
                      <MaterialIcons name="email" size={20} color={t.muted} />
                      <Text className="text-on-surface">{selectedCustomer.email || 'No registrado'}</Text>
                    </View>
                  </View>
                </View>

                {/* Preferencias */}
                <Text className="text-xs font-bold text-on-surface-variant mb-2 ml-1 uppercase tracking-widest">Preferencias</Text>
                <View className="bg-surface-container-lowest rounded-3xl border border-outline-variant shadow-sm p-4 mb-8">
                  <Text className="text-on-surface-variant">
                    {selectedCustomer.preferences || 'Sin preferencias registradas.'}
                  </Text>
                </View>

              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}
