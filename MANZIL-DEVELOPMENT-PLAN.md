# خطة فحص وإصلاح وتطوير — تطبيق منزل (Manzil)

> **هذا الملف هو المصدر الحي للخطة.** يُحدَّث بعد كل جلسة عمل.
> **نسخة متتبعة في المستودع:** `Manzil/MANZIL-DEVELOPMENT-PLAN.md` (منذ 2026-11-05).
> آخر تحديث: 2026-11-05
> الريبو: `Manzil/` — https://github.com/manzilsystem/Manzil.git

---

## 1) الحالة الحالية (Repo Health)

| البند | الحالة |
|---|---|
| شجرة العمل | نظيفة — لا تعديلات غير مُودعة |
| `main` مقابل `origin/main` | متطابقان |
| ملفات متتبعة | 216 |
| `npm run typecheck` | يمر بدون أخطاء |
| اختبارات Node | 511/511 تمر |
| اختبارات Deno (Edge Functions) | 61/61 تمر |
| انحراف الإنتاج | Migrations 53/53 مطبّقة. الدوال المنشورة: 5/5. `pg_cron` و`pg_net` مفعّلان، والمهمة `manzil-daily-error-check` نشطة يوميًا 06:00 UTC |
| ملفات متجاهلة | `node_modules/`, `test-results/` ✓ |

### الفروع (الكل مدمج على main — 2026-11-05)

لا فروع خارجية حاليًا. الفروع الخمسة السابقة مدمجة:
- `docs/local-dev-plan-sync` → PR #184 ✅
- `feat/landlord-report-pdf` → PR #185 ✅
- `fix/e2e-serve-robustness` → PR #186 ✅
- `feat/mobile-ux-a11y` → PR #187 ✅
- `feat/gradual-typescript` → PR #188 ✅ (rebase على main بعد دمج #187)

---

## 2) ما تم إنجازه

### المرحلة 0 — الفحص الأولي والعيوب
- [x] تشغيل `node --test`: 484 اختبار يمر
- [x] مراجعة `client_error_reports` + `js/telemetry.js` — تصميم سليم (معقّم، حد 5000 صف، RLS إدراج فقط)
- [x] تشخيص أعطال e2e — كانت بيئية (سيرفرات Python قديمة على المنفذ 8123) وليست عيوب تطبيق
- [x] إصلاح `e2e/serve.cjs` — رفض الروابط المشوهة بدل الانهيار

### المرحلة 1 — النظام المالي
- [x] مطابقة أرصدة الصناديق — موجودة فعلًا (`get_monthly_cashbox_close` + `v_reconciled`)
- [x] إقفال شهري للصناديق — موجود (`js/monthly-close.js`)
- [x] PDF حقيقي للع تقرير الشهري — **أُضيف جديدًا** (`feat/landlord-report-pdf`)
- [x] تصدير PDF لكشوفات/وحدات/تقارير أخرى — موجود مسبقًا
- [x] تحديث `docs/development-plan.md` لتعكس الواقع

### المرحلة 2 — الواجهة (جزئي)
- [x] توحيد رسائل تأكيد الحذف (`confirmRecordDeletion`)
- [x] `aria-label`s على أزرار حذف المصروفات/الإعلانات
- [x] أهداف لمس 44px لإجراءات إشعارات المالك
- [x] أزرار تعديل/حذف التحصيلات والمصروفات — مساحة لمس 32px عبر `.icon-action`
- [x] مراجعة بصرية آلية على Pixel 5 (393px) للشاشات الرئيسية — لا فيض أفقي في أي شاشة، والتبويب النشط صحيح؛ أُصلح ارتفاع رابط الهاتف في التذييل إلى 24px. مراجعة جهاز حقيقي تبقى موصى بها
- [ ] تقسيم `index.html` — مؤجل: كبير وحساس (CSP/service-worker/ترتيب السكربتات)

### المرحلة 3 — الباك إند (جزئي)
- [x] TypeScript تدريجي: `tsconfig.json` + `js/globals.d.ts` + `// @ts-check` على `telemetry.js`
- [x] `npm run typecheck` في CI
- [x] `deno check` لكل دوال Edge الخمس في CI
- [x] `tests/edge-functions-security.test.cjs` — 8 اختبارات (rate limiting، عدم كشف وجود حساب، ترتيب PIN change، صلاحيات المدير)
- [x] بيئة Supabase محلية كاملة: `config.toml` + `seed.sql` + `docs/local-development.md` + CI (`supabase-local-seed.yml`)
- [x] توسيع `// @ts-check` ليشمل كل وحدات JS الـ 14 (آخرها `supabase.js`) — `npm run typecheck` يمر بدون أخطاء
- [x] قياس أداء استعلامات DB — تم على الإنتاج 2026-11-05: كل الجداول ≤96 صفًا و32–136 kB، لا حاجة لفهارس جديدة
- [ ] اختبار استعادة معزول — يحتاج قاعدة اختبار منفصلة (مجاني)

