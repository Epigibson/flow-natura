import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { MaterialIcons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

export default function LoginScreen() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

  useEffect(() => {
    checkBiometrics();
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
        }
      }
    } catch (e) {
      console.warn('Biometrics error', e);
    }
  }

  async function handleBiometricLogin() {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Ingresar a Flow Natura',
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
            {/* Logo / Brand Icon Premium */}
            <View className="w-24 h-24 rounded-[32px] bg-primary items-center justify-center mb-6 shadow-xl shadow-primary/30 border-4 border-primary/20">
              <Text className="text-white text-5xl font-serif font-bold tracking-tighter">F</Text>
            </View>
            <Text className="text-4xl font-serif font-bold text-on-surface tracking-tight mb-2">Flow Natura</Text>
            <Text className="text-on-surface-variant/80 text-center font-medium px-4">
              La plataforma exclusiva para líderes y consultoras Natura.
            </Text>
          </View>

          <View className="px-8 space-y-4">
            
            {hasSavedCredentials && (
              <View className="mb-6">
                <TouchableOpacity 
                  onPress={handleBiometricLogin} 
                  disabled={loading}
                  className="bg-primary-container/20 border border-primary/30 py-5 rounded-3xl flex-row justify-center items-center gap-3 shadow-sm"
                >
                  <MaterialIcons name="fingerprint" size={28} color="#964900" />
                  <Text className="text-primary font-bold text-lg">Ingresar con Biometría</Text>
                </TouchableOpacity>
                <View className="flex-row items-center my-6">
                  <View className="flex-1 h-[1px] bg-outline-variant/30" />
                  <Text className="mx-4 text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">o usar correo</Text>
                  <View className="flex-1 h-[1px] bg-outline-variant/30" />
                </View>
              </View>
            )}

            <View className="bg-surface-container-highest rounded-3xl overflow-hidden border border-outline-variant/20">
              <View className="px-5 py-2 border-b border-outline-variant/20">
                <Text className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mt-2 mb-1">Correo Electrónico</Text>
                <TextInput
                  className="w-full text-on-surface text-base pb-3 font-medium"
                  placeholder="ejemplo@correo.com"
                  placeholderTextColor="#888"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                />
              </View>
              <View className="px-5 py-2">
                <Text className="text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mt-2 mb-1">Contraseña</Text>
                <TextInput
                  className="w-full text-on-surface text-base pb-3 font-medium"
                  placeholder="••••••••"
                  placeholderTextColor="#888"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />
              </View>
            </View>

            <TouchableOpacity className="self-end mt-4 mb-2">
              <Text className="text-primary font-bold text-sm">¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className={`w-full bg-on-surface py-5 rounded-3xl items-center mt-2 shadow-xl shadow-black/20 ${loading ? 'opacity-80' : ''}`}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={isDark ? '#000' : '#fff'} />
              ) : (
                <Text className="text-surface font-bold text-lg tracking-wide">Iniciar Sesión</Text>
              )}
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
