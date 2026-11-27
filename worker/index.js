const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept, MCP-Protocol-Version, MCP-Session-Id",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
});

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
  });
}

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text) return response.output_text;
  for (const item of response.output || []) {
    if (item.type === "message") {
      for (const part of item.content || []) {
        if (part.type === "output_text" && part.text) return part.text;
      }
    }
  }
  return "";
}

function collectSources(response) {
  const found = new Map();
  const add = (title, url) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    const normalized = url.split("#")[0];
    if (!found.has(normalized)) found.set(normalized, { title: title || new URL(normalized).hostname, url: normalized });
  };
  for (const item of response.output || []) {
    if (item.type === "web_search_call") {
      for (const source of item.action?.sources || []) add(source.title, source.url);
    }
    if (item.type === "message") {
      for (const part of item.content || []) {
        for (const annotation of part.annotations || []) {
          if (annotation.type === "url_citation") add(annotation.title, annotation.url);
        }
      }
    }
  }
  return Array.from(found.values()).slice(0, 20);
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["book_title", "subtitle", "introduction", "pages", "objectives"],
  properties: {
    book_title: { type: "string" },
    subtitle: { type: "string" },
    introduction: { type: "string" },
    pages: {
      type: "array", minItems: 4, maxItems: 12,
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "content"],
        properties: { title: { type: "string" }, content: { type: "string" } }
      }
    },
    objectives: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } }
  }
};

const auditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["review"],
  properties: {
    review: {
      type: "array", minItems: 4, maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["item", "status", "note"],
        properties: {
          item: { type: "string" },
          status: { type: "string", enum: ["راجعه", "يحتاج تحقق", "غير محسوم"] },
          note: { type: "string" }
        }
      }
    }
  }
};


