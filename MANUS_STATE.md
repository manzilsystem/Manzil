# MANUS_STATE — لقطة استئناف Manzil

آخر تحديث: 2026-11-20، بعد دمج PR #479 والتحقق من النشر الحي.

## المستودع وGitHub
المستودع [manzilsystem/Manzil](https://github.com/manzilsystem/Manzil). `main` نظيف ومتزامن عند `8857fa657c5573fdce389eb374be12d55058ce50` بعد دمج [PR #479](https://github.com/manzilsystem/Manzil/pull/479) squash. فرع الميزة حُذف بعد الدمج.

## دورة تقرير الفترة — S21
اكتمل قسم التقارير المختار عبر الطبقات الثلاث: واجهة `js/reports.js` تستدعي `get_period_report` للمدير المصرح، تطبق فلاتر الفترة/الغرض/الصندوق/الشقة، تتحقق من شكل الرد، وتعود إلى الحساب المحلي عند فشل القراءة دون تعطيل المعاينة. أضيفت migration `20261119230000_period_report_rpc.sql` لتجميع الأشهر والتحصيلات والمصروفات والطرق والأغراض خادميًا مع عزل المبنى وحارس المدير، وربطت باختبار التكامل. أُصلحت أثناء التحقق سياسة `assistant_messages_insert_own` القديمة حتى ينجح `supabase db reset --local`.

## الاختبارات والفحوص
| النطاق | النتيجة |
|---|---|
| Node | `npm test`: **971/971** ناجح |
| تقرير الفترة | الاختبارات المستهدفة **38/38** ناجحة، بما فيها اعتماد RPC وfallback وفلاتر التقرير |
| TypeScript والأصول | `npm run typecheck` و`npm run build:index` و`npm run check:index` و`git diff --check` ناجحة؛ الإصدار `manzil-030bafcd68` |
| PR #479 | كل الفحوص ناجحة: Quality، Node/PostgreSQL، Local Supabase seed، Lighthouse، Browser E2E؛ E2E **209 ناجحة واختبار واحد متخطٍ**؛ Supabase Preview متخطٍ فقط |
| main بعد الدمج | Quality وNode/PostgreSQL وLocal Supabase seed وLighthouse وBrowser E2E وPages build/deploy كلها ناجحة |

## Supabase وسلامة البيانات
المشروع `musvcrkljccubwbcrtjs`، المنطقة `eu-north-1`، الحالة `ACTIVE_HEALTHY`. طُبقت migration `period_report_rpc` فعليًا. التحقق من `pg_proc` أثبت أن RPC العام والخاص يمنحان `EXECUTE` لـ`authenticated` ويرفضانه عن `anon`. لا توجد كتابة بيانات مالية أو تغيير بيانات مستخدمين.

## التحقق الحي
`https://manzilsystem.github.io/Manzil/` و`sw.js` و`js/reports.js` أعادت HTTP 200 بعد النشر. `sw.js` يحمل `manzil-030bafcd68`، و`js/reports.js` المنشور يحتوي استدعاء `get_period_report` ووسم مصدر قاعدة البيانات وحارس الطلب غير المتزامن.

## التالي والعوائق
اكتمل قسم التقارير لهذه الدورة وفق التصميم والوظائف والتكامل والأمان والاختبارات والنشر والتحقق الحي. القسم التالي لا يُبدأ تلقائيًا قبل تدقيق فجوة مثبتة حسب MANZIL-MASTER-RULES: الأولوية لتدقيق S20/S21 المتبقي أو مرشح S24 جديد. لا توجد عوائق مفتوحة في دورة التقارير؛ Supabase Preview كان متخطّيًا فقط، بينما فحوص Local Supabase وmain نجحت فعليًا.