### المرحلة 4 — CI
- [x] توسيع اختبارات أمان Edge Functions
- [x] محاكاة طلبات HTTP فعلية للـ Edge Functions — اكتمل 2026-11-05: 61 اختبار Deno عبر الدوال الخمس مع خادم Supabase وهمي محلي، وخطوة CI دائمة

---

## 3) مقترحات تطوير قادمة (مرتبة بالأولوية)

### عالية الأولوية
1. ~~رفع الفروع وفتح PRs~~ — تم 2026-11-05: PRs #184–#188 كلها خضراء (CI ناجح)
2. ~~دمج الـ PRs~~ — تم 2026-11-05: دُمجت جميع الـ 5 PRs (squash)، الفروع محذوفة محليًا وعن بعد
3. ~~مراجعة migrations المكررة~~ — تم 2026-11-05: حُذف ملفان مكرران، الزوج الآخر شرعي (تحسين)
4. ~~إعادة تشغيل e2e نظيف~~ — تم 2026-11-05: أوقف سيرفر 8123 القديم ثم `npx playwright test` → 56/56 ناجح (desktop + mobile)
5. **MCP GitHub + Supabase** — مفعّل (2026-11-05)

### متوسطة الأولوية
6. ~~TypeScript تدريجي~~ — تم 2026-11-05: أُضيف `// @ts-check` لـ `telemetry.js`, `state.js`, `access.js`, `notices.js`, `app.js`, `subscription-rates.js`, `monthly-close.js`, `cashbox.js`, `backup.js` + تعريفات globals العالمة
7. ~~مراقبة أخطاء محسّنة~~ — تم 2026-11-05: `monitor-client-errors` منشورة في الإنتاج (v1، Verify JWT معطّل، وتتحقق من `CRON_SECRET`)، وفُعّل `pg_cron` 1.6.4 و`pg_net` 0.20.4، وأُضيفت مهمة `manzil-daily-error-check` يوميًا 06:00 UTC تنادي الدالة عبر `net.http_post` وتقرأ السر من Vault (`manzil_cron_secret`). تحقق حي: 200 للسر الصحيح، 401 للخاطئ، 405 لـGET، وتنفيذ pg_cron فعلي نجح (200)
8. ~~قياس أداء DB~~ — تم 2026-11-05 على الإنتاج: أكبر جدول 96 صفًا وكل الجداول 32–136 kB؛ لا فهارس جديدة مطلوبة
9. **اختبار استعادة معزول** — `tests/post-restore-verify.sql` جاهز للتحقق بعد الاستعادة، لكن الاستعادة الفعلية لم تُجرَّب على قاعدة منفصلة؛ تتطلب مشروع Supabase مجانيًا ثانيًا (قرار المستخدم)

### منخفضة الأولوية / مؤجلة
10. **تقسيم `index.html`** — يحتاج جلسة مخصصة مع خطة ترحيل سكربتات تدريجية
11. **تحسينات UI إضافية**: مراجعة شاشات الصناديق/المصروفات على موبايل حقيقي
12. **Service worker**: روجعت استراتيجية cache (2026-11-05) — network-first مع `cache: 'no-cache'`، إعادة تحقق للتنقلات، حذف الكاش القديم عند التنشيط، وتسجيل بـ `updateViaCache: 'none'`؛ والتحديث يؤجل أثناء أي نافذة مفتوحة. لا تغيير مطلوب الآن، وتُعاد المراجعة بعد أي تقسيم للواجهة

---

## 4) إعدادات معلّقة (MCP — تحكم GitHub وSupabase)

**الهدف:** ربط Devin بـ GitHub وSupabase عبر MCP.

- **Supabase**: `https://mcp.supabase.com/mcp` — OAuth من المتصفح (جاهز للإضافة)
- **GitHub**: `https://api.githubcopilot.com/mcp/` — لا يدعم Dynamic Client Registration؛ يحتاج:
  - إما **OAuth App** مسجّل على GitHub (Client ID فقط — PKCE)
  - أو **Personal Access Token** في header (أبسط)

