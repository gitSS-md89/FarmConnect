import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator, ImageBackground, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/auth/AuthContext';
import { api } from '@/src/lib/api';
import { symbol } from '@/src/lib/currency';
import { Card } from '@/src/ui/components';

type Period = 'daily' | 'weekly' | 'monthly';

const DEFAULT_BG = 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200';

export default function Dashboard() {
  const { colors, mode, toggle } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>('monthly');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const d = await api(`/dashboard?period=${p}`);
      setData(d);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(period); }, [load, period]));

  const doLogout = async () => { await logout(); router.replace('/auth'); };
  const sym = data?.primary_symbol || '$';
  const initial = (user?.name || 'F')[0].toUpperCase();
  const bgUri = user?.background_image || DEFAULT_BG;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ImageBackground
        testID="dashboard-hero"
        source={{ uri: bgUri }}
        style={{ paddingTop: insets.top + 12, paddingBottom: 22, paddingHorizontal: 20 }}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', mode === 'dark' ? 'rgba(18,22,20,0.7)' : 'rgba(0,0,0,0.35)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable testID="dashboard-avatar" onPress={() => router.push('/settings')} style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.brandTertiary, alignItems: 'center', justifyContent: 'center' }}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={{ width: 44, height: 44 }} />
            ) : (
              <Text style={{ color: colors.onBrandTertiary, fontSize: 18, fontWeight: '800' }}>{initial}</Text>
            )}
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6 }}>
              Hi, {user?.name?.split(' ')[0] || 'Farmer'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2, fontSize: 12 }}>Your farm at a glance</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable testID="settings-btn" onPress={() => router.push('/settings')} style={[styles.iconBtnHero]}>
              <Ionicons name="settings-outline" size={16} color="#fff" />
            </Pressable>
            <Pressable testID="theme-toggle" onPress={toggle} style={[styles.iconBtnHero]}>
              <Ionicons name={mode === 'dark' ? 'sunny' : 'moon'} size={16} color="#fff" />
            </Pressable>
            <Pressable testID="logout-btn" onPress={doLogout} style={[styles.iconBtnHero]}>
              <Ionicons name="log-out-outline" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
      </ImageBackground>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(period)} tintColor={colors.brand} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {(['daily', 'weekly', 'monthly'] as const).map(p => (
            <Pressable
              key={p}
              testID={`period-${p}`}
              onPress={() => setPeriod(p)}
              style={{
                paddingHorizontal: 16, height: 36, borderRadius: 999, borderWidth: 1,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: period === p ? colors.brandPrimary : 'transparent',
                borderColor: period === p ? colors.brandPrimary : colors.border,
                flexShrink: 0,
              }}
            >
              <Text style={{ color: period === p ? colors.onBrandPrimary : colors.onSurface, fontWeight: '600', textTransform: 'capitalize' }}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading && !data ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <StatCard label={`Revenue (${data?.primary_currency || 'USD'})`} value={`${sym}${data?.total_revenue ?? 0}`} accent={colors.brand} testID="stat-revenue" />
              <StatCard label="Investment" value={`${sym}${data?.total_investment ?? 0}`} accent={colors.warning} testID="stat-investment" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <StatCard label="Profit" value={`${sym}${data?.profit ?? 0}`} accent={(data?.profit ?? 0) >= 0 ? colors.success : colors.error} testID="stat-profit" />
              <StatCard label="Avg Rate" value={`${sym}${data?.avg_rate ?? 0}`} accent={colors.info} testID="stat-avg-rate" />
            </View>

            {(data?.low_stock_alerts?.length || 0) > 0 && (
              <Card style={{ marginTop: 16, borderColor: colors.warning }} testID="low-stock-card">
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="warning" size={18} color={colors.warning} />
                  <Text style={{ color: colors.warning, fontWeight: '700', marginLeft: 8 }}>LOW STOCK ALERTS</Text>
                </View>
                {data.low_stock_alerts.map((a: any) => (
                  <View key={a.produce_id} testID={`alert-${a.produce_id}`} style={{
                    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
                    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider,
                  }}>
                    <Text style={{ color: colors.onSurface, fontWeight: '600' }}>{a.name}</Text>
                    <Text style={{ color: colors.warning, fontWeight: '700' }}>{a.quantity} / {a.threshold} {a.unit}</Text>
                  </View>
                ))}
              </Card>
            )}

            {Object.keys(data?.revenue_by_currency || {}).length > 1 && (
              <Card style={{ marginTop: 16 }} testID="card-revenue-currency">
                <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 12 }}>REVENUE BY CURRENCY</Text>
                {Object.entries(data.revenue_by_currency).map(([k, v]: any, i, arr) => (
                  <Row key={k} label={k} value={`${symbol(k)}${v}`} colors={colors} last={i === arr.length - 1} />
                ))}
              </Card>
            )}

            <Card style={{ marginTop: 20 }} testID="card-quantities">
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 12 }}>QUANTITIES</Text>
              <Row label="In stock" value={`${data?.total_quantity_stock ?? 0} units`} colors={colors} />
              <Row label="Sold this period" value={`${data?.total_quantity_sold ?? 0} units`} colors={colors} />
              <Row label="Sales count" value={`${data?.sales_count ?? 0}`} colors={colors} />
              <Row label="Produce items" value={`${data?.produce_count ?? 0}`} colors={colors} last />
            </Card>

            <Card style={{ marginTop: 16 }} testID="card-sales-cat">
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 12 }}>SALES BY CATEGORY ({data?.primary_currency || 'USD'})</Text>
              {Object.keys(data?.sales_by_category || {}).length === 0
                ? <Text style={{ color: colors.muted }}>No sales yet.</Text>
                : Object.entries(data.sales_by_category).map(([k, v]: any, i, arr) => (
                    <Row key={k} label={k} value={`${sym}${v}`} colors={colors} last={i === arr.length - 1} />
                  ))}
            </Card>

            <Card style={{ marginTop: 16 }} testID="card-invest-cat">
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 12 }}>INVESTMENTS BY CATEGORY ({data?.primary_currency || 'USD'})</Text>
              {Object.keys(data?.investment_by_category || {}).length === 0
                ? <Text style={{ color: colors.muted }}>No investments yet.</Text>
                : Object.entries(data.investment_by_category).map(([k, v]: any, i, arr) => (
                    <Row key={k} label={k} value={`${sym}${v}`} colors={colors} last={i === arr.length - 1} />
                  ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, accent, testID }: any) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={{
      flex: 1, backgroundColor: colors.surfaceSecondary,
      borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16,
    }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{label.toUpperCase()}</Text>
      <Text style={{ color: accent, fontSize: 22, fontWeight: '800', marginTop: 8 }}>{value}</Text>
    </View>
  );
}

function Row({ label, value, colors, last }: any) {
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: colors.divider,
    }}>
      <Text style={{ color: colors.onSurface }}>{label}</Text>
      <Text style={{ color: colors.onSurface, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtnHero: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
});
