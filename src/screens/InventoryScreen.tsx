import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Alert,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Input, Btn, Badge, Empty } from '@/components/ui';
import { colors, radii } from '@/lib/theme';
import { fetchProducts, upsertProduct } from '@/lib/api';
import type { Product } from '@/lib/types';
import { fmtEGP } from '@/lib/utils';
import { useAuth } from '@/lib/store';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';

/* ────────────────────────────────────────────────────────── */
export default function InventoryScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const canEdit = user?.role === 'admin' || user?.permissions.includes('edit_inv') || user?.permissions.includes('all');
  const canAdd = user?.role === 'admin' || user?.permissions.includes('add_inv') || user?.permissions.includes('all');

  const [qRaw, setQRaw] = useState('');
  const [q, setQ] = useState(''); // debounced
  const [filter, setFilter] = useState<'all' | 'available' | 'low'>('all');
  const [tab, setTab] = useState<'piece' | 'weight'>('piece');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [scanMode, setScanMode] = useState<'form' | 'search'>('form');
  const lastScanRef = React.useRef(0);
  const isScanningRef = React.useRef(false);

  // form state
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<'piece' | 'weight'>('piece');
  const [errors, setErrors] = useState<{ name?: string; barcode?: string; sell?: string; qty?: string }>({});



  // debounce search 250ms
  useEffect(() => {
    const t = setTimeout(() => setQ(qRaw), 220);
    return () => clearTimeout(t);
  }, [qRaw]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await fetchProducts();
      setProducts(p);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذر تحميل المخزن');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const p = await fetchProducts();
      setProducts(p);
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // stats for chips — الكل / متوفر / ناقص
  const stats = useMemo(() => {
    const piece = products.filter((p) => p.unit_type === 'piece');
    const weight = products.filter((p) => p.unit_type === 'weight');
    const tabProducts = tab === 'piece' ? piece : weight;
    const available = tabProducts.filter((p) => p.quantity >= 5).length;
    const low = tabProducts.filter((p) => p.quantity < 5).length;
    return {
      piece: piece.length,
      weight: weight.length,
      all: tabProducts.length,
      available,
      low,
      total: products.length,
      availableAll: products.filter((p) => p.quantity >= 5).length,
      lowAll: products.filter((p) => p.quantity < 5).length,
    };
  }, [products, tab]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => p.unit_type === tab)
      .filter((p) => (filter === 'available' ? p.quantity >= 5 : filter === 'low' ? p.quantity < 5 : true))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.barcode.toLowerCase().includes(needle));
  }, [products, q, tab, filter]);

  function openAdd() {
    if (!canAdd) return Alert.alert('تنبيه', 'ليس لديك صلاحية الإضافة');
    setEditing(null);
    setName('');
    setBarcode('');
    setBuy('');
    setSell('');
    setQty('');
    setUnit(tab);
    setErrors({});
    setShowForm(true);
  }
  function openEdit(p: Product) {
    if (!canEdit) return Alert.alert('تنبيه', 'ليس لديك صلاحية التعديل');
    setEditing(p);
    setName(p.name);
    setBarcode(p.barcode);
    setBuy(String(p.buy_price));
    setSell(String(p.sell_price));
    setQty(String(p.quantity));
    setUnit(p.unit_type);
    setErrors({});
    setShowForm(true);
  }

  function validate(): boolean {
    const e: typeof errors = {};
    if (!name.trim()) e.name = 'اسم المنتج مطلوب';
    else if (name.trim().length < 2) e.name = 'الاسم قصير جداً';
    if (unit === 'piece' && !barcode.trim()) e.barcode = 'الباركود مطلوب للقطع';
    else if (barcode.trim() && barcode.trim().length < 3) e.barcode = 'الباركود قصير جداً (3+ أحرف)';
    const s = Number(sell);
    if (!sell.trim() || !Number.isFinite(s) || s < 0) e.sell = 'سعر البيع غير صالح';
    const qn = Number(qty);
    if (!qty.trim() || !Number.isFinite(qn) || qn < 0) e.qty = 'الكمية غير صالحة';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    // weight barcode optional — auto-generate if empty
    const finalBarcode = barcode.trim() || (unit === 'weight' ? `W-${Date.now().toString(36).toUpperCase()}` : '');
    if (!finalBarcode) {
      setErrors((prev) => ({ ...prev, barcode: 'الباركود مطلوب' }));
      return;
    }
    const b = Number(buy || 0);
    const s = Number(sell);
    const qn = Number(qty);
    setSubmitting(true);
    try {
      await upsertProduct({
        id: editing?.id,
        name: name.trim(),
        barcode: finalBarcode,
        buyPrice: b,
        sellPrice: s,
        qty: qn,
        type: unit,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowForm(false);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'تعذر الحفظ';
      // map duplicate barcode
      if (msg.toLowerCase().includes('barcode') || msg.includes('duplicate') || msg.includes('موجود')) {
        setErrors((prev) => ({ ...prev, barcode: 'الباركود موجود مسبقاً — استخدم باركود مختلف' }));
      }
      Alert.alert('خطأ', msg);
    } finally {
      setSubmitting(false);
    }
  }

  const onBarcodeScanned = useCallback(
    (code: string) => {
      if (isScanningRef.current) return;
      const now = Date.now();
      if (now - lastScanRef.current < 1500) return;
      lastScanRef.current = now;
      isScanningRef.current = true;
      setTimeout(() => {
        isScanningRef.current = false;
      }, 1200);
      Haptics.selectionAsync().catch(() => {});
      setShowScan(false);
      if (scanMode === 'form') {
        setBarcode(code);
        // clear barcode error if any
        setErrors((e) => ({ ...e, barcode: undefined }));
      } else {
        // search mode — fill search and switch tab automatically if product found
        const found = products.find((p) => p.barcode === code);
        if (found) setTab(found.unit_type);
        setQRaw(code);
        setQ(code);
        if (!found && canAdd) {
          // offer quick-add with scanned barcode prefilled
          setTimeout(() => {
            Alert.alert('غير موجود', `لا يوجد منتج بالباركود ${code}\nهل تريد إضافته للمخزن؟`, [
              { text: 'لا', style: 'cancel' },
              {
                text: 'إضافة +',
                onPress: () => {
                  setEditing(null);
                  setName('');
                  setBarcode(code);
                  setBuy('');
                  setSell('');
                  setQty('');
                  setUnit('piece');
                  setErrors({});
                  setShowForm(true);
                },
              },
            ]);
          }, 350);
        }
      }
    },
    [products, scanMode, canAdd]
  );

  // header counts text
  const filterLabel = filter === 'all' ? `الكل (${stats.all})` : filter === 'available' ? `متوفر (${stats.available})` : `ناقص (${stats.low})`;

  const renderProduct = useCallback(
    ({ item: p }: { item: Product }) => {
      const isOut = p.quantity <= 0;
      const isLow = !isOut && p.quantity < 5;
      const tone: 'danger' | 'warn' | 'ok' = isOut ? 'danger' : isLow ? 'warn' : 'ok';
      const badgeText = isOut ? 'نفد' : isLow ? `باقي ${p.quantity}` : `${p.quantity}`;
      const borderColor = isOut ? '#feb2b2' : isLow ? '#fbd38d' : colors.line;
      const bg = isOut ? '#fff5f5' : isLow ? '#fffbeb' : '#fff';
      const disabled = !canEdit;

      return (
        <Pressable
          onPress={() => openEdit(p)}
          disabled={disabled}
          android_ripple={{ color: '#eef3f8' }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            gap: 10,
            padding: 12,
            borderWidth: 1,
            borderColor,
            backgroundColor: pressed ? '#f8fafc' : bg,
            borderRadius: 14,
            alignItems: 'center',
            marginBottom: 8,
            opacity: disabled ? 0.9 : 1,
            // left accent indicator
            borderLeftWidth: isOut || isLow ? 3 : 1,
            borderLeftColor: isOut ? colors.danger : isLow ? '#f59e0b' : borderColor,
          })}
          accessibilityRole="button"
          accessibilityLabel={`تعديل ${p.name}`}
          hitSlop={2}
        >
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontWeight: '800', color: colors.ink, fontSize: 13, textAlign: 'right' }} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'right' }} numberOfLines={1}>
              {p.barcode ? `${p.barcode} • ` : ''}
              شراء {fmtEGP(p.buy_price)} • بيع {fmtEGP(p.sell_price)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 5, minWidth: 72 }}>
            <Badge text={badgeText} tone={tone} />
            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                fontWeight: '700',
                backgroundColor: '#eef3f8',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {p.unit_type === 'weight' ? 'كجم' : 'قطعة'}
            </Text>
          </View>
          {!disabled ? (
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: '#eef3f8',
                borderWidth: 1,
                borderColor: colors.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '900' }}>›</Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [canEdit]
  );

  const ListHeader = (
    <View style={{ gap: 12 }}>
      {/* Add product card */}
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '900', color: colors.primary, fontSize: 14, textAlign: 'right' }}>المخزن</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: 'right', lineHeight: 14 }}>
              {stats.total} صنف إجمالي • {stats.availableAll} متوفر • {stats.lowAll} ناقص • يتم الحفظ في السحابة فوراً
            </Text>
          </View>
          {canAdd ? (
            <Btn
              title="إضافة +"
              onPress={openAdd}
              style={{ minWidth: 92, paddingVertical: 10 }}
              accessibilityLabel="إضافة منتج جديد"
            />
          ) : (
            <View style={{ backgroundColor: colors.warningBg, borderWidth: 1, borderColor: '#fbd38d', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 }}>
              <Text style={{ color: '#92400e', fontSize: 10, fontWeight: '800' }}>عرض فقط</Text>
            </View>
          )}
        </View>
        {!canAdd ? (
          <View
            style={{
              marginTop: 10,
              backgroundColor: '#fff4e5',
              borderWidth: 1,
              borderColor: '#fbd38d',
              padding: 10,
              borderRadius: 10,
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 14 }}>🔒</Text>
            <Text style={{ color: '#92400e', fontSize: 11, flex: 1, lineHeight: 15, textAlign: 'right' }}>
              ليس لديك صلاحية الإضافة — اطلب من المالك ترقيتك من لوحة الويب.
            </Text>
          </View>
        ) : null}
      </Card>

      {/* Search + filters + tabs */}
      <Card style={{ padding: 14 }}>
        {/* Search */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1, position: 'relative' }}>
            <Input
              placeholder="بحث بالاسم أو الباركود…"
              value={qRaw}
              onChangeText={setQRaw}
              textAlign="right"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="بحث المنتجات"
              style={{ paddingLeft: qRaw ? 36 : 13 }}
            />
            {qRaw.length > 0 ? (
              <Pressable
                onPress={() => {
                  setQRaw('');
                  setQ('');
                }}
                style={{
                  position: 'absolute',
                  left: 6,
                  top: 6,
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: '#eef3f8',
                  borderWidth: 1,
                  borderColor: colors.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                hitSlop={6}
                accessibilityLabel="مسح البحث"
              >
                <Text style={{ color: colors.muted, fontWeight: '900', fontSize: 14 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          <Btn
            title="مسح"
            variant="secondary"
            onPress={async () => {
              if (!permission?.granted) {
                const r = await requestPermission();
                if (!r.granted) return Alert.alert('الكاميرا', 'السماح بالكاميرا مطلوب لمسح الباركود');
              }
              setScanMode('search');
              lastScanRef.current = 0;
              setShowScan(true);
            }}
            style={{ minWidth: 84, height: 48 }}
            accessibilityLabel="مسح باركود للبحث"
          />
        </View>

        {/* Stock filter segmented — الكل / متوفر / ناقص */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
          {(
            [
              ['all', `الكل`, stats.all],
              ['available', `متوفر`, stats.available],
              ['low', `ناقص`, stats.low],
            ] as const
          ).map(([k, label, count]) => {
            const active = filter === k;
            return (
              <Pressable
                key={k}
                onPress={() => setFilter(k)}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.primary : '#fff',
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.line,
                  flexDirection: 'row',
                  gap: 6,
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                hitSlop={4}
              >
                <Text style={{ fontWeight: '800', color: active ? '#fff' : colors.primary, fontSize: 11 }}>{label}</Text>
                <View
                  style={{
                    backgroundColor: active ? 'rgba(255,255,255,0.18)' : '#eef3f8',
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? 'rgba(255,255,255,0.22)' : colors.line,
                    minWidth: 26,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontWeight: '900', color: active ? '#fff' : colors.muted, fontSize: 10 }}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Piece / Weight tabs — now with counts */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {(['piece', 'weight'] as const).map((t) => {
            const count = t === 'piece' ? stats.piece : stats.weight;
            const active = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? colors.accent : '#fff',
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.line,
                  flexDirection: 'row',
                  gap: 6,
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                hitSlop={4}
              >
                <Text style={{ fontWeight: '900', color: active ? '#fff' : colors.primary, fontSize: 12 }}>
                  {t === 'piece' ? 'بالقطعة' : 'بالوزن/كجم'}
                </Text>
                <View
                  style={{
                    backgroundColor: active ? 'rgba(255,255,255,0.20)' : '#f3f6fa',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? 'rgba(255,255,255,0.28)' : colors.line,
                  }}
                >
                  <Text style={{ fontWeight: '900', color: active ? '#fff' : colors.muted, fontSize: 10 }}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Active filter hint */}
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            borderWidth: 1,
            borderColor: colors.line,
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>{filterLabel}</Text>
          <Text style={{ color: colors.muted, fontSize: 10 }}>{filtered.length} نتيجة</Text>
        </View>
      </Card>
    </View>
  );

  const ListEmpty = (
    <View style={{ marginTop: 8 }}>
      {loading ? (
        <Card style={{ padding: 16 }}>
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  height: 68,
                  borderRadius: 12,
                  backgroundColor: '#eef3f8',
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: 0.7 - i * 0.15,
                }}
              />
            ))}
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 4, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ color: colors.muted, fontSize: 12 }}>جارٍ تحميل المخزن…</Text>
            </View>
          </View>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Empty
            icon={filter !== 'all' || q ? '🔍' : '📦'}
            text={
              q
                ? `لا توجد نتائج لـ "${q}" في ${tab === 'piece' ? 'القطع' : 'الأوزان'}`
                : filter === 'available'
                  ? 'لا توجد أصناف متوفرة — كل الأصناف ناقصة'
                  : filter === 'low'
                    ? 'لا توجد أصناف ناقصة — المخزن ممتلئ 👌'
                    : tab === 'piece'
                      ? 'لا توجد منتجات بالقطعة — أضف أول صنف بالقطعة'
                      : 'لا توجد منتجات بالوزن — أضف أول صنف موزون (كجم)'
            }
          />
          {(q || filter !== 'all') && (
            <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingTop: 0, justifyContent: 'center' }}>
              {q ? (
                <Btn title="مسح البحث" variant="secondary" onPress={() => { setQRaw(''); setQ(''); }} style={{ flex: 1 }} />
              ) : null}
              {filter !== 'all' ? (
                <Btn title="عرض الكل" variant="ghost" onPress={() => setFilter('all')} style={{ flex: 1 }} />
              ) : null}
            </View>
          )}
          {!q && filter === 'all' && canAdd ? (
            <View style={{ padding: 12, paddingTop: 0 }}>
              <Btn title="إضافة أول صنف +" onPress={openAdd} />
            </View>
          ) : null}
        </Card>
      )}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* ── Navy header (parity with POSScreen) ── */}
      <View
        style={{
          backgroundColor: colors.primary,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: '#22365f',
        }}
      >
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              backgroundColor: 'rgba(255,255,255,0.10)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>▦</Text>
          </View>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>المخزن</Text>
          <View
            style={{
              backgroundColor: 'rgba(69,211,167,0.18)',
              borderWidth: 1,
              borderColor: '#45d3a7',
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <Text style={{ color: '#a7f3d0', fontWeight: '800', fontSize: 11 }}>{filtered.length} / {stats.all}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {stats.low > 0 ? (
            <View
              style={{
                backgroundColor: '#fff4e5',
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#fbd38d',
              }}
            >
              <Text style={{ color: '#92400e', fontWeight: '800', fontSize: 11 }}>
                {`${stats.low} ناقص`}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={onRefresh}
            style={{ padding: 6, minWidth: 44, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={8}
            accessibilityLabel="تحديث المخزن"
          >
            <Text style={{ color: '#b9c8df', fontSize: 12, fontWeight: '800' }}>تحديث ↻</Text>
          </Pressable>
        </View>
      </View>

      {/* ── List — FlatList with header (fixes nested scroll + gives virtualization) ── */}
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        renderItem={renderProduct}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={{
          padding: 12,
          paddingBottom: 120 + insets.bottom,
          gap: 0,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        windowSize={7}
        removeClippedSubviews
        ListFooterComponent={
          filtered.length > 0 ? (
            <View style={{ alignItems: 'center', marginTop: 8, gap: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>
                {filtered.length} نتيجة • {canEdit ? 'اضغط للتعديل' : 'العرض فقط'}
              </Text>
              {canAdd ? (
                <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>اسحب للأسفل للتحديث • استخدم البحث للوصول السريع</Text>
              ) : null}
            </View>
          ) : null
        }
      />

      {/* ── FAB for quick add — thumb zone ── */}
      {canAdd ? (
        <Pressable
          onPress={openAdd}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16 + insets.bottom + 58, // above tab bar
            width: 56,
            height: 56,
            borderRadius: 18,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#0f9d78',
            shadowOpacity: 0.28,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
            elevation: 6,
            borderWidth: 1,
            borderColor: '#0db68a',
          }}
          hitSlop={8}
          accessibilityLabel="إضافة صنف سريع"
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 26, lineHeight: 26, marginTop: -2 }}>+</Text>
        </Pressable>
      ) : null}

      {/* ── Add / Edit Modal — fixed keyboard + backdrop + scanner ── */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        {/* Backdrop — tap to close */}
        <Pressable onPress={() => !submitting && setShowForm(false)} style={{ flex: 1, backgroundColor: 'rgba(13,24,46,0.62)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ maxHeight: '92%' }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
            >
              <View
                style={{
                  backgroundColor: '#fff',
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 22,
                  padding: 16,
                  paddingBottom: 16 + insets.bottom,
                  maxHeight: '92%',
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderBottomWidth: 0,
                  shadowColor: '#14213d',
                  shadowOpacity: 0.18,
                  shadowRadius: 24,
                  elevation: 12,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 4,
                    borderRadius: 999,
                    backgroundColor: colors.line,
                    alignSelf: 'center',
                    marginBottom: 12,
                  }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Pressable
                    onPress={() => setShowForm(false)}
                    disabled={submitting}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      backgroundColor: '#f8fafc',
                      borderWidth: 1,
                      borderColor: colors.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: submitting ? 0.5 : 1,
                    }}
                    hitSlop={8}
                    accessibilityLabel="إغلاق"
                  >
                    <Text style={{ color: colors.muted, fontWeight: '900', fontSize: 14 }}>✕</Text>
                  </Pressable>
                  <Text style={{ fontWeight: '900', color: colors.primary, textAlign: 'center', fontSize: 15, flex: 1, marginHorizontal: 8 }}>
                    {editing ? 'تعديل الصنف' : 'إضافة صنف جديد'}
                  </Text>
                  <View style={{ width: 36 }} />
                </View>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
                >
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 12, marginBottom: 6, color: colors.ink, textAlign: 'right' }}>
                      اسم المنتج <Text style={{ color: colors.danger }}>*</Text>
                    </Text>
                    <Input
                      value={name}
                      onChangeText={(v) => {
                        setName(v);
                        if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
                      }}
                      placeholder="مثال: سكر 1كجم — أرز 5كجم"
                      textAlign="right"
                      autoCorrect={false}
                      returnKeyType="next"
                      editable={!submitting}
                    />
                    {errors.name ? <Text style={s.err}>{errors.name}</Text> : null}
                  </View>

                  {/* Barcode row with scan button */}
                  <View>
                    <Text style={{ fontWeight: '800', fontSize: 12, marginBottom: 6, color: colors.ink, textAlign: 'right' }}>
                      الباركود {unit === 'piece' ? <Text style={{ color: colors.danger }}>*</Text> : <Text style={{ color: colors.muted, fontWeight: '400', fontSize: 10 }}>(اختياري للوزن — يُولد تلقائياً)</Text>}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Input
                          value={barcode}
                          onChangeText={(v) => {
                            setBarcode(v);
                            if (errors.barcode) setErrors((e) => ({ ...e, barcode: undefined }));
                          }}
                          placeholder={unit === 'weight' ? 'اتركه فارغاً للأوزان أو امسح…' : '9780123456789'}
                          autoCapitalize="none"
                          autoCorrect={false}
                          textAlign="left"
                          keyboardType="default"
                          editable={!submitting}
                          style={{ textAlign: 'left' } as never}
                        />
                        {errors.barcode ? <Text style={s.err}>{errors.barcode}</Text> : null}
                      </View>
                      <Pressable
                        onPress={async () => {
                          if (!permission?.granted) {
                            const r = await requestPermission();
                            if (!r.granted) return Alert.alert('الكاميرا', 'السماح بالكاميرا مطلوب لمسح الباركود');
                          }
                          setScanMode('form');
                          lastScanRef.current = 0;
                          setShowScan(true);
                        }}
                        disabled={submitting}
                        style={{
                          height: 48,
                          minWidth: 84,
                          paddingHorizontal: 14,
                          borderRadius: radii.md,
                          backgroundColor: '#eef3f8',
                          borderWidth: 1,
                          borderColor: colors.line,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: submitting ? 0.5 : 1,
                        }}
                        accessibilityLabel="مسح الباركود للصنف"
                      >
                        <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 12 }}>مسح 📷</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Buy / Sell */}
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Text style={s.label}>سعر الشراء</Text>
                      <Input
                        value={buy}
                        onChangeText={setBuy}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        textAlign="right"
                        returnKeyType="next"
                        editable={!submitting}
                      />
                      <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' }}>اختياري — للتكلفة</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Text style={s.label}>
                        سعر البيع <Text style={{ color: colors.danger }}>*</Text>
                      </Text>
                      <Input
                        value={sell}
                        onChangeText={(v) => {
                          setSell(v);
                          if (errors.sell) setErrors((e) => ({ ...e, sell: undefined }));
                        }}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        textAlign="right"
                        returnKeyType="next"
                        editable={!submitting}
                      />
                      {errors.sell ? <Text style={s.err}>{errors.sell}</Text> : <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' }}>ج.م للوحدة</Text>}
                    </View>
                  </View>

                  {/* Unit + Qty */}
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={s.label}>نوع الوحدة</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {(['piece', 'weight'] as const).map((u) => {
                          const active = unit === u;
                          return (
                            <Pressable
                              key={u}
                              onPress={() => !submitting && setUnit(u)}
                              disabled={submitting}
                              style={{
                                flex: 1,
                                height: 48,
                                borderRadius: 10,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: active ? colors.primary : '#fff',
                                borderWidth: 1,
                                borderColor: active ? colors.primary : colors.line,
                                opacity: submitting ? 0.6 : 1,
                              }}
                            >
                              <Text style={{ fontWeight: '800', color: active ? '#fff' : colors.primary, fontSize: 12 }}>{u === 'piece' ? 'قطعة' : 'وزن'}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 10, marginTop: 6, textAlign: 'right' }}>
                        {unit === 'weight' ? 'يُباع بالكيلو (الكمية كجم)' : 'يُباع بالقطعة'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 140 }}>
                      <Text style={s.label}>
                        {unit === 'weight' ? 'الكمية (كجم) *' : 'الكمية (قطع) *'}
                      </Text>
                      <Input
                        value={qty}
                        onChangeText={(v) => {
                          setQty(v);
                          if (errors.qty) setErrors((e) => ({ ...e, qty: undefined }));
                        }}
                        keyboardType="decimal-pad"
                        placeholder={unit === 'weight' ? 'مثال: 12.5' : 'مثال: 24'}
                        textAlign="right"
                        returnKeyType="done"
                        onSubmitEditing={submit}
                        editable={!submitting}
                      />
                      {errors.qty ? (
                        <Text style={s.err}>{errors.qty}</Text>
                      ) : (
                        <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4, textAlign: 'right' }}>
                          {unit === 'weight' ? 'يمكن كسور مثل 0.5' : 'عدد صحيح'}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Helper for weight price per kg display */}
                  {unit === 'weight' && sell && qty ? (
                    <View
                      style={{
                        backgroundColor: colors.successBg,
                        borderWidth: 1,
                        borderColor: '#a7f3d0',
                        padding: 10,
                        borderRadius: 10,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ color: colors.muted, fontSize: 11 }}>قيمة المخزون الحالية</Text>
                      <Text style={{ fontWeight: '900', color: colors.accent, fontSize: 12 }}>
                        {fmtEGP(Number(sell || 0) * Number(qty || 0))}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Btn title="إلغاء" variant="ghost" onPress={() => setShowForm(false)} disabled={submitting} />
                  </View>
                  <View style={{ flex: 1.7 }}>
                    <Btn
                      title={submitting ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديل ✓' : 'إضافة للمخزن +'}
                      onPress={submit}
                      disabled={submitting}
                      loading={submitting}
                    />
                  </View>
                </View>
                {!canEdit && editing ? (
                  <Text style={{ color: colors.danger, fontSize: 11, textAlign: 'center', marginTop: 8 }}>ليس لديك صلاحية تعديل هذا الصنف</Text>
                ) : null}
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Barcode scanner for inventory (parity with POS) ── */}
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
              <Text style={{ color: '#fff', fontWeight: '900' }}>{scanMode === 'form' ? 'مسح باركود الصنف' : 'مسح للبحث في المخزن'}</Text>
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
            <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }}>
              <View
                style={{
                  width: 280,
                  height: 130,
                  borderWidth: 2,
                  borderColor: '#45d3a7',
                  borderRadius: 14,
                  backgroundColor: 'transparent',
                }}
              />
              <View
                style={{
                  marginTop: 16,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                }}
              >
                <Text style={{ color: '#e8eef8', fontSize: 11, fontWeight: '700' }}>
                  {scanMode === 'form' ? 'وجّه الكاميرا للباركود — سيُعبأ تلقائياً' : 'وجّه للباركود — سيتم البحث تلقائياً'}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, backgroundColor: '#101827' }}>
            <Text style={{ color: '#a9b8ce', textAlign: 'center', fontSize: 11, lineHeight: 15 }}>
              {scanMode === 'form'
                ? 'إذا لم يمسح، اكتب الباركود يدوياً. للأوزان يمكن تركه فارغاً وسيُنشأ كود تلقائي W-…'
                : 'إذا لم يمسح، اكتب الباركود يدوياً في خانة البحث.'}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  label: { color: colors.muted, fontWeight: '800', fontSize: 11, marginBottom: 6, textAlign: 'right' },
  err: { color: colors.danger, fontSize: 11, marginTop: 5, textAlign: 'right', fontWeight: '700' },
});
