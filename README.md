## Dodgy Dave's Stock Predictions

Fun demo app that fetches recent stock aggregate data and generates a playful AI-written mini report. Built with:

- Vite (frontend)
- Cloudflare Worker (API proxy + AI gateway)
- Polygon.io (market data) – optional, falls back to mock data when no key
- OpenAI (chat completion via Cloudflare AI Gateway)

> DISCLAIMER: This project is for fun, education, and experimentation only. It is NOT financial advice, NOT a trading tool, and the generated content is intentionally whimsical. Do not use any output for real investment decisions.

---

## Features
- Enter multiple stock tickers and generate a combined AI summary.
- Cloudflare Worker endpoint for stock data (`/stocks`).
- Cloudflare Worker endpoint for AI chat (`/ask`).
- Graceful fallback to mock price data when Polygon API key missing.
- Environment-based secrets kept out of version control.

## Prerequisites
- Node.js 18+ (recommended LTS)
- Polygon.io API key (optional; without it mock data is used)
- OpenAI API key (for AI report) or configured Cloudflare AI Gateway key
- Cloudflare account + Wrangler CLI (for deploying the Worker)

## Installation
```bash
git clone <your-fork-or-repo-url>
cd stock-pridictions-scrimba
npm install
```

## Environment Variables
Create a `.env` file at the project root (NOT committed) with:
```
VITE_POLYGON_API_KEY=your_polygon_key_here   # optional
VITE_OPENAI_API_KEY=your_openai_key_here     # frontend passes this to Worker
```
For the Cloudflare Worker, set durable secrets / vars (do NOT hard code):
```
wrangler secret put OPENAI_API_KEY
wrangler secret put POLYGON_API_KEY    # optional
```

Provide a public template for collaborators in `.env.example` (no secrets):
```
VITE_POLYGON_API_KEY=
VITE_OPENAI_API_KEY=
```

## Running Locally
Start the Vite dev server:
```bash
npm run dev
```
It will open (or print) a localhost URL like `http://localhost:5173` (it may increment the port if busy).

In another terminal, run / develop the Worker (if you have a separate worker directory adjust path accordingly):
```bash
cd openai-api-worker
wrangler dev
```

Deploy Worker:
```bash
wrangler deploy
```

## Frontend Flow
1. User enters tickers & clicks generate.
2. Frontend fetches Polygon aggregate data (or mock) directly.
3. Data string sent to Worker `/ask` endpoint as chat messages.
4. Worker calls OpenAI via Cloudflare Gateway and returns structured JSON `{ role, content }`.
5. Frontend renders the `content` in the report box.

## API Endpoints (Worker)
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

If you hit the root `/` you will get:
```json
{ "message": "Dodgy Dave's API is running!" }
```

## Troubleshooting
- Blank report: check browser console for `Worker response:` log.
- `401` errors: verify OpenAI key (frontend `.env` and Worker secret if relying on `env.OPENAI_API_KEY`).
- Polygon failures: without a key you’ll see mock data; supply a key to get real aggregates.
- CORS: Worker sets permissive `Access-Control-Allow-*` headers.

## Security Notes
- Never commit real API keys. `.gitignore` already excludes `.env`.
- Consider rate limiting / authentication before any production exposure.

## Contributing
PRs welcome for educational enhancements: better UI, streaming responses, improved data visualization, tests.

## License
MIT (adjust if you prefer another license)

---
Again: This is a playful educational project—NOT real financial advice.
