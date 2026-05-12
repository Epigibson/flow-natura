import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';

export default function MentoringScreen() {
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMentoring();
  }, []);

  async function loadMentoring() {
    setLoading(true);
    try {
      const data = await api.mentorship.getModules();
      setModules(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Helpers to pick a color safely from db "color" strings
  const getColors = (colorName: string) => {
    switch (colorName) {
      case 'primary': return { bg: 'bg-primary/10', text: 'text-primary' };
      case 'secondary': return { bg: 'bg-secondary/10', text: 'text-secondary' };
      case 'tertiary': return { bg: 'bg-tertiary/10', text: 'text-tertiary' };
      case 'error': return { bg: 'bg-error/10', text: 'text-error' };
      default: return { bg: 'bg-surface-container', text: 'text-on-surface' };
    }
  };

  return (
    <SecondaryLayout title="Mentoría 🎓">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        
        {/* Progress Banner */}
        <View className="bg-primary p-6 rounded-3xl mb-8 shadow-lg shadow-primary/30 relative overflow-hidden">
          <MaterialIcons name="school" size={100} color="rgba(255,255,255,0.1)" style={{position: 'absolute', right: -10, top: -10}} />
          <Text className="text-white/80 font-bold uppercase tracking-widest text-xs mb-2">Tu Progreso</Text>
          <Text className="text-white font-serif font-bold text-2xl mb-1">Cinturón Blanco</Text>
          <Text className="text-white/90 text-sm mb-4">Completa módulos para subir de nivel y obtener mejores beneficios.</Text>
          
          <View className="h-2 bg-white/20 rounded-full overflow-hidden mb-2">
            <View className="h-full bg-white rounded-full w-1/3" />
          </View>
          <Text className="text-white/80 text-xs text-right font-bold">30% al siguiente nivel</Text>
        </View>

        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color="#476810" />
          </View>
        ) : modules.length === 0 ? (
          <View className="items-center justify-center py-10">
            <MaterialIcons name="auto-stories" size={48} color="#e7e0eb" />
            <Text className="text-on-surface mt-4 font-bold">No hay módulos disponibles</Text>
            <Text className="text-on-surface-variant text-sm text-center mt-1">Regresa pronto para ver nuevos cursos de Natura.</Text>
          </View>
        ) : (
          modules.map((mod, idx) => {
            const colors = getColors(mod.color);
            return (
              <View key={mod.id} className="mb-8">
                <View className="flex-row items-center gap-3 mb-4">
                  <View className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center`}>
                    <MaterialIcons name={(mod.icon as any) || 'book'} size={20} className={colors.text} />
                  </View>
                  <Text className="text-xl font-serif font-bold text-on-surface flex-1">{mod.title}</Text>
                </View>
                
                <Text className="text-on-surface-variant text-sm mb-4">{mod.description}</Text>

                <View className="space-y-3">
                  {mod.lessons && mod.lessons.map((lesson: any, lIdx: number) => (
                    <TouchableOpacity key={lesson.id} className="bg-surface-container-lowest p-4 rounded-2xl flex-row items-center border border-outline-variant/10 shadow-sm mb-3">
                      <View className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center mr-4">
                        <Text className="font-bold text-on-surface-variant text-xs">{lIdx + 1}</Text>
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="font-bold text-on-surface text-sm">{lesson.title}</Text>
                        <Text className="text-xs text-on-surface-variant mt-0.5">{lesson.duration_minutes} min</Text>
                      </View>
                      <MaterialIcons name="play-circle-outline" size={24} color="#888" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })
        )}

      </ScrollView>
    </SecondaryLayout>
  );
}
