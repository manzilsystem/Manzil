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

بعد ذلك ينشئ المدير حسابات الملاك من Auth، ثم يربط كل مستخدم بالوحدة السكنية عبر `residents.user_id` وعضوية `building_members` بدور `owner`. لا تُخزّن PINs للملاك في قاعدة البيانات.

## قواعد مهمة

- يجب أن يكون `residents.user_id` مرتبطًا بمستخدم Auth واحد فقط؛ القيد `unique` يمنع ربط الحساب نفسه بوحدتين.
- لا تستخدم مفتاح `service_role` داخل المتصفح أو ملفات GitHub.
- مفتاح `anon` أو `sb_publishable_*` قابل للنشر في الواجهة، لكن RLS هو الحماية الفعلية.
- لا تُنشئ سياسات تسمح للمالك بالاعتماد على `building_id` وحده؛ ربط الوصول يكون عبر `auth.uid()`.

## حالة واجهة التطبيق

هذا الفرع يضع مخطط Supabase وRLS وتهيئة المدير كأساس آمن قابل للمراجعة. ما زالت واجهة HTML القديمة تستخدم `localStorage` وPIN إلى أن تُنفذ خطوة قطع الواجهة إلى Supabase Auth والقراءة/الكتابة من الجداول الجديدة. لا تُشارك بيانات حقيقية مع الملاك قبل إتمام هذه الخطوة واختبارها على حساب مدير وحسابي مالكين منفصلين.

## اختبار الخصوصية قبل الإطلاق

1. سجّل دخول المدير وتأكد من رؤية كل الشقق والتحصيلات والمصروفات.
2. سجّل دخول المالك الأول وتأكد من قراءة شقته ودفعاتها والإعلانات فقط.
3. جرّب طلب قراءة شقة المالك الثاني من نفس جلسة المالك الأول؛ يجب أن يعيد صفوفًا فارغة.
4. جرّب إدخال أو تعديل تحصيل/مصروف من جلسة المالك؛ يجب رفض العملية عبر RLS.
5. جرّب طلبًا بدون جلسة Auth؛ يجب ألا يعيد أي صف من جداول التطبيق.
