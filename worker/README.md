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

## Image generation with ComfyUI (open-source engine)

The Worker now exposes an authenticated ComfyUI adapter:

- `GET /api/v1/images/health`
- `POST /api/v1/images/generate`
- `GET /api/v1/images/status?prompt_id=...`

The adapter supports text-to-image and image-to-image using ComfyUI's built-in checkpoint, text-encode, sampler, VAE, upload, history, and view APIs. The current built-in workflow expects a **checkpoint-style model compatible with CheckpointLoaderSimple** (for example, an SDXL checkpoint); newer model families may need a different workflow and are not automatically compatible.

### Secure server setup

1. Install ComfyUI on a GPU computer or a trusted GPU host and install a compatible checkpoint in `ComfyUI/models/checkpoints`.
2. Put ComfyUI behind a private HTTPS reverse proxy or access-controlled tunnel. Do not expose its unauthenticated port directly to the public internet.
3. Configure the reverse proxy to accept a bearer token if you want upstream authentication. If the proxy does not require a bearer token, leave `IMAGE_ENGINE_TOKEN` unset and keep the endpoint private.
4. Deploy this Worker and set:
   - Secret `APP_ACCESS_TOKEN`: the same long random token entered in the Studio.
   - Variable `IMAGE_ENGINE_URL`: the private/protected HTTPS base URL of the ComfyUI server (no `/prompt` suffix).
   - Variable `IMAGE_CHECKPOINT`: the exact checkpoint filename, including extension.
   - Optional secret `IMAGE_ENGINE_TOKEN`: bearer token required by your reverse proxy.
   - Variable `ALLOWED_ORIGIN`: `https://gomaa223m-jpg.github.io`.
5. In the Studio, select **خادم آمن ComfyUI**, enter the Worker API base URL ending in `/api/v1`, and enter the same `APP_ACCESS_TOKEN`.
6. Use **اختبار الاتصال**. The endpoint is ready only when it returns `ok: true`.

The gateway keeps the upstream engine address and upstream token on the server. The browser only receives the app access token for its authenticated Worker requests. Keep this token private and use the Studio only on a trusted device.

### Free local mode

- Install and run ComfyUI on the same computer that opens the Studio.
- Download a compatible checkpoint separately and place it in `ComfyUI/models/checkpoints`. Model downloads and licenses are separate from ComfyUI's software license; check the individual model card and terms.
- Start ComfyUI with an explicit CORS origin for the Studio:
  `python main.py --enable-cors-header https://gomaa223m-jpg.github.io`
- In the Studio choose **محلي مجاني على جهازي**, use `http://127.0.0.1:8188`, enter the exact checkpoint filename, and test the connection.
- Local mode sends requests from the browser directly to the local ComfyUI instance. It does not send the image through the Worker and needs no API key. It only works when ComfyUI is running on the same computer as the browser; a phone cannot use a ComfyUI server installed on a different computer via the loopback address.

The first model download can be large. Generation speed and available resolution depend on GPU/VRAM and the chosen model. A CPU-only setup may be very slow or may not have enough memory. Local execution has no per-image API fee, but uses the computer's electricity and hardware.

### Image and avatar privacy

Reference images are uploaded to the selected ComfyUI instance for image-to-image generation. Only upload images you own or have permission to use, and get the depicted person's consent. Image-to-image generation can change facial details and does not guarantee exact identity preservation. Avoid uploading private student images or sensitive personal information.

### Current adapter limits

- One output image per request; 512–1280 pixel dimensions, 12–36 sampling steps.
- Reference image limit: 5 MB at the gateway; PNG, JPEG, and WEBP.
- Built-in workflow targets classic checkpoint models. Advanced ControlNet, face identity adapters, inpainting, and model-specific workflows are not configured automatically.
- This is a real generation adapter only after a compatible ComfyUI engine, checkpoint, and Worker secrets are configured and the health test succeeds. GitHub Pages by itself cannot host the GPU model.
