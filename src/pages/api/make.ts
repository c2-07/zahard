import type { APIRoute } from 'astro';
import { sql, getSetting } from '../../lib/db';
import { verifySession } from '../../lib/auth';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export const POST: APIRoute = async ({ request, cookies }) => {
  // 1. Check API switch
  const apiEnabled = await getSetting('api_enabled');
  if (apiEnabled !== 'true') {
    return new Response(JSON.stringify({ error: 'API is currently disabled by admin' }), { status: 503 });
  }

  // 2. Authenticate user
  const cookie = cookies.get('session');
  if (!cookie) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const session = await verifySession(cookie.value);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Check expiration again
  if (session.role !== 'admin') {
    const { rows } = await sql`SELECT expires_at FROM users WHERE id = ${session.userId}`;
    const user = rows[0];
    
    if (user?.expires_at && new Date(user.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: 'Account expired' }), { status: 403 });
    }
  }

  // Increment API usage (fire and forget)
  sql`UPDATE users SET api_calls = COALESCE(api_calls, 0) + 1 WHERE id = ${session.userId}`.catch(()=>{});

  // 3. Extract prompt
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { prompt, thinking } = body;
  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Prompt is required and must be a string' }), { status: 400 });
  }

  if (prompt.length > 50000) {
    return new Response(JSON.stringify({ error: 'Prompt exceeds maximum length (50000 characters)' }), { status: 413 });
  }

  // MOCK TEST BYPASS: Avoid token usage during automated testing
  if (prompt === '__TEST_PROMPT__') {
    return new Response(JSON.stringify({ 
      success: true, 
      text: 'This is a mocked AI response for testing.', 
      provider: 'mock' 
    }), { status: 200 });
  }

  // 4. LLM Fallback Logic
  const allProviders = [
    {
      name: 'gemini',
      client: createOpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: process.env.GEMINI_API_KEY || '' }),
      model: 'gemini-3.8-flash',
      hasKey: !!process.env.GEMINI_API_KEY
    },
    {
      name: 'groq',
      client: createOpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY || '' }),
      model: 'openai/gpt-oss-20b',
      hasKey: !!process.env.GROQ_API_KEY
    },
    {
      name: 'openrouter',
      client: createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY || '' }),
      model: 'openai/gpt-oss-20b',
      hasKey: !!process.env.OPENROUTER_API_KEY
    }
  ];

  let providers;
  if (thinking) {
    providers = [allProviders[0], allProviders[1], allProviders[2]];
  } else {
    providers = [allProviders[1], allProviders[2], allProviders[0]];
  }

  let allErrors: Record<string, string> = {};
  for (const provider of providers) {
    try {
      if (!provider.hasKey) {
        console.warn(`Skipping ${provider.name}, missing API key`);
        allErrors[provider.name] = 'Missing API key';
        continue;
      }

      const { text } = await generateText({
        model: provider.client(provider.model),
        prompt: `Solve the user's request and verify the answer before responding.\n\nIf the request asks you to create, modify, or provide source code:\n- Return only the final source code.\n- Format the code cleanly and consistently.\n- Use proper indentation, spacing, and line breaks.\n- Follow standard conventions for the language.\n- Do not include comments.\n- Do not include explanations.\n- Do not use Markdown code fences.\n- Do not include any text before or after the code.\n- The output must be directly writable to a source file.\n\nIf the request does not require source code:\n- Return a concise, direct answer.\n- Do not generate code unless it is necessary to answer the request.\n\nUser request:\n${prompt}`,
      });

      return new Response(JSON.stringify({ success: true, text, provider: provider.name }), { status: 200 });

    } catch (err: any) {
      console.error(`${provider.name} failed:`, err.message);
      allErrors[provider.name] = err.message;
    }
  }

  return new Response(JSON.stringify({ error: 'All models failed or no API keys were loaded', details: allErrors }), { status: 500 });
};
