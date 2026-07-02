import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, TextInput, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/src/theme/ThemeContext';
import { api } from '@/src/lib/api';
import { fmt, symbol, detectCurrency, POPULAR_CURRENCIES, CURRENCY_SYMBOLS, UNITS, convert } from '@/src/lib/currency';
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
  const [showFarmSettings, setShowFarmSettings] = useState(false);

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

  // Convert everything to farm's currency for the top mini-stats
  const displayCurrency = farm?.currency || 'USD';
  const totalRevenue = sales.reduce((a, s) => a + convert(s.total || 0, s.currency || 'USD', displayCurrency), 0);
  const totalInvest = invests.reduce((a, x) => a + convert(x.amount || 0, x.currency || displayCurrency, displayCurrency), 0);

  // Native breakdown for the extra chip row when mixed currencies exist
  const revenueByCurrency: Record<string, number> = sales.reduce((acc: any, s: any) => {
    const c = s.currency || 'USD';
    acc[c] = (acc[c] || 0) + (s.total || 0);
    return acc;
  }, {});
  const currencyKeys = Object.keys(revenueByCurrency);

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
            <Pressable testID="farm-settings-btn" onPress={() => setShowFarmSettings(true)} style={[s.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
              <Ionicons name="settings-outline" size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="delete-farm-btn" onPress={deleteFarm} style={[s.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
              <Ionicons name="trash" size={16} color={colors.error} />
            </Pressable>
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <MiniStat
            testID="mini-revenue"
            label={`Revenue (${displayCurrency})`}
            value={fmt(totalRevenue, displayCurrency)}
            color={colors.brand}
          />
          <MiniStat
            testID="mini-invested"
            label={`Invested (${displayCurrency})`}
            value={fmt(totalInvest, displayCurrency)}
            color={colors.warning}
          />
          <MiniStat
            testID="mini-profit"
            label={`Profit (${displayCurrency})`}
            value={fmt(totalRevenue - totalInvest, displayCurrency)}
            color={(totalRevenue - totalInvest) >= 0 ? colors.success : colors.error}
          />
        </View>
        {currencyKeys.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {currencyKeys.map(c => (
              <View key={c} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surfaceTertiary }}>
                <Text style={{ color: colors.onSurface, fontWeight: '600', fontSize: 12 }}>{c} {fmt(revenueByCurrency[c], c)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

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
              produce.map(p => {
                const isLow = Number(p.low_stock_threshold || 0) > 0 && Number(p.quantity || 0) <= Number(p.low_stock_threshold || 0);
                return (
                  <Card key={p.produce_id} testID={`produce-${p.produce_id}`} style={{ marginBottom: 10 }}>
                    <Row
                      title={p.name}
                      subtitle={p.category}
                      right={`${p.quantity} ${p.unit}`}
                      colors={colors}
                    />
                    {Number(p.quantity || 0) === 0 ? (
                      <Text testID={`out-of-stock-${p.produce_id}`} style={{ color: colors.error, fontSize: 12, marginTop: 6, fontWeight: '600' }}>Out of stock</Text>
                    ) : isLow ? (
                      <View testID={`low-stock-${p.produce_id}`} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <Ionicons name="warning" size={14} color={colors.warning} />
                        <Text style={{ color: colors.warning, fontSize: 12, marginLeft: 4, fontWeight: '600' }}>
                          Low stock — restock soon (threshold {p.low_stock_threshold} {p.unit})
                        </Text>
                      </View>
                    ) : null}
                  </Card>
                );
              }))}
            {tab === 'sales' && (sales.length === 0 ? <Empty text="No sales yet" /> :
              sales.map(sale => (
                <Card key={sale.sale_id} testID={`sale-${sale.sale_id}`} style={{ marginBottom: 10 }}>
                  <Row
                    title={`${sale.produce_name || 'Produce'} → ${sale.seller_name || 'Seller'}`}
                    subtitle={`${sale.quantity} × ${symbol(sale.currency)}${sale.rate}`}
                    right={fmt(sale.total, sale.currency)}
                    colors={colors}
                  />
                </Card>
              )))}
            {tab === 'invest' && (invests.length === 0 ? <Empty text="No investments yet" /> :
              invests.map(i => (
                <Card key={i.investment_id} testID={`invest-${i.investment_id}`} style={{ marginBottom: 10 }}>
                  <Row title={i.category} subtitle={i.description || ''} right={fmt(i.amount, i.currency || farm?.currency || 'USD')} colors={colors} />
                </Card>
              )))}
            {tab === 'sellers' && (sellers.length === 0 ? (
              <Card testID="empty-sellers">
                <Ionicons name="people-outline" size={36} color={colors.brand} style={{ alignSelf: 'center', marginBottom: 10 }} />
                <Text style={{ color: colors.onSurface, textAlign: 'center', fontWeight: '700', fontSize: 16 }}>No sellers yet</Text>
                <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 6 }}>Tap the + button below to add a buyer/seller.</Text>
              </Card>
            ) :
              sellers.map(sel => (
                <Card key={sel.seller_id} testID={`seller-${sel.seller_id}`} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.onSurface, fontWeight: '700' }}>{sel.name}</Text>
                      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>
                        {sel.location || '—'}{sel.contact ? ` • ${sel.contact}` : ''}
                      </Text>
                    </View>
                    {sel.currency && (
                      <View testID={`seller-currency-${sel.seller_id}`} style={{ backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                        <Text style={{ color: colors.onBrandTertiary, fontWeight: '700', fontSize: 12 }}>{sel.currency}</Text>
                      </View>
                    )}
                  </View>
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
        farm={farm}
        produce={produce}
        sellers={sellers}
        onSaved={load}
      />

      <FarmSettingsModal
        visible={showFarmSettings}
        farm={farm}
        onClose={() => setShowFarmSettings(false)}
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

function MiniStat({ label, value, color, testID }: any) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12 }}>
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

function AddModal({ visible, section, onClose, farmId, farm, produce, sellers, onSaved }: any) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showSellerForm, setShowSellerForm] = useState(false);
  const [newSeller, setNewSeller] = useState({ name: '', contact: '', location: '' });
  const [savingSeller, setSavingSeller] = useState(false);
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [investCurrency, setInvestCurrency] = useState<string | null>(null);
  // Common fields for various sections
  const [f, setF] = useState<any>({ name: '', quantity: '', unit: '', low_stock_threshold: '', notes: '', category: '', rate: '', amount: '', description: '', contact: '', location: '', produce_id: '', seller_id: '' });

  React.useEffect(() => {
    if (visible) {
      setF({ name: '', quantity: '', unit: farm?.default_unit || '', low_stock_threshold: '', notes: '', category: '', rate: '', amount: '', description: '', contact: '', location: '', produce_id: '', seller_id: '' });
      setErr(null);
      setShowSellerForm(section === 'sales' && sellers.length === 0);
      setNewSeller({ name: '', contact: '', location: '' });
      setCurrencyChoice(null);
      setInvestCurrency(farm?.currency || 'USD');
    }
  }, [visible, section, sellers.length, farm]);

  // Selected entities (for sale)
  const selectedProduce = produce.find((p: any) => p.produce_id === f.produce_id);
  const selectedSeller = sellers.find((sel: any) => sel.seller_id === f.seller_id);
  const availableStock = selectedProduce ? Number(selectedProduce.quantity || 0) : null;
  // Currency picker only when seller selected AND seller has no currency yet
  const sellerCurrency = selectedSeller?.currency || null;
  const needsCurrencyPick = !!selectedSeller && !sellerCurrency;
  const suggestedCurrency = React.useMemo(
    () => detectCurrency(selectedSeller?.location) || 'USD',
    [selectedSeller?.location]
  );
  React.useEffect(() => {
    if (needsCurrencyPick && !currencyChoice) setCurrencyChoice(suggestedCurrency);
    if (!needsCurrencyPick) setCurrencyChoice(null);
  }, [needsCurrencyPick, suggestedCurrency, currencyChoice]);
  const effectiveCurrency = sellerCurrency || currencyChoice || 'USD';

  const quickAddSeller = async () => {
    if (!newSeller.name.trim()) { setErr('Seller name is required'); return; }
    setSavingSeller(true); setErr(null);
    try {
      const created = await api('/sellers', {
        method: 'POST',
        body: JSON.stringify({
          name: newSeller.name.trim(),
          contact: newSeller.contact.trim() || null,
          location: newSeller.location.trim() || null,
        }),
      });
      await onSaved();
      // Auto-select the newly created seller in the sale form
      setF((s: any) => ({ ...s, seller_id: created.seller_id }));
      setNewSeller({ name: '', contact: '', location: '' });
      setShowSellerForm(false);
    } catch (e: any) { setErr(e.message); }
    finally { setSavingSeller(false); }
  };

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
        const qty = parseFloat(f.quantity);
        if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be positive');
        if (availableStock !== null && qty > availableStock) {
          throw new Error(`Not enough stock. Available: ${availableStock} ${selectedProduce?.unit || 'units'}`);
        }
        // If seller has no currency yet, save it first (one-time)
        if (needsCurrencyPick) {
          if (!currencyChoice) throw new Error('Please pick a currency for this seller');
          await api(`/sellers/${f.seller_id}/currency`, {
            method: 'PATCH',
            body: JSON.stringify({ currency: currencyChoice }),
          });
        }
        await api('/sales', { method: 'POST', body: JSON.stringify({
          farm_id: farmId, produce_id: f.produce_id, seller_id: f.seller_id,
          quantity: qty, rate: parseFloat(f.rate), notes: f.notes,
        })});
      } else if (section === 'invest') {
        if (!f.category || !f.amount) throw new Error('Category & amount are required');
        await api('/investments', { method: 'POST', body: JSON.stringify({
          farm_id: farmId, category: f.category, amount: parseFloat(f.amount),
          currency: investCurrency || farm?.currency || 'USD',
          description: f.description,
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

                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>Seller*</Text>
                    <Pressable
                      testID="sale-add-seller-toggle"
                      onPress={() => setShowSellerForm(v => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center' }}
                    >
                      <Ionicons name={showSellerForm ? 'close' : 'add'} size={14} color={colors.brand} />
                      <Text style={{ color: colors.brand, fontWeight: '700', marginLeft: 4, fontSize: 13 }}>
                        {showSellerForm ? 'Cancel' : 'Add new'}
                      </Text>
                    </Pressable>
                  </View>
                  {sellers.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                      {sellers.map((sel: any) => {
                        const selected = f.seller_id === sel.seller_id;
                        return (
                          <Pressable
                            key={sel.seller_id}
                            testID={`sale-seller-${sel.seller_id}`}
                            onPress={() => set('seller_id', sel.seller_id)}
                            style={{
                              paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, flexShrink: 0,
                              alignItems: 'center', justifyContent: 'center',
                              backgroundColor: selected ? colors.brandPrimary : 'transparent',
                              borderColor: selected ? colors.brandPrimary : colors.border,
                            }}
                          >
                            <Text style={{ color: selected ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>{sel.name}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                  {sellers.length === 0 && !showSellerForm && (
                    <Pressable
                      testID="sale-empty-add-seller"
                      onPress={() => setShowSellerForm(true)}
                      style={{ marginTop: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.brand, alignItems: 'center' }}
                    >
                      <Text style={{ color: colors.brand, fontWeight: '700' }}>+ Add your first seller</Text>
                    </Pressable>
                  )}
                  {showSellerForm && (
                    <View testID="inline-seller-form" style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>NEW SELLER</Text>
                      <TextInput
                        testID="seller-name-input"
                        value={newSeller.name}
                        onChangeText={(v) => setNewSeller(s => ({ ...s, name: v }))}
                        placeholder="Seller name*"
                        placeholderTextColor={colors.muted}
                        style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.onSurface, marginBottom: 8 }}
                      />
                      <TextInput
                        testID="seller-contact-input"
                        value={newSeller.contact}
                        onChangeText={(v) => setNewSeller(s => ({ ...s, contact: v }))}
                        placeholder="Contact (optional)"
                        placeholderTextColor={colors.muted}
                        style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.onSurface, marginBottom: 8 }}
                      />
                      <TextInput
                        testID="seller-location-input"
                        value={newSeller.location}
                        onChangeText={(v) => setNewSeller(s => ({ ...s, location: v }))}
                        placeholder="Location (optional)"
                        placeholderTextColor={colors.muted}
                        style={{ backgroundColor: colors.surfaceSecondary, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.onSurface, marginBottom: 10 }}
                      />
                      <Pressable
                        testID="seller-save-inline"
                        onPress={quickAddSeller}
                        disabled={savingSeller}
                        style={{ backgroundColor: colors.brandPrimary, paddingVertical: 12, borderRadius: 10, alignItems: 'center', opacity: savingSeller ? 0.6 : 1 }}
                      >
                        <Text style={{ color: colors.onBrandPrimary, fontWeight: '700' }}>{savingSeller ? 'Saving...' : 'Save Seller'}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                <Field label="Quantity*" testID="in-qty" value={f.quantity} onChangeText={(v: string) => set('quantity', v)} keyboardType="decimal-pad" />
                {selectedProduce && (
                  <Text testID="stock-hint" style={{
                    color: (parseFloat(f.quantity || '0') > (availableStock || 0)) ? colors.error : colors.muted,
                    fontSize: 12, marginTop: 4, fontWeight: '600',
                  }}>
                    In stock: {availableStock} {selectedProduce.unit || 'units'}
                    {parseFloat(f.quantity || '0') > (availableStock || 0) ? ' — exceeds available!' : ''}
                  </Text>
                )}

                {selectedSeller && sellerCurrency && (
                  <View testID="locked-currency" style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>Currency:</Text>
                    <View style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.brandTertiary }}>
                      <Text style={{ color: colors.onBrandTertiary, fontWeight: '700', fontSize: 12 }}>{sellerCurrency} ({symbol(sellerCurrency)})</Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 8 }}>fixed for {selectedSeller.name}</Text>
                  </View>
                )}

                {needsCurrencyPick && (
                  <View testID="currency-picker" style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.onSurface, fontWeight: '700', fontSize: 13 }}>
                      Pick currency for {selectedSeller?.name}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                      Suggested from location{selectedSeller?.location ? ` "${selectedSeller.location}"` : ''}: {suggestedCurrency}. Saved once — won&apos;t ask again.
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10, paddingBottom: 2 }}>
                      {POPULAR_CURRENCIES.map(c => (
                        <Pressable
                          key={c}
                          testID={`currency-opt-${c}`}
                          onPress={() => setCurrencyChoice(c)}
                          style={{
                            paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, flexShrink: 0,
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: currencyChoice === c ? colors.brandPrimary : colors.surfaceSecondary,
                            borderColor: currencyChoice === c ? colors.brandPrimary : colors.border,
                          }}
                        >
                          <Text style={{ color: currencyChoice === c ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>
                            {CURRENCY_SYMBOLS[c]} {c}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Field
                  label={`Rate per unit* (${symbol(effectiveCurrency)}${effectiveCurrency})`}
                  testID="in-rate"
                  value={f.rate}
                  onChangeText={(v: string) => set('rate', v)}
                  keyboardType="decimal-pad"
                />
                {!!f.quantity && !!f.rate && (
                  <Text testID="sale-total-preview" style={{ color: colors.brand, marginTop: 6, fontWeight: '700' }}>
                    Total: {fmt(parseFloat(f.quantity || '0') * parseFloat(f.rate || '0'), effectiveCurrency)}
                  </Text>
                )}
                <Field label="Notes" testID="in-notes" value={f.notes} onChangeText={(v: string) => set('notes', v)} />
              </>
            )}
            {section === 'invest' && (
              <>
                <Chips label="Category*" options={INVEST_CATS} value={f.category} onChange={(v: string) => set('category', v)} testIdPrefix="inv-cat" />
                <Field label={`Amount* (${symbol(investCurrency)}${investCurrency})`} testID="in-amount" value={f.amount} onChangeText={(v: string) => set('amount', v)} keyboardType="decimal-pad" />
                <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 }}>Currency (farm default: {farm?.currency || 'USD'})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                  {POPULAR_CURRENCIES.map(c => {
                    const selected = investCurrency === c;
                    return (
                      <Pressable
                        key={c}
                        testID={`invest-currency-${c}`}
                        onPress={() => setInvestCurrency(c)}
                        style={{
                          paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, flexShrink: 0,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: selected ? colors.brandPrimary : 'transparent',
                          borderColor: selected ? colors.brandPrimary : colors.border,
                        }}
                      >
                        <Text style={{ color: selected ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>
                          {CURRENCY_SYMBOLS[c]} {c}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
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

function FarmSettingsModal({ visible, farm, onClose, onSaved }: any) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [size, setSize] = useState('');
  const [currency, setCurrency] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  React.useEffect(() => {
    if (visible && farm) {
      setName(farm.name || '');
      setLocation(farm.location || '');
      setSize(farm.size_acres ? String(farm.size_acres) : '');
      setCurrency(farm.currency || null);
      setUnit(farm.default_unit || null);
      setLogo(farm.logo || null);
      setErr(null);
    }
  }, [visible, farm]);

  const pickLogo = async () => {
    setErr(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr('Photo library permission needed'); return; }
    setUploadingLogo(true);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, allowsEditing: true, aspect: [1, 1], base64: true,
      });
      if (!r.canceled && r.assets?.[0]?.base64) {
        setLogo(`data:image/jpeg;base64,${r.assets[0].base64}`);
      }
    } finally { setUploadingLogo(false); }
  };

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const payload: any = {};
      if (name.trim() && name.trim() !== farm.name) payload.name = name.trim();
      if (location.trim() !== (farm.location || '')) payload.location = location.trim();
      if (size !== (farm.size_acres ? String(farm.size_acres) : '')) payload.size_acres = size ? parseFloat(size) : null;
      if (currency && currency !== farm.currency) payload.currency = currency;
      if (unit && unit !== farm.default_unit) payload.default_unit = unit;
      if (logo !== (farm.logo || null) && logo) payload.logo = logo;
      if (Object.keys(payload).length === 0) { onClose(); return; }
      await api(`/farms/${farm.farm_id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await onSaved();
      onClose();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!farm) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' }}>
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{ width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2 }} />
          </View>
          <Text style={{ color: colors.onSurface, fontSize: 22, fontWeight: '800' }}>Farm Settings</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>Currency, units, logo and profile for this farm</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 8 }}>
            {/* Farm logo */}
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 8 }}>Farm Logo</Text>
            <Pressable
              testID="fs-pick-logo"
              onPress={pickLogo}
              style={{
                width: 96, height: 96, borderRadius: 16, alignSelf: 'flex-start', overflow: 'hidden',
                backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: colors.border,
              }}
            >
              {logo ? (
                <Image testID="fs-logo-preview" source={{ uri: logo }} style={{ width: 96, height: 96 }} />
              ) : (
                <Ionicons name="camera" size={28} color={colors.onBrandTertiary} />
              )}
              {uploadingLogo && (
                <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </Pressable>

            <SettingsField label="Name*" testID="fs-name" value={name} onChangeText={setName} />
            <SettingsField label="Location" testID="fs-location" value={location} onChangeText={setLocation} placeholder="e.g. Punjab, India" />
            <SettingsField label="Size (acres)" testID="fs-size" value={size} onChangeText={setSize} keyboardType="decimal-pad" />

            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 }}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
              {POPULAR_CURRENCIES.map(c => {
                const selected = currency === c;
                return (
                  <Pressable
                    key={c}
                    testID={`fs-currency-${c}`}
                    onPress={() => setCurrency(c)}
                    style={{
                      paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, flexShrink: 0,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selected ? colors.brandPrimary : 'transparent',
                      borderColor: selected ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <Text style={{ color: selected ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>
                      {CURRENCY_SYMBOLS[c]} {c}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 }}>Default Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
              {UNITS.map(u => {
                const selected = unit === u;
                return (
                  <Pressable
                    key={u}
                    testID={`fs-unit-${u}`}
                    onPress={() => setUnit(u)}
                    style={{
                      paddingHorizontal: 14, height: 36, borderRadius: 999, borderWidth: 1, flexShrink: 0,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selected ? colors.brandPrimary : 'transparent',
                      borderColor: selected ? colors.brandPrimary : colors.border,
                    }}
                  >
                    <Text style={{ color: selected ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', fontSize: 13 }}>{u}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {err && <Text style={{ color: colors.error, marginTop: 10 }}>{err}</Text>}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Pressable testID="fs-cancel" onPress={onClose} style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.onSurface, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton testID="fs-save" label={busy ? 'Saving...' : 'Save'} onPress={save} disabled={busy} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SettingsField({ label, ...rest }: any) {
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

const s = StyleSheet.create({
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
