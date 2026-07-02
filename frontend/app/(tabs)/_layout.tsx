import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/theme/ThemeContext';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 68,
          paddingTop: 6,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="analytics" size={size} color={color} />,
          tabBarButtonTestID: 'tab-dashboard',
        }}
      />
      <Tabs.Screen
        name="farms"
        options={{
          title: 'Farms',
          tabBarIcon: ({ color, size }) => <Ionicons name="leaf" size={size} color={color} />,
          tabBarButtonTestID: 'tab-farms',
        }}
      />
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'AI',
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size} color={color} />,
          tabBarButtonTestID: 'tab-assistant',
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} />,
          tabBarButtonTestID: 'tab-market',
        }}
      />
    </Tabs>
  );
}
