import OpenAI from 'openai';

export async function onRequestPost({ request, env }) {
  try {
    const { messages, temperature = 0.9 } = await request.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ ok:false, error:'messages[] required'}), { status:400, headers:{'Content-Type':'application/json'} });
    }
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const chat = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature
    });
    const payload = { role: chat.choices?.[0]?.message?.role || 'assistant', content: chat.choices?.[0]?.message?.content || '' };
    return new Response(JSON.stringify(payload), { headers:{'Content-Type':'application/json'} });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:e.message }), { status:500, headers:{'Content-Type':'application/json'} });
  }
}
