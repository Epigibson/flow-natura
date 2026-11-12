import React, { useState, useEffect } from 'react';
import { SITE_URL } from '../../lib/config';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import SecondaryLayout from '../../components/SecondaryLayout';
import { ErrorState } from '../../components/ErrorState';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { supabase } from '../../lib/supabase';
import { useThemeColors } from '../../hooks/use-theme-colors';
import {
  getPlanDisplayName,
  getPlanPrice,
  getTrialDaysLeft,
  isTrialActive,
  isSubscriptionActive,
  type Subscription,
} from '../../../src/lib/subscription';

const PLAN_ICONS: Record<string, string> = { trial: '⏳', basico: '🥈', pro: '💎', premium: '👑' };
const PLAN_DESCS: Record<string, string> = {
  trial: 'Acceso completo por tiempo limitado',
  basico: 'Inventario y ventas básicas',
  pro: 'Gestión completa de cobranza, abonos y recordatorios',
  premium: 'Reportes avanzados, IA y soporte prioritario',
};

const PLAN_CARDS: { id: string; icon: string; name: string; tagline: string; popular?: boolean; features: { ok: boolean; text: string }[] }[] = [
  {
    id: 'basico',
    icon: '🥈',
    name: 'Básico',
    tagline: 'Ideal para consultoras que inician',
    features: [
      { ok: true, text: 'Inventario y catálogo básico' },
      { ok: true, text: 'Registro de ventas (contado)' },
      { ok: true, text: 'Hasta 50 productos' },
      { ok: true, text: 'Hasta 20 clientes' },
      { ok: true, text: 'Dashboard básico' },
      { ok: false, text: 'Sin gestión de abonos' },
      { ok: false, text: 'Sin reportes avanzados' },
    ],
  },
  {
    id: 'pro',
    icon: '💎',
    name: 'Pro',
    tagline: 'Para consultoras con cartera activa',
    popular: true,
    features: [
      { ok: true, text: 'Todo lo del Básico +' },
      { ok: true, text: 'Gestión de cobranza y abonos' },
      { ok: true, text: 'Productos ilimitados' },
      { ok: true, text: 'Clientes ilimitados' },
      { ok: true, text: 'Recordatorios de cobro automáticos' },
      { ok: true, text: 'Importación catálogo Natura/Avon' },
      { ok: true, text: 'Catálogo digital compartible' },
      { ok: false, text: 'Sin reportes de ganancias' },
    ],
  },
  {
    id: 'premium',
    icon: '👑',
    name: 'Premium',
    tagline: 'Para consultoras de alto volumen',
    features: [
      { ok: true, text: 'Todo lo del Pro +' },
      { ok: true, text: 'Reportes de ganancias detallados' },
      { ok: true, text: 'Predicción de recompra con IA' },
      { ok: true, text: 'Soporte prioritario por WhatsApp' },
      { ok: true, text: 'Mentoría 1 a 1 mensual' },
      { ok: true, text: 'Exportación de datos (Excel/PDF)' },
      { ok: true, text: 'Acceso anticipado a nuevas funciones' },
    ],
  },
];

