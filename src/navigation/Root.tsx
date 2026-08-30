import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/lib/theme';
import { useAuth } from '@/lib/store';
import { setAuthToken } from '@/lib/api';

import LoginScreen from '@/screens/LoginScreen';
import POSScreen from '@/screens/POSScreen';
import InventoryScreen from '@/screens/InventoryScreen';
import ExpensesScreen from '@/screens/ExpensesScreen';
import SettingsScreen from '@/screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function Tabs() {
  const insets = useSafeAreaInsets();
  // edgeToEdgeEnabled pushes app under nav bar; inset.bottom can be >30 on gesture nav
  const bottomPad = Math.max(insets.bottom, 8);
  const tabHeight = 58 + bottomPad;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: tabHeight,
          paddingBottom: bottomPad,
          paddingTop: 6,
          backgroundColor: '#fff',
          borderTopColor: colors.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontWeight: '800', fontSize: 11 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="POS"
        component={POSScreen}
        options={{
          tabBarLabel: 'البيع',
          tabBarIcon: ({ color }) => <TabIcon label="◉" color={color} />,
        }}
      />
      <Tab.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{
          tabBarLabel: 'المخزن',
          tabBarIcon: ({ color }) => <TabIcon label="▦" color={color} />,
        }}
      />
      <Tab.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{
          tabBarLabel: 'المصروفات',
          tabBarIcon: ({ color }) => <TabIcon label="₿" color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'الإعدادات',
          tabBarIcon: ({ color }) => <TabIcon label="⚙" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontWeight: '900' }}>{label}</Text>
    </View>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    primary: colors.accent,
    card: '#fff',
    text: colors.ink,
    border: colors.line,
  },
};

export default function RootNav() {
  const { user, token, load } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load().finally(() => setReady(true));
  }, [load]);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>جارٍ التحميل…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {user ? (
          <Stack.Screen name="App" component={Tabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
