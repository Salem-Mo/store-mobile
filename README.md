# سوبر ماركت أيوب — تطبيق الموبايل (React Native + Expo)

> نسخة موبايل أصلية، مُحسّنة للكاشير على تابلت/موبايل، تشارك نفس Supabase + نفس API الخاص بالويب.

## لماذا React Native وليس مجرد Responsive؟

| الويب الحالي `static/index.html` داخل `app/page.tsx:4` | الموبايل الجديد |
|---|---|
| iframe + viewport مزدوج، جداول تتمدد أفقياً على 360px | شاشات Native حقيقية، Bottom Tabs، بطاقات عمودية، أزرار 48px |
| كاميرا عبر `html5-qrcode@2.3.8` (يتأخر/يفشل على أندرويد) | `expo-camera` + ماسح باركود أصلي + haptics |
| لوحة مفاتيح النظام | لوحة أرقام مدمجة + stepper |
| لا Offline queue (كان يضيع البيع عند قطع النت) | `offlineQueue.ts` — يحفظ الفاتورة محلياً ويرسلها تلقائياً |

## البنية

```
mobile/
├── App.tsx                    # Entry — يفعّل RTL + SafeArea + Navigation
├── app.json                   # Expo config (icon/splash/permissions)
├── src/
│   ├── navigation/Root.tsx    # Stack (Login) + Tabs (POS/Inventory/Expenses/Settings)
│   ├── screens/
│   │   ├── LoginScreen.tsx    # دخول عامل/مالك — نفس /api/worker-auth
│   │   ├── POSScreen.tsx      # القطع + الأوزان + سلة + دفع + ماسح
│   │   ├── InventoryScreen.tsx# بحث/فلتر low/out + تعديل/إضافة
│   │   ├── ExpensesScreen.tsx # مصروفات + تقفيل شيفت + واتساب
│   │   └── SettingsScreen.tsx # الملف الشخصي + حالة النظام
│   ├── components/ui.tsx      # Card/Input/Btn/Badge — نفس ألوان الويب #14213d/#0f9d78
│   └── lib/
│       ├── api.ts             # fetch لكل /api/* الموجودة — لا Backend جديد
│       ├── supabase.ts        # getSupabase() للاستخدام المباشر إن لزم
│       ├── store.ts           # zustand: auth/cart/UI + SecureStore
│       ├── offlineQueue.ts    # enqueueSale / getPending / removePending
│       ├── theme.ts           # ألوان المسافات والظلال — مطابقة للويب
│       └── types.ts
└── assets/                    # ضع icon.png / splash.png / adaptive-icon.png (1024x1024)
```

### Reuse — لا ازدواجية قواعد بيانات

الموبايل **لا ينشئ** جداول جديدة. يستخدم:

- `supabase-schema.sql:34` `products/sales/expenses/shift_closings/settings/audit_log`
- `app/api/worker-auth:192` تسجيل دخول + `checkoutSale()` RPC
- `lib/crypto.ts:4` scrypt — التحقق يتم على السيرفر فقط

## التشغيل محلياً (5 دقائق)

```bash
# 1) من جذر المشروع
cd mobile

# 2) تثبيت
npm install
# أو
pnpm install

# 3) إعداد البيئة — انسخ .env.example إلى .env
cp .env.example .env
# ثم عدّل:
# EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# EXPO_PUBLIC_WEB_URL=http://192.168.1.10:3000  # مهم: استخدم IP الجهاز وليس localhost عند التجربة على موبايل حقيقي

# 4) شغّل الويب في ترمينال آخر (ليستقبل الـ API)
cd .. && pnpm dev  # http://localhost:3000

# 5) شغّل الموبايل
cd mobile && npm run dev
# امسح QR بـ Expo Go (Android/iOS) — يعمل مباشرة بدون Build
```

