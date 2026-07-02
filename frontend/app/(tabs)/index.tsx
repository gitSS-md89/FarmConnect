import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '@/src/theme/ThemeContext';
import { useAuth } from '@/src/auth/AuthContext';
import { api } from '@/src/lib/api';
import { ScreenHeader, Card } from '@/src/ui/components';

type Period = 'daily' | 'weekly' | 'monthly';

export default function Dashboard() {
  const { colors, mode, toggle } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScreenHeader
        testID="dashboard-header"
        title={`Hi, ${user?.name?.split(' ')[0] || 'Farmer'} 👋`}
        subtitle="Your farm at a glance"
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable testID="theme-toggle" onPress={toggle} style={[styles.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
              <Ionicons name={mode === 'dark' ? 'sunny' : 'moon'} size={18} color={colors.onSurface} />
            </Pressable>
            <Pressable testID="logout-btn" onPress={doLogout} style={[styles.iconBtn, { backgroundColor: colors.surfaceTertiary }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.onSurface} />
            </Pressable>
          </View>
        }
      />

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
              <StatCard label="Revenue" value={`$${data?.total_revenue ?? 0}`} accent={colors.brand} testID="stat-revenue" />
              <StatCard label="Investment" value={`$${data?.total_investment ?? 0}`} accent={colors.warning} testID="stat-investment" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <StatCard label="Profit" value={`$${data?.profit ?? 0}`} accent={(data?.profit ?? 0) >= 0 ? colors.success : colors.error} testID="stat-profit" />
              <StatCard label="Avg Rate" value={`$${data?.avg_rate ?? 0}`} accent={colors.info} testID="stat-avg-rate" />
            </View>

            <Card style={{ marginTop: 20 }} testID="card-quantities">
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 12 }}>QUANTITIES</Text>
              <Row label="In stock" value={`${data?.total_quantity_stock ?? 0} units`} colors={colors} />
              <Row label="Sold this period" value={`${data?.total_quantity_sold ?? 0} units`} colors={colors} />
              <Row label="Sales count" value={`${data?.sales_count ?? 0}`} colors={colors} />
              <Row label="Produce items" value={`${data?.produce_count ?? 0}`} colors={colors} last />
            </Card>

            <Card style={{ marginTop: 16 }} testID="card-sales-cat">
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 12 }}>SALES BY CATEGORY</Text>
              {Object.keys(data?.sales_by_category || {}).length === 0
                ? <Text style={{ color: colors.muted }}>No sales yet.</Text>
                : Object.entries(data.sales_by_category).map(([k, v]: any, i, arr) => (
                    <Row key={k} label={k} value={`$${v}`} colors={colors} last={i === arr.length - 1} />
                  ))}
            </Card>

            <Card style={{ marginTop: 16 }} testID="card-invest-cat">
              <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 12 }}>INVESTMENTS BY CATEGORY</Text>
              {Object.keys(data?.investment_by_category || {}).length === 0
                ? <Text style={{ color: colors.muted }}>No investments yet.</Text>
                : Object.entries(data.investment_by_category).map(([k, v]: any, i, arr) => (
                    <Row key={k} label={k} value={`$${v}`} colors={colors} last={i === arr.length - 1} />
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
});
