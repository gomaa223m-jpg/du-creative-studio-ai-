# EDU CREATIVE STUDIO AI — AI Gateway

This folder contains an optional secure server-side gateway. It is not deployed by GitHub Pages and does not make paid AI services free.

## What it enables
- A protected `POST /api/generate` endpoint for Arabic video scripts and scene plans.
- A protected `POST /api/book` endpoint for structured educational book drafts and an optional second-pass review.
- Optional ComfyUI image generation endpoints when a separate GPU host and compatible checkpoint are configured.
- Keeps provider credentials on the Worker, never in the public HTML.

**Cost truth:** GitHub Pages and the local browser tools can be used without an AI API subscription. The cloud text endpoints require an OpenAI API key and API usage is billed separately; they are optional, not a free unlimited service. Image generation requires a separate ComfyUI host and suitable hardware or hosting, which may also cost money.

Examples of compatible gateways/providers may include OpenAI, OpenRouter, Groq, Together, and DeepSeek. Compatibility, model availability, JSON mode, quotas, and prices depend on the provider and selected model. This is not native integration with every vendor, and it does not render video through a video-generation API.

## Deploy to Cloudflare Workers
1. This repository's Worker entry point is `worker/index.js` (configured by `wrangler.toml`); do not use the obsolete `ai-gateway.js` filename.
2. Add GitHub Actions repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `APP_ACCESS_TOKEN`.
3. Optional cloud text generation: add `OPENAI_API_KEY`. This enables `/api/generate` and `/api/book`, but API use is billed by the provider. The Worker can deploy without this key; cloud text generation will report that it is not configured.
4. Run **Actions → Deploy EDU Creative Studio Worker → Run workflow**.
5. Test `GET https://YOUR-WORKER.workers.dev/health`.
6. Configure the Studio's video endpoint as `https://YOUR-WORKER.workers.dev/api/generate`; the book editor endpoint is `https://YOUR-WORKER.workers.dev/api/book`. Both require the same `APP_ACCESS_TOKEN`.
7. Never paste provider API keys or access tokens into the website source, screenshots, or chat.

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



#### Automated deployment from GitHub Actions

A workflow is now available at `.github/workflows/deploy-image-worker.yml`. To enable it:

1. In GitHub, open **Settings → Secrets and variables → Actions** for this repository.
2. Add `CLOUDFLARE_API_TOKEN` with permission to deploy Workers, and `CLOUDFLARE_ACCOUNT_ID`.
3. Run **Actions → Deploy image generation Worker → Run workflow**, or push a change under `worker/`.
4. If either GitHub secret is missing, the workflow deliberately skips deployment and reports why; a successful Pages build is not proof that the Worker was deployed.
5. After deployment, set the Worker runtime values in Cloudflare:
   - Variable `IMAGE_ENGINE_URL`: protected HTTPS base URL of ComfyUI.
   - Variable `IMAGE_CHECKPOINT`: exact model filename.
   - Secret `APP_ACCESS_TOKEN`: a long random access token.
   - Optional secret `IMAGE_ENGINE_TOKEN`: upstream proxy token.
   - Keep `ALLOWED_ORIGIN` set to the Studio's GitHub Pages origin.

Do not paste Cloudflare tokens, access tokens, or private server URLs into chat, source files, commits, or screenshots. Enter secrets only in the relevant GitHub/Cloudflare settings pages.

### Deploy the Worker

From the repository root, after signing in to a Cloudflare account with permission to deploy this Worker:

```bash
npx wrangler deploy --config wrangler.toml
```

Then configure the variables and secrets in the Cloudflare Worker settings (or with Wrangler). Do not commit secrets to the repository. The GitHub Pages workflow publishes only the static website; it does **not** deploy this Worker or provision a GPU server.

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


### GitHub Actions deployment settings (current workflow)

The automated Worker workflow requires only these settings to deploy the core gateway. Configure them under **Settings → Secrets and variables → Actions**:

**Required repository secrets**
- `CLOUDFLARE_API_TOKEN`: token with permission to deploy Workers and manage Worker secrets.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID.
- `APP_ACCESS_TOKEN`: long random private token used by the Studio-to-Worker authorization check.

**Optional repository secrets**
- `OPENAI_API_KEY`: enables cloud text generation for video scripts and books. API usage is paid separately; omit it to keep the cloud AI features disabled.
- `IMAGE_ENGINE_URL`: protected HTTPS base URL of a reachable ComfyUI host (without `/prompt`).
- `IMAGE_ENGINE_TOKEN`: optional bearer token for the protected ComfyUI proxy.

**Optional repository variable**
- `IMAGE_CHECKPOINT`: exact compatible checkpoint filename installed on the ComfyUI host.

The workflow deploys the Worker core without requiring a GPU server or paid AI key. Image generation is available only when both image settings are configured and the GPU host is online. GitHub Pages and Cloudflare Workers do not provide GPU hardware or model files.
