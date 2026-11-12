import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, TextInput, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/use-theme-colors';

const TICKETS_KEY = 'natura_tickets';

interface Ticket {
  subject: string;
  category: string;
  desc: string;
  priority: 'low' | 'medium' | 'high';
  date: string;
  status: 'open' | string;
}

const CATEGORIES = [
  { value: 'technical', label: '🔧 Problema técnico' },
  { value: 'billing', label: '💳 Facturación' },
  { value: 'orders', label: '📦 Pedidos' },
  { value: 'account', label: '👤 Mi cuenta' },
  { value: 'feature', label: '💡 Sugerencia' },
  { value: 'other', label: '📝 Otro' },
];

const PRIORITIES: { value: 'low' | 'medium' | 'high'; label: string; border: string; bg: string; text: string }[] = [
  { value: 'low', label: 'Baja', border: '#86efac', bg: '#f0fdf4', text: '#15803d' },
  { value: 'medium', label: 'Media', border: '#fcd34d', bg: '#fefce8', text: '#a16207' },
  { value: 'high', label: 'Alta', border: '#fca5a5', bg: '#fef2f2', text: '#b91c1c' },
];

const PRIORITY_LIST_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: '#dcfce7', text: '#15803d' },
  medium: { bg: '#fef3c7', text: '#b45309' },
  high: { bg: '#fee2e2', text: '#b91c1c' },
};

const FAQS = [
  {
    q: '¿Cómo agrego productos a mi inventario?',
    a: 'Ve a Inventario y Catálogo → Alta de Stock. Ahí puedes registrar nuevos productos con su precio, categoría y cantidad inicial. También puedes importar productos directamente desde el catálogo Natura.',
    icon: 'inventory-2',
  },
  {
    q: '¿Cómo funciona el pago en abonos?',
    a: 'Al crear una venta, selecciona "Abonos" como método de pago. Ingresa el enganche, número de pagos y frecuencia. Podrás cobrar cada abono desde el detalle de venta y darle seguimiento a la cobranza.',
    icon: 'calendar-month',
  },
  {
    q: '¿Cómo envío un ticket digital por WhatsApp?',
    a: 'Ve al detalle de cualquier venta y toca el botón de WhatsApp. Se generará un mensaje con el resumen de la compra listo para enviar a tu cliente.',
    icon: 'chat',
  },
  {
    q: '¿Puedo editar la información de un cliente?',
    a: 'Sí, ve a Mis Clientes, toca el perfil del cliente y presiona "Editar" para actualizar su nombre, teléfono y correo.',
    icon: 'person',
  },
  {
    q: '¿Cómo importo mi catálogo Natura/Avon?',
    a: 'Ve a Inventario → Importar Catálogo. Obtén tu token de autenticación de Natura y sube el archivo JSON generado. Los productos se sincronizarán automáticamente con tu inventario.',
    icon: 'sync',
  },
  {
    q: '¿Para qué sirven los Ajustes de Inventario?',
    a: 'Los ajustes te permiten registrar entradas (compras, devoluciones), salidas (demos, muestras, pérdidas) y correcciones (cuando el stock real no coincide con el sistema). Puedes hacerlos individualmente o en masa.',
    icon: 'tune',
  },
];