> **Expo Go** يكفي للتجربة. الـ Camera والـ Haptics تعمل مع Expo Go. لا تحتاج EAS إلا لبناء APK/IPA للمتجر.

## النشر للإنتاج (Deployment)

> الترتيب مهم: **الويب أولاً ثم الموبايل** — الموبايل عميل فقط ويقرأ `EXPO_PUBLIC_WEB_URL` ليتحدث مع `/api/*`.

### 0) المتطلبات

```bash
node -v   # >= 18
npm -v    # >= 9
npx expo --version   # 54.x  (المشروع الحالي 54.0.27)
npx eas --version    # >= 13.0.0 (المشروع eas.json يطلب cli >=13)
```

حسابات مطلوبة:

- حساب [Expo](https://expo.dev) — مجاني (`eas login`)
- أندرويد فقط: لا شيء إضافي للـ APK الداخلي
- أندرويد للمتجر: حساب Google Play Console
- iOS: حساب Apple Developer مدفوع (99$/سنة)

### 1) انشر الواجهة الخلفية (Next.js) أولاً

الموبايل لا يعمل بدون الـ API. انشر مجلد الويب (الذي يحتوي `app/api/*`) على Vercel مثلاً:

```bash
# من جذر الويب (المشروع الأصلي وليس mobile)
vercel --prod
# أو عبر ربط GitHub بـ Vercel Dashboard
```

انسخ رابط الإنتاج، مثال:

```
https://ayoub-market.vercel.app
```

اختبره:

```bash
curl https://ayoub-market.vercel.app/api/config
curl -X POST https://ayoub-market.vercel.app/api/worker-auth -H "Content-Type: application/json" -d '{"action":"login","username":"test","password":"1234"}'
```

### 2) إعداد متغيرات الإنتاج

> ⚠️ `app.json:53-55` حالياً يحتوي `EXPO_PUBLIC_WEB_URL=http://192.168.1.8:3000` — هذا للـ LAN فقط ويجب تغييره قبل أي Build للإنتاج.

**أ. محلياً للمعاينة:**

```bash
cp .env.example .env   # إن لم يكن موجوداً
```

عدّل `.env`:

```ini
EXPO_PUBLIC_SUPABASE_URL=https://jomgksetqqxyuarwhprq.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_hje37SMrZE0QrrECLyEq9A_Qvfpc6tV
EXPO_PUBLIC_WEB_URL=https://ayoub-market.vercel.app  # ← رابط Vercel الإنتاج، ليس localhost
```

**ب. في `app.json > expo.extra` (يُضمّن وقت الـ Build):**

```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_SUPABASE_URL": "https://jomgksetqqxyuarwhprq.supabase.co",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY": "sb_publishable_hje37SMrZE0QrrECLyEq9A_Qvfpc6tV",
      "EXPO_PUBLIC_WEB_URL": "https://ayoub-market.vercel.app",
      "eas": { "projectId": "b9cc527b-7f68-4fe7-bc8c-5e17ac875f59" }
    }
  }
}
```

**ج. للإنتاج الحقيقي استخدم EAS Secrets (لا تضع المفاتيح في Git):**

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value sb_publishable_...
eas secret:create --scope project --name EXPO_PUBLIC_WEB_URL --value https://ayoub-market.vercel.app
# أو حددها لكل profile في eas.json:
# "production": { "env": { "EXPO_PUBLIC_WEB_URL": "https://..." } }
```

> ملاحظة: `src/lib/api.ts:11` و `src/lib/supabase.ts:7` تقرأ `Constants.expoConfig.extra` أولاً ثم `process.env`، لذا يكفي تعيينها في أحد المكانين. EAS يمرر Secrets كـ `process.env` وقت الـ Build.

### 3) ربط المشروع بـ EAS (مرة واحدة)

```bash
npm i -g eas-cli
eas login                 # سجّل دخول Expo
eas build:configure       # يتحقق من eas.json + يسجل projectId (موجود مسبقاً b9cc527b-...)
# تأكد من eas.json الحالي:
cat eas.json
```

`eas.json` الحالي في المشروع (`eas.json:1`):

```json
{
  "cli": { "version": ">= 13.0.0", "appVersionSource": "local" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": { "autoIncrement": true }
  }
}
```

- `appVersionSource: local` يعني رقم `app.json > expo.version` و `android.versionCode`/`ios.buildNumber` يُقرأ من الملفات المحلية. ارفعه يدوياً عند كل إصدار متجر.
- `autoIncrement: true` في `production` يزيد `versionCode` تلقائياً على EAS.

### 4) التحديثات اللحظية OTA (EAS Update) — بدون إعادة بناء

مثالي لتغيير `EXPO_PUBLIC_WEB_URL` أو إصلاح واجهة دون المرور بالمتجر. يتطلب إعداد `expo-updates`:

```bash
npx expo install expo-updates
```

أضف في `app.json`:

```json
{
  "expo": {
    "runtimeVersion": { "policy": "appVersion" },
    "updates": { "url": "https://u.expo.dev/b9cc527b-7f68-4fe7-bc8c-5e17ac875f59" }
  }
}
```

ثم:

```bash
# إنشاء قنوات التحديث
eas channel:create production
eas channel:create preview

# نشر تحديث JS فقط (لا يغيّر native code)
eas update --channel production --message "fix: point WEB_URL to vercel prod"
eas update --channel preview --message "chore: test preview"

# للمستخدمين: يصل التحديث عند إعادة فتح التطبيق (أو عبر Updates.reloadAsync())
```

> غيّر `EXPO_PUBLIC_WEB_URL` ثم `eas update` يكفي — لا تحتاج `eas build` جديد إلا إذا غيّرت `app.json > plugins/permissions` أو native code.

### 5) بناء أندرويد — معاينة داخلية (APK)

للاختبار على أجهزة بدون Play Store / هواوي بدون Google Play:

```bash
# تأكد أن EXPO_PUBLIC_WEB_URL إنتاجي قبل البناء
eas build --platform android --profile preview
# الناتج: رابط APK مباشر في لوحة EAS + QR للتحميل
# ثبّت على الجهاز: adb install app-preview.apk  أو حمّل مباشرة
```

للأجهزة على نفس الشبكة أثناء التطوير (بدون EAS):

```bash
# حل مشاكل الجدار الناري/الشبكة:
adb reverse tcp:3000 tcp:3000   # يربط localhost الموبايل بـ localhost الكمبيوتر (لا يحتاج EXPO_PUBLIC_WEB_URL LAN)
npx expo start --tunnel        # أو استخدم tunnel إذا الواي فاي معزول
```

### 6) بناء أندرويد — إنتاج للمتجر (AAB)

```bash
eas build --platform android --profile production
# الناتج: .aab جاهز للرفع إلى Google Play Console
# رفعه تلقائياً:
eas submit --platform android --latest
# أو يدوياً: Play Console > Production > Create new release > Upload AAB
```

**قبل الرفع:**

- غيّر `app.json > expo.version` مثلاً `1.0.1` (أو اترك `autoIncrement` يتكفل بـ `versionCode`)
- تأكد من `android.package = com.ayoub.market` ثابت لا يتغير
- أضف `assets/icon.png` 1024×1024 و `adaptive-icon.png` بدون شفافية
- اختبر `aab` عبر `bundletool` محلياً إن لزم

### 7) بناء iOS — TestFlight والمتجر

يتطلب macOS أو EAS Cloud + حساب Apple Developer:

```bash
eas build --platform ios --profile production
# يطلب Apple ID + App Bundle com.ayoub.market (أنشئه في App Store Connect)
eas submit --platform ios --latest
# أو: eas build --platform ios --auto-submit
```

للاختبار الداخلي بدون متجر:

```bash
eas build --platform ios --profile preview
# أو Development Client:
eas build --platform ios --profile development
npx expo start --dev-client
```

> `app.json:18-24` يحتوي `NSCameraUsageDescription` — مطلوب لمراجعة Apple. لا تغيّر النص العربي إلا لتوضيح استخدام الباركود.

### 8) نشر نسخة الويب (اختياري — Expo Web)

إذا أردت تشغيل نفس التطبيق كـ PWA على Vercel/Netlify:

```bash
npx expo export --platform web
# ينتج مجلد dist/ (الحالي فارغ، سيُملأ بعد الأمر)
npx serve dist

# للنشر على Vercel:
vercel --prod dist
# أو أضف script في package.json:
# "export:web": "expo export --platform web"
```

> لا تخلط بين `dist/` الخاص بـ Expo Web و `dist/` الخاص بـ Next.js — كل واحد في مشروعه.

### 9) إدارة الإصدارات والبيئات

| البيئة | `EXPO_PUBLIC_WEB_URL` | Profile | الأمر |
|---|---|---|---|
| محلي (Expo Go) | `http://192.168.1.8:3000` أو `http://10.0.2.2:3000` (محاكي) | — | `npm run dev` |
| معاينة (APK داخلي) | `https://staging-ayoub.vercel.app` | `preview` | `eas build --profile preview` |
| إنتاج (متجر) | `https://ayoub-market.vercel.app` | `production` | `eas build --profile production` |
| تحديث سريع | غيّر URL ثم | OTA | `eas update --channel production` |

**رفع الإصدار:**

```bash
# عدّل app.json
# "version": "1.0.1"
# android.versionCode / ios.buildNumber يزيد تلقائياً بسبب autoIncrement
# ثم
eas build --platform all --profile production
```

### 10) قائمة التحقق قبل الإطلاق (Go-Live Checklist)

- [ ] `EXPO_PUBLIC_WEB_URL` يشير للإنتاج (ليس `192.168.*` ولا `localhost`)
- [ ] `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` تطابق إنتاج Supabase
- [ ] `app.json > expo.version` مرفوع + `icon/splash/adaptive-icon` 1024px
- [ ] `eas.json` يحتوي `production.autoIncrement: true`
- [ ] اختبار تسجيل دخول عامل/مالك + بيع + مصروف + تقفيل وحساب واتساب (`src/lib/api.ts:139,213`)
- [ ] اختبار Offline: اقطع النت → بيع → تأكد من `offlineQueue.ts` وشارة "معلّق N"
- [ ] اختبار الكاميرا على جهاز حقيقي (ليس محاكي)
- [ ] `npx tsc --noEmit` و `npx expo lint` بدون أخطاء
- [ ] جرب `eas update` للتأكد أن OTA يعمل قبل الاعتماد عليه

### 11) استكشاف الأخطاء

| المشكلة | الحل |
|---|---|
| `Network request failed — لا يمكن الوصول للسيرفر` | `src/lib/api.ts:98` يجرب fallbacks (`10.0.2.2 ↔ 192.168.1.8 ↔ localhost`). تأكد من `adb reverse tcp:3000 tcp:3000` أو أن الموبايل والكمبيوتر على نفس الواي فاي + `pnpm dev --hostname 0.0.0.0` + افتح جدار الحماية لمنفذ 3000 |
| QR لا يعمل في Expo Go | استخدم `npx expo start --tunnel` أو ثبّت APK الـ preview |
| `Supabase env missing` | `src/lib/supabase.ts:28` — تأكد من `EXPO_PUBLIC_SUPABASE_URL` في `.env` أو `app.json > extra` أو EAS Secrets |
| Build يفشل بسبب `versionCode` | احذف `autoIncrement` مؤقتاً أو ارفع `android.versionCode` يدوياً في `app.json` |
| iOS يرفض الكاميرا | تأكد من `NSCameraUsageDescription` و `expo-camera` plugin في `app.json:44` |
| التحديث OTA لا يصل | تأكد من `runtimeVersion` و `updates.url` و أنك نشرت على نفس `channel` المرتبط بالـ Build |

## قرارات UX للموبايل (مُحسّنة للاستخدام بيد واحدة)

- **Bottom Tabs ثابتة 64px** — الإبهام يصل لكل شيء. لا Hamburger.
- **POS Tabs قطعة/وزن 48px** — نفس تقسيم الويب `static/index.html:406`.
- **Steppers 48×48** — كانت 42px على الويب، الآن 48px للقفاز.
- **Search sticky + مسح باركود** — زر مسح 88px بجانب البحث.
- **Checkout Bottom Sheet** — بدلاً من dialog وسط الشاشة (صعب على الموبايل). أزرار دفع سريعة: `الإجمالي / +10 / +50 / +100`.
- **Inventory كـ Cards عمودية** — الجدول الأفقي `static/index.html:542` يتحول لقائمة بطاقات (لا scroll أفقي).
- **Expenses + Shift في نفس التاب** — تقليل التنقل.
- **RTL كامل** — `I18nManager.forceRTL(true)` مثل `html dir="rtl"` في الويب.
- **Haptics + Offline badge** — اهتزاز عند الإضافة + شارة "معلّق N" في الهيدر.

## الأمان

- PIN لا يُخزن كنص — يُرسل للـ `/api/worker-auth` الذي يتحقق بـ `verifyPin()` ثم يصدر `access_token` قصير.
- `SecureStore` يحفظ `token` مشفراً على الجهاز (Keychain/Keystore).
- كل الكتابة تمر عبر `service_role` في الـ API — نفس سياسات RLS في `supabase-schema.sql:132`.
- الكاميرا تطلب إذن مرة واحدة `NSCameraUsageDescription`.

## عدم الاتصال (Offline)

```ts
// src/lib/offlineQueue.ts
await enqueueSale(cartTotal, items) // عند فشل fetch
// عند عودة النت — POSScreen:handleCheckout() يحاول إرسال كل المعلقات
```

اختبر بقطع الواي فاي أثناء البيع — ستظهر "تم الحفظ محلياً" و شارة صفراء في الهيدر.

## التخصيص

- **الألوان**: `src/lib/theme.ts` — غيّر `colors.primary/accent`.
- **الخط**: أضف `expo-font` + Cairo.
- **اللغة**: كل النصوص عربية في `screens/*` — استخرجها لـ `i18n` إذا أردت إنجليزي.
- **الشعار**: استبدل `assets/icon.png` (1024×1024) + `splash.png` + `adaptive-icon.png`.

## ماذا بعد؟ (Horizon 2 من FEATURES_ROADMAP.md)

- A9 Favorites Rail — شريط 1-tap لأكثر 20 صنف مبيعاً
- A8 Numpad Overlay — لوحة أرقام تطفو فوق السلة
- B2 Expiry badge — شارة حمراء <30 يوم
- F1 Demand forecast — اقتراح كمية الطلب لـ 7 أيام

كلها تُضاف داخل `mobile/src` بدون لمس السكيما.

## أسئلة شائعة

**هل أحتاج Backend جديد؟** لا. الموبايل عميل فقط لنفس Next.js.

**هل يعمل بدون إنترنت؟** البيع يُحفظ محلياً ويرسل عند الاتصال. المخزن يحتاج اتصال للتحميل الأول.

**Huawei بدون Google Play؟** استخدم `eas build --profile preview` لإنتاج APK مباشر.

**كيف أغيّر رابط السيرفر بعد النشر؟** عدّل `EXPO_PUBLIC_WEB_URL` في `app.json > extra` ثم `eas update`.

---

*Built by Muse Spark — يعكس `static/index.html` حرفياً لكن بمنطق موبايل Native.*
