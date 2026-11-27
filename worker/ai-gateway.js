/**
 * EDU CREATIVE STUDIO AI — secure AI gateway
 * Cloudflare Worker entry point. Store all keys as Worker secrets.
 * Supports OpenAI-compatible chat-completions APIs; not every vendor natively.
 */
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", ...extra }
});
function cors(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return { "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
    "Vary": "Origin", "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" };
}
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function instructions(task, input) {
  const topic = String(input.topic || input.title || "").slice(0, 300);
  const grade = String(input.grade || "المرحلة الثانوية").slice(0, 100);
  const subject = String(input.subject || "علوم").slice(0, 100);
  const context = String(input.context || input.extra || "").slice(0, 12000);
  if (!topic.trim()) throw new Error("اكتب عنوان الدرس أو الموضوع أولاً.");
  const base = "أنت فريق إنتاج تعليمي عربي يضم خبير مناهج ومراجعاً علمياً وكاتب سيناريو ومخرجاً تعليمياً. اكتب بالعربية الفصحى الواضحة، واضبط المصطلحات والمعادلات، ولا تخترع مراجع أو حقائق. إذا كانت معلومة غير مؤكدة فصرّح بذلك.\nالمادة: " + subject + "\nالصف: " + grade + "\nالموضوع: " + topic + "\nملاحظات: " + context;
  if (task === "video") return base + "\nأنشئ حزمة إنتاج فيديو تعليمي جاهزة للتحرير مدتها 90-150 ثانية. أعد JSON صالحاً فقط بالمفاتيح: title, learning_goals, duration_seconds, voiceover, scenes, quiz, scientific_checks, sources_to_verify. أخرج 8-12 مشهداً. كل مشهد يحوي duration, title, visual, on_screen_text, voiceover, camera, transition, sound, asset_prompt. اجعل المشاهد مترابطة بصرياً، وأضف رسوماً توضيحية للمعادلات عند الحاجة. لا تضع نصوصاً طويلة على الشاشة.";
  if (task === "lesson") return base + "\nأنشئ خطة درس متكاملة. أعد JSON فقط بالمفاتيح title, objectives, warmup, sections, activity, assessment, homework, misconceptions, review_notes. كل section يحوي heading, content, example.";
  if (task === "worksheet") return base + "\nأنشئ ورقة عمل متدرجة من 12 سؤالاً مع نموذج إجابة منفصل وتفسير مختصر. أعد JSON فقط بالمفاتيح title, instructions, questions, answer_key, review_notes.";
  if (task === "book") return base + "\nأنشئ كتاباً تعليمياً من 6 صفحات على الأقل. أعد JSON فقط بالمفاتيح title, introduction, objectives, pages, review_notes, sources_to_verify. كل صفحة تحوي title وcontent.";
  return base + "\nأنشئ محتوى تعليمياً قابلاً للاستخدام. أعد JSON صالحاً فقط بالمفاتيح title, content, key_points, review_notes.";
}
async function callModel(env, prompt) {
  if (!env.AI_API_KEY || !env.AI_BASE_URL || !env.AI_MODEL) throw new Error("أكمل أسرار AI_API_KEY وAI_BASE_URL وAI_MODEL في إعدادات Worker.");
  const base = env.AI_BASE_URL.replace(/\/+$/, "");
  const endpoint = base.endsWith("/chat/completions") ? base : base + "/chat/completions";
  const response = await fetch(endpoint, { method: "POST",
    headers: { "Authorization": "Bearer " + env.AI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.AI_MODEL, temperature: 0.45, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "أنت مساعد إنتاج تعليمي دقيق. أخرج JSON صالحاً فقط، ولا تضف Markdown." },
        { role: "user", content: prompt }
      ] }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || ("فشل مزود الذكاء الاصطناعي: " + response.status));
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("لم يُرجع المزود محتوى نصياً.");
  try { return JSON.parse(content.trim()); }
  catch { throw new Error("رد النموذج ليس JSON صالحاً. جرّب نموذجاً يدعم إخراج JSON."); }
}
export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "EDU CREATIVE STUDIO AI Gateway", version: "1.0.0" }, 200, headers);
    if (request.method !== "POST" || !["/api/generate", "/api/book"].includes(url.pathname)) return json({ ok: false, error: "المسار غير موجود." }, 404, headers);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return json({ ok: false, error: "هذا النطاق غير مسموح له بالاتصال." }, 403, headers);
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!safeEqual(token, env.APP_ACCESS_TOKEN || "")) return json({ ok: false, error: "رمز الوصول غير صحيح." }, 401, headers);
    try {
      const input = await request.json();
      const task = url.pathname === "/api/book" ? "book" : String(input.task || "content");
      if (!["video", "lesson", "worksheet", "book", "content"].includes(task)) return json({ ok: false, error: "نوع المهمة غير مدعوم." }, 400, headers);
      const result = await callModel(env, instructions(task, input));
      return json(task === "book" ? { ok: true, book: result } : { ok: true, result }, 200, headers);
    } catch (error) {
      return json({ ok: false, error: error.message || "تعذر تنفيذ الطلب." }, 500, headers);
    }
  }
};