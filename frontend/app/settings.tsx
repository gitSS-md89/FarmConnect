import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

  const pickCurrency = async (code: string) => {
    setSaving(code);
    try {
      await api('/users/me/settings', { method: 'PATCH', body: JSON.stringify({ primary_currency: code }) });
      await refresh();
    } catch (e) { console.warn(e); }
    finally { setSaving(null); }
  };

  const doLogout = async () => { await logout(); router.replace('/auth'); };

  const current = user?.primary_currency || 'USD';

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader
        testID="settings-header"
        title="Settings"
        subtitle="Preferences & currency"
        right={
          <Pressable testID="settings-back" onPress={() => router.back()} style={[s.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
            <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Card testID="account-card">
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 12, marginBottom: 8 }}>ACCOUNT</Text>
          <Text style={{ color: colors.onSurface, fontWeight: '700', fontSize: 16 }}>{user?.name}</Text>
          <Text style={{ color: colors.muted, marginTop: 2 }}>{user?.email}</Text>
        </Card>

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
            Each farm has its own currency and default unit (auto-detected from location). Open a farm and tap the settings icon to edit.
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
