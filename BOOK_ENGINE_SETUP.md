# EDU Creative Studio — Secure Book Engine

This Worker is the private server-side bridge between the public GitHub Pages editor and the OpenAI Responses API.

## What it does
- Accepts a book title and educational context from the editor.
- Generates structured Arabic book pages (not just an outline).
- Uses the Responses API with web search enabled.
- Returns actual web-search citations when available, plus an automated review checklist.
- Keeps the provider API key on the server, never in the public HTML.
- Requires a separate app access token before allowing generation.
- Uses `store: false` for Responses API requests.

## Deploy
1. Install Node.js and Wrangler, then sign in to Cloudflare:
   `npx wrangler login`
2. From this repository root, set the provider key as a Worker secret:
   `npx wrangler secret put OPENAI_API_KEY`
3. Create a long, random app access token and store it as another secret:
   `npx wrangler secret put APP_ACCESS_TOKEN`
4. Deploy:
   `npx wrangler deploy`
5. Copy the Worker URL shown by Wrangler. Its API endpoint is:
   `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api/book`
6. In the website's Book Engine settings, enter that endpoint and the same app access token.

Optional: change `AI_MODEL` in `wrangler.toml` to a model enabled for your API project. The default is configurable and may need to be changed depending on API access.

## Important
- The OpenAI API is billed separately from ChatGPT subscriptions. Cloudflare's free allowance does not make model inference free or unlimited.
- Never put `OPENAI_API_KEY` or `APP_ACCESS_TOKEN` in GitHub Pages, HTML, JavaScript, or a committed config file.
- Do not commit local secret files such as `.dev.vars`.
- The source list contains URLs returned by web search annotations. If no source is returned, the editor must show that clearly rather than fabricate a bibliography.
- Automated review is an initial aid, not a substitute for a qualified teacher/subject-matter expert checking the final book before classroom use.
