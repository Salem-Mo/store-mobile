import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, Modal, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Input, Btn, Badge, Empty } from '@/components/ui';
import { colors } from '@/lib/theme';
import { fetchProducts, checkout } from '@/lib/api';
import { useCart, useUI } from '@/lib/store';
import type { Product } from '@/lib/types';
import { fmtEGP } from '@/lib/utils';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { enqueueSale, getPending, removePending } from '@/lib/offlineQueue';
import { useSyncOnReconnect } from '@/hooks/useSyncOnReconnect';

export default function POSScreen() {
  const { lines, addPiece, addWeight, setQtyById, removeById, clear, total } = useCart();
  const { posTab, setPosTab } = useUI();
  const insets = useSafeAreaInsets();
  useSyncOnReconnect();
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [weightId, setWeightId] = useState<string>('');
  const [grams, setGrams] = useState<string>('');
  const [paid, setPaid] = useState<string>('');
  const [showPay, setShowPay] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [pendingCount, setPendingCount] = useState(0);
  const lastScanRef = useRef(0);
  const isScanningRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchProducts();
      setProducts(p);
      const pend = await getPending();
      setPendingCount(pend.length);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذر تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const p = await fetchProducts();
      setProducts(p);
      const pend = await getPending();
      setPendingCount(pend.length);
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => (posTab === 'piece' ? p.unit_type === 'piece' : p.unit_type === 'weight'))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.barcode.toLowerCase().includes(needle))
      .slice(0, 40);
  }, [products, q, posTab]);

  const weightProduct = useMemo(() => products.find((p) => p.id === weightId) || null, [products, weightId]);
  const weightTotal = useMemo(() => {
    const g = Number(grams);
    if (!weightProduct || !Number.isFinite(g) || g <= 0) return 0;
    return +((g / 1000) * weightProduct.sell_price).toFixed(2);
  }, [grams, weightProduct]);

  const cartTotal = total();

  async function handleCheckout() {
    if (lines.length === 0) return Alert.alert('تنبيه', 'السلة فارغة');
    const paidNum = Number(paid);
    if (!Number.isFinite(paidNum) || paidNum < cartTotal) return Alert.alert('تنبيه', 'المبلغ المدفوع أقل من الإجمالي');

    const payload = lines.map((l) => ({
      barcode: l.barcode,
      name: l.name,
      price: l.price,
      qty: l.qty,
      type: l.unit,
    }));

    try {
      await checkout(cartTotal, payload);
      const change = +(paidNum - cartTotal).toFixed(2);
      Alert.alert('تم البيع', `الباقي: ${fmtEGP(change)}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      clear();
      setPaid('');
      setShowPay(false);
      // try to flush pending
      const pend = await getPending();
      for (const p of pend) {
        try {
          await checkout(p.total, p.items as never);
          await removePending(p.id);
        } catch {}
      }
      const pend2 = await getPending();
      setPendingCount(pend2.length);
      load();
    } catch (e: unknown) {
      // offline -> queue
      const msg = e instanceof Error ? e.message : '';
      const offline = msg.includes('Network') || msg.includes('fetch') || msg.includes('Failed') || msg.includes('لا يمكن الوصول');
      if (offline) {
        await enqueueSale(cartTotal, payload);
        Alert.alert('تم الحفظ محلياً', 'لا يوجد اتصال — سيتم إرسال الفاتورة تلقائياً عند عودة الإنترنت');
        clear();
        setShowPay(false);
        const pend = await getPending();
        setPendingCount(pend.length);
      } else {
        Alert.alert('تعذر إتمام البيع', msg || 'حاول مرة أخرى');
      }
    }
  }

  const onBarcodeScanned = useCallback(
    (barcode: string) => {
      if (isScanningRef.current) return;
      const now = Date.now();
      if (now - lastScanRef.current < 1500) return;
      lastScanRef.current = now;
      isScanningRef.current = true;
      setShowScan(false);
      setTimeout(() => { isScanningRef.current = false; }, 1200);
      const p = products.find((x) => x.barcode === barcode);
      if (!p) return Alert.alert('غير موجود', `لا يوجد منتج بالباركود ${barcode}`);
      if (p.unit_type === 'weight') {
        setPosTab('weight');
        setWeightId(p.id);
        return;
      }
      if (p.quantity <= 0) return Alert.alert('نفد المخزون', p.name);
      addPiece(p, 1);
      Haptics.selectionAsync().catch(() => {});
    },
    [products, addPiece, setPosTab]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={s.header}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>نقطة البيع</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {pendingCount > 0 ? (
            <View style={{ backgroundColor: colors.warningBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
              <Text style={{ color: '#7c3d00', fontWeight: '800', fontSize: 11 }}>{pendingCount} معلّق</Text>
            </View>
          ) : null}
          <Pressable onPress={onRefresh} style={{ padding: 6 }}>
            <Text style={{ color: '#b9c8df', fontSize: 12, fontWeight: '800' }}>تحديث ↻</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 120 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Tabs — 48px+ thumb targets */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['piece', 'weight'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setPosTab(t)}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: posTab === t ? colors.accent : '#fff',
                borderWidth: 1,
                borderColor: posTab === t ? colors.accent : colors.line,
              }}
            >
              <Text style={{ fontWeight: '800', color: posTab === t ? '#fff' : colors.primary }}>{t === 'piece' ? 'مبيعات القطع' : 'مبيعات الأوزان'}</Text>
            </Pressable>
          ))}
        </View>

        {posTab === 'piece' ? (
          <Card>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input
                  placeholder="ابحث بالاسم أو الباركود…"
                  value={q}
                  onChangeText={setQ}
                  returnKeyType="search"
                  textAlign="right"
                  autoCorrect={false}
                  accessibilityLabel="بحث المنتجات"
                />
              </View>
              <Btn
                title="مسح"
                variant="secondary"
                onPress={async () => {
                  if (!permission?.granted) {
                    const r = await requestPermission();
                    if (!r.granted) return Alert.alert('الكاميرا', 'السماح بالكاميرا مطلوب لمسح الباركود');
                  }
                  lastScanRef.current = 0;
                  setShowScan(true);
                }}
                style={{ minWidth: 88 }}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              {loading ? <Text style={{ color: colors.muted }}>جارٍ التحميل…</Text> : null}
              {filtered.length === 0 && !loading ? <Empty text="لا توجد نتائج — جرّب كلمة أخرى أو امسح الباركود" /> : null}
              {filtered.map((p) => (
                <View
                  key={p.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: colors.ink }}>{p.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>{p.barcode} • {fmtEGP(p.sell_price)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {p.quantity <= 0 ? (
                      <Badge text="نفد" tone="danger" />
                    ) : p.quantity < 5 ? (
                      <Badge text={`باقي ${p.quantity}`} tone="warn" />
                    ) : (
                      <Badge text={`متاح ${p.quantity}`} tone="ok" />
                    )}
                    <Btn title="إضافة" onPress={() => addPiece(p, 1)} style={{ minWidth: 84 }} disabled={p.quantity <= 0} />
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={{ fontWeight: '800', color: colors.primary, marginBottom: 8 }}>مبيعات الأوزان / الكيلو</Text>
            <View style={{ gap: 10 }}>
              <Input placeholder="ابحث عن صنف موزون…" value={q} onChangeText={setQ} textAlign="right" autoCorrect={false} />
              <View style={{ gap: 6 }}>
                <Text style={s.label}>صنف الوزن</Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 10,
                    backgroundColor: '#fbfcfe',
                    overflow: 'hidden',
                    maxHeight: 220,
                  }}
                >
                  <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {filtered.slice(0, 12).map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => setWeightId(item.id)}
                        style={{
                          padding: 12,
                          backgroundColor: weightId === item.id ? '#e6f7f0' : '#fff',
                          borderBottomWidth: 1,
                          borderBottomColor: colors.line,
                        }}
                      >
                        <Text style={{ fontWeight: weightId === item.id ? '800' : '600', color: colors.ink }}>
                          {item.name} — {fmtEGP(item.sell_price)}/كجم
                        </Text>
                      </Pressable>
                    ))}
                    {filtered.length === 0 ? (
                      <View style={{ padding: 14, alignItems: 'center' }}>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>لا توجد أصناف موزونة مطابقة</Text>
                      </View>
                    ) : null}
                  </ScrollView>
                </View>
                {weightProduct ? (
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      سعر الكيلو: <Text style={{ fontWeight: '800', color: colors.ink }}>{fmtEGP(weightProduct.sell_price)}</Text>
                    </Text>
                    <Badge text={`متاح ${weightProduct.quantity} كجم`} tone={weightProduct.quantity < 1 ? 'danger' : 'ok'} />
                  </View>
                ) : null}
              </View>
              <View>
                <Text style={s.label}>الوزن بالجرام *</Text>
                <Input
                  placeholder="مثال: 250"
                  keyboardType="number-pad"
                  value={grams}
                  onChangeText={setGrams}
                  returnKeyType="done"
                  textAlign="right"
                />
                <Text style={{ marginTop: 6, fontWeight: '800', color: colors.accent }}>الإجمالي: {fmtEGP(weightTotal)}</Text>
              </View>
              <Btn
                title="إضافة للفاتورة"
                onPress={() => {
                  if (!weightProduct) return Alert.alert('تنبيه', 'اختر صنف الوزن');
                  const g = Number(grams);
                  if (!Number.isFinite(g) || g <= 0) return Alert.alert('تنبيه', 'أدخل وزنًا صحيحًا');
                  if (g / 1000 > weightProduct.quantity + 1e-9) return Alert.alert('تنبيه', `الوزن أكبر من المتاح (${weightProduct.quantity} كجم)`);
                  addWeight(weightProduct, g);
                  setGrams('');
                  Haptics.selectionAsync().catch(() => {});
                }}
              />
            </View>
          </Card>
        )}

        {/* Cart */}
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '900', color: colors.primary }}>السلة ({lines.length})</Text>
            {lines.length > 0 ? (
              <Pressable
                onPress={() =>
                  Alert.alert('تفريغ السلة', 'هل أنت متأكد؟', [
                    { text: 'إلغاء', style: 'cancel' },
                    { text: 'تفريغ', style: 'destructive', onPress: clear },
                  ])
                }
                style={{ padding: 8, minWidth: 48, alignItems: 'center' }}
              >
                <Text style={{ color: colors.danger, fontWeight: '800' }}>تفريغ</Text>
              </Pressable>
            ) : null}
          </View>
          {lines.length === 0 ? (
            <Empty icon="🧺" text="السلة فارغة — أضف منتجاً للبدء" />
          ) : (
            <View style={{ marginTop: 8, gap: 8 }}>
              {lines.map((l) => (
                <View
                  key={l.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '800', color: colors.ink }} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      {fmtEGP(l.price)} × {l.unit === 'weight' ? `${(l.qty * 1000).toFixed(0)}g` : l.qty} = {fmtEGP(l.lineTotal)}
                    </Text>
                  </View>
                  {l.unit === 'piece' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pressable onPress={() => setQtyById(l.id, Math.max(0, l.qty - 1))} style={s.stepBtn} hitSlop={8}>
                        <Text style={s.stepTxt}>−</Text>
                      </Pressable>
                      <Text style={{ minWidth: 24, textAlign: 'center', fontWeight: '800' }}>{l.qty}</Text>
                      <Pressable onPress={() => setQtyById(l.id, l.qty + 1)} style={s.stepBtn} hitSlop={8}>
                        <Text style={s.stepTxt}>+</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Pressable onPress={() => removeById(l.id)} style={{ padding: 12, minWidth: 48, alignItems: 'center' }} hitSlop={8}>
                    <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 18 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <View
            style={{
              marginTop: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: colors.successBg,
              borderWidth: 1,
              borderColor: '#a7f3d0',
              padding: 12,
              borderRadius: 12,
            }}
          >
            <Text style={{ fontWeight: '900', color: colors.ink }}>الإجمالي</Text>
            <Text style={{ fontWeight: '900', color: colors.accent, fontSize: 18 }}>{fmtEGP(cartTotal)}</Text>
          </View>
          <Btn title={`إتمام البيع — ${fmtEGP(cartTotal)}`} onPress={() => setShowPay(true)} style={{ marginTop: 12 }} disabled={lines.length === 0} />
        </Card>
      </ScrollView>

      {/* Checkout sheet */}
      <Modal visible={showPay} animationType="slide" transparent onRequestClose={() => setShowPay(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(13,24,46,0.62)', justifyContent: 'flex-end' }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.bottom}>
            <View
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 16,
                gap: 12,
                paddingBottom: 16 + insets.bottom,
                maxHeight: '88%',
              }}
            >
              <View style={{ width: 44, height: 4, borderRadius: 999, backgroundColor: colors.line, alignSelf: 'center' }} />
              <Text style={{ fontWeight: '900', color: colors.primary, textAlign: 'center' }}>إتمام البيع</Text>
              <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10 }}>
                  {lines.map((l) => (
                    <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                      <Text style={{ color: colors.ink, flex: 1, fontSize: 12 }} numberOfLines={1}>
                        {l.name} × {l.unit === 'weight' ? `${(l.qty * 1000).toFixed(0)}g` : l.qty}
                      </Text>
                      <Text style={{ fontWeight: '800', fontSize: 12 }}>{fmtEGP(l.lineTotal)}</Text>
                    </View>
                  ))}
                  <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontWeight: '900' }}>الإجمالي</Text>
                    <Text style={{ fontWeight: '900', color: colors.accent }}>{fmtEGP(cartTotal)}</Text>
                  </View>
                </View>
              </ScrollView>
              <View style={{ gap: 6 }}>
                <Text style={s.label}>المبلغ المدفوع *</Text>
                <Input placeholder="0.00" keyboardType="decimal-pad" value={paid} onChangeText={setPaid} textAlign="right" returnKeyType="done" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[cartTotal, cartTotal + 10, cartTotal + 50, cartTotal + 100].slice(0, 4).map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => setPaid(String(Math.ceil(v)))}
                      style={{
                        flex: 1,
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: '#eef3f8',
                        borderWidth: 1,
                        borderColor: colors.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 11 }}>{Math.ceil(v)}</Text>
                    </Pressable>
                  ))}
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: colors.successBg,
                    borderWidth: 1,
                    borderColor: '#a7f3d0',
                    padding: 12,
                    borderRadius: 10,
                  }}
                >
                  <Text>الباقي</Text>
                  <Text style={{ fontWeight: '900', color: colors.accent, fontSize: 16 }}>
                    {fmtEGP(Math.max(0, Number(paid || 0) - cartTotal))}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Btn title="إلغاء" variant="ghost" onPress={() => setShowPay(false)} />
                </View>
                <View style={{ flex: 2 }}>
                  <Btn title="تأكيد البيع" onPress={handleCheckout} />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Barcode scanner */}
      <Modal visible={showScan} animationType="slide" onRequestClose={() => setShowScan(false)}>
        <View style={{ flex: 1, backgroundColor: '#101827' }}>
          <SafeAreaView edges={['top']} style={{ backgroundColor: '#101827' }}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>مسح الباركود</Text>
              <Btn title="إغلاق" variant="danger" onPress={() => setShowScan(false)} />
            </View>
          </SafeAreaView>
          <View style={{ flex: 1 }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'qr', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={(e) => {
                const v = (e as unknown as { data: string; raw?: string }).data || (e as unknown as { raw: string }).raw;
                if (v) onBarcodeScanned(String(v));
              }}
            />
            {/* viewfinder overlay */}
            <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 260, height: 160, borderWidth: 2, borderColor: '#45d3a7', borderRadius: 12, backgroundColor: 'transparent' }} />
            </View>
          </View>
          <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, backgroundColor: '#101827' }}>
            <Text style={{ color: '#a9b8ce', textAlign: 'center', fontSize: 12 }}>وجّه الكاميرا نحو الباركود — سيتم إضافته تلقائياً</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: { color: colors.muted, fontWeight: '800', fontSize: 11, marginBottom: 6 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#eef3f8',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { fontSize: 18, fontWeight: '900', color: colors.primary },
});
