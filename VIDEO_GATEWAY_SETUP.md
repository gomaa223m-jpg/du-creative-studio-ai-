# إعداد بوابة الذكاء الاصطناعي للفيديو — EDU Creative Studio

## النشر التلقائي
يستطيع سير العمل نشر محرك الكتب ومحرك الفيديو كلٌّ على Worker مستقل. لا تضع أي مفتاح في ملفات المستودع أو المحادثة.

من GitHub افتح **Settings → Secrets and variables → Actions → New repository secret** وأضف:

- `CLOUDFLARE_API_TOKEN`: رمز Cloudflare API بصلاحية إدارة Workers والنشر.
- `CLOUDFLARE_ACCOUNT_ID`: معرّف حساب Cloudflare.
- `APP_ACCESS_TOKEN`: رمز وصول قوي تنشئه من داخل الاستوديو.
- `AI_API_KEY`: مفتاح API لمزود متوافق مع واجهة OpenAI Chat Completions.

أضف `OPENAI_API_KEY` أيضاً إذا أردت تفعيل محرك تأليف الكتب؛ هذا المفتاح منفصل عن `AI_API_KEY`.

بعد حفظ الأسرار، افتح **Actions → Deploy EDU Creative Studio Worker → Run workflow**. يجب أن تنجح خطوات النشر؛ لا يكفي بدء التشغيل فقط.

## إعداد الفيديو
ملف `wrangler.video.toml` يحدد عنوان API الافتراضي `https://api.openai.com/v1` والنموذج `gpt-4.1-mini` والنطاق المسموح لموقع الاستوديو. النموذج قابل للتعديل في الملف عند استخدام مزود آخر متوافق مع `/chat/completions` وJSON mode.

بعد نجاح النشر، افتح **Workers & Pages** في Cloudflare وانسخ نطاق Worker المسمى `edu-creative-video-gateway`، ثم أدخل في الاستوديو:

- الرابط: `https://اسم-النطاق.workers.dev/api/generate`
- رمز الوصول: نفس قيمة `APP_ACCESS_TOKEN` التي أضفتها في GitHub Secrets.

## فحص الصحة
افتح `https://اسم-النطاق.workers.dev/health`. يجب أن ترى `ok: true` و`configured: true` و`missing: []`. إذا ظهرت عناصر في `missing` فتحقق من إعدادات Worker Secrets/Variables.

## تنبيهات
- GitHub Pages وحده لا ينشر خادم الذكاء الاصطناعي؛ يلزم Cloudflare Worker.
- خدمات API قد تفرض رسوماً أو حدود استخدام حسب حساب المزود.
- لا ترسل مفاتيح API أو رموز الوصول إلى أي محادثة، ولا تضعها في HTML أو JavaScript.
- نجاح نشر Worker لا يعني أن توليد الفيديو النهائي MP4 مضمون على كل هاتف؛ تصيير الفيديو يتم محلياً داخل المتصفح.
