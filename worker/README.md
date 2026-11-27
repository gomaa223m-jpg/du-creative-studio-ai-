# EDU CREATIVE STUDIO AI — AI Gateway

This folder contains an optional secure server-side gateway. It is not deployed by GitHub Pages and does not make paid AI services free.

## What it enables
- One protected endpoint for lesson plans, worksheets, video scripts/storyboards, and book drafts.
- Any provider exposing an OpenAI-compatible chat-completions API, configured on the server.
- Keeps the provider API key on the Worker, never in the public HTML.

Examples of compatible gateways/providers may include OpenAI, OpenRouter, Groq, Together, and DeepSeek. Compatibility, model availability, JSON mode, quotas, and prices depend on the provider and selected model. This is not native integration with every vendor, and it does not render video through a video-generation API.

## Deploy to Cloudflare Workers
1. Create a Worker and paste ai-gateway.js as its entry point.
2. Add these Worker secrets/variables in Cloudflare:
   - Secret APP_ACCESS_TOKEN: generate a long random token.
   - Secret AI_API_KEY: API key from the chosen provider.
   - Variable AI_BASE_URL: provider base URL ending at the API root, e.g. https://api.openai.com/v1.
   - Variable AI_MODEL: exact model identifier from that provider.
   - Variable ALLOWED_ORIGINS: https://gomaa223m-jpg.github.io
3. Deploy and test GET https://YOUR-WORKER.workers.dev/health.
4. Configure the Studio to call POST https://YOUR-WORKER.workers.dev/api/generate and /api/book with Authorization: Bearer YOUR_APP_ACCESS_TOKEN.
5. Never paste provider API keys into the website, GitHub repository, screenshots, or chat.

## Generate endpoint
Example request:
{"task":"video","topic":"تصنيف التفاعلات الكيميائية","subject":"كيمياء","grade":"الأول الثانوي","context":"شرح مبسط مع أمثلة موزونة"}

Response shape:
{"ok":true,"result":{"title":"...","scenes":[]}}

Supported tasks: video, lesson, worksheet, content. The /api/book endpoint returns { "ok": true, "book": ... } for the existing book editor.

## Important limits
- This gateway generates structured text/storyboards. It does not create MP4, images, narration audio, or animated footage by itself.
- Actual video generation requires a separate video provider/API, account, credentials, quota, and usually paid credits. A future adapter can be added once a specific provider is selected.
- Add durable rate limiting (such as Cloudflare rate limiting or a Durable Object) before opening access beyond a private test.
- Restrict ALLOWED_ORIGINS to the published Studio origin. CORS is not a substitute for authentication.
- Review generated science content and verify sources before teaching or publishing.
