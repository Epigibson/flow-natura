import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useThemeColors } from '../hooks/use-theme-colors';

export default function ForgotPasswordScreen() {
  const { colorScheme } = useColorScheme();
  const t = useThemeColors();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleResetPassword() {
    if (!email.trim()) {
      Alert.alert('Atención', 'Por favor ingresa tu correo electrónico.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'flownatura://reset-password',
      });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setSent(true);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error al enviar el correo.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
          <View className="px-8 items-center">
            <View className="w-24 h-24 rounded-full bg-secondary/10 items-center justify-center mb-6">
              <MaterialIcons name="mark-email-read" size={48} color={t.secondary} />
            </View>
            <Text className="text-3xl font-serif font-bold text-on-surface tracking-tight mb-3 text-center">
              ¡Correo Enviado! ✉️
            </Text>
            <Text className="text-on-surface-variant text-center text-sm mb-8 px-4 leading-6">
              Te enviamos un enlace de recuperación a{'\n'}
              <Text className="font-bold text-on-surface">{email}</Text>
              {'\n\n'}Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.
            </Text>

            <TouchableOpacity
              className="w-full bg-primary py-4 rounded-full items-center mb-4"
              style={{ shadowColor: t.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
              onPress={() => router.replace('/login')}
            >
              <Text className="text-white font-bold text-lg tracking-wide">Volver a Login</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3"
              onPress={() => { setSent(false); handleResetPassword(); }}
            >
              <Text className="text-primary font-bold text-sm">¿No llegó? Reenviar correo</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>

          {/* Back button */}
          <View className="px-4 absolute top-4 left-0 z-10">
            <TouchableOpacity
              className="w-10 h-10 rounded-full bg-surface-container-highest items-center justify-center"
              onPress={() => router.back()}
            >
              <MaterialIcons name="arrow-back" size={20} color={t.onSurface} />
            </TouchableOpacity>
          </View>

          <View className="px-8 items-center mb-8">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-6">
              <MaterialIcons name="lock-reset" size={40} color={t.primary} />
            </View>
            <Text className="text-3xl font-serif font-bold text-on-surface tracking-tight mb-2">
              Recuperar Contraseña
            </Text>
            <Text className="text-on-surface-variant opacity-80 text-center text-sm px-4">
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </Text>
          </View>

          <View className="px-8 space-y-4">
            <View>
              <Text className="text-[11px] font-bold text-on-surface-variant opacity-90 uppercase tracking-widest mb-2 ml-1">
                Correo Electrónico
              </Text>
              <View className="flex-row items-center bg-surface-container-highest rounded-2xl border border-outline-variant px-4 py-1 h-14">
                <MaterialIcons name="email" size={20} color={t.onSurfaceVariant} style={{ opacity: 0.6 }} />
                <TextInput
                  className="flex-1 text-on-surface text-base font-medium ml-3 h-full"
                  placeholder="ejemplo@correo.com"
                  placeholderTextColor={t.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                />
              </View>
            </View>

            <TouchableOpacity
              className={`w-full bg-primary py-4 rounded-full items-center mt-4 ${loading ? 'opacity-80' : ''}`}
              style={{ shadowColor: t.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-bold text-lg tracking-wide">Enviar Enlace</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="w-full py-3 items-center mt-2"
              onPress={() => router.back()}
            >
              <Text className="text-primary font-bold text-sm">
                <MaterialIcons name="arrow-back" size={14} color={t.primary} /> Volver a Login
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