function imageEngineUrl(env) {
  const raw = cleanText(env.IMAGE_ENGINE_URL, 500).replace(/\/+$/, "");
  if (!raw) throw new Error("لم يتم إعداد IMAGE_ENGINE_URL على الخادم.");
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("يجب أن يكون عنوان محرك الصور HTTPS آمناً دون بيانات دخول أو معاملات URL.");
  return raw;
}
function imageHeaders(env) {
  const headers = { Accept: "application/json" };
  if (env.IMAGE_ENGINE_TOKEN) headers.Authorization = "Bearer " + env.IMAGE_ENGINE_TOKEN;
  return headers;
}
function imageWorkflow({ prompt, negative, width, height, steps, cfg, seed, checkpoint, uploadedName, denoise }) {
  const graph = {
    "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: checkpoint } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["1", 1] } },
    "3": { class_type: "CLIPTextEncode", inputs: { text: negative, clip: ["1", 1] } }
  };
  let latentNode, samplerId;
  if (uploadedName) {
    graph["4"] = { class_type: "LoadImage", inputs: { image: uploadedName } };
    graph["5"] = { class_type: "VAEEncode", inputs: { pixels: ["4", 0], vae: ["1", 2] } };
    latentNode = ["5", 0]; samplerId = "6";
  } else {
    graph["4"] = { class_type: "EmptyLatentImage", inputs: { width, height, batch_size: 1 } };
    latentNode = ["4", 0]; samplerId = "5";
  }
  graph[samplerId] = { class_type: "KSampler", inputs: {
    seed, steps, cfg, sampler_name: "dpmpp_2m", scheduler: "karras",
    denoise: uploadedName ? denoise : 1,
    model: ["1", 0], positive: ["2", 0], negative: ["3", 0], latent_image: latentNode
  }};
  const decodeId = uploadedName ? "7" : "6";
  const saveId = uploadedName ? "8" : "7";
  graph[decodeId] = { class_type: "VAEDecode", inputs: { samples: [samplerId, 0], vae: ["1", 2] } };
  graph[saveId] = { class_type: "SaveImage", inputs: { filename_prefix: "EDU_Creative_Studio", images: [decodeId, 0] } };
  return graph;
}
async function handleImageEngine(request, env, origin, url) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.APP_ACCESS_TOKEN || auth !== "Bearer " + env.APP_ACCESS_TOKEN) return json({ ok: false, error: "رمز الوصول غير صحيح أو لم يُضبط على الخادم." }, 401, origin);
  let base;
  try { base = imageEngineUrl(env); } catch (error) { return json({ ok: false, error: error.message }, 503, origin); }
  const headers = imageHeaders(env);
  if (request.method === "GET" && url.pathname === "/api/v1/images/health") {
    if (!env.IMAGE_CHECKPOINT) return json({ ok: false, configured: false, error: "أضف IMAGE_CHECKPOINT باسم ملف النموذج الموجود في مجلد checkpoints." }, 503, origin);
    try {
      const upstream = await fetch(base + "/system_stats", { headers, signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) throw new Error("محرك الصور أعاد الحالة " + upstream.status);
      const stats = await upstream.json();
      const modelResponse = await fetch(base + "/object_info/CheckpointLoaderSimple", { headers, signal: AbortSignal.timeout(10000) });
      if (!modelResponse.ok) throw new Error("تعذر قراءة قائمة النماذج من ComfyUI: HTTP " + modelResponse.status);
      const modelInfo = await modelResponse.json();
      const checkpoints = modelInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
      if (!checkpoints.includes(env.IMAGE_CHECKPOINT)) {
        throw new Error("النموذج المحدد غير موجود في CheckpointLoaderSimple. تحقق من IMAGE_CHECKPOINT وملفات checkpoints.");
      }
      return json({ ok: true, configured: true, engine: "ComfyUI", checkpoint: env.IMAGE_CHECKPOINT, device: stats.devices?.[0]?.name || "متصل" }, 200, origin);
    } catch (error) {
      return json({ ok: false, configured: true, error: "فشل فحص جاهزية محرك الصور: " + String(error.message || error).slice(0, 180) }, 502, origin);
    }
  }
  if (request.method === "POST" && url.pathname === "/api/v1/images/generate") {
    let input;
    try { input = await request.json(); } catch { return json({ ok: false, error: "تعذر قراءة بيانات الطلب." }, 400, origin); }
    if (!env.IMAGE_CHECKPOINT) return json({ ok: false, error: "لم يتم تحديد IMAGE_CHECKPOINT على الخادم." }, 503, origin);
    const prompt = cleanText(input.prompt, 5000);
    const negative = cleanText(input.negative, 1600) || "blurry, low quality, distorted anatomy, malformed hands, unreadable text, watermark, logo";
    if (prompt.length < 8) return json({ ok: false, error: "اكتب وصفاً بصرياً أطول قبل التوليد." }, 400, origin);
    const width = Math.max(512, Math.min(1280, Math.round(Number(input.width) / 64) * 64 || 1024));
    const height = Math.max(512, Math.min(1280, Math.round(Number(input.height) / 64) * 64 || 1024));
    const steps = Math.max(12, Math.min(36, Math.round(Number(input.steps) || 26)));
    const cfg = Math.max(2, Math.min(9, Number(input.cfg) || 6));
    const denoise = Math.max(0.25, Math.min(0.8, Number(input.denoise) || 0.48));
    const seed = Number.isSafeInteger(Number(input.seed)) && Number(input.seed) >= 0 ? Number(input.seed) : crypto.getRandomValues(new Uint32Array(1))[0];
    let uploadedName = "";
    const imageData = typeof input.image === "string" ? input.image : "";
    if (imageData) {
      if (imageData.length > 7_000_000) return json({ ok: false, error: "الصورة كبيرة جداً؛ اختر صورة أصغر من 5 ميجابايت." }, 413, origin);
      const match = imageData.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json({ ok: false, error: "صيغة الصورة غير مدعومة. استخدم PNG أو JPG أو WEBP." }, 400, origin);
      try {
        const binary = atob(match[2]), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const extension = match[1] === "jpeg" ? "jpg" : match[1];
        const form = new FormData();
        form.append("image", new Blob([bytes], { type: "image/" + match[1] }), "edu-reference-" + crypto.randomUUID() + "." + extension);
        form.append("overwrite", "true");
        const upload = await fetch(base + "/upload/image", { method: "POST", headers, body: form, signal: AbortSignal.timeout(30000) });
        const uploaded = await upload.json().catch(() => ({}));
        if (!upload.ok || !uploaded.name) throw new Error(uploaded.error || "فشل رفع الصورة المرجعية إلى محرك الصور.");
        uploadedName = uploaded.name;
      } catch (error) {
        return json({ ok: false, error: "تعذر تجهيز الصورة المرجعية: " + String(error.message || error).slice(0, 180) }, 502, origin);
      }
    }
    const graph = imageWorkflow({ prompt, negative, width, height, steps, cfg, seed, checkpoint: cleanText(env.IMAGE_CHECKPOINT, 240), uploadedName, denoise });
    try {
      const queued = await fetch(base + "/prompt", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: graph, client_id: "edu-creative-studio" }),
        signal: AbortSignal.timeout(30000)
      });
      const result = await queued.json().catch(() => ({}));
      if (!queued.ok || !result.prompt_id) {
        const detail = result.error?.message || result.error || result.node_errors || "رفض محرك ComfyUI سير العمل.";
        return json({ ok: false, error: String(detail).slice(0, 500) }, 502, origin);
      }
      return json({ ok: true, prompt_id: result.prompt_id, seed, status: "queued", message: "أُرسل الطلب إلى محرك الصور. تابع حالة التوليد." }, 202, origin);
    } catch (error) {
      return json({ ok: false, error: "تعذر إرسال مهمة التوليد: " + String(error.message || error).slice(0, 180) }, 502, origin);
    }
  }
  if (request.method === "GET" && url.pathname === "/api/v1/images/status") {
    const promptId = cleanText(url.searchParams.get("prompt_id"), 100);
    if (!/^[a-f0-9-]{8,100}$/i.test(promptId)) return json({ ok: false, error: "معرّف مهمة غير صالح." }, 400, origin);
    try {
      const historyResponse = await fetch(base + "/history/" + encodeURIComponent(promptId), { headers, signal: AbortSignal.timeout(15000) });
      if (!historyResponse.ok) throw new Error("تعذر قراءة حالة المهمة: " + historyResponse.status);
      const history = await historyResponse.json(), item = history[promptId];
      if (!item) return json({ ok: true, status: "running", message: "المحرك ما زال ينفذ المهمة." }, 200, origin);
      const image = Object.values(item.outputs || {}).flatMap(group => group.images || [])[0];
      if (!image) {
        const failed = item.status?.status_str === "error";
        return json({ ok: !failed, status: failed ? "error" : "running", error: failed ? "انتهى التنفيذ دون صورة. تحقق من النموذج والذاكرة وسجل ComfyUI." : "جارٍ تجهيز الصورة النهائية." }, failed ? 502 : 200, origin);
      }
      const view = new URL(base + "/view");
      view.searchParams.set("filename", image.filename);
      view.searchParams.set("subfolder", image.subfolder || "");
      view.searchParams.set("type", image.type || "output");
      const imageResponse = await fetch(view.toString(), { headers, signal: AbortSignal.timeout(30000) });
      if (!imageResponse.ok) throw new Error("تعذر تنزيل الصورة الناتجة من المحرك.");
      const outHeaders = new Headers(corsHeaders(origin));
      outHeaders.set("Content-Type", imageResponse.headers.get("Content-Type") || "image/png");
      outHeaders.set("Cache-Control", "no-store");
      outHeaders.set("X-Image-Seed", String(item.prompt?.[1]?.seed || ""));
      return new Response(imageResponse.body, { status: 200, headers: outHeaders });
    } catch (error) {
      return json({ ok: false, error: String(error.message || error).slice(0, 220) }, 502, origin);
    }
  }
  return json({ ok: false, error: "مسار صور غير معروف." }, 404, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "https://gomaa223m-jpg.github.io")
      .split(",").map(value => value.trim()).filter(Boolean);
    if (origin && !allowedOrigins.includes(origin)) return new Response("Origin not allowed", { status: 403 });
    const headersOrigin = origin || allowedOrigins[0] || "https://gomaa223m-jpg.github.io";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(headersOrigin) });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && ["/health", "/api/v1/health"].includes(url.pathname)) {
      return json({ ok: true, service: "edu-creative-studio-api", apiVersion: "v1", mcp: "/mcp", tools: ["health", "generate_video_plan", "generate_book"] }, 200, headersOrigin);
    }

    if (url.pathname.startsWith("/api/v1/images/")) return handleImageEngine(request, env, headersOrigin, url);

    if (request.method === "POST" && url.pathname === "/api/generate") return handleGenerate(request, env, headersOrigin);

    if (request.method === "GET" && url.pathname === "/openapi.json") {
      return json({
        openapi: "3.1.0",
        info: { title: "EDU Creative Studio API", version: "1.0.0", description: "Unified API for educational content authoring." },
        servers: [{ url: url.origin }],
        paths: {
          "/api/v1/health": { get: { summary: "Service health", responses: { "200": { description: "Service status" } } } },
          "/api/generate": { post: { summary: "Generate an Arabic educational video script and scene plan", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["topic"], properties: { task: { type: "string" }, topic: { type: "string" }, subject: { type: "string" }, grade: { type: "string" }, context: { type: "string" } } } } } }, responses: { "200": { description: "Generated script and scene plan" }, "401": { description: "Unauthorized" }, "503": { description: "Cloud AI is not configured" } } } },
          "/api/v1/books/generate": { post: { summary: "Generate an educational book", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title"], properties: { title: { type: "string" }, subject: { type: "string" }, grade: { type: "string" }, term: { type: "string" }, type: { type: "string" }, size: { type: "string" }, level: { type: "string" }, design: { type: "string" }, extra: { type: "string" } } } } } }, responses: { "200": { description: "Generated book and review" }, "401": { description: "Unauthorized" }, "503": { description: "Service not configured" } } } }
        },
        components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } }
      }, 200, headersOrigin);
    }

    if (request.method === "POST" && url.pathname === "/mcp") {
      if (!env.APP_ACCESS_TOKEN) return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "MCP server is not configured." } }, 503, headersOrigin);
      const auth = request.headers.get("Authorization") || "";
      if (auth !== "Bearer " + env.APP_ACCESS_TOKEN) return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized. Provide a valid bearer token." } }, 401, headersOrigin);
      let rpc;
      try { rpc = await request.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400, headersOrigin); }
      if (!rpc || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
        return json({ jsonrpc: "2.0", id: rpc?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC request" } }, 400, headersOrigin);
      }
      if (rpc.method === "notifications/initialized" || rpc.method.startsWith("notifications/")) {
        return new Response(null, { status: 202, headers: corsHeaders(headersOrigin) });
      }
      if (rpc.method === "initialize") {
        return json({
          jsonrpc: "2.0", id: rpc.id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "edu-creative-studio", version: "1.0.0" },
            instructions: "Educational content tools. Call health to check service status, or generate_book to create an Arabic educational manuscript with source collection and automated review."
          }
        }, 200, headersOrigin);
      }
      if (rpc.method === "ping") return json({ jsonrpc: "2.0", id: rpc.id, result: {} }, 200, headersOrigin);
      if (rpc.method === "tools/list") {
        return json({
          jsonrpc: "2.0", id: rpc.id,
          result: { tools: [
            { name: "health", description: "Check whether EDU Creative Studio API is available.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
            { name: "generate_video_plan", description: "Generate an Arabic educational video script and scene plan. Requires an optional paid API key.", inputSchema: { type: "object", required: ["topic"], properties: { task: { type: "string" }, topic: { type: "string", minLength: 3, maxLength: 180 }, subject: { type: "string" }, grade: { type: "string" }, context: { type: "string", maxLength: 1800 } }, additionalProperties: false } },
            { name: "generate_book", description: "Generate an Arabic educational book with objectives, pages, web sources, and an automated scientific/editorial review. Requires configured API secrets and may incur API charges.", inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string", minLength: 3, maxLength: 180 }, subject: { type: "string" }, grade: { type: "string" }, term: { type: "string" }, type: { type: "string" }, size: { type: "string" }, level: { type: "string" }, design: { type: "string" }, extra: { type: "string", maxLength: 1800 } }, additionalProperties: false } }
          ] }
        }, 200, headersOrigin);
      }
      if (rpc.method === "tools/call") {
        const toolName = rpc.params?.name;
        const args = rpc.params?.arguments || {};
        if (toolName === "health") {
          return json({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify({ ok: true, service: "edu-creative-studio-api", apiVersion: "v1" }) }], isError: false } }, 200, headersOrigin);
        }
        if (toolName === "generate_video_plan") {
          const internalRequest = new Request(new URL("/api/generate", url.origin), {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": auth },
            body: JSON.stringify({ ...args, task: args.task || "video" })
          });
          const planResponse = await handleGenerate(internalRequest, env, headersOrigin);
          const resultText = await planResponse.text();
          return json({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: resultText }], isError: !planResponse.ok } }, 200, headersOrigin);
        }
        if (toolName === "generate_book") {
          const internalRequest = new Request(new URL("/api/book", url.origin), {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": auth },
            body: JSON.stringify(args)
          });
          const bookResponse = await handleBook(internalRequest, env, headersOrigin);
          const resultText = await bookResponse.text();
          return json({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: resultText }], isError: !bookResponse.ok } }, 200, headersOrigin);
        }
        return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: "Unknown tool: " + String(toolName || "") } }, 200, headersOrigin);
      }
      return json({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: "Method not found" } }, 200, headersOrigin);
    }

    if (request.method !== "POST" || !["/api/book", "/api/v1/books/generate"].includes(url.pathname)) {
      return json({ error: "المسار غير متاح." }, 404, headersOrigin);
    }
    return handleBook(request, env, headersOrigin);
  }
};


