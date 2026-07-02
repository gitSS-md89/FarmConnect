import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { api } from '@/src/lib/api';
import { ScreenHeader, Card, PrimaryButton } from '@/src/ui/components';

export default function Farms() {
  const { colors } = useTheme();
  const router = useRouter();
  const [farms, setFarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setFarms(await api('/farms')); } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Farm name is required'); return; }
    setBusy(true);
    try {
      await api('/farms', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          location: location.trim() || null,
          size_acres: size ? parseFloat(size) : null,
        }),
      });
      setShowAdd(false); setName(''); setLocation(''); setSize('');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader
        testID="farms-header"
        title="Farms"
        subtitle={`${farms.length} farm${farms.length === 1 ? '' : 's'}`}
        right={
          <Pressable testID="add-farm-btn" onPress={() => setShowAdd(true)} style={[styles.iconBtn, { backgroundColor: colors.brandPrimary }]}>
            <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> :
          farms.length === 0 ? (
            <Card testID="empty-farms">
              <Ionicons name="leaf-outline" size={40} color={colors.brand} style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={{ color: colors.onSurface, textAlign: 'center', fontSize: 16, fontWeight: '600' }}>No farms yet</Text>
              <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 6 }}>Tap + to add your first farm</Text>
            </Card>
          ) :
          farms.map((f) => (
            <Pressable
              key={f.farm_id}
              testID={`farm-item-${f.farm_id}`}
              onPress={() => router.push(`/farm/${f.farm_id}`)}
              style={{
                backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1,
                borderRadius: 16, padding: 16, marginBottom: 12,
                flexDirection: 'row', alignItems: 'center',
              }}
            >
              <View style={{
                width: 48, height: 48, borderRadius: 12,
                backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center', marginRight: 14,
              }}>
                <Ionicons name="leaf" size={22} color={colors.onBrandTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontWeight: '700', fontSize: 16 }}>{f.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 2 }}>
                  {f.location || 'No location'}{f.size_acres ? ` • ${f.size_acres} acres` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))
        }
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2 }} />
            </View>
            <Text style={{ color: colors.onSurface, fontSize: 22, fontWeight: '800' }}>New Farm</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>Register a farm you own or manage</Text>
            <Input label="Name" value={name} onChangeText={setName} testID="farm-input-name" colors={colors} placeholder="Green Valley" />
            <Input label="Location" value={location} onChangeText={setLocation} testID="farm-input-location" colors={colors} placeholder="Punjab, IN" />
            <Input label="Size (acres)" value={size} onChangeText={setSize} testID="farm-input-size" keyboardType="decimal-pad" colors={colors} placeholder="12" />
            {err && <Text style={{ color: colors.error, marginTop: 8 }}>{err}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable testID="farm-cancel" onPress={() => setShowAdd(false)} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.onSurface, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton testID="farm-submit" label={busy ? 'Saving...' : 'Save Farm'} onPress={submit} disabled={busy} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Input({ label, colors, ...rest }: any) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.onSurface }}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
