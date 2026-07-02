import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/ThemeContext';

export function ScreenHeader({
  title, subtitle, right, testID,
}: { title: string; subtitle?: string; right?: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        paddingHorizontal: 20,
        backgroundColor: colors.surface,
        borderBottomColor: colors.border,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.onSurface }}>{title}</Text>
        {subtitle ? <Text style={{ color: colors.muted, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, testID }: any) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={[{
        backgroundColor: colors.surfaceSecondary,
        borderColor: colors.border, borderWidth: 1,
        borderRadius: 16, padding: 16,
      }, style]}
    >
      {children}
    </View>
  );
}

export function PrimaryButton({ label, onPress, testID, icon, disabled }: any) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: colors.brandPrimary,
        paddingVertical: 14, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row', opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon ? <Ionicons name={icon} size={16} color={colors.onBrandPrimary} style={{ marginRight: 8 }} /> : null}
      <Text style={{ color: colors.onBrandPrimary, fontWeight: '700', fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