export default function SupportScreen() {
  const t = useThemeColors();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('technical');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('low');
  const [desc, setDesc] = useState('');
  const [subjectError, setSubjectError] = useState(false);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    loadTickets();
  }, []);

  async function loadTickets() {
    try {
      const raw = await AsyncStorage.getItem(TICKETS_KEY);
      setTickets(raw ? JSON.parse(raw) : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTickets(false);
    }
  }

  const openWhatsApp = () => {
    Linking.openURL('https://wa.me/5215512345678?text=Hola%20Natura%20Flow%2C%20necesito%20ayuda').catch(() => {
      Alert.alert('Error', 'No se pudo abrir WhatsApp. ¿Lo tienes instalado?');
    });
  };

  const submitTicket = async () => {
    if (!subject.trim()) {
      setSubjectError(true);
      setTimeout(() => setSubjectError(false), 2000);
      return;
    }
    setSubmitting(true);
    try {
      const categoryLabel = CATEGORIES.find(c => c.value === category)?.label || category;
      const ticket: Ticket = {
        subject: subject.trim(),
        category: categoryLabel,
        desc,
        priority,
        date: new Date().toISOString(),
        status: 'open',
      };
      const next = [ticket, ...tickets];
      await AsyncStorage.setItem(TICKETS_KEY, JSON.stringify(next));
      setTickets(next);
      setSubject('');
      setDesc('');
      setCategory('technical');
      setPriority('low');
      setShowForm(false);
      Alert.alert('¡Enviado!', 'Tu ticket de soporte fue creado correctamente.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo guardar el ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const openCount = tickets.filter(t => t.status === 'open').length;
  const closedCount = tickets.filter(t => t.status !== 'open').length;

  return (
    <SecondaryLayout title="Soporte 🛟" scrollable={false}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
      >
        {/* WhatsApp Directo */}
        <TouchableOpacity
          onPress={openWhatsApp}
          activeOpacity={0.85}
          className="bg-primary p-6 rounded-3xl mb-6 items-center shadow-lg shadow-primary/20 relative overflow-hidden"
        >
          <MaterialIcons name="support-agent" size={100} color="rgba(255,255,255,0.1)" style={{ position: 'absolute', right: -10, top: 10 }} />
          <Text className="text-white font-serif font-bold text-2xl mb-2 text-center">WhatsApp Directo</Text>
          <Text className="text-white/80 text-center text-sm mb-4 px-4">
            Chatea con soporte en tiempo real. Disponible de lunes a viernes de 9:00 AM a 6:00 PM.
          </Text>
          <View className="bg-white px-6 py-3 rounded-full flex-row items-center gap-2 shadow-sm">
            <MaterialIcons name="chat" size={20} color="#3e4d2b" />
            <Text className="text-primary font-bold">Abrir Chat</Text>
          </View>
        </TouchableOpacity>

        {/* Nuevo Ticket */}
        <TouchableOpacity
          onPress={() => setShowForm(v => !v)}
          activeOpacity={0.85}
          className={`py-4 rounded-2xl flex-row items-center justify-center gap-2 mb-4 shadow-md ${showForm ? 'bg-error/10 border border-error/20' : 'bg-primary'}`}
        >
          <MaterialIcons name={showForm ? 'close' : 'add'} size={20} color={showForm ? t.error : '#fff'} />
          <Text className={`font-bold ${showForm ? 'text-error' : 'text-white'}`}>{showForm ? 'Cancelar' : 'Nuevo Ticket'}</Text>
        </TouchableOpacity>

        {showForm && (
          <View className="bg-surface-container-lowest rounded-3xl p-5 mb-6 shadow-sm border border-outline-variant/10">
            <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Asunto</Text>
            <View className={`bg-surface-container-highest rounded-xl px-4 py-3 mb-4 ${subjectError ? 'border-2 border-error' : ''}`}>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder="Describe brevemente tu problema..."
                className="text-on-surface font-sans text-sm"
              />
            </View>

            <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Categoría</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {CATEGORIES.map(cat => {
                const active = category === cat.value;
                return (
                  <TouchableOpacity
                    key={cat.value}
                    onPress={() => setCategory(cat.value)}
                    className={`px-3 py-2 rounded-xl border ${active ? 'border-primary bg-primary/10' : 'border-outline-variant/20'}`}
                  >
                    <Text className={`text-xs font-bold ${active ? 'text-primary' : 'text-on-surface-variant'}`}>{cat.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Prioridad</Text>
            <View className="flex-row gap-2 mb-4">
              {PRIORITIES.map(p => {
                const active = priority === p.value;
                return (
                  <TouchableOpacity
                    key={p.value}
                    onPress={() => setPriority(p.value)}
                    className="flex-1 py-2.5 px-4 rounded-xl items-center border-2"
                    style={{
                      borderColor: active ? p.border : t.outlineVariant + '33',
                      backgroundColor: active ? p.bg : 'transparent',
                    }}
                  >
                    <Text className="text-sm font-bold" style={{ color: active ? p.text : t.onSurfaceVariant }}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Descripción</Text>
            <View className="bg-surface-container-highest rounded-xl px-4 py-3 mb-5">
              <TextInput
                value={desc}
                onChangeText={setDesc}
                placeholder="Explica tu situación con detalle..."
                className="text-on-surface font-sans text-sm"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={{ minHeight: 96 }}
              />
            </View>

            <TouchableOpacity
              onPress={submitTicket}
              disabled={submitting}
              className={`py-3 rounded-full flex-row items-center justify-center gap-2 ${submitting ? 'bg-primary/50' : 'bg-primary'}`}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="send" size={18} color="#fff" />
                  <Text className="text-white font-bold">Enviar Ticket</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Mis Tickets */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="font-serif font-bold text-xl text-on-surface">Mis Tickets</Text>
          {tickets.length > 0 && (
            <View className="flex-row items-center gap-2">
              <Text className="text-[10px] font-bold px-3 py-1 rounded-full bg-primary/10 text-primary">{openCount} abiertos</Text>
              <Text className="text-[10px] font-bold px-3 py-1 rounded-full bg-secondary/10 text-secondary">{closedCount} cerrados</Text>
            </View>
          )}
        </View>

        {loadingTickets ? (
          <ActivityIndicator color={t.primary} className="my-6" />
        ) : tickets.length === 0 ? (
          <View className="bg-surface-container-lowest rounded-3xl p-8 items-center shadow-sm border border-outline-variant/10 mb-8">
            <View className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
              <MaterialIcons name="check-circle" size={36} color="#16a34a" />
            </View>
            <Text className="text-on-surface font-bold text-lg">¡Todo en orden!</Text>
            <Text className="text-on-surface-variant mt-1 text-sm text-center">No tienes tickets de soporte abiertos.</Text>
            <Text className="text-on-surface-variant/60 text-xs mt-3 text-center">Si necesitas ayuda, crea un ticket o chatea por WhatsApp.</Text>
          </View>
        ) : (
          <View className="bg-surface-container-lowest rounded-3xl p-2 shadow-sm border border-outline-variant/10 mb-8">
            {tickets.map((ticket, idx) => {
              const isOpen = ticket.status === 'open';
              const pri = PRIORITY_LIST_COLORS[ticket.priority || 'low'] || PRIORITY_LIST_COLORS.low;
              const priLabel = (ticket.priority || 'low') === 'low' ? 'Baja' : ticket.priority === 'medium' ? 'Media' : 'Alta';
              return (
                <View
                  key={`${ticket.date}-${idx}`}
                  className={`flex-row items-center gap-3 py-4 px-3 rounded-xl ${idx > 0 ? 'border-t border-surface-container' : ''}`}
                >
                  <View
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: isOpen ? t.primary + '1A' : t.secondary + '1A' }}
                  >
                    <MaterialIcons name="confirmation-number" size={20} color={isOpen ? t.primary : t.secondary} />
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="font-bold text-on-surface text-sm" numberOfLines={1}>{ticket.subject}</Text>
                    <Text className="text-xs text-on-surface-variant" numberOfLines={1}>
                      {ticket.category} • {new Date(ticket.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <Text className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: pri.bg, color: pri.text }}>{priLabel}</Text>
                  <Text
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: isOpen ? t.primary + '1A' : t.secondary + '1A', color: isOpen ? t.primary : t.secondary }}
                  >
                    {isOpen ? '● Abierto' : '✓ Cerrado'}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* FAQ */}
        <View className="bg-surface-container-lowest rounded-3xl p-5 mb-8 shadow-sm border border-outline-variant/10">
          <View className="flex-row items-center gap-2 mb-4">
            <MaterialIcons name="quiz" size={20} color={t.primary} />
            <Text className="font-serif font-bold text-xl text-on-surface">Preguntas Frecuentes</Text>
          </View>

          {FAQS.map((faq, idx) => {
            const open = openFaq === idx;
            return (
              <View
                key={idx}
                className="rounded-2xl overflow-hidden mb-3 border"
                style={{ borderColor: open ? t.primary + '26' : t.outlineVariant + '1A', backgroundColor: open ? t.primary + '05' : 'transparent' }}
              >
                <TouchableOpacity
                  onPress={() => setOpenFaq(open ? null : idx)}
                  activeOpacity={0.7}
                  className="flex-row justify-between items-center p-4"
                >
                  <View className="flex-row items-center gap-3 flex-1">
                    <View className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: t.primary + '1A' }}>
                      <MaterialIcons name={faq.icon as any} size={16} color={t.primary} />
                    </View>
                    <Text className="font-bold text-on-surface text-sm flex-1">{faq.q}</Text>
                  </View>
                  <MaterialIcons name="expand-more" size={22} color={t.onSurfaceVariant} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
                </TouchableOpacity>
                {open && (
                  <View className="px-4 pb-4">
                    <View className="rounded-xl p-4 ml-11" style={{ backgroundColor: t.surfaceContainerLow + '80' }}>
                      <Text className="text-on-surface-variant text-sm leading-relaxed">{faq.a}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SecondaryLayout>
  );
}