async function handleGenerate(request, env, headersOrigin) {
  if (!env.APP_ACCESS_TOKEN) return json({ ok: false, error: "لم يتم إعداد رمز الوصول على الخادم." }, 503, headersOrigin);
  const auth = request.headers.get("Authorization") || "";
  if (auth !== "Bearer " + env.APP_ACCESS_TOKEN) return json({ ok: false, error: "رمز الوصول غير صحيح." }, 401, headersOrigin);
  if (!env.OPENAI_API_KEY) return json({ ok: false, error: "محرك الذكاء الاصطناعي السحابي غير مفعّل. يتطلب مفتاح مزود API وقد تترتب عليه تكلفة؛ استخدم الوضع المحلي المجاني بدلاً منه." }, 503, headersOrigin);
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 12000) return json({ ok: false, error: "الطلب أكبر من الحد المسموح." }, 413, headersOrigin);
  let input;
  try { input = await request.json(); } catch { return json({ ok: false, error: "تعذر قراءة بيانات الطلب." }, 400, headersOrigin); }
  const task = cleanText(input.task, 40) || "video";
  const topic = cleanText(input.topic, 180);
  if (topic.length < 3) return json({ ok: false, error: "أدخل عنواناً واضحاً للدرس." }, 400, headersOrigin);
  const context = {
    subject: cleanText(input.subject, 80) || "يُستنتج من عنوان الدرس",
    grade: cleanText(input.grade, 100) || "يُستنتج مع التصريح بالافتراض",
    context: cleanText(input.context, 1800)
  };
  const sceneSchema = {
    type: "object", additionalProperties: false,
    required: ["title", "on_screen_text", "voiceover", "visual"],
    properties: {
      title: { type: "string" },
      on_screen_text: { type: "string" },
      voiceover: { type: "string" },
      visual: { type: "string" }
    }
  };
  const outputSchema = {
    type: "object", additionalProperties: false,
    required: ["title", "scenes", "voiceover", "content"],
    properties: {
      title: { type: "string" },
      scenes: { type: "array", minItems: 5, maxItems: 10, items: sceneSchema },
      voiceover: { type: "string" },
      content: { type: "string" }
    }
  };
  const instructions = `أنت كاتب ومخرج محتوى تعليمي عربي. أنشئ مادة دقيقة وواضحة تناسب السياق، وصرّح بالافتراضات عندما لا تُذكر المرحلة أو المادة. لا تخترع حقائق أو أرقاماً أو مراجع أو معادلات. إذا لم تكن واثقاً من معلومة تخصصية فضع تنبيهاً واضحاً داخل المحتوى. اكتب مشاهد مرئية قابلة للتحويل إلى موشن جرافيك، ونص تعليق صوتي طبيعي، وعناوين قصيرة على الشاشة. لا تدّعِ إنشاء ملف فيديو أو صوت؛ أعد سيناريو ومخطط مشاهد فقط. المهمة: ${task}. العنوان: ${topic}. السياق: ${JSON.stringify(context)}. أخرج JSON مطابقاً للمخطط فقط.`;
  try {
    const ai = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.AI_MODEL || "gpt-6.2-astra",
        store: false,
        max_output_tokens: 7000,
        instructions,
        input: "أنشئ المادة الآن مع مراجعة اتساق المصطلحات والتسلسل التعليمي.",
        text: { format: { type: "json_schema", name: "educational_video_plan", strict: true, schema: outputSchema } }
      })
    });
    const raw = await ai.json().catch(() => ({}));
    if (!ai.ok) return json({ ok: false, error: String(raw?.error?.message || "تعذر الاتصال بمزود الذكاء الاصطناعي.").slice(0, 450) }, ai.status === 429 ? 429 : 502, headersOrigin);
    let result;
    try { result = JSON.parse(getOutputText(raw)); } catch { return json({ ok: false, error: "وصل رد غير مكتمل أو غير منسق. أعد المحاولة." }, 502, headersOrigin); }
    if (!result || !Array.isArray(result.scenes) || result.scenes.length < 5) return json({ ok: false, error: "المحتوى الناتج غير مكتمل؛ لم يتم اعتماده." }, 502, headersOrigin);
    return json({ ok: true, result }, 200, headersOrigin);
  } catch (error) {
    return json({ ok: false, error: String(error.message || error).slice(0, 300) }, 502, headersOrigin);
  }
}

