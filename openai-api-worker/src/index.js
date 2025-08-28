const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
import OpenAI from "openai";

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    // ------------------ /stocks ------------------
    if (url.pathname === "/stocks" && request.method === "POST") {
      try {
        const { tickers, startDate, endDate } = await request.json();
        
        if (!Array.isArray(tickers) || !tickers.length || !startDate || !endDate) {
          return new Response(JSON.stringify({ ok: false, error: "tickers[], startDate, and endDate are required" }), 
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const results = await Promise.all(tickers.map(async (ticker) => {
          const t = ticker.toUpperCase().trim();
          
          // Check if Polygon API key is available
          if (!env.POLYGON_API_KEY) {
            // Return mock data when API key is not available
            const mockPrices = {
              'MSFT': { current: 412.50, change: 2.34 },
              'AAPL': { current: 189.75, change: -1.25 },
              'GOOGL': { current: 142.30, change: 0.87 },
              'TSLA': { current: 248.90, change: -5.67 },
              'NVDA': { current: 875.20, change: 12.45 },
              'AMZN': { current: 178.65, change: 3.21 },
              'META': { current: 298.45, change: 4.12 },
              'NFLX': { current: 445.80, change: -2.34 }
            };
            
            const mockPrice = mockPrices[t] || { current: 100 + Math.random() * 200, change: (Math.random() - 0.5) * 20 };
            const oldPrice = mockPrice.current - mockPrice.change;
            
            return {
              ticker: t,
              status: 200,
              data: {
                ticker: t,
                results: [
                  { c: oldPrice, t: Date.now() - 30 * 24 * 60 * 60 * 1000 },
                  { c: mockPrice.current, t: Date.now() }
                ],
                resultsCount: 2,
                status: "OK"
              },
              error: null
            };
          }
          
          try {
            const polygonUrl = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(t)}/range/1/day/${encodeURIComponent(startDate)}/${encodeURIComponent(endDate)}?apiKey=${env.POLYGON_API_KEY}`;
            const resp = await fetch(polygonUrl);
            const data = await resp.json();
            
            // Clean the data for better caching by removing unique identifiers
            if (resp.status === 200 && data && typeof data === "object") {
              // Remove Polygon.io unique identifiers that break caching
              delete data.request_id;
              delete data.next_url;
              delete data.count; // This can vary slightly
              
              // Clean any nested objects that might have unique IDs
              if (data.results && Array.isArray(data.results)) {
                data.results.forEach(result => {
                  if (result && typeof result === "object") {
                    delete result.request_id;
                    delete result.id;
                  }
                });
              }
            }
            
            return {
              ticker: t,
              status: resp.status,
              data: resp.status === 200 ? data : null,
              error: resp.status !== 200 ? (data?.error || `HTTP ${resp.status}`) : null
            };
          } catch (error) {
            return {
              ticker: t,
              status: 500,
              data: null,
              error: error.message
            };
          }
        }));

        const successes = results.filter(r => r.status === 200 && r.data);
        const failures = results.filter(r => r.status !== 200 || r.error);

        if (successes.length === 0) {
          return new Response(JSON.stringify({ 
            ok: false, 
            results, 
            errors: failures.map(f => ({ ticker: f.ticker, error: f.error })) 
          }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({
          ok: true,
          results,
          meta: { startDate, endDate },
          errors: failures.map(f => ({ ticker: f.ticker, error: f.error }))
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), 
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ------------------ /ask ------------------
    if (url.pathname === "/ask" && request.method === "POST") {
      try {
        const body = await request.json();
        const { messages, temperature = 1.0, apiKey } = body;

        if (!messages || !Array.isArray(messages)) {
          return new Response(JSON.stringify({ ok: false, error: "messages[] required" }), 
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const openai = new OpenAI({
          apiKey: apiKey || env.OPENAI_API_KEY,
          baseURL: "https://gateway.ai.cloudflare.com/v1/1f7a2cc17e7193d1cf7a1a3b30d84536/stock-predict/openai"
        });

        const chatCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature,
          presence_penalty: 0,
          frequency_penalty: 0
        });

        const response = {
          role: chatCompletion.choices?.[0]?.message?.role || "assistant",
          content: chatCompletion.choices?.[0]?.message?.content || ""
        };

        return new Response(JSON.stringify(response), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });

      } catch (error) {
        return new Response(JSON.stringify({ ok: false, error: error.message }), 
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ------------------ Default route ------------------
    return new Response(JSON.stringify({ message: "Dodgy Dave's API is running!" }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  },
};