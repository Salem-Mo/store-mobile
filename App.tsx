import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nManager, Platform, Text, View, Pressable, Linking } from 'react-native';
import RootNav from '@/navigation/Root';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

if (Platform.OS !== 'web') {
  try {
    if (!I18nManager.isRTL) {
      I18nManager.allowRTL(true);
    }
    // Force RTL layout if device supports it — but avoid forcing if already RTL
    // I18nManager.forceRTL(true) would require reload; we keep allowRTL only to respect user restart.
  } catch {}
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: unknown) {
    console.error('[App]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f3f6fa' }}>
          <Text style={{ fontWeight: '900', color: '#14213d', textAlign: 'center' }}>حدث خطأ</Text>
          <Text style={{ color: '#718096', fontSize: 12, marginTop: 8, textAlign: 'center' }}>{String(this.state.error.message)}</Text>
          <Text style={{ color: '#9aa7b8', fontSize: 11, marginTop: 8, textAlign: 'center' }}>حاول إعادة تشغيل التطبيق — إذا تكرر، تواصل مع الدعم</Text>
          <Pressable
            onPress={() => Linking.openURL('https://wa.me/201281338512?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7%D8%8C%20%D8%A3%D8%AD%D8%AA%D8%A7%D8%AC%20%D9%85%D8%B3%D8%A7%D8%B9%D8%AF%D8%A9%20%D9%81%D9%8A%20%D9%86%D8%B8%D8%A7%D9%85%20%D8%B3%D9%88%D8%A8%D8%B1%20%D9%85%D8%A7%D8%B1%D9%83%D8%AA%20%D8%A3%D9%8A%D9%88%D8%A8').catch(() => {})}
            style={{ marginTop: 16, backgroundColor: '#25D366', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, textAlign: 'center' }}>الدعم واتساب — ‎+20 128 133 8512</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          {/* edgeToEdgeEnabled=true makes status bar translucent — light content on navy header */}
          <StatusBar style="light" backgroundColor="#14213d" translucent={Platform.OS === 'android'} />
          <RootNav />
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
