# عم عبده والذكاء الاصطناعي: إعداد Groq

## الفكرة

عم عبده يظل **محركًا حتميًا**: `js/assistant.js` هو الذي يحسب كل رقم، ويقرّر كل صلاحية، ويبني الرد المحلي. Groq لا يحسب ولا يقرّر ولا ينفّذ؛ دوره الوحيد هو إعادة صياغة رد مقروء باللهجة المصرية لقائمة محددة من الأسئلة المعلوماتية. أي فشل في الشبكة أو في النموذج يعيد التطبيق الرد المحلي كما هو.

القواعد الثابتة في الـ prompt (موجودة في `supabase/functions/assistant-groq/index.ts` وفي خادم التطوير):

- الرد المعتمد من بيانات التطبيق هو المصدر الوحيد للمعلومات.
- تُنسخ الأرقام والتواريخ وأسماء الشقق والسكان حرفيًا، بلا حساب جديد.
- لا يُضاف أي رقم أو اسم أو تقرير أو إجراء أو وعد.
- لا تُنفَّذ أوامر حفظ/تعديل ولا يُطلب تأكيد من النموذج.
- أسئلة التأكيد والإلغاء والرفض وفتح التقارير لا تُعاد صياغتها إطلاقًا.

## النشر

المفتاح لا يوجد في المتصفح ولا في المستودع. يعمل كـ Secret في Supabase ويستخدمه Edge Function اسمه `assistant-groq`:

```sh
# مرة واحدة، من جهازك وباستخدام SUPABASE_ACCESS_TOKEN من .env
npx supabase secrets set \
  GROQ_API_KEY=... \
  GROQ_MODEL=qwen/qwen3.8-27b \
  GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo \
  GROQ_TTS_MODEL=canopylabs/orpheus-arabic-saudi \
  GROQ_TTS_VOICE=abdullah \
  --project-ref musvcrkljccubwbcrtjs

npx supabase functions deploy assistant-groq --project-ref musvcrkljccubwbcrtjs
```

تفاصيل الاتصال:

- المتصفح ينادي `POST {SUPABASE_URL}/functions/v1/assistant-groq` بجلسة Supabase الحالية (`Authorization: Bearer <JWT>`).
- الدالة تتحقق من الـ JWT مقابل GoTrue قبل أي استخدام للمفتاح، وتسمح بـ `action: health` للفحص العام فقط.
- `action: chat` يستقبل `answerId` و`question` و`facts` و`role` فقط؛ الـ system prompt مخبّأ في السيرفر.
- `action: speak` يستقبل `text` فقط ويُرجع WAV خام من Groq؛ النص يُقسَّم إلى مقاطع لا يتجاوز كل منها 180 حرفًا، ثم تُدمج في ملف واحد. لا تُحفظ الاستجابة على السيرفر.
- `action: transcribe` يستقبل ملف صوت (`multipart/form-data`) ويستخدم Whisper (`whisper-large-v3-turbo`) مع تلميح عام للهجة المصرية. الحد الأقصى 8 MiB.
- المفتاح لا يُعاد في أي استجابة، وأخطاء Groq تُختصر إلى رموز عامة.

النموذج الافتراضي `qwen/qwen3.8-27b`: في اختبار مقارنة التزم حرفيًا بالأرقام المقدّمة، بينما أضاف `allam-2-7b` أرقامًا من عنده في نفس الاختبار. يمكن تغييره عبر Secret دون تعديل الكود.

## الصوت

- أثناء الضغط المطوّل على المايك يعمل `SpeechRecognition` في المتصفح (`ar-EG` أولًا) لإظهار الكلام فورًا، وهو كمان البديل عند تعذّر الاتصال.
- بعد انتهاء التسجيل، إن كانت الدالة متاحة، يُرسل الملف إلى Whisper فيُستخدم النص الناتج بدل نص المتصفح؛ وإن فشل الإرسال يُستخدم نص المتصفح.
- **قراءة ردود عم عبده أصبحت من Groq**: الدالة تطلب WAV من `canopylabs/orpheus-arabic-saudi` بالصوت الرجالي `abdullah`، والمتصفح يشغّله من كائن `blob:` في الذاكرة. صوت المتصفح (`ar-EG`، مع تفضيل صوت رجالي إن وُجد) يعمل كبديل فقط إذا فشل طلب Groq أو لم تُقبل شروط النموذج بعد.
- النصوص مكتوبة بعامية مصرية قريبة من رسائل واتساب («أزاي»، «كام»، «تمام»، «حاضر»، «يا فندم»). النطق هو اللهجة العربية المتاحة في Groq (سعودية)، لكن الكلام نفسه مصري ودود. القاعدة `أ/ = أستاذ` تُطبَّق في النص وفي النطق: `أ/سمير الشافعي` تُقرأ `أستاذ سمير الشافعي`.
- نموذج Orpheus يحتاج **قبول شروط من أدمن مؤسسة Groq** مرة واحدة على [رابط النموذج](https://console.groq.com/playground?model=canopylabs%2Forpheus-arabic-saudi). قبل القبول يُرجع `speak` الخطأ `tts_terms_required` ويعود المتصفح للبديل؛ بعد القبول لا يحتاج الأمر أي تعديل في الكود.
- لا تُحفظ المقاطع الصوتية في Supabase ولا في المتصفح بعد انتهاء الجلسة؛ كائنات `blob:` تُلغى فور انتهاء التشغيل أو عند مقاطعة الرد.
- أوامر التسجيل والتأكيد والإلغاء تُوضع دائمًا في خانة الكتابة للمراجعة قبل التنفيذ، سواء جاءت مكتوبة أو بالصوت.

## التطوير المحلي

```sh
# .env في جذر المشروع
GROQ_API_KEY=...
GROQ_MODEL=qwen/qwen3.8-27b
GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo
GROQ_TTS_MODEL=canopylabs/orpheus-arabic-saudi
GROQ_TTS_VOICE=abdullah

npm run dev:groq        # http://127.0.0.1:8787
```

الخادم `scripts/groq-dev-server.mjs` يقدّم الواجهة ويمرّر `/api/groq/chat` و`/api/groq/speak` و`/api/groq/transcribe` إلى Groq بالمفتاح من `.env`، ويضيف علامة في صفحته ليعرف المتصفح أن هذه النسخة تملك تلك المسارات. أي سيرفر ثابت آخر على localhost (مثل سيرفر الاختبارات) لا يُفعّل الجسر، فلا يُصدر طلبات فاشلة ولا 404 في الكونسول. على أي نطاق غير localhost يُستخدم Edge Function بدلًا من ذلك.

## الاختبارات والمراقبة

```sh
node --test tests/assistant-groq.test.cjs tests/assistant-voice.test.cjs
deno test supabase/functions/assistant-groq
```

`npm run check:secrets` يفحص الملفات المتتبعة، ويجب ألا يجد أي مفتاح. يُمنع وضع `GROQ_API_KEY` في `index.html` أو `sw.js` أو أي أصل ثابت.
