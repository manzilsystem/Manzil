# نقل Manzil إلى Supabase

## ما تم تنفيذه

- أصبح مصدر المصادقة المستهدف هو Supabase Auth بدل PIN المحلي.
- أضيفت جداول `profiles` و`buildings` و`building_members` و`residents` و`income` و`expenses` و`notices` و`audit_logs`.
- فُعّل RLS على جميع جداول التطبيق.
- المدير يرى بيانات المبنى الذي يديره ويمكنه تعديلها.
- المالك يرى ملفه/شقته ودفعات شقته وإعلانات المبنى فقط.
- لا يوجد وصول `anon` إلى جداول التطبيق.
- دوال RLS المساعدة موجودة في schema خاصة غير معروضة عبر API.

## تهيئة أول مدير

إنشاء مستخدم أول في **Supabase Dashboard → Authentication → Users**. بعد إنشاء المستخدم، نفّذ الاستعلام التالي من SQL Editor مع استبدال القيم بين الأقواس:

```sql
-- استخدم UUID المستخدم من Authentication → Users
insert into public.profiles (id, full_name, phone)
values ('<MANAGER_USER_UUID>', 'اسم المدير', '<PHONE>')
on conflict (id) do update
set full_name = excluded.full_name, phone = excluded.phone;

with new_building as (
  insert into public.buildings (name, manager_name, manager_phone)
  values ('اسم العمارة', 'اسم المدير', '<PHONE>')
  returning id
)
insert into public.building_members (building_id, user_id, role)
select id, '<MANAGER_USER_UUID>', 'manager'::public.app_role
from new_building;
```

بعد ذلك يضيف المدير الشقة ورقم جوال المالك من التطبيق، ثم يضغط «حفظ الشقة وإنشاء / إعادة ضبط PIN المالك». تستدعي الواجهة Edge Function `manage-owner-access`، التي تتحقق من جلسة المدير وربط الوحدة، ثم تنشئ حساب Auth وتربطه بالشقة. تُعرض PIN مؤقتة عشوائية من 8 أرقام مرة واحدة فقط؛ لا تُخزّن كقيمة صريحة في قاعدة البيانات أو المستودع. PIN الدائم الحالي يبقى 6 أرقام لتجنب إبطال رموز الملاك الحاليين.

يدخل المالك رقم جواله والـPIN في شاشة الدخول. لعدم تهيئة مزود SMS (مثل Twilio)، تستخدم Auth بريدًا داخليًا ثابتًا ضمن نطاق `.invalid` مشتقًا من رقم الجوال؛ لا يحتاج المالك إلى بريد ولا تُرسل رسالة. هذا يبقي الجلسة وسياسات RLS ضمن Supabase Auth، لكنه ليس Phone provider الأصلي. يقبل تسجيل الدخول PIN الدائم الحالي من 6 أرقام والـPIN المؤقت الجديد من 8 أرقام. عند أول دخول يُدخل المالك PIN المؤقت الحالي ويختار PIN دائمًا من 6 أرقام. تتحقق Edge Function `complete-owner-pin-change` من الجلسة ودور المالك والرمز الحالي، ثم تغيّر كلمة المرور وتزيل علامة `must_change_pin` بصلاحية الخادم. حتى ذلك الحين، تسمح الواجهة بقراءة الملف والعضوية اللازمين لعرض البوابة فقط، وتحجب RLS بيانات المبنى والوحدة والدفعات والإعلانات حتى لو استُدعي API مباشرة. لا يملك دور `authenticated` صلاحية تحديث جدول `profiles` مباشرة. ويمكن للمدير إصدار رمز مؤقت جديد من شاشة تعديل الشقة عند فقدانه.

## قواعد مهمة

- يجب أن يكون `residents.user_id` مرتبطًا بمستخدم Auth واحد فقط؛ القيد `unique` يمنع ربط الحساب نفسه بوحدتين.
- لا تستخدم مفتاح `service_role` داخل المتصفح أو ملفات GitHub.
- مفتاح `anon` أو `sb_publishable_*` قابل للنشر في الواجهة، لكن RLS هو الحماية الفعلية.
- لا تُنشئ سياسات تسمح للمالك بالاعتماد على `building_id` وحده؛ ربط الوصول يكون عبر `auth.uid()`.

## حالة واجهة التطبيق

