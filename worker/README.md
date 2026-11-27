# EDU CREATIVE STUDIO AI — Secure Worker

This optional Worker supplies server-side endpoints. It is separate from GitHub Pages.

## What works without a paid AI API

The published website includes browser-based authoring and export tools. The local video renderer creates motion-graphics scenes and can export a video file when the browser supports the selected recording format. The local image designer exports PNG graphics. The PowerPoint exporter creates editable PPTX files from content supplied to the editor. These features do not require an OpenAI API key, but they do depend on the device, browser, and internet connection for libraries loaded from CDNs.

The free video-script builder is a template-based starter, not an AI model. Check scientific facts, equations, and examples before teaching.

## Optional cloud endpoints

- `GET /health` — Worker status; no provider key required.
- `POST /api/generate` — Arabic video script and scene plan. Requires `APP_ACCESS_TOKEN` and `OPENAI_API_KEY`.
- `POST /api/book` — structured educational book draft and attempted second-pass review. Requires `APP_ACCESS_TOKEN` and `OPENAI_API_KEY`.
- `GET /api/v1/images/health`
- `POST /api/v1/images/generate`
- `GET /api/v1/images/status?prompt_id=...`

**Cost truth:** The cloud text endpoints use the OpenAI API, which is billed separately by token usage. They are optional and are not an unlimited free service. The local browser tools remain available without this key. The image endpoints require a separate ComfyUI host, a compatible checkpoint, and suitable hardware or paid hosting; Cloudflare Workers and GitHub Pages do not provide a GPU.

The Worker uses the Responses API and the configured `AI_MODEL` value. The current default in `wrangler.toml` is `gpt-6.2-astra`. Confirm model access and provider billing before enabling cloud calls.

## Deploy the Worker

The entry point is `worker/index.js`, configured in `wrangler.toml`. Do not use the obsolete `ai-gateway.js` filename.

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add these required secrets:

- `CLOUDFLARE_API_TOKEN` — permission to deploy Workers and manage secrets.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `APP_ACCESS_TOKEN` — long random private token shared by the Worker and the Studio.

Then run **Actions → Deploy EDU Creative Studio Worker → Run workflow**. The workflow also runs when Worker files or its deployment workflow change.

Optional secret:

- `OPENAI_API_KEY` — enables the cloud text endpoints. Do not add it if you want to keep cloud AI disabled and avoid API charges.

After deployment, test `https://YOUR-WORKER.workers.dev/health`. Configure the Studio video endpoint as `https://YOUR-WORKER.workers.dev/api/generate` and the book endpoint as `https://YOUR-WORKER.workers.dev/api/book`. Both require the same `APP_ACCESS_TOKEN`.

Never put provider keys or Worker access tokens in `index.html`, source control, screenshots, or chat.

## Optional ComfyUI image engine

The image adapter expects a checkpoint-style model compatible with ComfyUI's `CheckpointLoaderSimple` node.

1. Install ComfyUI on a computer with a compatible GPU, or on a trusted GPU host.
2. Install a compatible checkpoint in `ComfyUI/models/checkpoints`.
3. Put the service behind a private HTTPS reverse proxy or an access-controlled tunnel. Do not expose an unauthenticated ComfyUI port publicly.
4. Add the following optional GitHub Actions settings:
   - Secret `IMAGE_ENGINE_URL`: protected HTTPS base URL for ComfyUI, without a `/prompt` suffix.
   - Variable `IMAGE_CHECKPOINT`: exact checkpoint filename.
   - Optional secret `IMAGE_ENGINE_TOKEN`: upstream bearer token if the proxy requires it.
5. Redeploy the Worker workflow and test the image connection from the Studio.

Local ComfyUI mode is also available. It only works when ComfyUI is running on the same computer as the browser opening the Studio. A phone's `127.0.0.1` address refers to the phone itself, not another computer.

Image generation uses local or hosted hardware, power, storage, and model downloads. Check the individual model license. Image-to-image may change a person's facial details and does not guarantee identity preservation. Only use reference images with appropriate rights and consent; avoid private student images.

## Limits and quality control

- `/api/generate` returns a script and scene plan; it does not render MP4, generate narration audio, or produce realistic AI video.
- The local video renderer is motion graphics, not a text-to-video model.
- Cloud book generation can fail because of provider quotas, model availability, or network errors. A generated draft is not a human scientific review or official curriculum approval.
- The image engine is ready only when the Worker, ComfyUI host, checkpoint, and connection test all succeed.
- Add rate limiting and monitoring before allowing broad public use.
- Review scientific facts, equations, units, references, and curriculum alignment before classroom use or publication.
