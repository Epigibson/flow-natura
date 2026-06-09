import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { useThemeColors } from '../hooks/use-theme-colors';

export default function LoginScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const t = useThemeColors();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

  useEffect(() => {
    checkBiometrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkBiometrics() {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (compatible && enrolled) {
        setBiometricSupported(true);
        const savedEmail = await SecureStore.getItemAsync('fn_user_email');
        const savedPwd = await SecureStore.getItemAsync('fn_user_password');
        if (savedEmail && savedPwd) {
          setHasSavedCredentials(true);
          // Auto-trigger biometric login
          setTimeout(() => {
            handleBiometricLogin();
          }, 500);
        }
      }
    } catch (e) {
      console.warn('Biometrics error', e);
    }
  }

  async function handleBiometricLogin() {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Ingresar a Natura Manager',
      cancelLabel: 'Cancelar',
      disableDeviceFallback: true,
    });

    if (result.success) {
      const savedEmail = await SecureStore.getItemAsync('fn_user_email');
      const savedPwd = await SecureStore.getItemAsync('fn_user_password');
      if (savedEmail && savedPwd) {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ 
          email: savedEmail, 
          password: savedPwd 
        });
        
        if (error) {
          Alert.alert('Error', error.message);
          setLoading(false);
        } else {
          router.replace('/(tabs)');
        }
      }
    }
  }

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Atención', 'Por favor ingresa correo y contraseña.');
      return;
    }
    
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
    } else {
      if (biometricSupported && !hasSavedCredentials) {
        Alert.alert(
          'Autenticación Rápida',
          '¿Deseas activar Face ID / Huella Digital para ingresar más rápido en el futuro?',
          [
            { text: 'Quizás después', style: 'cancel', onPress: () => router.replace('/(tabs)') },
            { 
              text: 'Sí, activar', 
              style: 'default',
              onPress: async () => {
                await SecureStore.setItemAsync('fn_user_email', email.trim());
                await SecureStore.setItemAsync('fn_user_password', password);
                router.replace('/(tabs)');
              }
            }
          ]
        );
      } else {
        router.replace('/(tabs)');
      }
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
          
          <View className="px-8 items-center mb-12">
            {/* Logo Premium */}
            <View className="w-28 h-28 rounded-[36px] bg-surface-container-lowest items-center justify-center mb-6 shadow-2xl border border-outline-variant opacity-90 overflow-hidden" style={{ shadowColor: t.primary, elevation: 10 }}>
              <Image 
                source={require('../assets/images/icon.png')} 
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <Text className="text-4xl font-serif font-bold text-on-surface tracking-tight mb-2">Natura Manager</Text>
            <Text className="text-on-surface-variant opacity-80 text-center font-medium px-4">
              La plataforma exclusiva para líderes y consultoras.
            </Text>
          </View>

          <View className="px-8 space-y-5">
            
            {hasSavedCredentials && (
              <View className="mb-4">
                <TouchableOpacity 
                  onPress={handleBiometricLogin} 
                  disabled={loading}
                  className="border py-4 rounded-3xl flex-row justify-center items-center gap-3"
                  style={{ backgroundColor: isDark ? '#331B0A' : '#FFF0E5', borderColor: t.primaryContainer }}
                >
                  <MaterialIcons name="fingerprint" size={28} color={t.primary} />
                  <Text className="text-primary font-bold text-lg">Ingresar con Biometría</Text>
                </TouchableOpacity>
                <View className="flex-row items-center my-6">
                  <View className="flex-1 h-[1px] bg-outline-variant opacity-40" />
                  <Text className="mx-4 text-xs font-bold text-on-surface-variant opacity-60 uppercase tracking-widest">o usa tu correo</Text>
                  <View className="flex-1 h-[1px] bg-outline-variant opacity-40" />
                </View>
              </View>
            )}

            {/* Premium Input Fields */}
            <View className="space-y-4">
              <View>
                <Text className="text-[11px] font-bold text-on-surface-variant opacity-90 uppercase tracking-widest mb-2 ml-1">Correo Electrónico</Text>
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

              <View>
                <Text className="text-[11px] font-bold text-on-surface-variant opacity-90 uppercase tracking-widest mb-2 ml-1 mt-2">Contraseña</Text>
                <View className="flex-row items-center bg-surface-container-highest rounded-2xl border border-outline-variant px-4 py-1 h-14">
                  <MaterialIcons name="lock" size={20} color={t.onSurfaceVariant} style={{ opacity: 0.6 }} />
                  <TextInput
                    className="flex-1 text-on-surface text-base font-medium ml-3 h-full"
                    placeholder="••••••••"
                    placeholderTextColor={t.muted}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity className="self-end mt-2 mb-4" onPress={() => router.push('/forgot-password')}>
              <Text className="text-primary font-bold text-sm">¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className={`w-full bg-primary py-4 rounded-full items-center mt-2 ${loading ? 'opacity-80' : ''}`}
              style={{ shadowColor: t.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-bold text-lg tracking-wide">Iniciar Sesión</Text>
              )}
            </TouchableOpacity>

            {/* Register Link */}
            <TouchableOpacity
              className="w-full py-3 items-center mt-2"
              onPress={() => router.push('/register')}
            >
              <Text className="text-primary font-bold text-sm">
                ¿No tienes cuenta? <Text className="underline">Regístrate</Text>
              </Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
