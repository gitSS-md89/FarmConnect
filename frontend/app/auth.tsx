import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/auth/AuthContext';

export default function AuthScreen() {
  const { colors, mode, toggle } = useTheme();
  const { login, register, loginWithGoogle } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!email || !password || (tab === 'signup' && !name)) {
      setError('Please fill in all fields');
      return;
    }
    setBusy(true);
    try {
      if (tab === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message || 'Authentication failed');
    } finally { setBusy(false); }
  };

  const onGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle();
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message || 'Google sign-in failed');
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Pressable
        testID="theme-toggle"
        onPress={toggle}
        style={[styles.themeBtn, { top: insets.top + 8, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
      >
        <Ionicons name={mode === 'dark' ? 'sunny' : 'moon'} size={18} color={colors.onSurface} />
      </Pressable>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 12 }}>
            <Image
              testID="brand-logo"
              source={require('@/assets/images/farmhand-emblem.png')}
              style={{ width: 140, height: 140, resizeMode: 'contain' }}
            />
            <Text style={{ fontSize: 32, fontWeight: '800', color: colors.onSurface, marginTop: 8, letterSpacing: 0.5 }}>Farm Hand</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>Farm Management System</Text>
          </View>

          <View style={[styles.tabRow, { backgroundColor: colors.surfaceTertiary }]}>
            {(['login', 'signup'] as const).map(t => (
              <Pressable
                key={t}
                testID={`tab-${t}`}
                onPress={() => setTab(t)}
                style={[
                  styles.tabBtn,
                  tab === t && { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={{ color: tab === t ? colors.onSurface : colors.muted, fontWeight: '600' }}>
                  {t === 'login' ? 'Log In' : 'Sign Up'}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'signup' && (
            <Field
              testID="input-name"
              label="Full Name"
              value={name}
              onChangeText={setName}
              placeholder="Ravi Kumar"
              colors={colors}
            />
          )}
          <Field
            testID="input-email"
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@farm.com"
            keyboardType="email-address"
            autoCapitalize="none"
            colors={colors}
          />
          <Field
            testID="input-password"
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            colors={colors}
          />

          {error && (
            <Text testID="auth-error" style={{ color: colors.error, marginTop: 8 }}>{error}</Text>
          )}

          <Pressable
            testID="auth-submit-button"
            onPress={onSubmit}
            disabled={busy}
            style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary, opacity: busy ? 0.7 : 1 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <Text style={{ color: colors.onBrandPrimary, fontWeight: '700', fontSize: 16 }}>
                {tab === 'login' ? 'Log In' : 'Create Account'}
              </Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <Text style={{ color: colors.muted, marginHorizontal: 12 }}>or</Text>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <Pressable
            testID="google-login-button"
            onPress={onGoogle}
            disabled={busy}
            style={[styles.googleBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          >
            <Ionicons name="logo-google" size={18} color={colors.onSurface} />
            <Text style={{ color: colors.onSurface, fontWeight: '600', marginLeft: 10 }}>Continue with Google</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ label, colors, ...rest }: any) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: colors.muted, marginBottom: 6, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={{
          backgroundColor: colors.surfaceSecondary,
          borderColor: colors.border, borderWidth: 1, borderRadius: 12,
          paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
          color: colors.onSurface,
        }}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  themeBtn: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  tabRow: { flexDirection: 'row', padding: 4, borderRadius: 12, marginTop: 24, marginBottom: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  primaryBtn: { marginTop: 20, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  line: { flex: 1, height: 1 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
});
