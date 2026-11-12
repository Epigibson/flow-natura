import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { SITE_URL } from '../lib/config';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useThemeColors } from '../hooks/use-theme-colors';

export default function RegisterScreen() {
  const { colorScheme } = useColorScheme();
  const t = useThemeColors();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!fullName.trim()) {
      Alert.alert('Atención', 'Por favor ingresa tu nombre completo.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Atención', 'Por favor ingresa tu correo electrónico.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Atención', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Atención', 'Las contraseñas no coinciden.');
      return;
    }
    if (!termsAccepted) {
      Alert.alert('Atención', 'Debes aceptar los Términos de Servicio y la Política de Privacidad.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${SITE_URL}/login?verified=true`,
        }
      });

      if (error) {
        const messages: Record<string, string> = {
          'User already registered': 'Este correo ya tiene una cuenta. Intenta iniciar sesión.',
          'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
        };
        Alert.alert('Error', messages[error.message] || error.message);
        return;
      }

      if (data.user && !data.session) {
        // Email confirmation required
        Alert.alert(
          'Éxito',
          '¡Cuenta creada! Revisa tu correo electrónico para confirmar tu cuenta. 📬',
          [{ text: 'Ir a Login', onPress: () => router.replace('/login') }]
        );
      } else {
        // Auto-logged in (consultant_profiles row comes from the handle_new_user trigger)
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Error al crear la cuenta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>

          <View className="px-8 items-center mb-8">
            {/* Logo */}
            <View className="w-20 h-20 rounded-[28px] bg-surface-container-lowest items-center justify-center mb-4 shadow-lg border border-outline-variant overflow-hidden" style={{ shadowColor: t.primary, elevation: 8 }}>
              <Image
                source={require('../assets/images/icon.png')}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <Text className="text-3xl font-serif font-bold text-on-surface tracking-tight mb-1">Crear Cuenta</Text>
            <Text className="text-on-surface-variant opacity-80 text-center text-sm">
              Regístrate para empezar a gestionar tu negocio Natura.
            </Text>
          </View>

          <View className="px-8 space-y-4">

            {/* Full Name */}
            <View>
              <Text className="text-[11px] font-bold text-on-surface-variant opacity-90 uppercase tracking-widest mb-2 ml-1">Nombre Completo</Text>
              <View className="flex-row items-center bg-surface-container-highest rounded-2xl border border-outline-variant px-4 py-1 h-14">
                <MaterialIcons name="person" size={20} color={t.onSurfaceVariant} style={{ opacity: 0.6 }} />
                <TextInput
                  className="flex-1 text-on-surface text-base font-medium ml-3 h-full"
                  placeholder="María López"
                  placeholderTextColor={t.muted}
                  autoCapitalize="words"
                  value={fullName}
                  onChangeText={setFullName}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Email */}
            <View>
              <Text className="text-[11px] font-bold text-on-surface-variant opacity-90 uppercase tracking-widest mb-2 ml-1 mt-2">Correo Electrónico</Text>
              <View className="flex-row items-center bg-surface-container-highest rounded-2xl border border-outline-variant px-4 py-1 h-14">
                <MaterialIcons name="email" size={20} color={t.onSurfaceVariant} style={{ opacity: 0.6 }} />
                <TextInput
                  className="flex-1 text-on-surface text-base font-medium ml-3 h-full"
                  placeholder="tu@correo.com"
                  placeholderTextColor={t.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password */}
            <View>
              <Text className="text-[11px] font-bold text-on-surface-variant opacity-90 uppercase tracking-widest mb-2 ml-1 mt-2">Contraseña</Text>
              <View className="flex-row items-center bg-surface-container-highest rounded-2xl border border-outline-variant px-4 py-1 h-14">
                <MaterialIcons name="lock" size={20} color={t.onSurfaceVariant} style={{ opacity: 0.6 }} />
                <TextInput
                  className="flex-1 text-on-surface text-base font-medium ml-3 h-full"
                  placeholder="Mínimo 6 caracteres"
                  placeholderTextColor={t.muted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Confirm Password */}
            <View>
              <Text className="text-[11px] font-bold text-on-surface-variant opacity-90 uppercase tracking-widest mb-2 ml-1 mt-2">Confirmar Contraseña</Text>
              <View className="flex-row items-center bg-surface-container-highest rounded-2xl border border-outline-variant px-4 py-1 h-14">
                <MaterialIcons name="lock-outline" size={20} color={t.onSurfaceVariant} style={{ opacity: 0.6 }} />
                <TextInput
                  className="flex-1 text-on-surface text-base font-medium ml-3 h-full"
                  placeholder="Repite tu contraseña"
                  placeholderTextColor={t.muted}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                />
              </View>
            </View>

            {/* Terms */}
            <TouchableOpacity
              className="flex-row items-start gap-2 pt-1"
              onPress={() => setTermsAccepted(!termsAccepted)}
              disabled={loading}
            >
              <MaterialIcons
                name={termsAccepted ? 'check-box' : 'check-box-outline-blank'}
                size={20}
                color={termsAccepted ? t.primary : t.onSurfaceVariant}
                style={{ marginTop: 1 }}
              />
              <Text className="flex-1 text-xs text-on-surface-variant">
                Acepto los <Text className="text-primary font-bold">Términos de Servicio</Text> y la <Text className="text-primary font-bold">Política de Privacidad</Text>
              </Text>
            </TouchableOpacity>

            {/* Register Button */}
            <TouchableOpacity
              className={`w-full bg-primary py-4 rounded-full items-center mt-4 ${loading ? 'opacity-80' : ''}`}
              style={{ shadowColor: t.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-bold text-lg tracking-wide">Crear Cuenta Gratis</Text>
              )}
            </TouchableOpacity>

            {/* Back to Login */}
            <TouchableOpacity
              className="w-full py-3 items-center mt-2"
              onPress={() => router.back()}
            >
              <Text className="text-primary font-bold text-sm">
                ¿Ya tienes cuenta? <Text className="underline">Iniciar Sesión</Text>
              </Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
