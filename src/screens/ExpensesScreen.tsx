import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, Linking, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Input, Btn, Empty } from '@/components/ui';
import { colors } from '@/lib/theme';
import { fetchExpenses, addExpenseApi, fetchShiftReport, closeShift } from '@/lib/api';
import type { ExpenseRow } from '@/lib/types';
import { fmtEGP, waLink } from '@/lib/utils';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' } as never);
  } catch {
    return iso;
  }
}

export default function ExpensesScreen() {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shift, setShift] = useState<{ totalSales: number; expenses: number; cash: number; net: number; text?: string; ownerWhatsapp?: string; invoices?: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        fetchExpenses().catch(() => ({ expenses: [] as ExpenseRow[] })),
        fetchShiftReport().catch(() => null),
      ]);
      setExpenses((e as { expenses: ExpenseRow[] }).expenses || []);
      if (s) setShift(s as never);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [e, s] = await Promise.all([
        fetchExpenses().catch(() => ({ expenses: [] as ExpenseRow[] })),
        fetchShiftReport().catch(() => null),
      ]);
      setExpenses((e as { expenses: ExpenseRow[] }).expenses || []);
      if (s) setShift(s as never);
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalExpenses = expenses.reduce((a, b) => a + Number(b.amount || 0), 0);

  async function handleAdd() {
    if (!reason.trim()) return Alert.alert('تنبيه', 'السبب مطلوب');
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return Alert.alert('تنبيه', 'المبلغ غير صالح');
    if (reason.trim().length < 2) return Alert.alert('تنبيه', 'السبب قصير جداً');
    try {
      await addExpenseApi(reason.trim(), n);
      setReason('');
      setAmount('');
      load();
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذر الحفظ');
    }
  }

  async function handleShiftClose(andSendWapp = false) {
    // Confirm destructive
    Alert.alert('تقفيل الشيفت', 'سيتم حفظ إجمالي المبيعات والمصروفات وإقفال الشيفت الحالي. متابعة؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'تقفيل',
        style: 'destructive',
        onPress: async () => {
          try {
            await closeShift({});
            Alert.alert('تم', 'تم تقفيل الشيفت');
            // reload first to get fresh text/owner phone
            const fresh = await fetchShiftReport().catch(() => shift);
            const txt = (fresh as { text?: string } | null)?.text || shift?.text || `تقرير الشيفت — مبيعات ${fmtEGP(shift?.totalSales || 0)} — مصروفات ${fmtEGP(totalExpenses)} — صافي ${fmtEGP(shift ? shift.cash : 0)}`;
            if (andSendWapp) {
              const phone = (fresh as { ownerWhatsapp?: string } | null)?.ownerWhatsapp || shift?.ownerWhatsapp || '';
              if (!phone) {
                Alert.alert('تنبيه', 'رقم واتساب المالك غير مسجل — احفظه من الإعدادات > الاتصال (للمالك على الويب أو الموبايل)');
              } else {
                const url = waLink(phone, txt);
                Linking.openURL(url).catch(() => Alert.alert('تعذر فتح واتساب', url));
              }
            }
            load();
          } catch (e: unknown) {
            Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذر تقفيل الشيفت');
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 100 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <View style={{ gap: 12 }}>
          <Card>
            <Text style={{ fontWeight: '900', color: colors.primary }}>تسجيل مصروفات</Text>
            <View style={{ gap: 8, marginTop: 10 }}>
              <View>
                <Text style={{ fontWeight: '800', fontSize: 11, marginBottom: 6, color: colors.ink }}>السبب *</Text>
                <Input placeholder="أكياس، فواتير، صيانة…" value={reason} onChangeText={setReason} textAlign="right" returnKeyType="next" />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', fontSize: 11, marginBottom: 6, color: colors.ink }}>المبلغ (ج.م) *</Text>
                  <Input placeholder="0.00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} textAlign="right" returnKeyType="done" onSubmitEditing={handleAdd} />
                </View>
                <Btn title="تسجيل" variant="danger" onPress={handleAdd} style={{ minWidth: 96 }} />
              </View>
            </View>
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '900', color: colors.primary }}>سجل مصروفات الشيفت الحالي</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{expenses.length} بند</Text>
            </View>
            {expenses.length === 0 ? <Empty text={loading ? 'جارٍ التحميل…' : 'لا توجد مصروفات في هذا الشيفت'} /> : null}
            {expenses.map((e) => (
              <View
                key={e.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={1}>
                    {e.reason}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDate(e.created_at)}</Text>
                </View>
                <Text style={{ fontWeight: '900', color: colors.danger, marginLeft: 8 }}>{fmtEGP(Number(e.amount))}</Text>
              </View>
            ))}
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                justifyContent: 'space-between',
                backgroundColor: colors.errorBg,
                borderWidth: 1,
                borderColor: '#fecaca',
                padding: 12,
                borderRadius: 12,
              }}
            >
              <Text style={{ fontWeight: '800' }}>إجمالي المصروفات</Text>
              <Text style={{ fontWeight: '900', color: colors.danger }}>{fmtEGP(totalExpenses)}</Text>
            </View>
          </Card>

          <Card>
            <Text style={{ fontWeight: '900', color: colors.primary }}>تقفيل الشيفت (End Shift)</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>يتم الحساب من قاعدة البيانات السحابية منذ آخر تقفيل — مطابق تماماً لتقرير الويب.</Text>
            {shift ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text>إجمالي المبيعات</Text>
                  <Text style={{ fontWeight: '900', color: colors.accent }}>{fmtEGP(shift.totalSales)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text>المصروفات</Text>
                  <Text style={{ fontWeight: '900', color: colors.danger }}>{fmtEGP(shift.expenses ?? totalExpenses)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text>الصافي (كاش)</Text>
                  <Text style={{ fontWeight: '900' }}>{fmtEGP(shift.cash ?? shift.totalSales - (shift.expenses ?? totalExpenses))}</Text>
                </View>
                {shift.invoices != null ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text>عدد الفواتير</Text>
                    <Text style={{ fontWeight: '800' }}>{shift.invoices}</Text>
                  </View>
                ) : null}
                {shift.text ? (
                  <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 10, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: colors.ink, lineHeight: 18, textAlign: 'right' }}>{shift.text}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>جارٍ تحميل تقرير الشيفت…</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Btn title="تقفيل + واتساب" variant="secondary" onPress={() => handleShiftClose(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Btn title="تقفيل الشيفت" onPress={() => handleShiftClose(false)} />
              </View>
            </View>
            <Pressable
              onPress={load}
              style={{ marginTop: 8, alignItems: 'center', padding: 10, minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: colors.accent, fontWeight: '800' }}>تحديث ↻</Text>
            </Pressable>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
