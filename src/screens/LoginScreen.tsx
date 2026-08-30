import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Input, Btn } from '@/components/ui';
import { colors } from '@/lib/theme';
import { loginWorker, setAuthToken, getWebBaseUrl, fetchCanSignup, signupAdmin } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { SUPPORT_WHATSAPP_DISPLAY, supportWaLink } from '@/lib/utils';

export default function LoginScreen() {
  const { setAuth } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // signup state
  const [signupName, setSignupName] = useState('');
  const [signupPin, setSignupPin] = useState('');
  const [signupConfirm, setSignupConfirm] = useState('');
  const [showSignupPin, setShowSignupPin] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupErr, setSignupErr] = useState<string | null>(null);
  const [canSignup, setCanSignup] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetchCanSignup();
        if (mounted) setCanSignup(r.canSignup);
      } catch {
        // on network error keep signup visible — server will enforce anyway
        if (mounted) setCanSignup(null);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogin() {
    if (!name.trim() || !pin.trim()) {
      setErr('اسم المستخدم والرمز مطلوبان');
      return;
    }
    if (pin.length < 4) {
      setErr('الرمز قصير جداً — 4 أحرف على الأقل');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await loginWorker(name.trim(), pin.trim());
      if (!res.access_token) {
        throw new Error('لم يرجع السيرفر رمز الدخول — تأكد من Supabase config');
      }
      await setAuth(res.user as never, res.access_token);
      setAuthToken(res.access_token);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر تسجيل الدخول';
      if (msg.includes('Network') || msg.includes('لا يمكن الوصول')) {
        setErr(`${msg}\n\nالسيرفر: ${getWebBaseUrl()} — تأكد أن الهاتف والكمبيوتر على نفس الواي فاي وشغّل: npx next dev --hostname 0.0.0.0`);
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    const n = signupName.trim();
    const p = signupPin.trim();
    const c = signupConfirm.trim();
    if (!n || n.length < 2) {
      setSignupErr('أدخل اسم مستخدم (حرفان على الأقل)');
      return;
    }
    if (!p || p.length < 6) {
      setSignupErr('الرمز يجب أن يكون 6 أحرف على الأقل');
      return;
    }
    if (/^(0+|1+|123456|000000)$/.test(p)) {
      setSignupErr('رمز ضعيف — اختر رمزاً أقوى');
      return;
    }
    if (!c) {
      setSignupErr('أكد الرمز السري');
      return;
    }
    if (p !== c) {
      setSignupErr('الرمزان غير متطابقين');
      return;
    }
    if (canSignup === false) {
      setSignupErr('تم إنشاء حساب المسؤول بالفعل — لا يمكن إنشاء حساب جديد إلا عبر المسؤول');
      return;
    }
    setSignupLoading(true);
    setSignupErr(null);
    try {
      const res = await signupAdmin(n, p);
      if (!res.access_token) {
        // fallback: account created but auto-login failed — prompt to login
        Alert.alert('تم إنشاء حساب المسؤول', 'تم إنشاء حساب المسؤول بنجاح — سجّل دخولك الآن بنفس البيانات.');
        setTab('login');
        setName(n);
        setPin('');
        setCanSignup(false);
        return;
      }
      await setAuth(res.user as never, res.access_token);
      setAuthToken(res.access_token);
      Alert.alert('مرحباً', `تم إنشاء حساب المسؤول — مرحباً ${res.user.display_name || n}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر إنشاء الحساب';
      if (msg.includes('المسؤول بالفعل') || msg.includes('403')) {
        setCanSignup(false);
      }
      if (msg.includes('Network') || msg.includes('لا يمكن الوصول')) {
        setSignupErr(`${msg}\n\nالسيرفر: ${getWebBaseUrl()}`);
      } else {
        setSignupErr(msg);
      }
    } finally {
      setSignupLoading(false);
    }
  }

  function switchTab(which: 'login' | 'signup') {
    if (which === 'signup' && canSignup === false) {
      setSignupErr('تم إنشاء حساب المسؤول بالفعل — سجّل دخولك كمسؤول لإنشاء حسابات العمال من لوحة الويب.');
      return;
    }
    setTab(which);
    setErr(null);
    setSignupErr(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top + 8}>
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16, flexGrow: 1, justifyContent: 'center', paddingBottom: 24 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={{ alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>أيوب</Text>
            </View>
            <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 20 }}>سوبر ماركت أيوب</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>للنظم الذكية — تسجيل الدخول</Text>
            <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 4 }}>السيرفر: {getWebBaseUrl()}</Text>
          </View>

          <Card>
            {/* Auth Tabs */}
            <View style={{ flexDirection: 'row', gap: 8, backgroundColor: '#eef3f8', padding: 4, borderRadius: 12, marginBottom: 14 }}>
              <Pressable
                onPress={() => switchTab('login')}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tab === 'login' ? '#fff' : 'transparent',
                  borderWidth: tab === 'login' ? 1 : 0,
                  borderColor: colors.line,
                  shadowColor: tab === 'login' ? '#14213d' : 'transparent',
                  shadowOpacity: tab === 'login' ? 0.08 : 0,
                  shadowRadius: 8,
                }}
              >
                <Text style={{ fontWeight: '900', color: tab === 'login' ? colors.primary : colors.muted, fontSize: 13 }}>تسجيل دخول</Text>
              </Pressable>
              <Pressable
                onPress={() => switchTab('signup')}
                disabled={canSignup === false}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tab === 'signup' ? '#fff' : 'transparent',
                  borderWidth: tab === 'signup' ? 1 : 0,
                  borderColor: colors.line,
                  opacity: canSignup === false ? 0.45 : 1,
                }}
              >
                <Text style={{ fontWeight: '900', color: tab === 'signup' ? colors.primary : colors.muted, fontSize: 12 }}>
                  إنشاء حساب {canSignup === false ? '🔒' : ''}
                </Text>
              </Pressable>
            </View>

            {tab === 'login' ? (
              <>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
                  أدخل اسم المستخدم وكلمة المرور — جميع الأسماء فريدة (لا يوجد اسم محجوز)
                </Text>
                <View style={{ gap: 10 }}>
                  <View>
                    <Text style={s.label}>
                      اسم المستخدم<Text style={{ color: colors.danger }}> *</Text>
                    </Text>
                    <Input
                      placeholder="مثال: أحمد"
                      value={name}
                      onChangeText={setName}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textAlign="right"
                      returnKeyType="next"
                      accessibilityLabel="اسم المستخدم"
                    />
                  </View>
                  <View>
                    <Text style={s.label}>
                      الرمز السري<Text style={{ color: colors.danger }}> *</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Input
                          placeholder="••••"
                          value={pin}
                          onChangeText={setPin}
                          secureTextEntry={!showPin}
                          keyboardType="number-pad"
                          onSubmitEditing={handleLogin}
                          returnKeyType="done"
                          textAlign="right"
                          autoCorrect={false}
                        />
                      </View>
                      <Pressable
                        onPress={() => setShowPin((v) => !v)}
                        style={{ height: 48, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eef3f8', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', minWidth: 64 }}
                        hitSlop={8}
                      >
                        <Text style={{ fontWeight: '800', color: colors.primary }}>{showPin ? 'إخفاء' : 'إظهار'}</Text>
                      </Pressable>
                    </View>
                  </View>

                  {err ? (
                    <View style={{ backgroundColor: colors.errorBg, borderWidth: 1, borderColor: '#fecaca', padding: 10, borderRadius: 10 }}>
                      <Text style={{ color: '#7f1d1d', fontWeight: '700', fontSize: 12, textAlign: 'right' }}>{err}</Text>
                    </View>
                  ) : null}

                  <Btn title="دخول" onPress={handleLogin} loading={loading} />
                  <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>يتم حفظ الجلسة بأمان على الجهاز. سيتم تسجيل الخروج عند حذف التطبيق.</Text>
                  {canSignup === false ? (
                    <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 2 }}>حساب المسؤول موجود — إنشاء العمال يتم من لوحة الويب (الإعدادات → الموظفون).</Text>
                  ) : canSignup === true ? (
                    <Pressable onPress={() => switchTab('signup')} style={{ alignItems: 'center', padding: 6 }}>
                      <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>ليس لديك حساب؟ أنشئ حساب المسؤول الآن</Text>
                    </Pressable>
                  ) : checking ? (
                    <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>جارٍ التحقق من حالة الحساب...</Text>
                  ) : null}
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 10, textAlign: 'center' }}>
                  هذا متاح فقط عند أول تشغيل — قبل وجود أي حساب. سيتم إنشاؤك كـ <Text style={{ fontWeight: '900', color: colors.primary }}>مسؤول (Admin)</Text> بصلاحيات كاملة، وبعدها تُنشئ باقي العمال من الإعدادات.
                </Text>
                {canSignup === false ? (
                  <View style={{ backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fbd38d', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                    <Text style={{ color: '#92400e', fontWeight: '800', fontSize: 12, textAlign: 'right' }}>🔒 تم إنشاء حساب المسؤول بالفعل</Text>
                    <Text style={{ color: '#92400e', fontSize: 11, marginTop: 4, textAlign: 'right' }}>لا يمكن إنشاء حساب جديد من هنا. سجّل دخولك كمسؤول لإنشاء حسابات العمال من لوحة الويب (الإعدادات → الموظفون).</Text>
                  </View>
                ) : null}
                <View style={{ gap: 10, opacity: canSignup === false ? 0.55 : 1 }} pointerEvents={canSignup === false ? 'none' : 'auto'}>
                  <View>
                    <Text style={s.label}>
                      اسم المستخدم للمسؤول<Text style={{ color: colors.danger }}> *</Text>
                    </Text>
                    <Input
                      placeholder="مثال: أحمد"
                      value={signupName}
                      onChangeText={setSignupName}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textAlign="right"
                      returnKeyType="next"
                    />
                  </View>
                  <View>
                    <Text style={s.label}>
                      الرمز السري<Text style={{ color: colors.danger }}> *</Text>
                      <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 10 }}> (≥6 أحرف، تجنب 000000/123456)</Text>
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Input
                          placeholder="••••••"
                          value={signupPin}
                          onChangeText={setSignupPin}
                          secureTextEntry={!showSignupPin}
                          textAlign="right"
                          autoCorrect={false}
                          returnKeyType="next"
                        />
                      </View>
                      <Pressable
                        onPress={() => setShowSignupPin((v) => !v)}
                        style={{ height: 48, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#eef3f8', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', minWidth: 64 }}
                      >
                        <Text style={{ fontWeight: '800', color: colors.primary }}>{showSignupPin ? 'إخفاء' : 'إظهار'}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View>
                    <Text style={s.label}>
                      تأكيد الرمز<Text style={{ color: colors.danger }}> *</Text>
                    </Text>
                    <Input
                      placeholder="••••••"
                      value={signupConfirm}
                      onChangeText={setSignupConfirm}
                      secureTextEntry={!showSignupPin}
                      textAlign="right"
                      autoCorrect={false}
                      onSubmitEditing={handleSignup}
                      returnKeyType="done"
                    />
                  </View>

                  {signupErr ? (
                    <View style={{ backgroundColor: colors.errorBg, borderWidth: 1, borderColor: '#fecaca', padding: 10, borderRadius: 10 }}>
                      <Text style={{ color: '#7f1d1d', fontWeight: '700', fontSize: 12, textAlign: 'right' }}>{signupErr}</Text>
                    </View>
                  ) : null}

                  <Btn title="إنشاء حساب المسؤول" onPress={handleSignup} loading={signupLoading} disabled={canSignup === false} />

                  <Pressable onPress={() => switchTab('login')} style={{ alignItems: 'center', padding: 6 }}>
                    <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 12 }}>لديك حساب؟ سجّل دخول</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Card>

          <Pressable
            onPress={() => Linking.openURL(supportWaLink('مرحبا، أحتاج مساعدة في تسجيل الدخول لنظام سوبر ماركت أيوب')).catch(() => Alert.alert('تعذر فتح واتساب', SUPPORT_WHATSAPP_DISPLAY))}
            style={{ backgroundColor: '#25D366', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>الدعم الفني واتساب — {SUPPORT_WHATSAPP_DISPLAY}</Text>
          </Pressable>
          <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 4 }}>تواصل مباشرة مع الدعم الفني عند أي مشكلة في الدخول</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  label: { color: colors.ink, fontWeight: '800', fontSize: 12, marginBottom: 6, textAlign: 'right' },
});
