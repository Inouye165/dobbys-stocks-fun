// worker.js
// Cloudflare Worker: Stocks helper + Chat proxy

import OpenAI from "openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// Strong anti-cache headers for “live” responses
const noCacheJSON = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
};

// Flip this to true if you want fake data when POLYGON_API_KEY is missing (dev only)
const ALLOW_DEV_MOCKS = false;

// Simple helper to JSON responses
const jres = (obj, init = {}) =>
  new Response(JSON.stringify(obj), { headers: noCacheJSON, ...init });

// Market status helper (optional but handy in UI)
async function getMarketStatus(apiKey) {
  try {
    const r = await fetch(
      `https://api.polygon.io/v1/marketstatus/now?apiKey=${apiKey}&_=${Date.now()}`
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Fetch last price via snapshot, fallback to last trade
async function fetchLivePrice(ticker, apiKey) {
  const t = encodeURIComponent(ticker.toUpperCase().trim());
  // 1) Snapshot (contains lastTrade + today/minute/day)
  const snap = await fetch(
    `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${t}?apiKey=${apiKey}&_=${Date.now()}`
  );
  let data = await snap.json();
  if (snap.ok && data?.ticker?.lastTrade?.p != null) {
    const lt = data.ticker.lastTrade; // {p, t, ...}
    return {
      ok: true,
      source: "snapshot",
      price: lt.p,
      asOf: lt.t,
      raw: {
        day: data.ticker.day || null,
        minute: data.ticker.min || null
      }
    };
  }

  // 2) Fallback: last trade endpoint
  const ltResp = await fetch(
    `https://api.polygon.io/v2/last/trade/${t}?apiKey=${apiKey}&_=${Date.now()}`
  );
  data = await ltResp.json();
  if (ltResp.ok && data?.results?.p != null) {
    return {
      ok: true,
      source: "last-trade",
      price: data.results.p,
      asOf: data.results.t,
      raw: null
    };
  }

  return { ok: false, error: data?.error || `HTTP ${ltResp.status}` };
}

// Fetch adjusted daily bars for a date range
async function fetchDailyRange(ticker, startDate, endDate, apiKey) {
  const t = encodeURIComponent(ticker.toUpperCase().trim());
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/` +
    `${encodeURIComponent(startDate)}/${encodeURIComponent(endDate)}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (!resp.ok) {
    console.error(`[Polygon] Error for ${ticker}:`, data?.error || `HTTP ${resp.status}`);
    return { ok: false, status: resp.status, error: data?.error || `HTTP ${resp.status}` };
  }

  // Clean non-deterministic fields (nice-to-have for cache stability)
  delete data.request_id;
  delete data.next_url;
  delete data.count;
  if (Array.isArray(data.results)) {
    for (const r of data.results) {
      if (r && typeof r === "object") {
        delete r.request_id;
        delete r.id;
      }
    }
  }

  // Debug: log results for GOOGL and empty results
  if (ticker.toUpperCase().trim() === "GOOGL") {
    console.log(`[Polygon] GOOGL results:`, JSON.stringify(data.results));
  }
  if (!Array.isArray(data.results) || !data.results.length) {
    console.warn(`[Polygon] No results for ${ticker}. Raw response:`, JSON.stringify(data));
    return {
      ok: false,
      status: 200,
      data,
      error: `No price data returned for ${ticker}`,
      meta: { latestClose: null, latestCloseTime: null }
    };
  }

  const lastBar = data.results[data.results.length - 1];

  return {
    ok: true,
    status: 200,
    data,
    meta: {
      latestClose: lastBar?.c ?? null,
      latestCloseTime: lastBar?.t ?? null
    }
  };
}

// Optional: prevent the LLM endpoint from answering price questions
function looksLikePriceQuestion(messages) {
  const text = (messages || [])
    .map(m => (typeof m.content === "string" ? m.content : ""))
    .join(" ")
    .toLowerCase();
  return /\b(price|quote|how much is|what is.*trading at|stock.*now|current.*price)\b/.test(text);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // ------------------ /price ------------------
    if (url.pathname === "/price" && request.method === "POST") {
      try {
        const { ticker } = await request.json();
        if (!ticker) return jres({ ok: false, error: "ticker required" }, { status: 400 });

        if (!env.POLYGON_API_KEY) {
          if (ALLOW_DEV_MOCKS) {
            return jres({
              ok: true,
              ticker,
              price: 100 + Math.random() * 50,
              asOf: Date.now(),
              meta: { source: "mock", market: null }
            });
          }
          return jres({ ok: false, error: "Missing POLYGON_API_KEY" }, { status: 401 });
        }

        const [market, live] = await Promise.all([
          getMarketStatus(env.POLYGON_API_KEY),
          fetchLivePrice(ticker, env.POLYGON_API_KEY)
        ]);

        if (!live.ok) {
          return jres({ ok: false, ticker, error: live.error || "Unable to fetch price", meta: { market } }, { status: 502 });
        }

        return jres({
          ok: true,
          ticker: ticker.toUpperCase().trim(),
          price: live.price,
          asOf: live.asOf, // epoch millis from Polygon
          meta: { source: live.source, market, snapshot: live.raw }
        });
      } catch (err) {
        return jres({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // ------------------ /stocks ------------------
    if (url.pathname === "/stocks" && request.method === "POST") {
      try {
        const { tickers, startDate, endDate } = await request.json();
        if (!Array.isArray(tickers) || !tickers.length || !startDate || !endDate) {
          return jres({ ok: false, error: "tickers[], startDate, and endDate are required" }, { status: 400 });
        }

        if (!env.POLYGON_API_KEY) {
          if (ALLOW_DEV_MOCKS) {
            const now = Date.now();
            const results = tickers.map(t => ({
              ticker: t.toUpperCase().trim(),
              status: 200,
              data: {
                ticker: t.toUpperCase().trim(),
                results: [
                  { c: 100, t: now - 86400000 * 2 },
                  { c: 105, t: now - 86400000 },
                  { c: 107, t: now }
                ],
                resultsCount: 3,
                status: "OK"
              },
              error: null,
              meta: { latestClose: 107, latestCloseTime: now }
            }));
            return jres({ ok: true, results, meta: { startDate, endDate }, errors: [] });
          }
          return jres({ ok: false, error: "Missing POLYGON_API_KEY" }, { status: 401 });
        }

        const results = await Promise.all(
          tickers.map(async (ticker) => {
            try {
              const r = await fetchDailyRange(ticker, startDate, endDate, env.POLYGON_API_KEY);
              if (!r.ok) {
                console.warn(`[Worker] No valid data for ${ticker}:`, r.error);
              }
              return { ticker: ticker.toUpperCase().trim(), ...r, error: r.ok ? null : r.error };
            } catch (e) {
              console.error(`[Worker] Exception for ${ticker}:`, e.message);
              return { ticker: ticker.toUpperCase().trim(), ok: false, status: 500, data: null, error: e.message };
            }
          })
        );

        const successes = results.filter(r => r.ok);
        if (!successes.length) {
          console.error(`[Worker] All tickers failed. Results:`, JSON.stringify(results));
          return jres({ ok: false, results, errors: results.map(r => ({ ticker: r.ticker, error: r.error })) }, { status: 502 });
        }

        // Debug: log summary of results
        results.forEach(r => {
          if (!r.ok) {
            console.warn(`[Worker] Ticker ${r.ticker} failed:`, r.error);
          } else {
            console.log(`[Worker] Ticker ${r.ticker} success. Latest close:`, r.meta.latestClose);
          }
        });

        return jres({
          ok: true,
          results,
          meta: { startDate, endDate },
          errors: results.filter(r => !r.ok).map(r => ({ ticker: r.ticker, error: r.error }))
        });
      } catch (err) {
        return jres({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // ------------------ /ask ------------------
    if (url.pathname === "/ask" && request.method === "POST") {
      try {
        const body = await request.json();
        const { messages, temperature = 1.0, apiKey } = body;

        if (!Array.isArray(messages)) {
          return jres({ ok: false, error: "messages[] required" }, { status: 400 });
        }

        // Light guard: avoid using LLM for price quotes
        if (looksLikePriceQuestion(messages)) {
          return jres({
            ok: false,
            error: "Use /price (for live) or /stocks (for history) for market data."
          }, { status: 400 });
        }

        const openai = new OpenAI({
          apiKey: apiKey || env.OPENAI_API_KEY,
          baseURL: "https://gateway.ai.cloudflare.com/v1/1f7a2cc17e7193d1cf7a1a3b30d84536/stock-predict/openai"
        });

        const chat = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature,
          presence_penalty: 0,
          frequency_penalty: 0
        });

        const response = {
          role: chat.choices?.[0]?.message?.role || "assistant",
          content: chat.choices?.[0]?.message?.content || ""
        };

        return jres(response);
      } catch (err) {
        return jres({ ok: false, error: err.message }, { status: 500 });
      }
    }

    // ------------------ Default ------------------
    return jres({ message: "Dodgy Dave's API is running!" });
  }
};
