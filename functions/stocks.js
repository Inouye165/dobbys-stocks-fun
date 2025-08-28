export async function onRequestPost({ request, env }) {
  try {
    const { tickers, startDate, endDate } = await request.json();
    if (!Array.isArray(tickers) || !tickers.length || !startDate || !endDate) {
      return new Response(JSON.stringify({ ok: false, error: 'tickers[], startDate, endDate required'}), { status: 400, headers: { 'Content-Type':'application/json' } });
    }
    const apiKey = env.POLYGON_API_KEY;
    const results = await Promise.all(tickers.map(async (t) => {
      const ticker = t.toUpperCase().trim();
      if (!apiKey) {
        return { ticker, mock: true };
      }
      const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${encodeURIComponent(startDate)}/${encodeURIComponent(endDate)}?apiKey=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json();
      return { ticker, status: resp.status, data };
    }));
    return new Response(JSON.stringify({ ok: true, results }), { headers: { 'Content-Type':'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type':'application/json' } });
  }
}