async function handleBook(request, env, headersOrigin) {
    if (!env.OPENAI_API_KEY || !env.APP_ACCESS_TOKEN) {
      return json({ error: "الخادم غير مكتمل الإعداد: أضف أسرار OPENAI_API_KEY و APP_ACCESS_TOKEN." }, 503, headersOrigin);
    }
    const auth = request.headers.get("Authorization") || "";
    if (auth !== "Bearer " + env.APP_ACCESS_TOKEN) {
      return json({ error: "رمز الوصول غير صحيح. راجع إعدادات محرك التأليف." }, 401, headersOrigin);
    }

    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 16000) return json({ error: "الطلب كبير جداً." }, 413, headersOrigin);

    let input;
    try { input = await request.json(); }
    catch { return json({ error: "تعذر قراءة بيانات الطلب." }, 400, headersOrigin); }

    const title = cleanText(input.title, 180);
    if (title.length < 3) return json({ error: "اكتب عنواناً واضحاً للكتاب." }, 400, headersOrigin);

    const context = {
      subject: cleanText(input.subject, 100),
      grade: cleanText(input.grade, 100),
      term: cleanText(input.term, 100),
      type: cleanText(input.type, 100),
      size: cleanText(input.size, 100),
      level: cleanText(input.level, 100),
      design: cleanText(input.design, 100),
      extra: cleanText(input.extra, 1800)
    };

    const instructions = `أنت رئيس تحرير أكاديمي ومؤلف كتب تعليمية عربية. اكتب كتاباً تعليمياً أصلياً باللغة العربية الفصحى، واضحاً للمتعلمين، دقيقاً علمياً، منظماً وقابلاً للتحرير والطباعة.
قواعد إلزامية:
1) ابدأ من عنوان الكتاب والسياق المعطى، وأنشئ بين 4 و12 صفحة/فصلاً تعليمياً متماسكاً، لا تكتفِ بفهرس أو مخطط.
2) اكتب محتوى تعليمياً فعلياً في كل صفحة: شرحاً متدرجاً، أمثلة محلولة عند ملاءمتها، تطبيقات، أسئلة قصيرة، ومفردات أساسية. تجنب الحشو والتكرار.
3) ابحث عبر الويب عن مصادر تعليمية/علمية موثوقة وحديثة عند الحاجة. لا تخترع مراجع أو روابط أو مؤلفين أو تواريخ. لا تذكر حقيقة دقيقة على أنها مؤكدة إن لم تجد لها دعماً موثوقاً.
4) في المراجعة العلمية، افحص صحة المفاهيم والوحدات والمعادلات والأرقام واتساق المصطلحات. ضع "يحتاج تحقق" أو "غير محسوم" عندما لا تستطيع الجزم؛ لا تدّعِ مراجعة بشرية أو اعتماداً رسمياً.
5) لا تنقل فقرات مطولة من المصادر. لخّص بلغتك. لا تضع روابط مخترعة داخل المحتوى.
6) اكتب المحتوى داخل حقول Markdown كنص عادي، لا HTML ولا شيفرات.
7) اجعل الأهداف قابلة للقياس، والأمثلة مناسبة للمرحلة المذكورة.
8) إذا كان الموضوع تخصصياً أو المنهج/المرحلة غير واضحين، اذكر الافتراضات بوضوح داخل المقدمة ولا تختلق مواصفات منهج رسمي.
العنوان: ${title}
السياق: ${JSON.stringify(context)}
أخرج JSON مطابقاً للمخطط المطلوب فقط.`;

    try {
      const ai = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: env.AI_MODEL || "gpt-6.2-astra",
          store: false,
          max_output_tokens: 12000,
          tools: [{ type: "web_search", search_context_size: "high" }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          instructions,
          input: "أنشئ الكتاب الآن. اجعل كل صفحة مادة تعليمية مكتملة وليست مجرد نقاط عناوين.",
          text: {
            format: {
              type: "json_schema",
              name: "educational_book",
              strict: true,
              schema
            }
          }
        })
      });

      const raw = await ai.json();
      if (!ai.ok) {
        const message = raw?.error?.message || "تعذر الاتصال بخدمة التأليف.";
        return json({ error: message.slice(0, 500) }, ai.status === 429 ? 429 : 502, headersOrigin);
      }

      const outputText = getOutputText(raw);
      let book;
      try { book = JSON.parse(outputText); }
      catch { return json({ error: "وصل رد غير مكتمل من محرك التأليف. أعد المحاولة أو قلّل حجم الكتاب." }, 502, headersOrigin); }

      if (!book || !Array.isArray(book.pages) || book.pages.length < 4) {
        return json({ error: "الكتاب الناتج غير مكتمل؛ لم يتم إدخاله إلى المحرر." }, 502, headersOrigin);
      }

      // Independent second-pass scientific/editorial audit with a fresh web search.
      let auditRaw = null;
      try {
        const auditResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.OPENAI_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: env.REVIEW_MODEL || env.AI_MODEL || "gpt-6.2-astra",
            store: false,
            max_output_tokens: 3500,
            tools: [{ type: "web_search", search_context_size: "high" }],
            tool_choice: "required",
            include: ["web_search_call.action.sources"],
            instructions: "أنت مراجع علمي مستقل لمخطوط تعليمي. لا تفترض صحة النص لمجرد أنه مولّد. افحص الادعاءات العلمية والمصطلحات والوحدات والمعادلات والأرقام والملاءمة للمرحلة بالرجوع إلى مصادر موثوقة عبر البحث. لا توافق إلا عند وجود دعم كافٍ. أخرج 4 إلى 8 ملاحظات محددة؛ استخدم الحالة راجعه فقط لما أمكن التحقق منه، واستخدم يحتاج تحقق أو غير محسوم عند نقص الدليل. لا تدّعِ اعتماداً بشرياً أو رسمياً. أعد JSON فقط.",
            input: JSON.stringify({ title, context, manuscript: book }),
            text: {
              format: {
                type: "json_schema",
                name: "scientific_audit",
                strict: true,
                schema: auditSchema
              }
            }
          })
        });
        auditRaw = await auditResponse.json();
        if (auditResponse.ok) {
          const auditText = getOutputText(auditRaw);
          const audit = JSON.parse(auditText);
          if (audit && Array.isArray(audit.review)) book.review = audit.review;
        }
      } catch (auditError) {
        // Keep the manuscript available, but explicitly mark all review as pending.
      }

      if (!Array.isArray(book.review) || !book.review.length) {
        book.review = [
          { item: "الحقائق والمفاهيم العلمية", status: "يحتاج تحقق", note: "لم تكتمل المراجعة المستقلة؛ راجع المعلومات مع مصدر علمي معتمد." },
          { item: "المعادلات والوحدات والأرقام", status: "يحتاج تحقق", note: "تحقق من جميع العمليات والوحدات والأرقام قبل الاستخدام." },
          { item: "مطابقة المرحلة والمنهج", status: "غير محسوم", note: "يلزم مطابقة المحتوى مع المنهج الدراسي المعتمد." },
          { item: "المراجع والاستشهادات", status: "يحتاج تحقق", note: "افحص المصادر الأصلية وتأكد من دعمها للمعلومات المذكورة." }
        ];
      }

      const sources = [...collectSources(raw), ...(auditRaw ? collectSources(auditRaw) : [])]
        .filter((source, index, all) => all.findIndex(x => x.url === source.url) === index)
        .slice(0, 25);

      return json({
        ok: true,
        book,
        sources,
        model: raw.model || env.AI_MODEL || "configured-model",
        reviewModel: auditRaw?.model || env.REVIEW_MODEL || env.AI_MODEL || "configured-model",
        usage: { generation: raw.usage || null, review: auditRaw?.usage || null },
        note: "أُجريت مراجعة آلية مستقلة في مرحلة ثانية عند نجاح الاتصال؛ يلزم اعتماد المعلم أو المختص قبل النشر."
      }, 200, headersOrigin);
    } catch (error) {
      return json({ error: "حدث خطأ أثناء التوليد: " + String(error?.message || error).slice(0, 240) }, 500, headersOrigin);
    }

}
