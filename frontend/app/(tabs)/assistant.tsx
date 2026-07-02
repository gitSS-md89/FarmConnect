import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/src/theme/ThemeContext';
import { api } from '@/src/lib/api';
import { ScreenHeader } from '@/src/ui/components';

type Msg = { role: 'user' | 'assistant'; content: string; image?: string };

const PROMPTS = [
  'Analyze my profit',
  'Suggest what to grow this season',
  'Detect disease from photo',
  'Recommend fertilizer',
];

export default function Assistant() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [image, setImage] = useState<string | null>(null); // base64 (no prefix)
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const pick = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true,
    });
    if (!r.canceled && r.assets?.[0]?.base64) {
      setImage(r.assets[0].base64);
      setImagePreview(r.assets[0].uri);
    }
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text && !image) return;
    setInput('');
    const userMsg: Msg = { role: 'user', content: text || '(analyze this image)', image: imagePreview || undefined };
    setMessages(prev => [...prev, userMsg]);
    const imgToSend = image;
    setImage(null); setImagePreview(null);
    setBusy(true);
    try {
      const r = await api('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ session_id: sessionId, message: text || 'Analyze this image for issues.', image_base64: imgToSend }),
      });
      setSessionId(r.session_id);
      setMessages(prev => [...prev, { role: 'assistant', content: r.reply }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader testID="assistant-header" title="AI Assistant" subtitle="Farm Hand AI • Gemini 3 Pro" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <View testID="assistant-empty" style={{ marginTop: 8 }}>
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <View style={{
                  width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary,
                  alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                }}>
                  <Ionicons name="sparkles" size={28} color={colors.onBrandTertiary} />
                </View>
                <Text style={{ color: colors.onSurface, fontSize: 20, fontWeight: '800' }}>Hi, I&apos;m Farm Hand AI</Text>
                <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 8, paddingHorizontal: 24 }}>
                  Ask me about your farm, upload a plant photo for disease detection, or get profit insights.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                {PROMPTS.map(p => (
                  <Pressable
                    key={p}
                    testID={`prompt-${p.replace(/\s+/g, '-').toLowerCase()}`}
                    onPress={() => setInput(p)}
                    style={{
                      borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceSecondary,
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: colors.onSurface, fontWeight: '500' }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {messages.map((m, i) => (
            <View key={i} testID={`msg-${i}`} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '86%', marginTop: 12,
            }}>
              {m.image && (
                <Image source={{ uri: m.image }} style={{ width: 200, height: 200, borderRadius: 12, marginBottom: 6 }} />
              )}
              <View style={{
                backgroundColor: m.role === 'user' ? colors.brandPrimary : colors.surfaceSecondary,
                borderColor: colors.border, borderWidth: m.role === 'user' ? 0 : 1,
                borderRadius: 16, padding: 12,
              }}>
                <Text style={{ color: m.role === 'user' ? colors.onBrandPrimary : colors.onSurface, lineHeight: 20 }}>
                  {m.content}
                </Text>
              </View>
            </View>
          ))}

          {busy && (
            <View style={{ alignSelf: 'flex-start', marginTop: 12, padding: 12 }}>
              <ActivityIndicator color={colors.brand} />
            </View>
          )}
        </ScrollView>

        <View style={{
          borderTopColor: colors.border, borderTopWidth: 1,
          backgroundColor: colors.surfaceSecondary, padding: 12,
        }}>
          {imagePreview && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Image source={{ uri: imagePreview }} style={{ width: 48, height: 48, borderRadius: 8 }} />
              <Text style={{ color: colors.muted, marginLeft: 10, flex: 1 }}>Photo attached</Text>
              <Pressable testID="clear-image" onPress={() => { setImage(null); setImagePreview(null); }}>
                <Ionicons name="close-circle" size={22} color={colors.muted} />
              </Pressable>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              testID="assistant-attach"
              onPress={pick}
              style={{
                width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.surfaceTertiary,
              }}
            >
              <Ionicons name="camera" size={20} color={colors.onSurface} />
            </Pressable>
            <TextInput
              testID="assistant-input"
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything about your farm..."
              placeholderTextColor={colors.muted}
              style={{
                flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
                borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, color: colors.onSurface,
                maxHeight: 100,
              }}
              multiline
            />
            <Pressable
              testID="assistant-send"
              onPress={send}
              disabled={busy || (!input.trim() && !image)}
              style={{
                width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.brandPrimary, opacity: (busy || (!input.trim() && !image)) ? 0.5 : 1,
              }}
            >
              <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({});