**الحالة:** ✅ مفعّل (2026-11-05)

- **GitHub**: `https://api.githubcopilot.com/mcp/` + PAT في header — تم التحقق من التوكن (الحساب `manzilsystem`)
- **Supabase**: `https://mcp.supabase.com/mcp` — OAuth؛ أول استخدام سيفتح المتصفح لتسجيل الدخول
- **الملف:** `C:\Users\Admin\AppData\Roaming\devin\mcp_config.json`
- **الصلاحيات:** `mcp__github__*` و `mcp__supabase__*` مضافة إلى `permissions.allow` في `config.json` — تنفيذ مباشر بدون موافقة لكل عملية
- **مطلوب:** إعادة تشغيل session لتفعيل الأدوات + تسجيل دخول Supabase عند أول استخدام

---

## 5) قواعد ثابتة (لا تُخالف)

- خدمات مجانية فقط (Supabase free tier)
- فرع مستقل لكل تغيير + اختبارات قبل الدمج
- لا `supabase db reset` على بيئة حية/مرتبطة
- لا اختبار استعادة على الإنتاج
- عدم إضعاف أمان PIN المالك أو كشف service-role key للمتصفح
- تحديث هذا الملف بعد كل جلسة

---

## 6) سجل الجلسات

| التاريخ |Session | ما تم |
|---|---|---|
| 2026-11-05 | استمرارية | فحص الريبو + إنشاء هذه الخطة الحية + إعداد MCP (GitHub PAT ✅ / Supabase OAuth ⏳) |
| 2026-11-05 | MCP | كتابة `mcp_config.json` + صلاحيات تلقائية لـ github/supabase + توثيق الخطة |
| 2026-11-05 | مراجعة خطة | مطابقة الخطة مع الكود: بيئة Supabase المحلية مكتملة فعليًا + ملاحظة migrations مكررة |
| 2026-11-05 | رفع PRs | دفع 5 فروع + إنشاء PRs #184–#188 عبر REST API — CI أخضر بالكامل؛ PR #188 stacked على `feat/mobile-ux-a11y` ويُعاد توجيهه لـ main بعد دمج #187 |
| 2026-11-05 | دمج PRs | دمج كل الـ 5 PRs (#187 أولًا، ثم rebase #188 على main وإعادة توجيهه، ثم دمج) — الفروع محذوفة محليًا وعن بعد |
| 2026-11-05 | TypeScript state.js | إضافة `// @ts-check` لـ `state.js` + تعريفات globals العالمة + إصلاح test بعد حذف migrations مكررة |
| 2026-11-05 | TypeScript notices.js | إضافة `// @ts-check` لـ `notices.js` + تعريفات globals (openModal, closeModal, renderNotices) + type assertions لـ HTMLInputElement.value |
| 2026-11-05 | TypeScript app.js | إضافة `// @ts-check` لـ `app.js` + تعريفات globals (resetReportView, loadBackupConsole, initSupabaseApp, handleReportViewKeydown) + type assertions لـ HTMLElement.focus() |
| 2026-11-05 | TypeScript subscription-rates.js | إضافة `// @ts-check` لـ `subscription-rates.js` + تعريف loadState global |
| 2026-11-05 | TypeScript monthly-close.js | إضافة `// @ts-check` لـ `monthly-close.js` + تعريفات globals (markReportPreviewStale, syncReportNavStatus) + type assertions لـ HTMLButtonElement/HTMLSelectElement + إصلاح window.html2pdf() |
| 2026-11-05 | TypeScript cashbox.js | إضافة `// @ts-check` لـ `cashbox.js` + تعريفات globals (activeBuildingVersion, refreshCashboxSummary, persistedAuditLogIds) + type assertions لـ HTMLSelectElement/HTMLInputElement/HTMLTextAreaElement/HTMLButtonElement/HTMLFormElement |
| 2026-11-05 | مراقبة أخطاء | Edge Function مجدول `monitor-client-errors` للتحقق من `client_errors` في آخر 24 ساعة مع عتبة 100 خطأ/يوم |
| 2026-11-05 | اختبار استعادة | إنشاء `tests/post-restore-verify.sql` للتحقق من صحة قاعدة البيانات بعد الاستعادة (جداول، RLS، فهارس، تكامل البيانات) |
| 2026-11-05 | TypeScript backup.js + migrations | إضافة `// @ts-check` لـ `backup.js` + تعريفات globals (lockCurrentSession, setAuthModal) + type assertions لـ HTML elements + استعادة ملفي migration كـ no-op placeholders لإصلاح "Remote migration versions not found" |
| 2026-11-05 | إصلاح edge-function-check | توحيد `monitor-client-errors` مع نمط الدوال الأخرى: `npm:@supabase/supabase-js@2` + `Deno.serve` + `json()` helper + تحديث regex الاختبار |
| 2026-11-05 | TypeScript reports.js | إضافة `// @ts-check` لـ `reports.js` + type assertions لـ HTMLSelectElement/HTMLButtonElement/HTMLElement + إصلاح Date arithmetic + إضافة netCents/rate لـ period report totals |
| 2026-11-05 | TypeScript render.js | إضافة `// @ts-check` لـ `render.js` + type assertions لـ HTMLSelectElement/HTMLInputElement + إصلاح Date arithmetic + إزالة تكرارات globals.d.ts |
| 2026-11-05 | TypeScript على settings.js | ✅ تم — 12 وحدة مفحوصة (telemetry, state, access, notices, app, subscription-rates, monthly-close, cashbox, backup, reports, render, settings) |
| 2026-11-05 | توسيع CORS test | إضافة `monitor-client-errors` إلى `edge-function-cors.test.cjs` — الآن يغطي كل الـ 5 Edge Functions |
| 2026-11-05 | تقييم TypeScript المتبقي | `crud.js` (83 خطأ بعد إصلاحات DOM) — معقد جدًا، يحتاج refactoring مخصص |
| 2026-11-05 | تقييم بنود أخرى | المراحل A-E في الخطة تحتاج بيئة خارجية (Docker، جهاز حقيقي، أو بيئة اختبار منفصلة) |
| 2026-11-05 | اختبارات أرصدة الصناديق | `hasValidCashboxBalances` + `normalizeCashboxSummary` — 2 اختبار جديد (498/498) |
| 2026-11-05 | اختبار مطابقة الإقفال | `reconciled` flag formula verification — 1 اختبار جديد (499/499) |
| 2026-11-05 | إصلاح GitHub Pages | deployment عالق `4b803ef` حجب كل الـ deploys — push فارغ أعاد المحاولة ونجح |
| 2026-11-05 | TypeScript على crud.js | ✅ تم — 13/14 وحدة مفحوصة. 113 `getElementById` لُفّت بـ `/** @type {any} */` casts |
| 2026-11-05 | TypeScript على supabase.js | ✅ تم — 14/14 وحدة. أُضيفت للـ `tsconfig`، حُذفت التعريفات المكررة من `globals.d.ts`، إصلاح إعادة إسناد `loadState` في `subscription-rates.js` عبر `globalThis`، وcasts دقيقة لعناصر DOM. `typecheck` نظيف و499/499 اختبار يمر |
| 2026-11-05 | e2e نظيف + مراجعة بصرية | إيقاف سيرفر 8123 القديم؛ 56/56 e2e ناجح. مراجعة آلية Pixel 5 (393px) للشاشات الست: لا فيض أفقي، التبويب النشط صحيح. إصلاح ارتفاع رابط الهاتف بالتذييل إلى 24px + تكبير أزرار تعديل/حذف التحصيلات والمصروفات إلى 32px (`.icon-action`) + اختبارات انحدار. 501/501 اختبار و56/56 e2e بعد الإصلاح |
| 2026-11-05 | Deno محلي | تثبيت Deno 2.9.6 وتشغيل `deno check` على الدوال الخمس — كشف 5 أخطاء null narrowing في `manage-owner-access` وأُصلحت بالتقاط المعرفات غير الفارغة خارج closure. كل الدوال تمر والاختبارات 501/501 |
| 2026-11-05 | النسخ الاحتياطي — إدارة | إضافة SHA-256 إلى قائمة الكتالوج و`canRestore` للتحقق الخادمي؛ لوحة تفاصيل للنسخة المختارة (الوقت/الحجم/المعرّف/البصمة/آخر استعادة)؛ لافتة صريحة للبيانات المحلية القديمة؛ تقييد الاستعادة فعليًا بمدير جميع المباني |
| 2026-11-05 | الاستعادة — تأكيد | استبدال `prompt` بنافذة تأكيد مستقلة تتطلب كتابة RESTORE وتعرض ملخص النسخة قبل الإرسال، مع تعطيل زر التنفيذ حتى تطابق العبارة. تحديث اختبارات السلامة للتحقق من البوابة الجديدة |
| 2026-11-05 | JSON — تنسيق | تصدير بإصدار تنسيق ووقت التصدير واسم العمارة وعدد السجلات مع استمرار قبول الملفات القديمة؛ رسالة استيراد تعرض المصدر والعدد وتوضح أن الاستبدال للعمارة الحالية فقط |
| 2026-11-05 | الصناديق — تطوير | ملخص شهري لكل صندوق (تحصيلات/مصروفات/صافي تحويلات/صافي حركة) مع اختيار الشهر؛ تنبيه المتبقي والمتأخرات في نموذج التحصيل؛ عرض مصروفات الشهر الحالية للصندوق داخل معاينة المصروف |
| 2026-11-05 | تحديث تلقائي v109 | رفع الإصدار إلى `manzil-v109`؛ تأجيل إعادة التحميل أثناء نافذة أو حقل قيد الإدخال مع تنبيه، وإعادة المحاولة كل 5 ثوانٍ وعند focus/visibility — التحديث يصل دون مسح كاش |
| 2026-11-05 | تحقق | `tsc` نظيف، اختبارات الوحدات والنسخ/الصناديق ناجحة، و12/12 اختبار Playwright المستهدف (desktop + Pixel 5) للنسخ الاحتياطي وملخص الصناديق |
| 2026-11-05 | نشر backup-console | نُشرت نسخة `backup-console` المحدّثة يدويًا من لوحة Supabase (مشروع `musvcrkljccubwbcrtjs`) بعد تعذّر MCP بخطأ OAuth `insufficient_scope` (`projects:read`). تحقق: بصمة SHA-256 للمصدر المنشور تطابق الملف المحلي `9b24a038…eb8b0`، و"Verify JWT" مفعّل، والدالة تعيد 401 JSON لطلب غير مصادق |
| 2026-11-05 | موصل Supabase | أُزيل الموصل الرسمي وأُعيد تثبيته من السوق؛ الحالة `ready` لكن بوابة Qoder ما زالت تطلب نطاقات ناقصة (`projects:read`, `database:read`) → الإدارة تتم عبر لوحة Supabase. أُضيف موصل مخصص «Supabase Direct» بانتظار موافقة OAuth في المتصفح |
| 2026-11-05 | فحص الإنتاج | 53 migration مطبّقة = 53 محلية (لا انحراف). `backup_catalog`: 17 نسخة، 0 بصمة تالفة، آخرها `backup-20261105T030517Z` (~497KB)، ولا استعادات نشطة. Advisors: 15 ملاحظة أمنية + 8 فهارس «غير مستخدمة» — كلها مقبولة/بتصميم: حماية كلمة المرور المسربة غير متاحة في الخطة المجانية، جداول service-role بلا سياسات مع سحب صلاحيات العميل، سياسة `client_errors` إدراج فقط، والفهارس غير مكررة |
| 2026-11-05 | توثيق النشر | إضافة قسم «نشر دوال Edge» في `docs/supabase-rollout.md`: الخطوات من لوحة Supabase، إعداد Verify JWT، التحقق ببصمة SHA-256، اختبار 401، وبديل CLI. `typecheck` نظيف و508/508 اختبار |
| 2026-11-05 | قياس الأداء | أكبر جدول `building_mutations` = 96 صفًا، وكل جداول `public` بين 32–136 kB. Seq Scan طبيعي ومفضّل في هذا الحجم؛ لا فهارس جديدة مطلوبة. الفهارس الحالية تغطي مفاتيح الاستعلام الفعلية وتكفي للنمو القادم |
| 2026-11-05 | محاكاة HTTP (1) | `monitor-client-errors`: فصل المعالج إلى `handleRequest` مع `Deno.serve` تحت `import.meta.main`، وإضافة `index_test.ts` بـ6 اختبارات (OPTIONS/CORS، 405، غياب السر، سر خاطئ، cron مجهول، JSON تالف) — 6/6 ناجحة. أُضيفت خطوة `deno test` إلى CI، والتحقق: `deno check` لكل الدوال + `tsc` نظيف + 508/508 اختبار |
| 2026-11-05 | محاكاة HTTP (2) | `backup-console`: نفس الفصل + 8 اختبارات تشمل OPTIONS، 405، غياب/فساد رمز Bearer، نقص إعدادات الخادم، 403 لغير المدير، 500 لفشل الاستعلام، و400 لإجراء مجهول — عبر خادم Supabase وهمي محلي يستبدل Auth/REST. المجموع 14/14 اختبار Deno، و`tsc` نظيف و508/508 |
| 2026-11-05 | محاكاة HTTP (3) | `owner-login`: فصل المعالج + 12 اختبارًا: OPTIONS، 405، JSON تالف، تحقق الجوال/PIN (بما فيها الأرقام العربية)، 503 لنقص الإعدادات، 429 مع `Retry-After`، فشل محدّد المعدل، جوال مجهول/بلا عضوية/Auth يرفض → 401، انقطاع Auth → 503، ونجاح يعيد الرموز. المجموع 26/26 اختبار Deno |
| 2026-11-05 | محاكاة HTTP (4) | `complete-owner-pin-change`: فصل المعالج + 15 اختبارًا تغطي OPTIONS/405/401/500، صيغة PIN وتطابقه، بوابة تغيير PIN، عضوية المالك، محدّد المعدل (503/429)، PIN خاطئ أو جلسة مختلفة، انقطاع Auth، نجاح، تعذّر إغلاق البوابة، وفشل تحديث Auth. المجموع 41/41 اختبار Deno |
| 2026-11-05 | محاكاة HTTP (5) | `manage-owner-access`: فصل المعالج + 20 اختبارًا تشمل التحقق من UUID، حصر المدير، نطاق المبنى، الجوال، إنشاء مالك جديد وإعادة استخدام حساب مرتبط، تعارض الجوال/الدور، وفشل كل خطوة كتابة مع تعويض الحذف والاستعادة. اكتمل البند: 5 دوال و61/61 اختبار Deno، وCI يشغّلها مع `deno check` |
| 2026-11-05 | توثيق وحماية الاختبارات | قسم «اختبارات الدوال» في `docs/supabase-rollout.md` موضحًا أمر التشغيل والخادم الوهمي وأن `index_test.ts` لا يُنشر. إضافة `tests/edge-function-tests.test.cjs` يضمن أن كل دالة تصدّر `handleRequest` ولا تستمع إلا تحت `import.meta.main`، وأن لكل دالة اختبارًا يشغّله CI — 511/511 اختبار |
| 2026-11-05 | تحقق بوابة التشغيل حيًّا | الدوال المنشورة تستخدم `if (import.meta.main) { Deno.serve(handleRequest) }`، واختبار حي على `owner-login` أعاد `200` لـ OPTIONS و`400` لـ POST `{}` — أي أن `import.meta.main` يُضبط فعليًا في Edge Runtime. أُعيد توحيد المستودع على نفس البوابة في الدوال الخمس + حارس الاختبار + التوثيق، وزال الانحراف مع الإنتاج: `deno check` نظيف، 61/61 Deno، 511/511 Node |
| 2026-11-05 | انحراف المراقبة | التحقق من الإنتاج: الدوال 4 فقط (`monitor-client-errors` غير منشورة)، لا `pg_cron`/`pg_net` ولا جدول `cron.job`، وجدول `client_errors` موجود بإجمالي 0 صف. صُحّح البند في الخطة من «مجدول» إلى «كود واختبارات جاهزة، غير منشور/مجدول»، وأُضيف توضيح في `docs/supabase-rollout.md` |
| 2026-11-05 | تحقق نهائي | CI أخضر للالتزام `a14b232`: Quality + Node/PostgreSQL + Local Supabase seed. محليًا: `deno check` للدوال الخمس، 61/61 Deno، 511/511 Node، و`tsc` نظيف. مراجعة استراتيجية service worker — سليمة ولا تغيير مطلوب |
| 2026-11-05 | تتبّع الخطة | نُسخ ملف الخطة إلى المستودع كـ `MANZIL-DEVELOPMENT-PLAN.md` وأُضيف إلى git ليُرفع مع الكود ويبقى مرئيًا في المستودع |
| 2026-11-05 | نشر المراقبة | عبر موصل `supabase_direct`: نشر `monitor-client-errors` v1 (`verify_jwt=false`)، إضافة سر `CRON_SECRET`، تفعيل `pg_cron` و`pg_net`، تخزين نسخة السر في Vault، وجدولة `manzil-daily-error-check` يوميًا 06:00 UTC. تحقق حي: 200/401/405، ثم تنفيذ مهمة pg_cron مؤقتة نجح وأعاد 200، وأُزيلت مهمة الاختبار. الدوال الآن 5/5 |
