import { requireAccount } from '../../../auth/api-access';
export const runtime = 'nodejs';
export const maxDuration = 180;
const MAX_BODY = 12_000_000;

export async function POST(request: Request) {
  const access=await requireAccount();
  if (access) return access;
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: 'Add OPENAI_API_KEY to .env.local and restart the server.' }, { status: 503 });
  let body;
  try {
    // Bound streamed bodies too, rather than relying on Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return Response.json({ error: 'Input is too large.' }, { status: 413 }); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  const { prompt, outputType, input } = body ?? {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000 || !['text', 'image'].includes(outputType) ||
    !input || !['text', 'image'].includes(input.type) || typeof input.content !== 'string' || !input.content.trim() ||
    (input.type === 'text' && input.content.length > 40000) ||
    (input.type === 'image' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(input.content))) {
    return Response.json({ error: 'Provide a prompt (up to 12,000 characters) and a valid text or PNG, JPEG, or WebP input.' }, { status: 400 });
  }
  try {
    const model = process.env.OPENAI_CHAIN_MODEL || 'gpt-4.1-mini';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, store: false, max_output_tokens: 3000,
        input: [{ role: 'user', content: [
          { type: 'input_text', text: `${prompt}\n\n${input.type === 'text' ? `Input:\n${input.content}` : 'Apply these instructions to the attached image.'}` },
          ...(input.type === 'image' ? [{ type: 'input_image', image_url: input.content, detail: 'auto' }] : []),
        ] }],
        ...(outputType === 'image' ? { tools: [{ type: 'image_generation', model: 'gpt-image-1-mini', quality: 'low', size: '1024x1024' }], tool_choice: { type: 'image_generation' } } : {}),
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(165000)]), cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok) {
      const code = result.error?.code;
      const error = code === 'insufficient_quota' ? 'OpenAI credits or usage limits have been reached. Check the API project billing.'
        : response.status === 429 ? 'OpenAI is busy or rate-limited. Wait a moment and run again.'
        : [401, 403].includes(response.status) ? 'Check the OpenAI API key and project access, including image model access.'
        : response.status === 400 ? 'OpenAI could not process this step. Check the input, prompt, and configured model access.'
        : 'OpenAI could not complete this step. Please try again.';
      return Response.json({ error }, { status: response.status === 429 ? 429 : 502 });
    }
    if (result.status !== 'completed') return Response.json({ error: 'The model did not complete this step. Try a shorter prompt.' }, { status: 502 });
    const output = result.output ?? [];
    if (outputType === 'image') {
      const image = output.find((o: { type: string; result?: string }) => o.type === 'image_generation_call' && o.result);
      if (image) return Response.json({ output: { type: 'image', content: `data:image/png;base64,${image.result}` }, model: 'gpt-image-1-mini' });
    } else {
      const text = output.filter((o: { type: string }) => o.type === 'message').flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? []).filter((c: { type: string }) => c.type === 'output_text').map((c: { text: string }) => c.text).join('\n').trim();
      if (text) return Response.json({ output: { type: 'text', content: text }, model });
    }
    return Response.json({ error: 'No usable output was returned. The model may have declined this request. Try a different prompt.' }, { status: 422 });
  } catch {
    return Response.json({ error: 'The request timed out or could not reach OpenAI. Try again.' }, { status: 504 });
  }
}
