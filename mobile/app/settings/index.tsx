import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Switch, TouchableOpacity, TextInput, ActivityIndicator, Alert, Share, Linking } from 'react-native';
import { useColorScheme } from 'nativewind';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { supabase } from '../../../src/lib/supabase';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function SettingsScreen() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const t = useThemeColors();
  const darkMode = colorScheme === 'dark';
  const setDarkMode = (val: boolean) => setColorScheme(val ? 'dark' : 'light');
  
  const [notifications, setNotifications] = useState(true);
  const [offlineMode, setOfflineMode] = useState(true);

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [fullName, setFullName] = useState('');
  const [naturaCode, setNaturaCode] = useState('');
  const [email, setEmail] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  // Password states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isAuthUpdating, setIsAuthUpdating] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setCurrentUserId(session.user.id);
      }
      
      const data = await api.consultant.getProfile();
      setProfile(data);
      setFullName(data?.full_name || '');
      setNaturaCode(data?.natura_code || '');
      setEmail(data?.natura_email || '');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await api.consultant.updateProfile({
        full_name: fullName,
        natura_code: naturaCode,
        natura_email: email
      });
      Alert.alert('Éxito', 'Perfil actualizado correctamente');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
    if (newPassword !== confirmPassword) return Alert.alert('Error', 'Las contraseñas no coinciden');
    
    setIsAuthUpdating(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsAuthUpdating(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Éxito', 'Contraseña actualizada correctamente');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const catalogUrl = `https://flownatura.com/catalogo?c=${currentUserId}`;

  const shareCatalog = async () => {
    try {
      await Share.share({
        message: `¡Hola! 🌿 Te comparto mi catálogo Natura:\n${catalogUrl}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const sendTemplate = (templateId: string) => {
    const name = "[Nombre]";
    const catalog = catalogUrl;
    let text = "";

    switch (templateId) {
      case 'cobro': text = `Hola ${name} 👋 Te recuerdo que tu pago vence pronto. ¿Puedo ayudarte con algo? 💚`; break;
      case 'gracias': text = `¡Hola ${name}! 🌿 Gracias por tu compra. Espero que disfrutes tus productos Natura. ¡Cualquier duda estoy para ti! 💚`; break;
      case 'promo': text = `¡Hola ${name}! 🎉 Tengo una promo especial para ti este ciclo. ¿Te mando mi catálogo actualizado? 👉 ${catalog}`; break;
      case 'recompra': text = `¡Hola ${name}! 💚 Ya pasó un tiempo desde tu última compra. ¿Te gustaría reabastecer algún producto? Te dejo mi catálogo: ${catalog}`; break;
      case 'entrega': text = `¡Hola ${name}! 📦 Tu pedido está listo para entregarse. ¿Cuándo te queda bien pasar por él o que te lo lleve? 🚗`; break;
      case 'cumple': text = `¡Feliz cumpleaños ${name}! 🎂🎉 Como regalo especial, tienes un descuento en tu próxima compra. ¡Disfruta tu día! 💚`; break;
    }

    const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'No se pudo abrir WhatsApp. ¿Lo tienes instalado?');
    });
  };

  return (
    <SecondaryLayout title="Ajustes ⚙️">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        
        {/* Perfil */}
        <View className="mb-6">
          <Text className="text-[10px] uppercase font-bold tracking-widest text-primary/70 mb-2 px-2">Tu Perfil</Text>
          <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden p-5">
            {loading ? (
              <ActivityIndicator color={t.primary} />
            ) : (
              <>
                <View className="mb-4">
                  <Text className="text-xs text-on-surface-variant font-bold mb-1">Nombre Completo</Text>
                  <View className="bg-surface-container-highest rounded-xl px-4 py-3">
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Tu nombre"
                      className="text-on-surface font-sans"
                    />
                  </View>
                </View>
                
                <View className="mb-4">
                  <Text className="text-xs text-on-surface-variant font-bold mb-1">Código Natura</Text>
                  <View className="bg-surface-container-highest rounded-xl px-4 py-3">
                    <TextInput
                      value={naturaCode}
                      onChangeText={setNaturaCode}
                      placeholder="Ej. 1234567"
                      className="text-on-surface font-sans"
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View className="mb-5">
                  <Text className="text-xs text-on-surface-variant font-bold mb-1">Correo (Contacto)</Text>
                  <View className="bg-surface-container-highest rounded-xl px-4 py-3">
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="tu@correo.com"
                      className="text-on-surface font-sans"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <TouchableOpacity 
                  className={`py-3 rounded-full flex-row items-center justify-center gap-2 ${saving ? 'bg-primary/50' : 'bg-primary'}`}
                  onPress={saveProfile}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <MaterialIcons name="save" size={18} color="#fff" />
                      <Text className="font-bold text-white">Guardar Cambios</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Seguridad */}
        <View className="mb-6">
          <Text className="text-[10px] uppercase font-bold tracking-widest text-primary/70 mb-2 px-2">Seguridad</Text>
          <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden p-5">
            <Text className="text-xs text-on-surface-variant font-bold mb-1">Cambiar Contraseña</Text>
            
            <View className="bg-surface-container-highest rounded-xl px-4 py-3 mb-3">
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Nueva Contraseña (Mín. 6)"
                className="text-on-surface font-sans"
                secureTextEntry
              />
            </View>
            <View className="bg-surface-container-highest rounded-xl px-4 py-3 mb-4">
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirmar Contraseña"
                className="text-on-surface font-sans"
                secureTextEntry
              />
            </View>

            <TouchableOpacity 
              onPress={handleChangePassword} disabled={isAuthUpdating}
              className={`py-3 rounded-full flex-row items-center justify-center border border-primary/20 ${isAuthUpdating ? 'bg-outline' : 'bg-transparent'}`}
            >
              {isAuthUpdating ? <ActivityIndicator size="small" color={t.primary} /> : <Text className="text-primary font-bold">Actualizar Contraseña</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Catálogo y Compartir */}
        <View className="mb-6">
          <Text className="text-[10px] uppercase font-bold tracking-widest text-primary/70 mb-2 px-2">Herramientas</Text>
          <View className="bg-primary/5 rounded-3xl shadow-sm border border-primary/10 p-5">
            <Text className="text-sm font-serif font-bold text-primary mb-1">🛍️ Tu Catálogo Digital</Text>
            <Text className="text-xs text-on-surface-variant mb-4">Comparte tu enlace personal con clientes para que armen su pedido.</Text>
            
            <TouchableOpacity onPress={shareCatalog} className="bg-primary py-3 rounded-full items-center flex-row justify-center mb-5 shadow-sm">
              <MaterialIcons name="share" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text className="text-white font-bold">Compartir Catálogo</Text>
            </TouchableOpacity>

            <Text className="text-xs font-bold text-on-surface mb-3">Plantillas Rápidas (WhatsApp)</Text>
            <View className="flex-row flex-wrap justify-between">
              {[
                { id: 'cobro', label: 'Cobro', icon: '💰' },
                { id: 'gracias', label: 'Gracias', icon: '💚' },
                { id: 'promo', label: 'Promo', icon: '🏷️' },
                { id: 'recompra', label: 'Recompra', icon: '🔄' },
                { id: 'entrega', label: 'Entrega', icon: '📦' },
                { id: 'cumple', label: 'Cumple', icon: '🎂' },
              ].map(tpl => (
                <TouchableOpacity 
                  key={tpl.id}
                  onPress={() => sendTemplate(tpl.id)}
                  className="w-[48%] bg-surface-container-lowest rounded-xl p-3 mb-3 items-center border border-primary/10 shadow-sm"
                >
                  <Text className="text-lg mb-1">{tpl.icon}</Text>
                  <Text className="text-[10px] font-bold text-on-surface text-center">{tpl.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Preferencias */}
        <View className="mb-6">
          <Text className="text-[10px] uppercase font-bold tracking-widest text-primary/70 mb-2 px-2">Preferencias Generales</Text>
          <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden">
            
            <View className="flex-row items-center justify-between p-4 border-b border-outline-variant/10">
              <View className="flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <MaterialIcons name="notifications" size={18} color={t.onSurfaceVariant} />
                </View>
                <Text className="font-bold text-on-surface">Notificaciones Push</Text>
              </View>
              <Switch value={notifications} onValueChange={setNotifications} trackColor={{ true: t.primary, false: t.muted }} thumbColor="#fff" />
            </View>

            <View className="flex-row items-center justify-between p-4 border-b border-outline-variant/10">
              <View className="flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <MaterialIcons name="dark-mode" size={18} color={t.onSurfaceVariant} />
                </View>
                <Text className="font-bold text-on-surface">Modo Oscuro</Text>
              </View>
              <Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ true: t.primary, false: t.muted }} thumbColor="#fff" />
            </View>

            <View className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <MaterialIcons name="wifi-off" size={18} color={t.onSurfaceVariant} />
                </View>
                <Text className="font-bold text-on-surface">Modo Offline Automático</Text>
              </View>
              <Switch value={offlineMode} onValueChange={setOfflineMode} trackColor={{ true: t.primary, false: t.muted }} thumbColor="#fff" />
            </View>

          </View>
        </View>

        {/* Acerca De */}
        <View className="mb-6">
          <Text className="text-[10px] uppercase font-bold tracking-widest text-primary/70 mb-2 px-2">Acerca de</Text>
          <View className="bg-surface-container-lowest rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden p-4 items-center">
            <Text className="font-serif font-bold text-on-surface text-lg">Natura Manager</Text>
            <Text className="text-on-surface-variant text-xs mt-1">Versión 1.0.0 (Build 42)</Text>
            <TouchableOpacity className="mt-4 bg-surface-container py-2 px-4 rounded-full">
              <Text className="text-on-surface text-xs font-bold">Buscar Actualizaciones</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SecondaryLayout>
  );
}
