import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/auth/AuthContext';
import { api } from '@/src/lib/api';
import { ALL_CURRENCIES, CURRENCY_SYMBOLS } from '@/src/lib/currency';
import { ScreenHeader, Card } from '@/src/ui/components';

export default function Settings() {
  const { colors, mode, setMode } = useTheme();
  const { user, refresh, logout } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'picture' | 'background' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickCurrency = async (code: string) => {
    setSaving(code);
    try {
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify({ primary_currency: code }) });
      await refresh();
    } catch (e) { console.warn(e); }
    finally { setSaving(null); }
  };

  const pickAndUpload = async (kind: 'picture' | 'background') => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Photo library permission needed'); return; }
    const opts: ImagePicker.ImagePickerOptions = kind === 'picture'
      ? { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, allowsEditing: true, aspect: [1, 1], base64: true }
      : { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, allowsEditing: true, aspect: [16, 9], base64: true };
    const r = await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets?.[0]?.base64) return;
    const b64 = `data:image/jpeg;base64,${r.assets[0].base64}`;
    setUploading(kind);
    try {
      const payload: any = {};
      payload[kind === 'picture' ? 'picture' : 'background_image'] = b64;
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(payload) });
      await refresh();
    } catch (e: any) { setError(e.message || 'Upload failed'); }
    finally { setUploading(null); }
  };

  const clearImage = async (kind: 'picture' | 'background') => {
    setUploading(kind);
    try {
      const payload: any = {};
      payload[kind === 'picture' ? 'picture' : 'background_image'] = '';
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify(payload) });
      await refresh();
    } catch (e) { console.warn(e); }
    finally { setUploading(null); }
  };

  const doLogout = async () => { await logout(); router.replace('/auth'); };

  const current = user?.primary_currency || 'USD';
  const initial = (user?.name || 'F')[0].toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader
        testID="settings-header"
        title="Settings"
        subtitle="Preferences, profile & currency"
        right={
          <Pressable testID="settings-back" onPress={() => router.back()} style={[s.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
            <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Profile card */}
        <Card testID="account-card">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              testID="pick-avatar"
              onPress={() => pickAndUpload('picture')}
              style={{
                width: 72, height: 72, borderRadius: 36, overflow: 'hidden',
                backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
              }}
            >
              {user?.picture ? (
                <Image source={{ uri: user.picture }} style={{ width: 72, height: 72 }} />
              ) : (
                <Text style={{ color: colors.onBrandTertiary, fontSize: 28, fontWeight: '800' }}>{initial}</Text>
              )}
              {uploading === 'picture' && (
                <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="camera" size={12} color={colors.onBrandPrimary} />
              </View>
            </Pressable>
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{ color: colors.onSurface, fontWeight: '700', fontSize: 18 }}>{user?.name}</Text>
              <Text style={{ color: colors.muted, marginTop: 2 }}>{user?.email}</Text>
              {user?.picture && (
                <Pressable testID="clear-avatar" onPress={() => clearImage('picture')} style={{ marginTop: 6 }}>
                  <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}>Remove photo</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Card>

        {/* Background image */}
        <Card style={{ marginTop: 16 }} testID="background-card">
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 12, marginBottom: 8 }}>DASHBOARD BACKGROUND</Text>
          <View style={{
            height: 120, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.brandTertiary,
            alignItems: 'center', justifyContent: 'center',
          }}>
            {user?.background_image ? (
              <Image testID="bg-preview" source={{ uri: user.background_image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="leaf" size={36} color={colors.onBrandTertiary} />
                <Text style={{ color: colors.onBrandTertiary, marginTop: 6, fontSize: 12, fontWeight: '600' }}>Default agri-green</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable
              testID="pick-background"
              onPress={() => pickAndUpload('background')}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
            >
              {uploading === 'background' ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <>
                  <Ionicons name="image" size={16} color={colors.onBrandPrimary} />
                  <Text style={{ color: colors.onBrandPrimary, fontWeight: '700', marginLeft: 6 }}>Upload background</Text>
                </>
              )}
            </Pressable>
            {user?.background_image && (
              <Pressable
                testID="clear-background"
                onPress={() => clearImage('background')}
                style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.error, fontWeight: '700', fontSize: 13 }}>Reset</Text>
              </Pressable>
            )}
          </View>
        </Card>

        {error && <Text testID="settings-error" style={{ color: colors.error, marginTop: 8 }}>{error}</Text>}

        <Card style={{ marginTop: 16 }} testID="theme-card">
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 12, marginBottom: 12 }}>APPEARANCE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['light', 'dark'] as const).map(m => (
              <Pressable
                key={m}
                testID={`theme-${m}`}
                onPress={() => setMode(m)}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                  backgroundColor: mode === m ? colors.brandPrimary : colors.surfaceTertiary,
                }}
              >
                <Ionicons name={m === 'dark' ? 'moon' : 'sunny'} size={18} color={mode === m ? colors.onBrandPrimary : colors.onSurface} />
                <Text style={{ color: mode === m ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', textTransform: 'capitalize' }}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: 16 }} testID="currency-card">
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 12 }}>SYSTEM-WIDE CURRENCY</Text>
          <Text style={{ color: colors.onSurface, marginTop: 6, fontSize: 13 }}>
            All Dashboard totals & profit are converted to your primary currency using approximate reference rates.
          </Text>
          <Text testID="current-currency" style={{ color: colors.brand, marginTop: 8, fontWeight: '700', fontSize: 16 }}>
            Current: {CURRENCY_SYMBOLS[current]} {current}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {ALL_CURRENCIES.map(code => (
              <Pressable
                key={code}
                testID={`pick-currency-${code}`}
                onPress={() => pickCurrency(code)}
                style={{
                  paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1,
                  alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
                  backgroundColor: current === code ? colors.brandPrimary : 'transparent',
                  borderColor: current === code ? colors.brandPrimary : colors.border,
                  opacity: saving && saving !== code ? 0.5 : 1,
                }}
              >
                {saving === code ? (
                  <ActivityIndicator size="small" color={current === code ? colors.onBrandPrimary : colors.onSurface} />
                ) : (
                  <Text style={{ color: current === code ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>
                    {CURRENCY_SYMBOLS[code]} {code}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </Card>

        <Card style={{ marginTop: 16 }} testID="farms-info-card">
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 12, marginBottom: 8 }}>FARM SETTINGS</Text>
          <Text style={{ color: colors.onSurface, fontSize: 14 }}>
            Each farm has its own currency, default unit, and logo. Open a farm and tap the settings icon to edit.
          </Text>
        </Card>

        <Pressable testID="settings-logout" onPress={doLogout} style={{ marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 }}>
          <Text style={{ color: colors.error, fontWeight: '700' }}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
