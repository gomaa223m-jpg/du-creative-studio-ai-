# إعداد محرك الفيديو السحابي — EDU Creative Studio

## تنبيه مهم
هذه خدمة اختيارية منفصلة عن GitHub Pages ومحرك تأليف الكتب. إنشاء رمز الوصول في صفحة الاستوديو لا ينشر الخادم ولا يضيف الأسرار إليه. يلزم نشر Worker مستقل باستخدام الملف `worker/ai-gateway.js`.

قد يترتب على مزود الذكاء الاصطناعي رسوم أو حدود استخدام. يجب أن يتولى مالك الحساب أو الشخص البالغ المسؤول إعداد حساب المزود والفوترة والمفتاح السري. لا تضع أي مفتاح في الموقع أو GitHub أو المحادثة.

## النشر التلقائي من GitHub Actions

يدعم المستودع الآن نشر بوابة الفيديو تلقائياً عند تعديل `worker/ai-gateway.js` أو `wrangler.video.toml` أو ملف سير النشر. أضف الإعدادات التالية في **Settings → Secrets and variables → Actions**:

**Secrets**
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `APP_ACCESS_TOKEN`
- `AI_API_KEY`

**Variables**
- `AI_BASE_URL`: عنوان أساس API المتوافق مع Chat Completions، مثل `https://api.openai.com/v1`؛ لا تضف `/chat/completions` إلا إذا كان عنوان المزود يتطلبه.
- `AI_MODEL`: معرّف نموذج متاح لحساب المزود ويدعم إخراج JSON.

بعد حفظ الإعدادات، افتح **Actions → Deploy EDU Creative Studio Worker → Run workflow**. لا تعتبر علامة نجاح سير العمل دليلاً على نشر Worker إذا كانت خطوة النشر قد تم تخطيها؛ راجع ملخص التشغيل وتأكد من ظهور خطوة **Deploy optional video AI gateway** ناجحة.

## النشر باستخدام Cloudflare Dashboard
1. افتح Cloudflare ثم **Workers & Pages** وأنشئ Worker جديداً باسم `edu-creative-video-gateway`.
2. افتح محرر الكود، واستبدل محتواه بالكامل بمحتوى الملف `worker/ai-gateway.js` من هذا المستودع، ثم انشره.
3. من **Settings → Variables and Secrets** أضف:
   - Secret `APP_ACCESS_TOKEN`: الرمز الذي أنشأته من زر «إنشاء رمز وصول آمن ونسخه» في لوحة الفيديو.
   - Secret `AI_API_KEY`: مفتاح المزود الذي اختاره وأعدّه مالك الحساب/المسؤول البالغ.
   - Variable `AI_BASE_URL`: عنوان واجهة Chat Completions المتوافقة لدى المزود، مثل `https://api.openai.com/v1` عند استخدام مزود يدعم هذا المسار.
   - Variable `AI_MODEL`: اسم نموذج صحيح ومتاح لدى المزود.
   - Variable `ALLOWED_ORIGINS`: `https://gomaa223m-jpg.github.io`
4. احفظ الإعدادات وأعد نشر Worker إذا طلبت لوحة Cloudflare ذلك.
5. اختبر عنوان الصحة: `https://YOUR-WORKER.workers.dev/health`. يجب أن يعيد JSON يتضمن `"ok":true`.
6. في لوحة الفيديو بالموقع، أدخل:
   - رابط الخادم: `https://YOUR-WORKER.workers.dev/api/generate`
   - رمز الوصول: القيمة نفسها التي أضفتها كسِر `APP_ACCESS_TOKEN`.
7. اضغط «حفظ إعدادات المحرك السحابي لهذه الجلسة»، ثم جرّب عنوان درس قصيراً.

## النشر عبر Wrangler
يوجد ملف إعداد مستقل `wrangler.video.toml` حتى لا يختلط Worker الفيديو بمحرك الكتب:
```bash
npx wrangler deploy --config wrangler.video.toml
npx wrangler secret put APP_ACCESS_TOKEN --config wrangler.video.toml
npx wrangler secret put AI_API_KEY --config wrangler.video.toml
```
أضف المتغيرين `AI_BASE_URL` و`AI_MODEL` من لوحة Cloudflare أو عبر إعدادات Wrangler، ثم تحقق من `ALLOWED_ORIGINS`.

## حدود الوظيفة
هذا المحرك ينشئ سيناريو منظماً ومشاهد وتعليقاً صوتياً نصياً. لا ينشئ ملف MP4 أو لقطات فيديو واقعية أو صوتاً مسجلاً بمفرده؛ إخراج الفيديو المحلي يتم من أدوات الاستوديو، أما توليد لقطات واقعية أو صوت مسجل فيحتاج خدمة منفصلة.
