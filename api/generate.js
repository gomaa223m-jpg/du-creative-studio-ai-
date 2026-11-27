import { timingSafeEqual } from "node:crypto";

function validBearer(header, expected) {
  const supplied = String(header || "").replace(/^Bearer\\s+/i, "");
  if (!supplied || !expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({error:"طريقة الطلب غير مدعومة."}); }
  if (!validBearer(req.headers.authorization, process.env.APP_ACCESS_TOKEN)) {
    return res.status(401).json({error:"رمز الوصول غير صحيح أو لم يُضبط على الخادم."});
  }
  const bodySize = Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
  if (bodySize > 20000) return res.status(413).json({error:"الطلب أكبر من الحد المسموح."});
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({error:"الخادم غير مكتمل الإعداد: أضف OPENAI_API_KEY كمتغير سري في الاستضافة."});
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({error:"أرسل وصف المشروع أولاً."});
  if (prompt.length > 18000) return res.status(413).json({error:"النص طويل جداً. اختصر التفاصيل ثم أعد المحاولة."});
  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
      signal:AbortSignal.timeout(45000),
      body:JSON.stringify({model:process.env.OPENAI_MODEL || "gpt-6",instructions:"أنت مساعد متخصص في إنتاج محتوى تعليمي عربي دقيق. لا تختلق مراجع أو بيانات، وراعِ عمر الطلاب وسلامتهم.",input:prompt,max_output_tokens:7000,store:false})
    });
    const data = await upstream.json().catch(()=>({}));
    if (!upstream.ok) { console.error("OpenAI API error",upstream.status,data?.error?.code||"unknown"); return res.status(upstream.status===429?429:502).json({error:upstream.status===429?"تم بلوغ حد الاستخدام أو الرصيد المتاح.":"تعذر على خدمة الذكاء الاصطناعي إكمال الطلب. راجع إعدادات النموذج والخادم."}); }
    const output=(data.output||[]).filter(x=>x.type==="message").flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n").trim();
    if (!output) return res.status(502).json({error:"لم يرجع النموذج نصاً قابلاً للعرض."});
    return res.status(200).json({output});
  } catch (e) { console.error("Generation route failed",e?.message||"unknown"); return res.status(500).json({error:"حدث خطأ في الخادم أثناء إنشاء المحتوى."}); }
}