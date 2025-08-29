## Dobby's Stock Picks

Fun demo app that fetches recent stock aggregate data and generates a playful AI-written mini report. Built with:

- Vite (frontend)
- Cloudflare Pages Functions (serverless endpoints `/stocks` + `/ask`)
- Polygon.io (market data) – optional, falls back to mock data when no key
- OpenAI (chat completion via Cloudflare AI Gateway / standard API)

> DISCLAIMER: This project is for fun, education, and experimentation only. It is NOT financial advice, NOT a trading tool, and the generated content is intentionally whimsical. Do not use any output for real investment decisions.

---

## Features
- Enter multiple stock tickers and generate a combined AI summary.
- Cloudflare Pages Function for stock data (`POST /stocks`).
- Cloudflare Pages Function for AI chat (`POST /ask`).
- Graceful fallback to mock price data when Polygon API key missing.
- Environment-based secrets kept out of version control.

## Prerequisites
- Node.js 18+ (recommended LTS)
- Polygon.io API key (optional; without it mock data is used)
- OpenAI API key (for AI report) or configured Cloudflare AI Gateway key
- Cloudflare account (for Pages deployment).

## Installation
```bash
git clone <your-fork-or-repo-url>
cd stock-pridictions-scrimba
npm install
```

## Environment Variables
Create a `.env` file at the project root (NOT committed) with:
```
VITE_POLYGON_API_KEY=your_polygon_key_here   # optional (frontend fetches if present)
VITE_OPENAI_API_KEY=your_openai_key_here     # used client-side ONLY in dev — prefer server secret
```
In Cloudflare Pages project settings, add these Environment Variables (Production + Preview):
```
POLYGON_API_KEY=your_polygon_key_here  (optional)
OPENAI_API_KEY=your_openai_key_here
```

Provide a public template for collaborators in `.env.example` (no secrets):
```

VITE_POLYGON_API_KEY=
VITE_OPENAI_API_KEY=
```

## Running Locally -
Start the Vite dev server:
```bash
npm run dev
```
Pages Functions are not executed locally by default with plain Vite. For local testing of Functions you can:
1. Use `npx @cloudflare/cli pages dev .` (or `wrangler pages dev`) to simulate Pages + Functions, OR
2. Hit the deployed Pages preview environment for `/stocks` and `/ask`.

Build for production:
```bash
npm run build
```
The output in `dist/` is what Cloudflare Pages will serve; Functions in `functions/` deploy automatically.

## Frontend Flow
1. User enters tickers & clicks generate.
2. Frontend sends POST to `/stocks` (Pages Function) with tickers + date range.
3. Function fetches Polygon (or returns mock) data.
4. Frontend builds a condensed string and POSTs to `/ask` with `messages`.
5. Function calls OpenAI and returns `{ role, content }`.
6. Frontend renders the AI `content`.

## API Endpoints (Pages Functions)
`POST /stocks`
Request JSON:
```json
{ "tickers": ["AAPL","MSFT"], "startDate": "2024-08-01", "endDate": "2024-08-05" }
```
Response JSON (simplified):
```json
{ "ok": true, "results": [ ... ], "meta": {"startDate":"...","endDate":"..."}, "errors": [] }
```

`POST /ask`
Request JSON:
```json
{ "messages": [{"role":"system","content":"..."},{"role":"user","content":"..."}], "temperature": 0.9, "apiKey": "(optional overrides worker)" }
```
Response JSON:
```json
{ "role": "assistant", "content": "Generated report text" }
```

Static root serves the built SPA; Functions only run on their paths.

## Troubleshooting
- Blank report: check console for `Worker response:` log (now Pages Function response).
- `401` or auth errors: confirm `OPENAI_API_KEY` set in Pages env vars (and not exposed publicly in production builds).
- Polygon failures: without `POLYGON_API_KEY` you’ll see mock data.
- Local dev functions: use `wrangler pages dev` or deploy a preview.

## Security Notes
- Never commit real API keys. `.gitignore` already excludes `.env`.
- Consider rate limiting / authentication before any production exposure.

## Contributing
PRs welcome for educational enhancements: better UI, streaming responses, improved data visualization, tests.

## License
MIT (adjust if you prefer another license)

---
Again: This is a playful educational project—NOT real financial advice.
