# التكاملات الخارجية — EDU Creative Studio AI

## ما الذي أصبح متاحاً في الكود؟

أضيفت طبقة API موحدة وواجهة MCP أولية إلى Cloudflare Worker:

- فحص الخدمة: `GET /api/v1/health` (لا يحتاج رمزاً).
- توليد كتاب: `POST /api/v1/books/generate` (يتطلب Bearer token).
- وصف OpenAPI: `GET /openapi.json`.
- خادم MCP عبر HTTP: `POST /mcp`، بروتوكول JSON-RPC 2.0 / MCP `2025-03-26`.
- أدوات MCP: `health` و`generate_book`.
- المسار القديم `POST /api/book` باقٍ للتوافق مع نسخة الموقع الحالية.

## عناوين الخدمة بعد نشر Worker

استبدل `YOUR-WORKER` باسم Worker الحقيقي الذي يظهر في لوحة Cloudflare:

- API: `https://YOUR-WORKER.workers.dev/api/v1`
- OpenAPI: `https://YOUR-WORKER.workers.dev/openapi.json`
- MCP: `https://YOUR-WORKER.workers.dev/mcp`
- Health: `https://YOUR-WORKER.workers.dev/api/v1/health`

لا تستخدم رابط GitHub Pages باعتباره عنوان MCP؛ واجهة MCP موجودة على Worker وليس على الموقع الثابت.

## المصادقة والأسرار

يجب ضبط السرّين في Cloudflare Worker Secrets:

- `OPENAI_API_KEY`: مفتاح API صالح ومفعّل للفوترة/الاستخدام.
- `APP_ACCESS_TOKEN`: رمز وصول قوي وفريد.

كل طلب إلى `/api/v1/books/generate` أو `/mcp` يحتاج الترويسة:

```http
Authorization: Bearer YOUR_APP_ACCESS_TOKEN
```

لا تضع أيّاً من السرّين في GitHub أو ملفات HTML/JavaScript العامة أو محادثة. لا تشارك رمز الوصول في إعدادات موصل عام أو خادم MCP غير موثوق. استخدم فقط تطبيقاً موثوقاً يدعم تخزين بيانات الاعتماد السرية.

## اختبار API

فحص الحالة:

```bash
curl https://YOUR-WORKER.workers.dev/api/v1/health
```

توليد كتاب:

```bash
curl -X POST https://YOUR-WORKER.workers.dev/api/v1/books/generate \
  -H "Authorization: Bearer YOUR_APP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"مدخل إلى تصنيف التفاعلات الكيميائية","subject":"الكيمياء","grade":"الثانوي"}'
```

## إعداد MCP

في عميل MCP يدعم **Remote MCP عبر Streamable HTTP** وإضافة ترويسة Bearer مخصصة، استخدم:

- Server URL: `https://YOUR-WORKER.workers.dev/mcp`
- Authorization: `Bearer YOUR_APP_ACCESS_TOKEN`

يجب أن يرسل العميل طلب `initialize` ثم `tools/list`. الأدوات المتاحة:

1. `health`: فحص الخدمة.
2. `generate_book`: إنشاء كتاب تعليمي عربي بمصادر ومراجعة آلية.

مثال طلب JSON-RPC لاختبار التهيئة:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"mcp-client","version":"1.0.0"}}}
```

## حدود مهمة

- إضافة هذه المسارات إلى المستودع لا تنشر Worker تلقائياً ما لم يكن Cloudflare مربوطاً بالنشر التلقائي. يجب نشر آخر نسخة من `worker/index.js` على Cloudflare بعد حفظ التعديل.
- لم تُختبر هذه الواجهة على خادم Cloudflare حيّ بعد؛ لا تعتبرها مفعّلة حتى ينجح اختبار Health وMCP من عنوان Worker الفعلي.
- MCP لا يثبت الأداة تلقائياً في كل منصات الذكاء الاصطناعي. يجب أن يدعم التطبيق المستهلك Remote MCP/HTTP وأن يسمح بإعداد عنوان الخادم والمصادقة. المنصات التي لا تدعم ذلك يمكنها استخدام REST API أو فتح الموقع/استيراد الملفات وفق قدراتها.
- واجهة OpenAPI وصف للـ REST API وليست إضافة تلقائية داخل كل تطبيق.
- التوليد يستخدم OpenAI API وقد يترتب عليه استهلاك مدفوع. مراجعة المحتوى آلية وليست اعتماداً علمياً بشرياً.
- لا ترسل بيانات الطلاب الشخصية أو الحساسة.
