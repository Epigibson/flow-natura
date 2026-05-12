import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SecondaryLayout from '../../components/SecondaryLayout';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../../../src/lib/api';

export default function CommunityScreen() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New Post Modal
  const [showModal, setShowModal] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    setLoading(true);
    try {
      const data = await api.community.getPosts();
      setPosts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return Alert.alert('Error', 'Escribe algo para publicar.');
    setSubmitting(true);
    try {
      await api.community.createPost(newPostContent);
      setNewPostContent('');
      setShowModal(false);
      loadPosts(); // Reload to show new post
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo publicar: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleReaction = async (postId: string) => {
    try {
      // Optimistic update
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1 } : p));
      await api.community.toggleReaction(postId);
      // Let's reload to get accurate truth, or just keep optimistic
    } catch (e) {
      // Revert optimistic update silently
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: Math.max(0, p.likes - 1) } : p));
    }
  };

  return (
    <SecondaryLayout title="Comunidad 💬">
      <ScrollView className="p-6 pb-24" showsVerticalScrollIndicator={false}>
        {/* Header Action */}
        <TouchableOpacity 
          className="bg-surface-container-lowest p-4 rounded-3xl mb-6 shadow-sm flex-row items-center gap-4 border border-outline-variant/10"
          onPress={() => setShowModal(true)}
        >
          <View className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
            <MaterialIcons name="person" size={20} color="#3e4d2b" />
          </View>
          <Text className="flex-1 text-on-surface-variant text-sm">¿Qué quieres compartir hoy?</Text>
          <View className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md">
            <MaterialIcons name="add" size={20} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Feed */}
        {loading ? (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color="#476810" />
          </View>
        ) : posts.length === 0 ? (
          <View className="items-center justify-center py-10">
            <MaterialIcons name="forum" size={48} color="#e7e0eb" />
            <Text className="text-on-surface mt-4 font-bold">Aún no hay publicaciones</Text>
            <Text className="text-on-surface-variant text-sm text-center px-4 mt-2">Sé el primero en iniciar una conversación con la red de consultores.</Text>
          </View>
        ) : (
          posts.map((post) => {
            const authorInitial = post.author_name ? post.author_name.charAt(0).toUpperCase() : 'C';
            const timeString = new Date(post.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            return (
              <View key={post.id} className="bg-surface-container-lowest p-5 rounded-3xl mb-4 shadow-sm border border-outline-variant/10">
                <View className="flex-row items-center mb-3">
                  <View className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center mr-3">
                    <Text className="font-bold text-secondary text-base">{authorInitial}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-on-surface">{post.author_name || 'Consultor'}</Text>
                    <Text className="text-xs text-on-surface-variant">{timeString}</Text>
                  </View>
                  {post.topic && (
                    <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] font-bold text-primary uppercase">{post.topic}</Text>
                    </View>
                  )}
                </View>
                
                <Text className="text-on-surface mb-4 leading-relaxed">{post.content}</Text>
                
                <View className="flex-row items-center pt-3 border-t border-outline-variant/10 gap-6">
                  <TouchableOpacity className="flex-row items-center gap-1.5" onPress={() => handleToggleReaction(post.id)}>
                    <MaterialIcons name="favorite-border" size={18} color="#888" />
                    <Text className="text-xs font-bold text-on-surface-variant">{post.likes}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-row items-center gap-1.5" onPress={() => Alert.alert('Info', 'Los comentarios estarán disponibles pronto.')}>
                    <MaterialIcons name="chat-bubble-outline" size={18} color="#888" />
                    <Text className="text-xs font-bold text-on-surface-variant">{post.comments}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* New Post Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-surface">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
            <View className="px-6 py-4 flex-row justify-between items-center border-b border-outline-variant/10">
              <Text className="text-xl font-serif font-bold text-on-surface">Crear Publicación</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={28} color="#564336" />
              </TouchableOpacity>
            </View>
            <View className="p-6 flex-1">
              <TextInput
                className="text-on-surface text-lg flex-1"
                placeholder="¿Qué quieres compartir con la red?"
                multiline
                textAlignVertical="top"
                autoFocus
                value={newPostContent}
                onChangeText={setNewPostContent}
              />
            </View>
            <View className="p-6 border-t border-outline-variant/10 bg-surface-container-lowest">
              <TouchableOpacity 
                className={`py-4 rounded-full flex-row items-center justify-center gap-2 ${!newPostContent.trim() ? 'bg-surface-container' : 'bg-primary shadow-lg shadow-primary/30'}`}
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

    </SecondaryLayout>
  );
}