export default function MembershipScreen() {
  const t = useThemeColors();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAnnual, setIsAnnual] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const subData = await api.consultant.getSubscription();
      setSubscription(subData as Subscription | null);
    } catch (err) {
      console.error(err);
      setLoadError('No se pudo cargar tu membresía.');
    } finally {
      setLoading(false);
    }
  }

  // Checkout/portal viven en la web: el móvil abre la página de membresía.
  const openMembershipWeb = async () => {
    const url = `${SITE_URL}/membresia`;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir la página de membresía.'));
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas salir de tu cuenta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (error) Alert.alert('Error', 'No se pudo cerrar sesión');
          },
        },
      ]
    );
  };

  const fmtPrice = (v: number) => '$' + (v % 1 === 0 ? String(v) : v.toFixed(2));

  const currentPlan = subscription?.plan || 'trial';
  const planStatus = subscription?.status || 'trialing';
  const activePaid = isSubscriptionActive(subscription) && currentPlan !== 'trial';
  const showTrialBanner = planStatus === 'trialing' && isTrialActive(subscription);

  const statusBadge = (() => {
    if (planStatus === 'active') return { label: 'ACTIVO', bg: '#dcfce7', text: '#15803d' };
    if (planStatus === 'trialing') return { label: 'PRUEBA', bg: '#fef3c7', text: '#b45309' };
    if (planStatus === 'past_due') return { label: 'PAGO PENDIENTE', bg: '#fee2e2', text: '#b91c1c' };
    if (planStatus === 'canceled') return { label: 'CANCELADO', bg: '#f3f4f6', text: '#4b5563' };
    return { label: planStatus.toUpperCase(), bg: '#f3f4f6', text: '#4b5563' };
  })();

  const formatDate = (dateString?: string | null, opts?: Intl.DateTimeFormatOptions) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('es-MX', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <SecondaryLayout title="Mi Membresía 💎" scrollable={false}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>

        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color={t.primary} />
          </View>
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => loadData()} />
        ) : (
          <>
            {/* Past Due Alert */}
            {planStatus === 'past_due' && (
              <View className="rounded-3xl p-5 mb-6 flex-row items-center gap-4 border-2" style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca' }}>
                <View className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#fee2e2' }}>
                  <MaterialIcons name="warning" size={22} color="#dc2626" />
                </View>
                <View className="flex-1">
                  <Text className="font-bold" style={{ color: '#991b1b' }}>Pago pendiente</Text>
                  <Text className="text-sm" style={{ color: '#b91c1c' }}>Tu último pago no se procesó. Actualiza tu método de pago para mantener tu plan activo.</Text>
                </View>
                <TouchableOpacity onPress={openMembershipWeb} className="py-2 px-4 rounded-xl shrink-0" style={{ backgroundColor: '#dc2626' }}>
                  <Text className="text-white font-bold text-xs">Corregir Pago</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Plan Actual */}
            <View className="rounded-3xl p-6 mb-6 shadow-sm border" style={{ backgroundColor: t.primaryContainer + '26', borderColor: t.primary + '1A' }}>
              <View className="flex-row items-center gap-4">
                <View className="w-16 h-16 rounded-2xl items-center justify-center" style={{ backgroundColor: t.surfaceContainerLowest }}>
                  <Text style={{ fontSize: 32 }}>{PLAN_ICONS[currentPlan] || '⏳'}</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 flex-wrap">
                    <Text className="text-2xl font-serif font-bold text-on-surface">Plan {getPlanDisplayName(currentPlan)}</Text>
                    <Text className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}>
                      {statusBadge.label}
                    </Text>
                  </View>
                  <Text className="text-on-surface-variant text-sm mt-1">{PLAN_DESCS[currentPlan] || ''}</Text>
                </View>
              </View>

              <View className="flex-row gap-6 mt-4">
                {activePaid ? (
                  <>
                    <View>
                      <Text className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">Precio</Text>
                      <Text className="text-xl font-bold text-primary">
                        {fmtPrice(getPlanPrice(currentPlan, subscription?.billing_period || 'monthly'))}
                        <Text className="text-xs font-normal text-on-surface-variant">
                          {subscription?.billing_period === 'annual' ? '/mes (anual)' : '/mes'}
                        </Text>
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">Próximo Cobro</Text>
                      <Text className="text-base font-bold text-on-surface">{formatDate(subscription?.current_period_end)}</Text>
                    </View>
                  </>
                ) : planStatus === 'trialing' ? (
                  <>
                    <View>
                      <Text className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">Días Restantes</Text>
                      <Text className="text-xl font-bold" style={{ color: '#d97706' }}>{getTrialDaysLeft(subscription)}</Text>
                    </View>
                    <View>
                      <Text className="text-[10px] font-bold tracking-widest text-on-surface-variant uppercase">Expira</Text>
                      <Text className="text-base font-bold text-on-surface">{formatDate(subscription?.trial_ends_at, { day: 'numeric', month: 'short' })}</Text>
                    </View>
                  </>
                ) : (
                  <Text className="text-sm text-on-surface-variant">Elige un plan para comenzar a usar Natura Manager</Text>
                )}
              </View>

              {!!subscription?.cancel_at_period_end && (
                <Text className="text-xs font-bold mt-3" style={{ color: '#dc2626' }}>⚠️ Se cancela al final del periodo</Text>
              )}

              <TouchableOpacity
                onPress={openMembershipWeb}
                className="mt-4 py-2.5 px-5 rounded-xl self-start flex-row items-center gap-2 border-2"
                style={{ borderColor: t.primary + '33' }}
              >
                <MaterialIcons name="settings" size={16} color={t.primary} />
                <Text className="text-primary font-bold text-sm">Gestionar Plan</Text>
              </TouchableOpacity>
            </View>

            {/* Trial Banner */}
            {showTrialBanner && (
              <View className="rounded-3xl p-5 mb-6 border flex-row items-center gap-4" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a80' }}>
                <View className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#fef3c7' }}>
                  <MaterialIcons name="hourglass-top" size={22} color="#b45309" />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-on-surface">Periodo de Prueba Gratuita</Text>
                  <Text className="text-sm text-on-surface-variant">
                    Te quedan <Text className="font-bold">{getTrialDaysLeft(subscription)}</Text> días de prueba. Elige un plan para no perder tu información.
                  </Text>
                </View>
                <TouchableOpacity onPress={openMembershipWeb} className="py-2.5 px-4 rounded-xl" style={{ backgroundColor: t.primary }}>
                  <Text className="text-white font-bold text-xs">Elegir Plan</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Planes */}
            <View className="flex-row items-center justify-between mb-4">
              <Text className="font-serif font-bold text-xl text-on-surface">Planes Disponibles</Text>
              <View className="flex-row rounded-xl p-1" style={{ backgroundColor: t.surfaceContainerHighest }}>
                <TouchableOpacity
                  onPress={() => setIsAnnual(false)}
                  className={`px-4 py-2 rounded-lg ${!isAnnual ? 'bg-primary' : ''}`}
                >
                  <Text className={`text-xs font-bold ${!isAnnual ? 'text-white' : 'text-on-surface-variant'}`}>Mensual</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsAnnual(true)}
                  className={`px-4 py-2 rounded-lg ${isAnnual ? 'bg-primary' : ''}`}
                >
                  <Text className={`text-xs font-bold ${isAnnual ? 'text-white' : 'text-on-surface-variant'}`}>
                    Anual <Text className="text-[10px] text-secondary">-17%</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {PLAN_CARDS.map(card => {
              const isCurrent = activePaid && currentPlan === card.id;
              const price = getPlanPrice(card.id, isAnnual ? 'annual' : 'monthly');
              return (
                <View
                  key={card.id}
                  className="rounded-3xl p-6 mb-5 shadow-sm border-2 relative"
                  style={{ borderColor: isCurrent ? t.primary + '4D' : card.popular ? t.primary + '4D' : t.outlineVariant + '1A' }}
                >
                  {isCurrent && (
                    <View className="absolute top-3 right-3 px-2.5 py-1 rounded-full" style={{ backgroundColor: t.primary + '1A' }}>
                      <Text className="text-[10px] font-bold" style={{ color: t.primary }}>✓ TU PLAN</Text>
                    </View>
                  )}
                  {card.popular && !isCurrent && (
                    <View className="absolute -top-3 self-center px-4 py-1.5 rounded-full" style={{ backgroundColor: t.primary }}>
                      <Text className="text-[10px] font-bold text-white">⭐ MÁS POPULAR</Text>
                    </View>
                  )}

                  <View className="items-center mb-4">
                    <Text style={{ fontSize: 36 }}>{card.icon}</Text>
                    <Text className="font-serif font-bold text-xl text-on-surface mt-2">{card.name}</Text>
                    <Text className="text-xs text-on-surface-variant mt-1 text-center">{card.tagline}</Text>
                    <View className="flex-row items-end mt-3">
                      <Text className="text-4xl font-serif font-bold" style={{ color: card.id === 'pro' ? t.primary : card.id === 'premium' ? t.secondary : t.onSurface }}>
                        {fmtPrice(price)}
                      </Text>
                      <Text className="text-sm text-on-surface-variant mb-1">{isAnnual ? '/mes (factura anual)' : '/mes'}</Text>
                    </View>
                  </View>

                  <View className="mb-5">
                    {card.features.map((f, i) => (
                      <View key={i} className="flex-row items-start gap-2 mb-2.5">
                        <MaterialIcons
                          name={f.ok ? 'check-circle' : 'remove'}
                          size={18}
                          color={f.ok ? t.secondary : t.muted}
                          style={{ marginTop: 1 }}
                        />
                        <Text className={`text-sm flex-1 ${f.ok ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>{f.text}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    onPress={openMembershipWeb}
                    disabled={isCurrent}
                    className={`py-3 rounded-xl items-center ${isCurrent ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: isCurrent ? t.surfaceContainerHighest : card.id === 'pro' ? t.primary : 'transparent', borderWidth: card.id === 'pro' ? 0 : 2, borderColor: card.id === 'premium' ? t.secondary + '33' : t.primary + '33' }}
                  >
                    <Text
                      className="font-bold text-sm"
                      style={{ color: isCurrent ? t.onSurfaceVariant : card.id === 'pro' ? '#fff' : card.id === 'premium' ? t.secondary : t.primary }}
                    >
                      {isCurrent ? 'Plan Actual' : `Elegir ${card.name}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {isAnnual && (
              <View className="rounded-2xl p-4 mb-8 border items-center" style={{ backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <Text className="text-sm text-center" style={{ color: '#166534' }}>
                  💰 Ahorra hasta <Text className="font-bold">$504 MXN al año</Text> con el plan anual — "Paga 10 meses y llévate 12"
                </Text>
              </View>
            )}

            {/* Cerrar Sesión */}
            <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden">
              <TouchableOpacity className="flex-row items-center justify-between p-4" onPress={handleLogout}>
                <View className="flex-row items-center gap-3">
                  <View className="w-8 h-8 rounded-full bg-error/10 flex items-center justify-center">
                    <MaterialIcons name="logout" size={18} color={t.error} />
                  </View>
                  <Text className="font-bold text-error">Cerrar Sesión de Natura</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={t.muted} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SecondaryLayout>
  );
}