الواجهة تستخدم Supabase Auth لتسجيل دخول المدير بالبريد والمالك بالجوال والـPIN، وتحدد الدور من `building_members`، وتحمّل وتكتب البيانات عبر المفتاح العام وسياسات RLS. تُخزّن حالة فرض تغيير PIN في `profiles.must_change_pin` بينما تبقى كلمة المرور محفوظة بتجزئة Supabase Auth. لم يعد مسار التشغيل يعتمد على `localStorage` أو GitHub Gist.

## نشر دوال Edge

الدوال الخمس في `supabase/functions/` تُنشر يدويًا من لوحة Supabase لأن موصل MCP الرسمي قد لا يملك نطاق `projects:read`/`database:read` المطلوب لأدوات الإدارة:

1. اختر المشروع `musvcrkljccubwbcrtjs` ← **Edge Functions** ← الدالة المطلوبة.
2. تبويب **Code** ← استبدل `index.ts` بنسخة المستودع، ثم **Deploy updates** وأكّد.
3. تأكد أن **Settings → Verify JWT with legacy secret** مفعّل (ما عدا `owner-login`)، وأن **Overview** يعرض «Last deployed a few seconds ago».
4. للتحقق من التطابق: احسب `sha256sum supabase/functions/<name>/index.ts` وقارنه ببصمة محتوى المحرر.
5. اختبار سريع: طلب `POST` بدون توثيق يجب أن يعيد `401` بصيغة الدالة `{"error":"unauthorized"}`.

بديل عند توفر `SUPABASE_ACCESS_TOKEN`: `npx supabase functions deploy <name> --project-ref musvcrkljccubwbcrtjs`. لا ترفع ملفات تجريبية مع الدالة، ولا تضع `BACKUP_REPO_TOKEN` أو `service_role` في المتصفح أو الريبو.

### اختبارات الدوال

كل دالة تُصدّر `handleRequest` ولا تستمع إلا عندما تكون وحدة الدخول (`import.meta.main`)، وهو ما يتحقق في Edge Runtime ولا يتحقق عند استيرادها في الاختبارات. تشغيل الاختبارات محليًا:

```bash
deno test --allow-env --allow-net supabase/functions/*/index_test.ts
```

الاختبارات لا تلمس الإنتاج: تستخدم خادم Supabase وهميًا محليًا على `127.0.0.1` لعزل Auth وREST. خطوة `deno test` مضافة إلى مهمة `edge-function-check` في CI، وملفات `index_test.ts` لا تُنشر مع الدالة.

## رصد أخطاء الواجهة

**الحالة: مطبَّق ومفعَّل في الإصدار `manzil-v96` (2026-11-05).** أُسند الترحيل `supabase/migrations/20261104220000_client_error_reports.sql` إلى المشروع المستضاف عبر مهمة `workflow_dispatch` مؤقتة تستخدم السر `SUPABASE_DB_URL` مع `psql` داخل معاملة واحدة، ثم حُذفت المهمة بعد التحقق. النتيجة: الجدول وRLS والسياسة الإلحاقية ومُشغّل الحد الأقصى مثبّتة، وإدراج فعلي عبر REST أعاد `201` بينما أعادت القراءة `401`. لا يستخدم المشروع `supabase db push` لعدم وجود ربط CLI محلي؛ أي ترحيل لاحق يُطبَّق بنفس الطريقة أو من SQL Editor.

يرسل `js/telemetry.js` أخطاء JavaScript وأخطاء الوعود غير المعالجة إلى جدول `public.client_errors` باستخدام مفتاح publishable.

- الجدول إلحاقي فقط: دورَا `anon` و`authenticated` يملكان `insert` دون `select`، ولا يوجد تعديل أو حذف عبر API.
- يتوقف الإدخال تلقائياً عند 5000 صف حتى لا يتضخم التخزين.
- لا تُرسل قيم الحقول أو بيانات شخصية: الرسالة والمسار والملف ورقم السطر والدور وإصدار الواجهة فقط، والمكدس محدود بـ1200 حرف.
- لا يُرسل شيء من `localhost` أو `127.0.0.1`؛ تُحفظ آخر 20 خطأ محلياً في `localStorage` تحت `manzil-error-log`، ويمكن قراءتها من الكونسول عبر `manzilErrorLog()`.

لقرار أخطاء الإنتاج نفّذ من SQL Editor:

```sql
select created_at, release, kind, role, message, source, line, path
from public.client_errors
order by created_at desc
limit 50;
```

