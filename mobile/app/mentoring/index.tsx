import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Alert } from 'react-native';
import SecondaryLayout from '../../components/SecondaryLayout';
import { ErrorState } from '../../components/ErrorState';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { useThemeColors } from '../../hooks/use-theme-colors';

export default function MentoringScreen() {
  const t = useThemeColors();
  const [modules, setModules] = useState<any[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<any>(null);
  const [completingLesson, setCompletingLesson] = useState(false);

  useEffect(() => {
    loadMentoring();
  }, []);

  async function loadMentoring() {
    setLoading(true);
    setLoadError(null);
    try {
      const [modData, progressData] = await Promise.all([
        api.mentorship.getModules(),
        api.mentorship.getProgress(),
      ]);
      setModules(modData || []);
      // getModules() does not return lesson.completed; progress rows carry lesson_id (web mentoria.astro)
      setCompletedIds(new Set((progressData || []).map((p: any) => p.lesson_id)));
    } catch (err) {
      console.error(err);
      setLoadError('No se pudieron cargar los módulos.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteLesson(lessonId: string) {
    setCompletingLesson(true);
    try {
      await api.mentorship.completeLesson(lessonId);
      Alert.alert('¡Felicidades! 🎉', 'Has completado esta lección.');
      setSelectedLesson(null);
      loadMentoring(); // Refresh to update progress
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo marcar como completada');
    } finally {
      setCompletingLesson(false);
    }
  }

  const getColors = (colorName: string) => {
    switch (colorName) {
      case 'primary': return { bg: 'bg-primary/10', text: 'text-primary' };
      case 'secondary': return { bg: 'bg-secondary/10', text: 'text-secondary' };
      case 'tertiary': return { bg: 'bg-tertiary/10', text: 'text-tertiary' };
      case 'error': return { bg: 'bg-error/10', text: 'text-error' };
      default: return { bg: 'bg-surface-container', text: 'text-on-surface' };
    }
  };

  // Real progress + tramo labels (web mentoria.astro)
  const totalLessons = modules.reduce((acc, m) => acc + ((m.lessons || []).length), 0);
  const completedCount = completedIds.size;
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;
  const progressLabel =
    pct === 0 ? '¡Lee tu primera guía de negocio! ✨'
    : pct < 30 ? '¡Gran inicio! Cada tip cuenta 💪'
    : pct < 60 ? '¡Vas volando! Estás perfeccionando tu negocio 🔥'
    : pct < 100 ? '¡Casi experta! Ya falta poco para leerlas todas 🚀'
    : '🎉 ¡100% completado! ¡Eres toda una crack en ventas!';

  return (
    <SecondaryLayout title="Mentoría 🎓" scrollable={false}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 96 }} showsVerticalScrollIndicator={false}>
        
        {/* Progress Banner */}
        <View className="bg-primary p-6 rounded-3xl mb-8 shadow-lg shadow-primary/30 relative overflow-hidden">
          <MaterialIcons name="school" size={100} color="rgba(255,255,255,0.1)" style={{position: 'absolute', right: -10, top: -10}} />
          <Text className="text-white/80 font-bold uppercase tracking-widest text-xs mb-2">Tu Progreso</Text>
          <Text className="text-white font-serif font-bold text-2xl mb-1">{pct}% completado</Text>
          <Text className="text-white/90 text-sm mb-4">{progressLabel}</Text>
          
          <View className="h-2 bg-white/20 rounded-full overflow-hidden mb-2">
            <View className="h-full bg-white rounded-full" style={{ width: `${pct}%` }} />
          </View>
          <Text className="text-white/80 text-xs text-right font-bold">{completedCount} de {totalLessons} lecciones</Text>
        </View>

        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color="#476810" />
          </View>
        ) : loadError ? (
          <ErrorState message={loadError} onRetry={() => loadMentoring()} />
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
                    <TouchableOpacity 
                      key={lesson.id} 
                      className="bg-surface-container-lowest p-4 rounded-2xl flex-row items-center border border-outline-variant/10 shadow-sm mb-3"
                      onPress={() => setSelectedLesson(lesson)}
                    >
                      <View className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center mr-4">
                        <Text className="font-bold text-on-surface-variant text-xs">{lIdx + 1}</Text>
                      </View>
                      <View className="flex-1 pr-2">
                        <Text className="font-bold text-on-surface text-sm">{lesson.title}</Text>
                        <Text className="text-xs text-on-surface-variant mt-0.5">{lesson.duration_minutes} min</Text>
                      </View>
                      {completedIds.has(lesson.id) ? (
                        <MaterialIcons name="check-circle" size={24} color={t.secondary} />
                      ) : (
                        <MaterialIcons name="play-circle-outline" size={24} color="#888" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })
        )}

      </ScrollView>

      {/* Lesson Detail Modal */}
      <Modal visible={!!selectedLesson} animationType="slide" presentationStyle="pageSheet">
        <View className="flex-1 bg-surface">
          {selectedLesson && (
            <>
              <View className="px-6 py-4 flex-row justify-between items-center border-b border-outline-variant/10">
                <TouchableOpacity onPress={() => setSelectedLesson(null)}>
                  <MaterialIcons name="close" size={28} color={t.onSurfaceVariant} />
                </TouchableOpacity>
                <View className="bg-surface-container px-3 py-1 rounded-full">
                  <Text className="text-xs font-bold text-on-surface-variant">{selectedLesson.duration_minutes} min</Text>
                </View>
              </View>
              <ScrollView className="flex-1 p-6">
                <Text className="text-2xl font-serif font-bold text-on-surface mb-4">{selectedLesson.title}</Text>
                <Text className="text-on-surface-variant text-base leading-7 mb-8">
                  {selectedLesson.content || selectedLesson.description || 'Contenido de la lección próximamente. Mantente atenta a las actualizaciones.'}
                </Text>

                {!completedIds.has(selectedLesson.id) && (
                  <TouchableOpacity 
                    className="bg-primary py-4 rounded-full flex-row items-center justify-center gap-2 shadow-lg"
                    style={{ shadowColor: t.primary }}
                    onPress={() => handleCompleteLesson(selectedLesson.id)}
                    disabled={completingLesson}
                  >
                    {completingLesson ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <MaterialIcons name="check" size={20} color="#fff" />
                        <Text className="text-white font-bold text-base">Marcar como Completada</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {completedIds.has(selectedLesson.id) && (
                  <View className="bg-secondary/10 p-4 rounded-2xl flex-row items-center gap-3">
                    <MaterialIcons name="check-circle" size={24} color={t.secondary} />
                    <Text className="text-secondary font-bold">¡Ya completaste esta lección!</Text>
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </Modal>
    </SecondaryLayout>
  );
}

