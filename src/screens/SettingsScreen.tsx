import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  Pressable,
  Linking,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Input, Btn, Badge, Empty } from '@/components/ui';
import { colors } from '@/lib/theme';
import { useAuth } from '@/lib/store';
import {
  setAuthToken,
  getWebBaseUrl,
  isLocalServerUrl,
  fetchOwnerWhatsapp,
  updateOwnerWhatsapp,
  fetchWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  WorkerRow,
  PERM_DEFS,
  ROLE_PRESETS,
} from '@/lib/api';
import { SUPPORT_WHATSAPP, SUPPORT_WHATSAPP_DISPLAY, supportWaLink } from '@/lib/utils';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'workers' | 'contact' | 'system'>('workers');
  const [wa, setWa] = useState<string | null>(null);
  const [waInput, setWaInput] = useState('');
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [waSuccess, setWaSuccess] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || (user?.permissions || []).includes('all');

  // ── workers state
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [refreshingWorkers, setRefreshingWorkers] = useState(false);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [searchWorkers, setSearchWorkers] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // form
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formPin, setFormPin] = useState('');
  const [formConfirm, setFormConfirm] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [formActive, setFormActive] = useState(true);
  const [formPerms, setFormPerms] = useState<Set<string>>(new Set());
  const [formNameErr, setFormNameErr] = useState<string | null>(null);
  const [formPinErr, setFormPinErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadWa = useCallback(async () => {
    try {
      const v = await fetchOwnerWhatsapp();
      setWa(v || '');
      setWaInput(v || '');
      setWaError(null);
      setWaSuccess(null);
    } catch {
      setWa('');
      setWaError('تعذر تحميل الرقم — تحقق من الاتصال');
    }
  }, []);

  const handleSaveWa = useCallback(async () => {
    if (!isAdmin) {
      Alert.alert('تنبيه', 'تعديل رقم الواتساب متاح للمالك فقط.');
      return;
    }
    const digits = waInput.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      setWaError('رقم غير صحيح — يجب 10-15 رقماً (مثال 201012345678 بدون +)');
      setWaSuccess(null);
      return;
    }
    setWaSaving(true);
    setWaError(null);
    setWaSuccess(null);
    try {
      const res = await updateOwnerWhatsapp(digits);
      const saved = res.number || digits;
      setWa(saved);
      setWaInput(saved);
      setWaSuccess('تم حفظ الرقم ✓ — سيُستخدم لإرسال تقرير الشيفت');
      Alert.alert('تم', 'تم حفظ رقم واتساب المالك بنجاح');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر حفظ الرقم';
      if (msg.includes('صلاحية') || msg.includes('403') || msg.includes('Unauthorized')) {
        setWaError('ليس لديك صلاحية — هذه الميزة للمالك فقط');
      } else {
        setWaError(msg);
      }
    } finally {
      setWaSaving(false);
    }
  }, [waInput, isAdmin]);

  const loadWorkers = useCallback(async (opts?: { silent?: boolean }) => {
    if (!isAdmin) return;
    const silent = opts?.silent ?? false;
    if (!silent) setLoadingWorkers(true);
    setWorkersError(null);
    try {
      const list = await fetchWorkers();
      // API returns all users (admin+workers). Keep only workers for management, but keep admin count for stats
      const onlyWorkers = list.filter((w) => w.role === 'worker');
      // sort: active first, then name
      onlyWorkers.sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return (a.display_name || a.username).localeCompare(b.display_name || b.username, 'ar');
      });
      setWorkers(onlyWorkers);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر تحميل الموظفين';
      // 403 already means permission denial — show friendly
      if (msg.includes('صلاحية') || msg.includes('403') || msg.toLowerCase().includes('permission')) {
        setWorkersError('ليس لديك صلاحية عرض الموظفين — هذه الميزة للمالك فقط.');
      } else {
        setWorkersError(msg);
      }
    } finally {
      setLoadingWorkers(false);
      setRefreshingWorkers(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (tab === 'workers' && isAdmin) loadWorkers();
  }, [tab, isAdmin, loadWorkers]);

  // initial load if admin and default tab workers
  useEffect(() => {
    if (isAdmin) loadWorkers();
  }, [isAdmin, loadWorkers]);

  // preload whatsapp (admin can edit, worker can view) — keep in sync with server
  useEffect(() => {
    loadWa();
  }, [loadWa]);

  useEffect(() => {
    if (tab === 'contact') loadWa();
  }, [tab, loadWa]);

  const filteredWorkers = useMemo(() => {
    const needle = searchWorkers.trim().toLowerCase();
    return workers.filter((w) => {
      if (filterActive === 'active' && !w.active) return false;
      if (filterActive === 'inactive' && w.active) return false;
      if (!needle) return true;
      const hay = `${w.username} ${w.display_name} ${(w.permissions || []).join(' ')}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [workers, searchWorkers, filterActive]);

  const stats = useMemo(() => {
    const total = workers.length;
    const active = workers.filter((w) => w.active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [workers]);

  function openCreate() {
    if (!isAdmin) return Alert.alert('تنبيه', 'إدارة الموظفين متاحة للمالك فقط.');
    setEditingWorker(null);
    setFormName('');
    setFormPin('');
    setFormConfirm('');
    setShowPin(false);
    setFormActive(true);
    setFormPerms(new Set(['pos', 'weights']));
    setFormNameErr(null);
    setFormPinErr(null);
    setShowWorkerModal(true);
  }

  function openEdit(w: WorkerRow) {
    setEditingWorker(w);
    setFormName(w.username);
    setFormPin('');
    setFormConfirm('');
    setShowPin(false);
    setFormActive(w.active !== false);
    setFormPerms(new Set(w.permissions || []));
    setFormNameErr(null);
    setFormPinErr(null);
    setShowWorkerModal(true);
  }

  function togglePerm(key: string) {
    setFormPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyPreset(perms: string[]) {
    setFormPerms(new Set(perms));
  }

  function toggleAllPerms(v: boolean) {
    if (v) setFormPerms(new Set(PERM_DEFS.map((p) => p.key)));
    else setFormPerms(new Set());
  }

  async function handleSaveWorker() {
    // validation
    const name = formName.trim();
    const pin = formPin.trim();
    const confirm = formConfirm.trim();
    let hasErr = false;
    if (!name || name.length < 2) {
      setFormNameErr('اسم المستخدم مطلوب — حرفان على الأقل');
      hasErr = true;
    } else {
      setFormNameErr(null);
    }

    const isEdit = !!editingWorker;

    // PIN validation: required on create, optional on edit (if empty => no change)
    if (!isEdit || pin.length > 0) {
      if (!isEdit && !pin) {
        setFormPinErr('الرمز مطلوب — 6 أحرف على الأقل');
        hasErr = true;
      } else if (pin && pin.length < 6) {
        setFormPinErr('الرمز يجب أن يكون 6 أحرف على الأقل');
        hasErr = true;
      } else if (pin && /^(0+|1+|123456|000000)$/.test(pin)) {
        setFormPinErr('رمز ضعيف — اختر رمزاً أقوى');
        hasErr = true;
      } else if (pin && confirm !== pin) {
        setFormPinErr('الرمزان غير متطابقين — تأكد من التأكيد');
        hasErr = true;
      } else {
        setFormPinErr(null);
      }
    } else {
      setFormPinErr(null);
    }

    if (hasErr) return;

    setSubmitting(true);
    try {
      const perms = Array.from(formPerms);
      if (isEdit && editingWorker) {
        await updateWorker(editingWorker.id, {
          username: name,
          pin: pin || undefined,
          permissions: perms,
          active: formActive,
        });
        setShowWorkerModal(false);
        await loadWorkers({ silent: true });
        Alert.alert('تم', `تم تحديث ${name} بنجاح`);
      } else {
        await createWorker({ username: name, pin, permissions: perms, active: formActive });
        setShowWorkerModal(false);
        await loadWorkers({ silent: true });
        Alert.alert('تم', `تمت إضافة ${name} — يمكنه تسجيل الدخول الآن`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر الحفظ';
      Alert.alert('خطأ', msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDeleteWorker(w: WorkerRow) {
    Alert.alert(
      'حذف الموظف',
      `هل تريد تعطيل ${w.display_name || w.username}؟\nسيتم حظره ومنعه من الدخول — يمكن إعادة تفعيله لاحقاً من الويب لو لزم.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تعطيل',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorker(w.id);
              await loadWorkers({ silent: true });
            } catch (e: unknown) {
              Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذر الحذف');
            }
          },
        },
      ]
    );
  }

  async function handleLogout() {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'خروج',
        style: 'destructive',
        onPress: async () => {
          setAuthToken(null);
          await logout();
        },
      },
    ]);
  }

  function openWeb() {
    const base = getWebBaseUrl();
    if (!base) {
      Alert.alert('تنبيه', 'أدخل EXPO_PUBLIC_WEB_URL الصحيح في .env (المصدر الوحيد للرابط)');
      return;
    }
    if (isLocalServerUrl(base)) {
      Alert.alert('تنبيه', `EXPO_PUBLIC_WEB_URL الحالي ${base} يعمل فقط على نفس الواي فاي. للتوزيع استخدم رابط Vercel في .env.`);
    }
    Linking.openURL(base).catch(() => Alert.alert('تعذر فتح الرابط', base));
  }

  const onRefreshWorkers = useCallback(async () => {
    setRefreshingWorkers(true);
    await loadWorkers({ silent: true });
  }, [loadWorkers]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        refreshControl={tab === 'workers' && isAdmin ? <RefreshControl refreshing={refreshingWorkers} onRefresh={onRefreshWorkers} tintColor={colors.accent} /> : undefined}
      >
        <View style={{ gap: 12 }}>
          {/* Profile header */}
          <Card style={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#22365f',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{(user?.username || '؟').slice(0, 2)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 14 }}>{user?.display_name || user?.username}</Text>
                  <View
                    style={{
                      backgroundColor: isAdmin ? colors.successBg : '#eef3f8',
                      borderWidth: 1,
                      borderColor: isAdmin ? '#b9efd9' : colors.line,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: isAdmin ? colors.accent : colors.muted, fontWeight: '800', fontSize: 10 }}>{isAdmin ? 'المالك' : 'عامل'}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {(user?.permissions || []).length ? (user?.permissions || []).slice(0, 4).join(' • ') : 'بدون صلاحيات خاصة'} {(user?.permissions?.length || 0) > 4 ? ' +' + ((user?.permissions?.length || 0) - 4) : ''}
                </Text>
              </View>
              <Btn title="خروج" variant="danger" onPress={handleLogout} style={{ paddingHorizontal: 14 }} />
            </View>
            <Pressable
              onPress={openWeb}
              style={{
                marginTop: 10,
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: colors.line,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                alignSelf: 'flex-start',
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>السيرفر: {getWebBaseUrl()}</Text>
            </Pressable>
          </Card>

          {/* Tabs */}
          <Card style={{ padding: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                ['workers', 'الموظفون'],
                ['contact', 'الاتصال'],
                ['system', 'النظام'],
              ].map(([k, label]) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    setTab(k as never);
                    if (k === 'contact') loadWa();
                    if (k === 'workers' && isAdmin) loadWorkers();
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: tab === k ? colors.primary : '#fff',
                    borderWidth: 1,
                    borderColor: tab === k ? colors.primary : colors.line,
                    opacity: pressed ? 0.9 : 1,
                    shadowColor: tab === k ? '#14213d' : 'transparent',
                    shadowOpacity: tab === k ? 0.12 : 0,
                    shadowRadius: 8,
                    elevation: tab === k ? 2 : 0,
                  })}
                >
                  <Text style={{ fontWeight: '900', color: tab === k ? '#fff' : colors.primary, fontSize: 12 }}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── Workers Tab ── */}
            {tab === 'workers' ? (
              <View style={{ marginTop: 14, gap: 12 }}>
                {/* Admin gate */}
                {!isAdmin ? (
                  <View style={{ gap: 10 }}>
                    <View
                      style={{
                        backgroundColor: colors.warningBg,
                        borderWidth: 1,
                        borderColor: '#fbd38d',
                        padding: 14,
                        borderRadius: 14,
                        flexDirection: 'row',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#92400e', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '900' }}>🔒</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#92400e', fontWeight: '900', fontSize: 12 }}>إدارة الموظفين — للمالك فقط</Text>
                        <Text style={{ color: '#92400e', fontSize: 11, marginTop: 2, lineHeight: 16 }}>تحتاج صلاحية المالك لإضافة أو تعديل العمال. تواصل مع المالك لترقية حسابك.</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14 }}>
                      <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 12 }}>صلاحياتك الحالية</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {(user?.permissions || []).length ? (
                          (user?.permissions || []).map((p) => (
                            <View key={p} style={{ backgroundColor: '#eef3f8', borderWidth: 1, borderColor: colors.line, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 }}>
                              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '700' }}>{p}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={{ color: colors.muted, fontSize: 11 }}>بدون صلاحيات خاصة</Text>
                        )}
                      </View>
                    </View>
                    <Btn title="فتح لوحة الويب (للمالك)" variant="secondary" onPress={openWeb} />
                  </View>
                ) : (
                  <>
                    {/* Stats + Search */}
                    <View style={{ gap: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 13 }}>فريق العمل</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <View style={{ backgroundColor: '#eef3f8', borderWidth: 1, borderColor: colors.line, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 }}>
                            <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '800' }}>{stats.total} إجمالي</Text>
                          </View>
                          <View style={{ backgroundColor: colors.successBg, borderWidth: 1, borderColor: '#b9efd9', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 }}>
                            <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>{stats.active} نشط</Text>
                          </View>
                          {stats.inactive > 0 ? (
                            <View style={{ backgroundColor: colors.errorBg, borderWidth: 1, borderColor: '#feb2b2', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 }}>
                              <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '800' }}>{stats.inactive} موقوف</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                          <Input
                            placeholder="بحث بالاسم أو الصلاحية…"
                            value={searchWorkers}
                            onChangeText={setSearchWorkers}
                            textAlign="right"
                            autoCorrect={false}
                            style={{ backgroundColor: '#fbfcfe' }}
                          />
                        </View>
                        <Pressable
                          onPress={openCreate}
                          style={({ pressed }) => ({
                            height: 48,
                            minWidth: 108,
                            paddingHorizontal: 14,
                            borderRadius: 12,
                            backgroundColor: colors.accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                            opacity: pressed ? 0.88 : 1,
                            shadowColor: colors.accent,
                            shadowOpacity: 0.18,
                            shadowRadius: 10,
                            elevation: 3,
                          })}
                        >
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>+ إضافة</Text>
                        </Pressable>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[
                          ['all', 'الكل'],
                          ['active', 'نشط'],
                          ['inactive', 'موقوف'],
                        ].map(([k, label]) => (
                          <Pressable
                            key={k}
                            onPress={() => setFilterActive(k as never)}
                            style={{
                              flex: 1,
                              height: 38,
                              borderRadius: 10,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: filterActive === k ? colors.primary : '#fff',
                              borderWidth: 1,
                              borderColor: filterActive === k ? colors.primary : colors.line,
                            }}
                          >
                            <Text style={{ fontWeight: '800', color: filterActive === k ? '#fff' : colors.primary, fontSize: 11 }}>{label}</Text>
                          </Pressable>
                        ))}
                        <Pressable
                          onPress={() => loadWorkers({ silent: true })}
                          style={{
                            height: 38,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: colors.line,
                          }}
                        >
                          <Text style={{ fontWeight: '800', color: colors.muted, fontSize: 11 }}>تحديث</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* List */}
                    {loadingWorkers ? (
                      <View style={{ padding: 18, alignItems: 'center' }}>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>جارٍ تحميل الموظفين…</Text>
                      </View>
                    ) : workersError ? (
                      <View style={{ backgroundColor: colors.errorBg, borderWidth: 1, borderColor: '#fecaca', padding: 14, borderRadius: 12 }}>
                        <Text style={{ color: '#7f1d1d', fontWeight: '800', fontSize: 12, textAlign: 'center' }}>{workersError}</Text>
                        <View style={{ marginTop: 10 }}>
                          <Btn title="إعادة المحاولة" variant="secondary" onPress={() => loadWorkers()} />
                        </View>
                      </View>
                    ) : filteredWorkers.length === 0 ? (
                      <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', padding: 18, borderRadius: 14, alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 22 }}>👥</Text>
                        <Text style={{ color: colors.primary, fontWeight: '900', fontSize: 13 }}>
                          {workers.length === 0 ? 'لا يوجد عمال بعد' : 'لا نتائج مطابقة للبحث'}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
                          {workers.length === 0 ? 'أضف أول عامل — اختر اسماً فريداً ورمزاً 6 أحرف على الأقل وحدد الصلاحيات.' : 'جرّب كلمة أخرى أو غيّر فلتر النشط/الموقوف.'}
                        </Text>
                        {workers.length === 0 ? <Btn title="+ إضافة أول عامل" onPress={openCreate} style={{ marginTop: 6 }} /> : null}
                      </View>
                    ) : (
                      <View style={{ gap: 10 }}>
                        {filteredWorkers.map((w) => {
                          const initials = (w.display_name || w.username).slice(0, 2);
                          const perms = w.permissions || [];
                          return (
                            <View
                              key={w.id}
                              style={{
                                backgroundColor: '#fff',
                                borderWidth: 1,
                                borderColor: w.active === false ? '#fecaca' : colors.line,
                                borderRadius: 16,
                                padding: 12,
                                gap: 10,
                                shadowColor: '#14213d',
                                shadowOpacity: 0.06,
                                shadowRadius: 10,
                                elevation: 2,
                              }}
                            >
                              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                                <View
                                  style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 22,
                                    backgroundColor: w.active === false ? '#fde8e8' : colors.primary,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: 1,
                                    borderColor: w.active === false ? '#feb2b2' : '#22365f',
                                  }}
                                >
                                  <Text style={{ color: w.active === false ? '#7f1d1d' : '#fff', fontWeight: '900' }}>{initials}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Text style={{ fontWeight: '900', color: colors.ink, fontSize: 13 }}>{w.display_name || w.username}</Text>
                                    {w.active === false ? <Badge text="موقوف" tone="danger" /> : <Badge text="نشط" tone="ok" />}
                                    {w.role === 'admin' ? <Badge text="مالك" tone="warn" /> : null}
                                  </View>
                                  <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                                    @{w.username} • {w.created_at ? new Date(w.created_at).toLocaleDateString('ar-EG') : '—'}
                                  </Text>
                                </View>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: w.active === false ? colors.danger : colors.accent, borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4 }} />
                              </View>

                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {perms.length ? (
                                  perms.map((p) => {
                                    const def = PERM_DEFS.find((d) => d.key === p);
                                    const label = def?.label || p;
                                    return (
                                      <View
                                        key={p}
                                        style={{
                                          backgroundColor: '#f0fdf4',
                                          borderWidth: 1,
                                          borderColor: '#bbf7d0',
                                          paddingVertical: 4,
                                          paddingHorizontal: 8,
                                          borderRadius: 999,
                                        }}
                                      >
                                        <Text style={{ color: '#065f46', fontSize: 10, fontWeight: '800' }}>{label}</Text>
                                      </View>
                                    );
                                  })
                                ) : (
                                  <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 }}>
                                    <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700' }}>بدون صلاحيات</Text>
                                  </View>
                                )}
                              </View>

                              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                                <Pressable
                                  onPress={() => openEdit(w)}
                                  style={({ pressed }) => ({
                                    flex: 1,
                                    height: 40,
                                    borderRadius: 10,
                                    backgroundColor: '#eef3f8',
                                    borderWidth: 1,
                                    borderColor: colors.line,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: pressed ? 0.85 : 1,
                                  })}
                                >
                                  <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 12 }}>تعديل</Text>
                                </Pressable>
                                <Pressable
                                  onPress={() => handleDeleteWorker(w)}
                                  style={({ pressed }) => ({
                                    flex: 1,
                                    height: 40,
                                    borderRadius: 10,
                                    backgroundColor: colors.danger,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: pressed ? 0.88 : 1,
                                  })}
                                >
                                  <Text style={{ fontWeight: '900', color: '#fff', fontSize: 12 }}>تعطيل</Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                        <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 4 }}>
                          {filteredWorkers.length} من {workers.length} • اسحب للتحديث • اضغط تعديل للصلاحيات
                        </Text>
                      </View>
                    )}

                    <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14 }}>💡</Text>
                      <Text style={{ color: colors.muted, fontSize: 11, flex: 1, lineHeight: 16 }}>
                        نفس البيانات يراها الويب فوراً دون مزامنة. يمكنك أيضاً إدارة العمال من لوحة الويب: الإعدادات → الموظفون
                      </Text>
                      <Pressable onPress={openWeb} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }}>
                        <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 10 }}>فتح الويب</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ) : null}

            {tab === 'contact' ? (
              <View style={{ marginTop: 12, gap: 12 }}>
                <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 13 }}>رقم واتساب المالك</Text>
                <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>
                  يُستخدم لإرسال تقرير الشيفت مباشرة إلى المالك. {isAdmin ? 'يمكنك تعديله وحفظه هنا — سيظهر فوراً في الويب والموبايل.' : 'يُعرض هنا للاطلاع — التعديل متاح للمالك فقط.'}
                </Text>

                {isAdmin ? (
                  <>
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontWeight: '800', fontSize: 12, color: colors.ink, textAlign: 'right' }}>
                        رقم الواتساب <Text style={{ color: colors.danger }}>*</Text>
                        <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 10 }}> — مثال 201012345678 بدون +</Text>
                      </Text>
                      <Input
                        value={waInput}
                        onChangeText={(v) => {
                          setWaInput(v);
                          if (waError) setWaError(null);
                          if (waSuccess) setWaSuccess(null);
                        }}
                        placeholder="201012345678"
                        keyboardType="phone-pad"
                        textAlign="left"
                        autoCorrect={false}
                        autoCapitalize="none"
                        style={{ textAlign: 'left', letterSpacing: 0.5, direction: 'ltr' } as never}
                        error={waError || undefined}
                      />
                      {waSuccess ? <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800', textAlign: 'right' }}>{waSuccess}</Text> : null}
                      <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 14, textAlign: 'right' }}>
                        الصيغة الدولية بدون + — 10 إلى 15 رقماً. مثال مصر 20 + رقم الموبايل، السعودية 9665…، الإمارات 9715…
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Btn title="تحديث" variant="ghost" onPress={loadWa} />
                      </View>
                      <View style={{ flex: 1.4 }}>
                        <Btn title="حفظ الرقم" onPress={handleSaveWa} loading={waSaving} />
                      </View>
                    </View>

                    <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 }}>
                      <InfoRow label="المحفوظ حالياً" value={wa == null ? 'جاري التحميل…' : wa ? `${wa} ✓` : 'غير مسجل — أضف رقماً واحفظ'} />
                      {wa ? <InfoRow label="رابط الاختبار" value={`wa.me/${wa}`} /> : null}
                    </View>

                    {wa ? (
                      <Pressable
                        onPress={() =>
                          Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent('تقرير الشيفت — اختبار من تطبيق الموبايل')}`).catch(() =>
                            Alert.alert('تعذر فتح واتساب', String(wa))
                          )
                        }
                        style={{ backgroundColor: '#25D366', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48 }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>اختبار الإرسال على واتساب ↗</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={openWeb}
                      style={{ alignItems: 'center', padding: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 10 }}
                    >
                      <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 11 }}>فتح لوحة الويب أيضاً ↗</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View
                      style={{
                        backgroundColor: colors.warningBg,
                        borderWidth: 1,
                        borderColor: '#fbd38d',
                        padding: 12,
                        borderRadius: 12,
                        flexDirection: 'row',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>🔒</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#92400e', fontWeight: '800', fontSize: 11 }}>للاطلاع فقط — التعديل للمالك فقط</Text>
                        <Text style={{ color: '#92400e', fontSize: 10, marginTop: 2, lineHeight: 14 }}>تواصل مع المالك لتغيير الرقم من تبويب الاتصال.</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 }}>
                      <InfoRow label="الرقم الحالي" value={wa == null ? 'اضغط تحديث' : wa ? `${wa} ✓` : 'غير مسجل'} />
                    </View>
                    <Btn title="تحديث الرقم" variant="secondary" onPress={loadWa} />
                  </>
                )}
              </View>
            ) : null}

            {tab === 'system' ? (
              <View style={{ marginTop: 12, gap: 12 }}>
                <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 13 }}>النظام</Text>
                <View style={{ gap: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' }}>
                  <InfoRow label="التطبيق" value="سوبر ماركت أيوب — موبايل v1.0.0" />
                  <InfoRow label="قاعدة البيانات" value="Supabase — نفس الويب" />
                  <InfoRow label="المصادقة" value="PIN آمن (scrypt)" />
                  <InfoRow label="وضع عدم الاتصال" value="قائمة انتظار محلية + مزامنة تلقائية" />
                  <InfoRow label="السيرفر" value={getWebBaseUrl()} />
                </View>
                <View style={{ backgroundColor: colors.warningBg, borderWidth: 1, borderColor: '#fbd38d', padding: 12, borderRadius: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18 }}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#92400e', fontWeight: '800', fontSize: 12 }}>تصفير كافة البيانات</Text>
                    <Text style={{ color: '#92400e', fontSize: 11, marginTop: 2 }}>يتم فقط من لوحة الويب بعد تأكيد رمز المالك و كتابة DELETE.</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', padding: 14, borderRadius: 14, gap: 10 }}>
                  <Text style={{ color: '#065f46', fontWeight: '900', fontSize: 14, textAlign: 'center' }}>الدعم الفني — واتساب</Text>
                  <Text style={{ color: '#047857', fontSize: 11, textAlign: 'center' }}>تواصل مباشرة مع الدعم الفني عبر واتساب</Text>
                  <Pressable
                    onPress={() => Linking.openURL(supportWaLink()).catch(() => Alert.alert('تعذر فتح واتساب', SUPPORT_WHATSAPP_DISPLAY))}
                    style={{ backgroundColor: '#25D366', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 50 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>تواصل واتساب — {SUPPORT_WHATSAPP_DISPLAY}</Text>
                  </Pressable>
                  <Pressable onPress={() => Linking.openURL(`tel:+${SUPPORT_WHATSAPP}`).catch(() => {})} style={{ padding: 6, alignItems: 'center' }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>أو اتصال: {SUPPORT_WHATSAPP_DISPLAY}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Card>

          {/* Feature highlight */}
          <Card style={{ padding: 14 }}>
            <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 13 }}>ميزات الموبايل — مصممة للاستخدام اليومي</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              {[
                'ماسح باركود بالكاميرا + اهتزاز عند الإضافة',
                'إدارة العمال والصلاحيات مباشرة من الموبايل (للمالك)',
                'لوحة أرقام مدمجة للكاشير بدون كيبورد النظام',
                'أزرار 48px للاستخدام بالقفاز',
                'حفظ محلي عند انقطاع النت ثم مزامنة',
                'إرسال تقرير الشيفت واتساب مباشرة',
              ].map((t) => (
                <View key={t} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.successBg, borderWidth: 1, borderColor: '#b9efd9', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.accent, fontWeight: '900', fontSize: 10 }}>✓</Text>
                  </View>
                  <Text style={{ color: colors.ink, fontSize: 12, flex: 1 }}>{t}</Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>

      {/* ── Add / Edit Worker Modal ── */}
      <Modal visible={showWorkerModal} animationType="slide" transparent onRequestClose={() => setShowWorkerModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(13,24,46,0.62)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.bottom}>
            <View
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                padding: 16,
                paddingBottom: 16 + insets.bottom,
                maxHeight: '94%',
                borderWidth: 1,
                borderColor: colors.line,
                borderBottomWidth: 0,
              }}
            >
              <View style={{ width: 44, height: 4, borderRadius: 999, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 10 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Pressable onPress={() => setShowWorkerModal(false)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.muted, fontWeight: '900' }}>✕</Text>
                </Pressable>
                <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 15, textAlign: 'center' }}>{editingWorker ? 'تعديل العامل' : 'إضافة عامل جديد'}</Text>
                <View style={{ width: 36 }} />
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                {/* Name */}
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 12, marginBottom: 6, color: colors.ink, textAlign: 'right' }}>
                    اسم المستخدم <Text style={{ color: colors.danger }}>*</Text>
                    <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 10 }}> — فريد، حرفان على الأقل</Text>
                  </Text>
                  <Input value={formName} onChangeText={(v) => { setFormName(v); if (formNameErr) setFormNameErr(null); }} placeholder="مثال: أحمد" textAlign="right" autoCapitalize="none" autoCorrect={false} error={formNameErr || undefined} />
                </View>

                {/* PIN */}
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 12, marginBottom: 6, color: colors.ink, textAlign: 'right' }}>
                    الرمز السري{' '}
                    {!editingWorker ? <Text style={{ color: colors.danger }}>*</Text> : <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 10 }}>(اتركه فارغاً لعدم التغيير)</Text>}
                    <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 10 }}> — 6 أحرف على الأقل</Text>
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        value={formPin}
                        onChangeText={(v) => { setFormPin(v); if (formPinErr) setFormPinErr(null); }}
                        placeholder={editingWorker ? '•••••• (اختياري)' : '••••••'}
                        secureTextEntry={!showPin}
                        textAlign="right"
                        autoCorrect={false}
                        keyboardType="default"
                        error={formPinErr || undefined}
                      />
                    </View>
                    <Pressable
                      onPress={() => setShowPin((v) => !v)}
                      style={{ height: 48, minWidth: 64, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#eef3f8', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 12 }}>{showPin ? 'إخفاء' : 'إظهار'}</Text>
                    </Pressable>
                  </View>
                </View>

                {formPin.length > 0 || !editingWorker ? (
                  <View>
                    <Text style={{ fontWeight: '700', fontSize: 11, marginBottom: 6, color: colors.ink, textAlign: 'right' }}>تأكيد الرمز</Text>
                    <Input value={formConfirm} onChangeText={setFormConfirm} placeholder="أعد كتابة الرمز" secureTextEntry={!showPin} textAlign="right" autoCorrect={false} />
                  </View>
                ) : null}

                {/* Active toggle */}
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 12, marginBottom: 8, color: colors.ink, textAlign: 'right' }}>حالة الحساب</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      [true, 'نشط — يمكنه الدخول'],
                      [false, 'موقوف — ممنوع الدخول'],
                    ].map(([val, label]) => (
                      <Pressable
                        key={String(val)}
                        onPress={() => setFormActive(val as boolean)}
                        style={{
                          flex: 1,
                          height: 44,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: formActive === val ? (val ? colors.successBg : colors.errorBg) : '#fff',
                          borderWidth: 1,
                          borderColor: formActive === val ? (val ? '#b9efd9' : '#feb2b2') : colors.line,
                        }}
                      >
                        <Text style={{ fontWeight: '900', color: formActive === val ? (val ? '#065f46' : '#7f1d1d') : colors.muted, fontSize: 11 }}>{label as string}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* Presets */}
                <View>
                  <Text style={{ fontWeight: '800', fontSize: 12, marginBottom: 8, color: colors.ink, textAlign: 'right' }}>قوالب سريعة</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {ROLE_PRESETS.map((preset) => {
                      const isActive = preset.perms.length === formPerms.size && preset.perms.every((p) => formPerms.has(p));
                      return (
                        <Pressable
                          key={preset.id}
                          onPress={() => applyPreset(preset.perms)}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 999,
                            backgroundColor: isActive ? colors.primary : '#fff',
                            borderWidth: 1,
                            borderColor: isActive ? colors.primary : colors.line,
                          }}
                        >
                          <Text style={{ fontWeight: '800', color: isActive ? '#fff' : colors.primary, fontSize: 11 }}>{preset.label}</Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => toggleAllPerms(false)}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }}
                    >
                      <Text style={{ fontWeight: '800', color: colors.muted, fontSize: 11 }}>مسح الكل</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => toggleAllPerms(true)}
                      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }}
                    >
                      <Text style={{ fontWeight: '800', color: colors.accent, fontSize: 11 }}>تحديد الكل</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Permissions */}
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: colors.muted, fontSize: 10 }}>{formPerms.size} صلاحية محددة</Text>
                    <Text style={{ fontWeight: '800', fontSize: 12, color: colors.ink, textAlign: 'right' }}>الصلاحيات</Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {PERM_DEFS.map((perm) => {
                      const checked = formPerms.has(perm.key);
                      return (
                        <Pressable
                          key={perm.key}
                          onPress={() => togglePerm(perm.key)}
                          style={{
                            flexDirection: 'row',
                            gap: 10,
                            alignItems: 'center',
                            padding: 12,
                            borderRadius: 12,
                            backgroundColor: checked ? '#f0fdf4' : '#fbfcfe',
                            borderWidth: 1,
                            borderColor: checked ? '#bbf7d0' : colors.line,
                          }}
                        >
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 7,
                              borderWidth: 1.5,
                              borderColor: checked ? colors.accent : colors.line,
                              backgroundColor: checked ? colors.accent : '#fff',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {checked ? <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>✓</Text> : null}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 12, textAlign: 'right' }}>{perm.label}</Text>
                            <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'right', marginTop: 1 }}>{perm.desc}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 8, lineHeight: 14 }}>
                    يمكنك تعديل الصلاحيات لاحقاً من نفس الشاشة — التغيير يطبق فوراً على جميع الأجهزة.
                  </Text>
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Btn title="إلغاء" variant="ghost" onPress={() => setShowWorkerModal(false)} />
                </View>
                <View style={{ flex: 1.6 }}>
                  <Btn title={editingWorker ? 'حفظ التعديل' : 'إضافة العامل'} onPress={handleSaveWorker} loading={submitting} />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
      <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 11, flexShrink: 1, textAlign: 'right', marginLeft: 12 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}