> **الحالة (2026-11-05): مفعّل في الإنتاج.** الدالة `monitor-client-errors` منشورة (الإصدار 1) مع **Verify JWT معطّل** لأنها تتحقق من `CRON_SECRET` في جسم الطلب. السر محفوظ في أسرار Edge Functions باسم `CRON_SECRET`، ونسخة مطابقة في Vault باسم `manzil_cron_secret` ليقرأها أمر الجدولة دون كتابة القيمة نصًا. امتدادا `pg_cron` (1.6.4) و`pg_net` (0.20.4) مفعّلان، والمهمة `manzil-daily-error-check` تعمل يوميًا الساعة **06:00 UTC** (08:00 بتوقيت القاهرة) عبر `net.http_post`.
>
> التحقق الحي: طلب بالسر الصحيح أعاد `200 {"checked":true,"errorCount":0,"threshold":100}`، والسر الخاطئ `401`، وGET `405`؛ وأعاد `net._http_response` الحالة `200` لنفس التشغيل. الحد 100 خطأ/24 ساعة، والتجاوز يُسجَّل في سجلات الدالة (`console.error`) دون إشعار خارجي بعد.
>
> `pg_net` مثبّت بالأمر الموصى به `create extension pg_net;` الذي ينشئ مخطط `net` تلقائيًا. يظهر تحذير المستشارين `extension_in_public` لأن سجل الامتداد في `public`، لكن دواله (`net.http_post`) في مخطط `net` وغير مكشوفة عبر PostgREST؛ الامتداد غير قابل للنقل (`extrelocatable=false`) فلا تحاول `alter extension ... set schema`.
>
> لمتابعة المهمة:
> ```sql
> select jobid, jobname, schedule, active from cron.job;
> select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
> select id, status_code, content, error_msg from net._http_response order by id desc limit 10;
> ```
>
> لتشغيل الفحص فورًا بدل انتظار الجدولة:
> ```sql
> select net.http_post(
>   url := 'https://musvcrkljccubwbcrtjs.supabase.co/functions/v1/monitor-client-errors',
>   headers := '{"Content-Type":"application/json"}'::jsonb,
>   body := jsonb_build_object('cron','daily_error_check','secret',(select decrypted_secret from vault.decrypted_secrets where name='manzil_cron_secret'))
> );
> ```

## اختبار الاستعادة (Restore Drill)

**الحالة (2026-11-05): ناجح على مشروع مؤقت.** أُنشئ مشروع `manzil-restore-drill` في نفس المؤسسة والمنطقة بتكلفة **$0/شهر**، ثم حُذف بعد الاختبار.

- نُزّلت أحدث نسخة `backup-20261105T212133Z` من المستودع الخاص، وتطابق بصمة SHA-256، ثم استُعيدت بالأمر نفسه المستخدم في الإنتاج.
- اكتُشف أن الأمر السابق كان يفشل عند `DROP EVENT TRIGGER pgrst_drop_watch` لأن مخططات `auth`/`storage` والمشغلات العامة مملوكة لـ`supabase_admin`، ودور `postgres` لا يملك صلاحية تعديلها. أصبحت الاستعادة محصورة في `public` و`private` و`supabase_migrations`، وهي مخططات التطبيق التي يملكها `postgres`.
- بيانات الدخول في `auth` لا تُستعاد من النسخة المنطقية؛ تبقى كما هي في المشروع الهدف. هذا هو السلوك الصحيح للاستعادة فوق قاعدة قائمة.
- بعد الاستعادة نجح `tests/post-restore-verify.sql` بكل فحوصه: 13 جدولًا أساسيًا، وRLS على كل الجداول، والفهارس، وسلامة المراجع.
- للتحقق يدويًا بعد أي استعادة:
  ```bash
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/post-restore-verify.sql
  ```

## اختبار الخصوصية قبل الإطلاق

1. سجّل دخول المدير وتأكد من رؤية كل الشقق والتحصيلات والمصروفات.
2. سجّل دخول المالك الأول وتأكد من قراءة شقته ودفعاتها والإعلانات فقط.
3. جرّب طلب قراءة شقة المالك الثاني من نفس جلسة المالك الأول؛ يجب أن يعيد صفوفًا فارغة.
4. جرّب إدخال أو تعديل تحصيل/مصروف من جلسة المالك؛ يجب رفض العملية عبر RLS.
5. جرّب طلبًا بدون جلسة Auth؛ يجب ألا يعيد أي صف من جداول التطبيق.
6. لحساب عليه `must_change_pin=true`، جرّب تحديث `profiles` مباشرة؛ يجب رفضه. تحقق أيضًا أن Edge Function ترفض PIN حاليًا خاطئًا أو PIN جديدًا مطابقًا له.

