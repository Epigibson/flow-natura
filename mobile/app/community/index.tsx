import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SecondaryLayout from '../../components/SecondaryLayout';
import { ErrorState } from '../../components/ErrorState';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';
import { errorMessage } from '../../../src/lib/orders';
import { useThemeColors } from '../../hooks/use-theme-colors';
import { haptic } from '../../lib/haptics';

// Same topics and reactions as /comunidad on the web
const TOPICS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'logro', label: '🏆 Logros' },
  { value: 'tip', label: '💡 Tips' },
  { value: 'pregunta', label: '❓ Preguntas' },
  { value: 'motivacion', label: '💪 Motivación' },
];
const TOPIC_LABELS: Record<string, string> = {
  logro: '🏆 Logro', tip: '💡 Tip', pregunta: '❓ Pregunta', motivacion: '💪 Motivación', general: '💬 General',
};
const REACTIONS: { type: string; on: string; off: string }[] = [
  { type: 'love', on: '❤️', off: '🤍' },
  { type: 'fire', on: '🔥', off: '🔥' },
  { type: 'clap', on: '👏', off: '👏' },
  { type: 'save', on: '🔖', off: '🔖' },
];

export default function CommunityScreen() {
  const t = useThemeColors();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState('all');
  const [userId, setUserId] = useState<string | null>(null);

  // New post
  const [showModal, setShowModal] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostTopic, setNewPostTopic] = useState('general');
  const [submitting, setSubmitting] = useState(false);

  // Comments
  const [commentPost, setCommentPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  useEffect(() => { api.getCurrentUserId().then(setUserId); }, []);

  const loadPosts = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      setPosts(await api.community.getPosts(topic));
    } catch (err: any) {
      console.error(err);
      setError(errorMessage(err, 'Error de conexión'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [topic]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return Alert.alert('Error', 'Escribe algo para publicar.');
    setSubmitting(true);
    try {
      await api.community.createPost({ content: newPostContent, topic: newPostTopic });
      haptic.success();
      setNewPostContent('');
      setNewPostTopic('general');
      setShowModal(false);
      loadPosts(true);
    } catch (e) {
      haptic.error();
      Alert.alert('No se pudo publicar', errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleReaction = async (post: any, type: string) => {
    const had = (post.user_reactions || []).includes(type);
    const patch = (p: any) => {
      const counts = { ...(p.reactions || {}) };
      counts[type] = Math.max(0, (counts[type] || 0) + (had ? -1 : 1));
      const mine = had ? (p.user_reactions || []).filter((r: string) => r !== type) : [...(p.user_reactions || []), type];
      return { ...p, reactions: counts, user_reactions: mine, likes: counts.love || 0 };
    };
    haptic.light();
    setPosts(prev => prev.map(p => (p.id === post.id ? patch(p) : p)));
    try {
      await api.community.toggleReaction(post.id, type);
    } catch (e) {
      // Revert
      setPosts(prev => prev.map(p => (p.id === post.id ? post : p)));
      Alert.alert('No se pudo reaccionar', errorMessage(e));
    }
  };

  const handleDeletePost = (post: any) => {
    Alert.alert('Eliminar publicación', '¿Eliminar este post? No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await api.community.deletePost(post.id);
            haptic.warning();
            setPosts(prev => prev.filter(p => p.id !== post.id));
          } catch (e) {
            Alert.alert('No se pudo eliminar', errorMessage(e));
          }
        },
      },
    ]);
  };

  const openComments = async (post: any) => {
    setCommentPost(post);
    setComments([]);
    setNewComment('');
    setCommentsLoading(true);
    try {
      setComments((await api.community.getComments(post.id)) || []);
    } catch (e) {
      Alert.alert('No se pudieron cargar los comentarios', errorMessage(e));
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !commentPost || sendingComment) return;
    setSendingComment(true);
    try {
      await api.community.createComment(commentPost.id, newComment);
      setNewComment('');
      setComments((await api.community.getComments(commentPost.id)) || []);
      setPosts(prev => prev.map(p => (p.id === commentPost.id ? { ...p, comments: (p.comments || 0) + 1, comment_count: (p.comment_count || 0) + 1 } : p)));
      haptic.success();
    } catch (e) {
      haptic.error();
      Alert.alert('No se pudo comentar', errorMessage(e));
    } finally {
      setSendingComment(false);
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <SecondaryLayout title="Comunidad 💬" scrollable={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPosts(true); }} colors={[t.primary]} tintColor={t.primary} />}
      >
        {/* Compose */}
        <TouchableOpacity
          className="bg-surface-container-lowest p-4 rounded-3xl mb-4 shadow-sm flex-row items-center gap-4 border border-outline-variant/10"
          onPress={() => setShowModal(true)}
        >
          <View className="w-10 h-10 rounded-full bg-primary-container items-center justify-center">
            <MaterialIcons name="person" size={20} color={t.onPrimaryContainer} />
          </View>
          <Text className="flex-1 text-on-surface-variant text-sm">¿Qué quieres compartir hoy?</Text>
          <View className="w-10 h-10 rounded-full bg-primary items-center justify-center shadow-md">
            <MaterialIcons name="add" size={20} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Topic filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          {TOPICS.map(tp => (
            <TouchableOpacity
              key={tp.value}
              onPress={() => setTopic(tp.value)}
              className="px-4 py-2 rounded-full mr-2"
              style={{ backgroundColor: topic === tp.value ? t.primary : t.surfaceContainerHighest }}
            >
              <Text style={{ color: topic === tp.value ? '#fff' : t.onSurfaceVariant, fontWeight: '700', fontSize: 12 }}>{tp.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Feed */}
        {loading ? (
          <View className="py-10 items-center justify-center"><ActivityIndicator size="large" color={t.primary} /></View>
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadPosts()} />
        ) : posts.length === 0 ? (
          <View className="items-center justify-center py-10">
            <MaterialIcons name="forum" size={48} color={t.surfaceContainerHighest} />
            <Text className="text-on-surface mt-4 font-bold">Aún no hay publicaciones</Text>
            <Text className="text-on-surface-variant text-sm text-center px-4 mt-2">Comparte un tip, celebra un logro o haz una pregunta.</Text>
          </View>
        ) : (
          posts.map((post) => {
            const mine = post.author_id === userId;
            return (
              <View key={post.id} className="bg-surface-container-lowest p-5 rounded-3xl mb-4 shadow-sm border border-outline-variant/10">
                <View className="flex-row items-center mb-3">
                  <View className="w-10 h-10 rounded-full bg-secondary-container items-center justify-center mr-3">
                    <Text className="font-bold text-secondary text-base">{(post.author_name || 'C').charAt(0).toUpperCase()}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-on-surface">{post.author_name || 'Consultora'}</Text>
                    <Text className="text-xs text-on-surface-variant">{formatDate(post.created_at)}</Text>
                  </View>
                  {post.topic && post.topic !== 'general' && (
                    <View className="bg-primary/10 px-2 py-0.5 rounded-full mr-2">
                      <Text className="text-[10px] font-bold text-primary">{TOPIC_LABELS[post.topic] || post.topic}</Text>
                    </View>
                  )}
                  {mine && (
                    <TouchableOpacity onPress={() => handleDeletePost(post)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Eliminar publicación">
                      <MaterialIcons name="delete-outline" size={20} color={t.error} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text className="text-on-surface mb-4 leading-relaxed">{post.content}</Text>

                <View className="flex-row items-center pt-3 border-t border-outline-variant/10 flex-wrap gap-x-4 gap-y-2">
                  {REACTIONS.map(r => {
                    const active = (post.user_reactions || []).includes(r.type);
                    return (
                      <TouchableOpacity key={r.type} className="flex-row items-center gap-1" onPress={() => handleToggleReaction(post, r.type)}>
                        <Text style={{ fontSize: 16, opacity: active || r.type !== 'love' ? 1 : 0.7 }}>{active ? r.on : r.off}</Text>
                        <Text className="text-xs font-bold" style={{ color: active ? t.primary : t.onSurfaceVariant }}>{post.reactions?.[r.type] || 0}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity className="flex-row items-center gap-1 ml-auto" onPress={() => openComments(post)}>
                    <MaterialIcons name="chat-bubble-outline" size={18} color={t.onSurfaceVariant} />
                    <Text className="text-xs font-bold text-on-surface-variant">{post.comments || 0}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        <View className="h-10" />
      </ScrollView>

      {/* New post */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <SafeAreaView className="flex-1 bg-surface">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
            <View className="px-6 py-4 flex-row justify-between items-center border-b border-outline-variant/10">
              <Text className="text-xl font-serif font-bold text-on-surface">Crear publicación</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={28} color={t.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <View className="p-6 flex-1">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 flex-grow-0">
                {TOPICS.filter(tp => tp.value !== 'all').concat([{ value: 'general', label: '💬 General' }]).map(tp => (
                  <TouchableOpacity
                    key={tp.value}
                    onPress={() => setNewPostTopic(tp.value)}
                    className="px-3 py-1.5 rounded-full mr-2 border"
                    style={{ backgroundColor: newPostTopic === tp.value ? t.primary + '1A' : 'transparent', borderColor: newPostTopic === tp.value ? t.primary : t.outlineVariant }}
                  >
                    <Text style={{ color: newPostTopic === tp.value ? t.primary : t.onSurfaceVariant, fontWeight: '700', fontSize: 12 }}>{tp.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput
                className="text-on-surface text-lg flex-1"
                style={{ color: t.onSurface }}
                placeholder="¿Qué quieres compartir con la red?"
                placeholderTextColor={t.onSurfaceVariant + '99'}
                multiline
                maxLength={2000}
                textAlignVertical="top"
                autoFocus
                value={newPostContent}
                onChangeText={setNewPostContent}
              />
            </View>
            <View className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest">
              <TouchableOpacity
                className={`py-4 rounded-full flex-row items-center justify-center ${!newPostContent.trim() ? 'bg-surface-container' : 'bg-primary'}`}
                disabled={!newPostContent.trim() || submitting}
                onPress={handleCreatePost}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <Text className={`font-bold text-lg ${!newPostContent.trim() ? 'text-on-surface-variant' : 'text-white'}`}>Publicar</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Comments */}
      <Modal visible={!!commentPost} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCommentPost(null)}>
        <SafeAreaView className="flex-1 bg-surface">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
            <View className="px-6 py-4 flex-row justify-between items-center border-b border-outline-variant/10">
              <Text className="text-xl font-serif font-bold text-on-surface">Comentarios</Text>
              <TouchableOpacity onPress={() => setCommentPost(null)}>
                <MaterialIcons name="close" size={28} color={t.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-6 pt-4">
              {commentsLoading ? (
                <ActivityIndicator color={t.primary} className="py-10" />
              ) : comments.length === 0 ? (
                <Text className="text-on-surface-variant text-center py-10">Sé la primera en comentar.</Text>
              ) : comments.map(c => (
                <View key={c.id} className="mb-4">
                  <Text className="font-bold text-on-surface text-sm">{c.author_name || 'Consultora'} <Text className="text-xs font-normal text-on-surface-variant">· {formatDate(c.created_at)}</Text></Text>
                  <Text className="text-on-surface mt-1">{c.content}</Text>
                </View>
              ))}
            </ScrollView>
            <View className="p-4 border-t border-outline-variant/10 flex-row items-center gap-3 bg-surface-container-lowest">
              <TextInput
                className="flex-1 bg-surface-container rounded-full px-4 py-3"
                style={{ color: t.onSurface }}
                placeholder="Escribe un comentario..."
                placeholderTextColor={t.onSurfaceVariant + '99'}
                maxLength={1000}
                value={newComment}
                onChangeText={setNewComment}
                onSubmitEditing={handleSendComment}
                returnKeyType="send"
              />
              <TouchableOpacity
                className="w-11 h-11 rounded-full items-center justify-center"
                style={{ backgroundColor: newComment.trim() ? t.primary : t.surfaceContainerHighest }}
                disabled={!newComment.trim() || sendingComment}
                onPress={handleSendComment}
                accessibilityLabel="Enviar comentario"
              >
                {sendingComment ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="send" size={20} color={newComment.trim() ? '#fff' : t.onSurfaceVariant} />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SecondaryLayout>
  );
}
