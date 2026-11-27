const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://gomaa223m-jpg.github.io";
    if (origin && origin !== allowedOrigin) return new Response("Origin not allowed", { status: 403 });
    const headersOrigin = origin || allowedOrigin;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(headersOrigin) });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "edu-creative-book-engine", version: "1.0.0" }, 200, headersOrigin);
    }
    if (request.method !== "POST" || url.pathname !== "/api/book") {
      return json({ error: "المسار غير متاح." }, 404, headersOrigin);
    }
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
};