## نتيجة فحص المدير الأول

- تم إنشاء حساب المدير الأول وربطه بعضوية `manager` في مبنى `Manzil`.
- نجح تسجيل الدخول من الواجهة، واستُعيدت الجلسة عند إعادة تحميل الصفحة.
- اختبار قراءة المبنى بصلاحية المدير نجح بعد إضافة migration تمنح دور `authenticated` صلاحية `USAGE` على schema الخاصة و`EXECUTE` على دوال RLS المساعدة.
- تأكد الاختبار أن `anon` لا يستطيع تنفيذ دالة المدير المساعدة أو قراءة جدول المباني.
- إعداد Phone provider الأصلي في لوحة Supabase بقي معطّلًا لأن الواجهة تتطلب بيانات SMS Provider غير متوفرة؛ لا يعتمد مسار PIN الحالي على SMS.
- اجتاز اختبارًا حيًا بحسابَي مالكين وأرقام هاتف خيالية محجوزة للاختبار: الدخول بالجوال وPIN، فرض تغيير PIN عند أول دخول، وإظهار وحدة كل مالك فقط؛ القراءة العابرة لم تُرجع صفوفًا والتعديل لم يغيّر السجل.
- حُذفت حسابات Auth والوحدات وسجلات التدقيق المؤقتة بعد الاختبار. لم يُنشأ أو يُغيّر أي حساب مالك حقيقي؛ يُنصح بأن يختبر المدير أول مالك فعلي من واجهة التطبيق قبل تعميمها.

## ترحيل توجيه التحصيل إلى الصناديق

**الحالة: مطبَّق على المشروع المستضاف (2026-11-05).** الملف `supabase/migrations/20261105090000_income_cash_account_allocation.sql` يضيف عمود `cash_account_code` إلى `public.income` مع قيد القيم (`main` / `development` / `emergency`)، ويعيد تعريف `private.get_cashbox_summary` و`private.get_monthly_cashbox_close` و`private.persist_building_snapshot` ليُحسب رصيد كل صندوق من التحصيل الموجه إليه بدل الخزنة الرئيسية وحدها.

- طُبِّق عبر مهمة GitHub Actions واحدة (`workflow_dispatch` بديل: فرع مؤقت `ops/apply-income-cash-account-migration` بمشغّل `push`) يستخدم السر `SUPABASE_DB_URL` مع `psql --single-transaction -v ON_ERROR_STOP=1`، ثم حُذف الفرع والمهمة بعد التحقق. لم تُلمس ملفات الواجهة في هذا الرفع.
- خطوة التحقق في نفس المهمة تفشل الترخيص (RAISE EXCEPTION) لو: العمود مفقود أو غير `NOT NULL DEFAULT 'main'`، القيد مفقود أو `NOT validated`، أي دالة من الثلاث بلا توجيه، أي تحصيل قديم تغيّر صندوقه، رصيد أي صندوق لا يطابق حسابه المستقل، أو لم يعد الإقفال الشهري `reconciled`. النتيجة: `success`.
- تحقق خارجي إضافي من PostgREST: `select=cash_account_code` يرجع خطأ صلاحية `42501` بينما عمود وهمي يرجع `42703`، أي أن العمود موجود في مخطط المشروع المستضاف.
- الترتيب إلزامي لأي إصدار قادم: طبّق الترحيل أولًا ثم انشر الواجهة. الواجهة تطلب العمود `cash_account_code` في قائمة حقول `income`، فلو بقيت القاعدة بدون العمود تفشل جلسة المدير عند التحميل بخطأ `42703`.
- العكس آمن: قاعدة بها العمود تعمل مع عملاء إصدارات أقدم، لأن `persist_building_snapshot` يحدّث التوجيه فقط عندما يرسل العميل المفتاح، فلا يعيد العميل القديم التحصيلات الموجهة إلى `main`.
- القيم القديمة حصلت على `main` عند إضافة العمود، ولم يتغيّر رصيد أي صندوق قبل أول تحصيل جديد.
