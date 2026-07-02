import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, StyleSheet, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/auth/AuthContext';
import { api } from '@/src/lib/api';
import { ScreenHeader, Card, PrimaryButton } from '@/src/ui/components';

export default function Market() {
  const { colors } = useTheme();
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<'market' | 'community'>('market');
  const [listings, setListings] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([api('/market/listings'), api('/community/posts')]);
      setListings(m.listings || []);
      setPosts(p || []);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = !!user?.subscription?.active;

  const toggleSub = async () => {
    try {
      if (active) await api('/market/unsubscribe', { method: 'POST' });
      else await api('/market/subscribe', { method: 'POST' });
      await refresh();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const submitPost = async () => {
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      await api('/community/posts', { method: 'POST', body: JSON.stringify({ content: newPost.trim() }) });
      setNewPost('');
      await load();
    } catch (e) { console.warn(e); }
    finally { setPosting(false); }
  };

  const like = async (id: string) => {
    try { await api(`/community/posts/${id}/like`, { method: 'POST' }); await load(); } catch {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader testID="market-header" title="Marketplace" subtitle="Sell smarter, grow farther" />

      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
        {(['market', 'community'] as const).map(t => (
          <Pressable
            key={t}
            testID={`market-tab-${t}`}
            onPress={() => setTab(t)}
            style={{
              paddingHorizontal: 16, height: 36, borderRadius: 999, borderWidth: 1,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: tab === t ? colors.brandPrimary : 'transparent',
              borderColor: tab === t ? colors.brandPrimary : colors.border,
            }}
          >
            <Text style={{ color: tab === t ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', textTransform: 'capitalize' }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {tab === 'market' ? (
          <>
            <Card testID="subscription-card" style={{ marginBottom: 16, backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name={active ? 'checkmark-circle' : 'lock-closed'} size={22} color={active ? colors.brand : colors.warning} />
                <Text style={{ color: colors.onSurface, fontWeight: '700', marginLeft: 10, fontSize: 16 }}>
                  {active ? 'Premium Active' : 'Unlock Marketplace'}
                </Text>
              </View>
              <Text style={{ color: colors.muted, marginTop: 8 }}>
                {active
                  ? 'You have access to all marketplace channels. Renews in 30 days.'
                  : 'Subscribe to list your produce across 4+ marketplaces and reach thousands of buyers.'}
              </Text>
              <View style={{ marginTop: 14 }}>
                <PrimaryButton
                  testID="subscribe-button"
                  label={active ? 'Cancel Subscription' : 'Subscribe – $9/mo (mock)'}
                  onPress={toggleSub}
                />
              </View>
            </Card>

            {loading ? <ActivityIndicator color={colors.brand} /> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {listings.map((l) => (
                  <View
                    key={l.id}
                    testID={`listing-${l.id}`}
                    style={{
                      width: '48%', backgroundColor: colors.surfaceSecondary,
                      borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden',
                      opacity: active ? 1 : 0.65,
                    }}
                  >
                    <Image source={{ uri: l.image }} style={{ width: '100%', height: 96 }} />
                    <View style={{ padding: 12 }}>
                      <Text style={{ color: colors.onSurface, fontWeight: '700' }}>{l.name}</Text>
                      <Text style={{ color: colors.muted, marginTop: 2, fontSize: 12 }}>{l.category} • {l.reach}</Text>
                      <Text style={{ color: colors.brand, marginTop: 6, fontWeight: '700' }}>Commission {l.commission}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <Card style={{ marginBottom: 16 }}>
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 8 }}>SHARE WITH FARM FRIENDS</Text>
              <TextInput
                testID="post-input"
                value={newPost}
                onChangeText={setNewPost}
                placeholder="What's happening on your farm?"
                placeholderTextColor={colors.muted}
                multiline
                style={{
                  minHeight: 60, backgroundColor: colors.surface, borderRadius: 12,
                  borderColor: colors.border, borderWidth: 1, padding: 12, color: colors.onSurface,
                }}
              />
              <View style={{ marginTop: 10 }}>
                <PrimaryButton testID="post-submit" label={posting ? 'Posting...' : 'Post'} onPress={submitPost} disabled={posting} />
              </View>
            </Card>

            {loading ? <ActivityIndicator color={colors.brand} /> :
              posts.length === 0 ? (
                <Card testID="empty-community">
                  <Text style={{ color: colors.muted, textAlign: 'center' }}>Be the first to share!</Text>
                </Card>
              ) :
              posts.map((p) => (
                <Card key={p.post_id} testID={`post-${p.post_id}`} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{
                      width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary,
                      alignItems: 'center', justifyContent: 'center', marginRight: 10,
                    }}>
                      <Text style={{ color: colors.onBrandTertiary, fontWeight: '700' }}>{(p.user_name || 'F')[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.onSurface, fontWeight: '700' }}>{p.user_name}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(p.created_at).toLocaleString()}</Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.onSurface, marginTop: 10, lineHeight: 20 }}>{p.content}</Text>
                  <Pressable testID={`like-${p.post_id}`} onPress={() => like(p.post_id)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                    <Ionicons name="heart" size={16} color={colors.brand} />
                    <Text style={{ color: colors.muted, marginLeft: 6 }}>{p.likes || 0}</Text>
                  </Pressable>
                </Card>
              ))
            }
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({});
