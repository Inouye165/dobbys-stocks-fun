export async function onRequestPost({ request, env }) {
  try {
    const { messages, temperature = 0.0 } = await request.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ ok: false, error: 'messages[] required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'OPENAI_API_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const apiUrl = 'https://gateway.ai.cloudflare.com/v1/1f7a2cc17e7193d1cf7a1a3b30d84536/stock-predict/openai/v1/chat/completions';
    const body = {
      model: 'gpt-4o-mini',
      messages,
      temperature,
      // Safety: minimal response formatting
      stream: false
    };

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const json = await resp.json();
    if (!resp.ok) {
      return new Response(JSON.stringify({ ok: false, error: json.error?.message || `HTTP ${resp.status}` }), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
    }

    const payload = {
      role: json.choices?.[0]?.message?.role || 'assistant',
      content: json.choices?.[0]?.message?.content || ''
    };
    return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
