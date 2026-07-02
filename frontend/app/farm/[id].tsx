import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { api } from '@/src/lib/api';
import { ScreenHeader, Card, PrimaryButton } from '@/src/ui/components';

type Tab = 'produce' | 'sales' | 'invest' | 'sellers';
const PRODUCE_CATS = ['Grain', 'Vegetable', 'Fruit', 'Dairy', 'Other'];
const INVEST_CATS = ['Seeds', 'Fertilizer', 'Labour', 'Equipment', 'Irrigation', 'Other'];

export default function FarmDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('produce');
  const [farm, setFarm] = useState<any>(null);
  const [produce, setProduce] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [invests, setInvests] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalTab, setModalTab] = useState<Tab | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [farms, p, s, i, sl] = await Promise.all([
        api('/farms'),
        api(`/produce?farm_id=${id}`),
        api(`/sales?farm_id=${id}`),
        api(`/investments?farm_id=${id}`),
        api('/sellers'),
      ]);
      setFarm(farms.find((f: any) => f.farm_id === id));
      setProduce(p); setSales(s); setInvests(i); setSellers(sl);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalRevenue = sales.reduce((a, s) => a + (s.total || 0), 0);
  const totalInvest = invests.reduce((a, x) => a + (x.amount || 0), 0);

  const deleteFarm = async () => {
    Alert.alert('Delete Farm?', 'This will remove all data for this farm.', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await api(`/farms/${id}`, { method: 'DELETE' }); router.back(); } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader
        testID="farm-detail-header"
        title={farm?.name || 'Farm'}
        subtitle={farm ? `${farm.location || '—'}${farm.size_acres ? ` • ${farm.size_acres} acres` : ''}` : ''}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable testID="back-btn" onPress={() => router.back()} style={[s.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
              <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="delete-farm-btn" onPress={deleteFarm} style={[s.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
              <Ionicons name="trash" size={16} color={colors.error} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <MiniStat label="Revenue" value={`$${totalRevenue.toFixed(2)}`} color={colors.brand} />
          <MiniStat label="Invested" value={`$${totalInvest.toFixed(2)}`} color={colors.warning} />
          <MiniStat label="Profit" value={`$${(totalRevenue - totalInvest).toFixed(2)}`} color={(totalRevenue - totalInvest) >= 0 ? colors.success : colors.error} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 16, paddingBottom: 4 }}>
          {([
            { k: 'produce', label: `Produce (${produce.length})` },
            { k: 'sales', label: `Sales (${sales.length})` },
            { k: 'invest', label: `Investments (${invests.length})` },
            { k: 'sellers', label: `Sellers (${sellers.length})` },
          ] as { k: Tab, label: string }[]).map(t => (
            <Pressable
              key={t.k}
              testID={`section-tab-${t.k}`}
              onPress={() => setTab(t.k)}
              style={{
                paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, flexShrink: 0,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tab === t.k ? colors.brandPrimary : 'transparent',
                borderColor: tab === t.k ? colors.brandPrimary : colors.border,
              }}
            >
              <Text style={{ color: tab === t.k ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} /> : (
          <View style={{ marginTop: 16 }}>
            {tab === 'produce' && (produce.length === 0 ? <Empty text="No produce yet" /> :
              produce.map(p => (
                <Card key={p.produce_id} testID={`produce-${p.produce_id}`} style={{ marginBottom: 10 }}>
                  <Row title={p.name} subtitle={p.category} right={`${p.quantity} ${p.unit}`} colors={colors} />
                </Card>
              )))}
            {tab === 'sales' && (sales.length === 0 ? <Empty text="No sales yet" /> :
              sales.map(sale => {
                const p = produce.find(x => x.produce_id === sale.produce_id);
                const sel = sellers.find(x => x.seller_id === sale.seller_id);
                return (
                  <Card key={sale.sale_id} testID={`sale-${sale.sale_id}`} style={{ marginBottom: 10 }}>
                    <Row
                      title={`${p?.name || 'Produce'} → ${sel?.name || 'Seller'}`}
                      subtitle={`${sale.quantity} × $${sale.rate}`}
                      right={`$${sale.total}`}
                      colors={colors}
                    />
                  </Card>
                );
              }))}
            {tab === 'invest' && (invests.length === 0 ? <Empty text="No investments yet" /> :
              invests.map(i => (
                <Card key={i.investment_id} testID={`invest-${i.investment_id}`} style={{ marginBottom: 10 }}>
                  <Row title={i.category} subtitle={i.description || ''} right={`$${i.amount}`} colors={colors} />
                </Card>
              )))}
            {tab === 'sellers' && (sellers.length === 0 ? <Empty text="No sellers yet" /> :
              sellers.map(sel => (
                <Card key={sel.seller_id} testID={`seller-${sel.seller_id}`} style={{ marginBottom: 10 }}>
                  <Row title={sel.name} subtitle={sel.location || '—'} right={sel.contact || ''} colors={colors} />
                </Card>
              )))}
          </View>
        )}
      </ScrollView>

      <Pressable
        testID="add-fab"
        onPress={() => setModalTab(tab)}
        style={{
          position: 'absolute', right: 20, bottom: 24,
          backgroundColor: colors.brandPrimary,
          width: 56, height: 56, borderRadius: 28,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        <Ionicons name="add" size={28} color={colors.onBrandPrimary} />
      </Pressable>

      <AddModal
        visible={modalTab !== null}
        section={modalTab}
        onClose={() => setModalTab(null)}
        farmId={id!}
        produce={produce}
        sellers={sellers}
        onSaved={load}
      />
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Card>
      <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 12 }}>{text}</Text>
    </Card>
  );
}

function MiniStat({ label, value, color }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600' }}>{label.toUpperCase()}</Text>
      <Text style={{ color, fontSize: 16, fontWeight: '800', marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function Row({ title, subtitle, right, colors }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.onSurface, fontWeight: '700' }}>{title}</Text>
        {!!subtitle && <Text style={{ color: colors.muted, marginTop: 2, fontSize: 13 }}>{subtitle}</Text>}
      </View>
      <Text style={{ color: colors.brand, fontWeight: '700' }}>{right}</Text>
    </View>
  );
}

function AddModal({ visible, section, onClose, farmId, produce, sellers, onSaved }: any) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Common fields for various sections
  const [f, setF] = useState<any>({});

  React.useEffect(() => { if (visible) { setF({}); setErr(null); } }, [visible, section]);

  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      if (section === 'produce') {
        if (!f.name || !f.quantity || !f.category) throw new Error('Fill required fields');
        await api('/produce', { method: 'POST', body: JSON.stringify({
          farm_id: farmId, name: f.name, category: f.category, quantity: parseFloat(f.quantity), unit: f.unit || 'kg', notes: f.notes,
        })});
      } else if (section === 'sales') {
        if (!f.produce_id || !f.seller_id || !f.quantity || !f.rate) throw new Error('Select produce, seller, quantity & rate');
        await api('/sales', { method: 'POST', body: JSON.stringify({
          farm_id: farmId, produce_id: f.produce_id, seller_id: f.seller_id,
          quantity: parseFloat(f.quantity), rate: parseFloat(f.rate), notes: f.notes,
        })});
      } else if (section === 'invest') {
        if (!f.category || !f.amount) throw new Error('Category & amount are required');
        await api('/investments', { method: 'POST', body: JSON.stringify({
          farm_id: farmId, category: f.category, amount: parseFloat(f.amount), description: f.description,
        })});
      } else if (section === 'sellers') {
        if (!f.name) throw new Error('Seller name is required');
        await api('/sellers', { method: 'POST', body: JSON.stringify({
          name: f.name, contact: f.contact, location: f.location,
        })});
      }
      await onSaved();
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const title = section === 'produce' ? 'Add Produce' : section === 'sales' ? 'Record Sale' : section === 'invest' ? 'Add Investment' : 'Add Seller';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '86%' }}>
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2 }} />
          </View>
          <Text style={{ color: colors.onSurface, fontSize: 22, fontWeight: '800' }}>{title}</Text>
          <ScrollView style={{ marginTop: 8 }} keyboardShouldPersistTaps="handled">
            {section === 'produce' && (
              <>
                <Field label="Name*" testID="in-name" value={f.name} onChangeText={(v: string) => set('name', v)} />
                <Chips label="Category*" options={PRODUCE_CATS} value={f.category} onChange={(v: string) => set('category', v)} testIdPrefix="cat" />
                <Field label="Quantity*" testID="in-qty" value={f.quantity} onChangeText={(v: string) => set('quantity', v)} keyboardType="decimal-pad" />
                <Field label="Unit (default kg)" testID="in-unit" value={f.unit} onChangeText={(v: string) => set('unit', v)} />
                <Field label="Notes" testID="in-notes" value={f.notes} onChangeText={(v: string) => set('notes', v)} />
              </>
            )}
            {section === 'sales' && (
              <>
                <Chips label="Produce*" options={produce.map((p: any) => p.name)} value={produce.find((p: any) => p.produce_id === f.produce_id)?.name}
                  onChange={(v: string) => { const p = produce.find((x: any) => x.name === v); set('produce_id', p?.produce_id); }} testIdPrefix="sale-produce" />
                <Chips label="Seller*" options={sellers.map((s: any) => s.name)} value={sellers.find((s: any) => s.seller_id === f.seller_id)?.name}
                  onChange={(v: string) => { const s = sellers.find((x: any) => x.name === v); set('seller_id', s?.seller_id); }} testIdPrefix="sale-seller" />
                {sellers.length === 0 && <Text style={{ color: colors.warning, marginTop: 6 }}>Add a seller first (Sellers tab).</Text>}
                <Field label="Quantity*" testID="in-qty" value={f.quantity} onChangeText={(v: string) => set('quantity', v)} keyboardType="decimal-pad" />
                <Field label="Rate per unit*" testID="in-rate" value={f.rate} onChangeText={(v: string) => set('rate', v)} keyboardType="decimal-pad" />
                <Field label="Notes" testID="in-notes" value={f.notes} onChangeText={(v: string) => set('notes', v)} />
              </>
            )}
            {section === 'invest' && (
              <>
                <Chips label="Category*" options={INVEST_CATS} value={f.category} onChange={(v: string) => set('category', v)} testIdPrefix="inv-cat" />
                <Field label="Amount*" testID="in-amount" value={f.amount} onChangeText={(v: string) => set('amount', v)} keyboardType="decimal-pad" />
                <Field label="Description" testID="in-desc" value={f.description} onChangeText={(v: string) => set('description', v)} />
              </>
            )}
            {section === 'sellers' && (
              <>
                <Field label="Name*" testID="in-name" value={f.name} onChangeText={(v: string) => set('name', v)} />
                <Field label="Contact" testID="in-contact" value={f.contact} onChangeText={(v: string) => set('contact', v)} />
                <Field label="Location" testID="in-location" value={f.location} onChangeText={(v: string) => set('location', v)} />
              </>
            )}
            {err && <Text style={{ color: colors.error, marginTop: 10 }}>{err}</Text>}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable testID="modal-cancel" onPress={onClose} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.onSurface, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton testID="modal-submit" label={busy ? 'Saving...' : 'Save'} onPress={submit} disabled={busy} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, ...rest }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.onSurface }}
        {...rest}
      />
    </View>
  );
}

function Chips({ label, options, value, onChange, testIdPrefix }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
        {options.map((opt: string) => (
          <Pressable
            key={opt}
            testID={`${testIdPrefix}-${opt.replace(/\s+/g, '-').toLowerCase()}`}
            onPress={() => onChange(opt)}
            style={{
              paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, flexShrink: 0,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: value === opt ? colors.brandPrimary : 'transparent',
              borderColor: value === opt ? colors.brandPrimary : colors.border,
            }}
          >
            <Text style={{ color: value === opt ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>{opt}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
