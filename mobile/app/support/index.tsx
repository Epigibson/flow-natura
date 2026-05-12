import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';

export default function SupportScreen() {
  const faqs = [
    { q: '¿Cómo registro un cliente que paga en abonos?', a: 'Ve a la pantalla de Ventas, selecciona "Nueva Venta" y elige "Abonos" como método de pago. Podrás definir el número de pagos y el enganche.' },
    { q: '¿Cómo importar productos de Natura?', a: 'Desde la versión web, ve a Inventario y utiliza la opción "Importar". Se sincronizará automáticamente con tu aplicación móvil.' },
    { q: '¿Qué hago si no me aparece un producto?', a: 'Asegúrate de tener conexión a internet estable. Si el problema persiste, intenta reiniciar la aplicación.' },
  ];

  return (
    <SecondaryLayout title="Soporte 🎧">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        {/* Contacto Directo */}
        <View className="bg-primary p-6 rounded-3xl mb-8 items-center shadow-lg shadow-primary/20 relative overflow-hidden">
          <MaterialIcons name="support-agent" size={100} color="rgba(255,255,255,0.1)" style={{position: 'absolute', right: -10, top: 10}} />
          <Text className="text-white font-serif font-bold text-2xl mb-2 text-center">¿Necesitas ayuda?</Text>
          <Text className="text-white/80 text-center text-sm mb-6 px-4">
            Nuestro equipo de soporte está disponible de lunes a viernes de 9:00 AM a 6:00 PM.
          </Text>
          <TouchableOpacity 
            className="bg-white px-6 py-3 rounded-full flex-row items-center gap-2 shadow-sm w-full justify-center"
            onPress={() => Linking.openURL('whatsapp://send?phone=+525512345678')}
          >
            <MaterialIcons name="chat" size={20} color="#3e4d2b" />
            <Text className="text-primary font-bold">Chat en Vivo</Text>
          </TouchableOpacity>
        </View>

        <Text className="font-serif font-bold text-xl text-on-surface mb-4">Preguntas Frecuentes</Text>

        {faqs.map((faq, idx) => (
          <View key={idx} className="bg-surface-container-lowest p-5 rounded-3xl mb-4 shadow-sm border border-outline-variant/10">
            <View className="flex-row items-start gap-3 mb-2">
              <MaterialIcons name="help-outline" size={20} color="#888" style={{marginTop: 2}} />
              <Text className="flex-1 font-bold text-on-surface leading-tight">{faq.q}</Text>
            </View>
            <Text className="text-on-surface-variant text-sm leading-relaxed pl-8">{faq.a}</Text>
          </View>
        ))}

        {/* Recursos Adicionales */}
        <Text className="font-serif font-bold text-xl text-on-surface mb-4 mt-4">Recursos Adicionales</Text>
        
        <View className="flex-row justify-between mb-4">
          <TouchableOpacity className="bg-surface-container-lowest p-4 rounded-3xl w-[48%] items-center shadow-sm border border-outline-variant/10">
            <View className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mb-2">
              <MaterialIcons name="menu-book" size={24} color="#564336" />
            </View>
            <Text className="font-bold text-on-surface text-center text-sm">Manual de Usuario</Text>
          </TouchableOpacity>
          
          <TouchableOpacity className="bg-surface-container-lowest p-4 rounded-3xl w-[48%] items-center shadow-sm border border-outline-variant/10">
            <View className="w-12 h-12 rounded-full bg-tertiary/10 flex items-center justify-center mb-2">
              <MaterialIcons name="play-circle-outline" size={24} color="#3e6068" />
            </View>
            <Text className="font-bold text-on-surface text-center text-sm">Video Tutoriales</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SecondaryLayout>
  );
}
