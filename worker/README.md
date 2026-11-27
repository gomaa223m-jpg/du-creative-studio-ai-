# EDU CREATIVE STUDIO AI — Secure Workers

The website is hosted separately from these Cloudflare Workers. GitHub Actions deploys the Workers to the Cloudflare account selected by the API token.

## What works without a paid AI API

The published website includes browser-based authoring and export tools. The local video renderer creates motion-graphics scenes and can export a video file when the browser supports the selected recording format. The local image designer exports PNG graphics. The PowerPoint exporter creates editable PPTX files from content supplied to the editor. These features depend on the device, browser, and libraries loaded from CDNs.

The free video-script builder is template-based, not an AI model. Review scientific facts, equations, and examples before teaching.

## Cloudflare Workers

- `wrangler.toml` deploys `worker/index.js`, the core book and image API.
- `wrangler.video.toml` deploys `worker/ai-gateway.js`, an optional AI text gateway that creates scripts and scene plans for videos.
- The video AI gateway does **not** generate realistic video footage or render final MP4 files. MP4 export is a separate browser-side motion-graphics feature in the current site.

## Required GitHub Actions repository secrets

Open **Settings → Secrets and variables → Actions → Repository secrets** and add:

- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token authorized to deploy Workers and manage Worker secrets for the target account.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID for that same account.
- `APP_ACCESS_TOKEN` — a long random private token used to protect the Worker endpoints and shared with the Studio's connection settings.

The deployment workflow validates all three before deploying. It never prints their values.

Then run **Actions → Deploy EDU Creative Studio Worker → Run workflow**. The same workflow also runs when Worker files or its deployment workflow change on `main` or `master`.

## Optional AI providers

- `OPENAI_API_KEY` — optional secret for cloud text features in the core Worker.
- `AI_API_KEY` — optional secret for the separate video-script gateway. The endpoint and model are configured in `wrangler.video.toml`.
- These APIs may incur provider charges. They are not an unlimited free service.

The video gateway uses `APP_ACCESS_TOKEN` and `AI_API_KEY` as Worker secrets. Its `AI_BASE_URL` and `AI_MODEL` values come from `wrangler.video.toml`.

## Optional ComfyUI image engine

The image adapter expects a checkpoint-style model compatible with ComfyUI's `CheckpointLoaderSimple` node.

1. Install ComfyUI on a computer with a compatible GPU or a trusted GPU host.
2. Install a compatible checkpoint in `ComfyUI/models/checkpoints`.
3. Put the service behind a private HTTPS reverse proxy or access-controlled tunnel. Do not expose an unauthenticated ComfyUI port publicly.
4. Configure the GitHub Actions settings:
   - Secret `IMAGE_ENGINE_URL`: protected HTTPS base URL for ComfyUI, without a `/prompt` suffix.
   - Variable `IMAGE_CHECKPOINT`: exact checkpoint filename.
   - Optional secret `IMAGE_ENGINE_TOKEN`: upstream bearer token if the proxy requires it.
5. Redeploy the Worker workflow and test the image connection from the Studio.

A GPU host, model files, storage, and power/hosting are required. Cloudflare Workers and GitHub Pages do not provide a GPU.

## Connect GitHub and Cloudflare

This repository currently uses **GitHub Actions → Cloudflare Wrangler** for deployment. A separate Cloudflare Workers Builds Git integration is not required and should not be enabled in parallel unless deliberately migrating the deployment method.

The Cloudflare API token must belong to the Cloudflare account where the Workers should be deployed. GitHub and Cloudflare do not need to share a login identity; the token authorizes the deployment.

After a successful run, test the core Worker at `https://YOUR-WORKER.workers.dev/health`. Test the video script gateway at `https://edu-creative-video-gateway.YOUR-SUBDOMAIN.workers.dev/health` if its optional provider key was configured.

Never put provider keys or Worker access tokens in `index.html`, source control, screenshots, or chat.

## Limits and quality control

- The cloud video gateway returns a script and scene plan; it does not render MP4 or generate narration audio.
- The local browser renderer creates motion graphics, not text-to-video footage.
- The image engine is ready only when the Worker, ComfyUI host, checkpoint, and connection test all succeed.
- Add rate limiting and monitoring before allowing broad public use.
- Review scientific facts, equations, units, references, and curriculum alignment before classroom use or publication.
