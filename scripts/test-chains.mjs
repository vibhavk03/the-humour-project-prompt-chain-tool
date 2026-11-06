import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/api/chains/step/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let calls = [];
let upstream = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'A funny observation.' }] }] };
let upstreamStatus = 200;
let authBlocked = null;
const context = { require: () => ({ requireAccount: async () => authBlocked }), exports: {}, Buffer, Request, Response, AbortSignal, URL, process: { env: { OPENAI_API_KEY: 'test-key' } }, fetch: async (url, init) => { calls.push({ url, ...init, parsed: JSON.parse(init.body) }); return Response.json(upstream, { status: upstreamStatus }); } };
vm.runInNewContext(compiled, context);
const post = body => context.exports.POST(new Request('http://localhost/api/chains/step', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify(body) }));
const valid = { prompt: 'Find something funny', outputType: 'text', input: { type: 'text', content: 'A dog in an office' } };
let response = await post(valid);
assert.equal(response.status, 200);
assert.equal((await response.json()).output.content, 'A funny observation.');
assert.equal(calls[0].parsed.store, false);
assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
assert.ok(calls[0].parsed.input[0].content[0].text.includes(valid.input.content));

const before = calls.length;
for (const body of [{}, { ...valid, prompt: '' }, { ...valid, prompt: 'x'.repeat(12001) }, { ...valid, outputType: 'video' }, { ...valid, input: { type: 'image', content: 'https://internal.example/secret' } }, { ...valid, input: { type: 'text', content: 'x'.repeat(40001) } }]) {
  assert.equal((await post(body)).status, 400);
}
assert.equal(calls.length, before, 'invalid input must never reach OpenAI');
response = await context.exports.POST(new Request('http://localhost/api/chains/step', { method: 'POST', headers: { origin: 'https://another-site.example' }, body: JSON.stringify(valid) }));
assert.equal(response.status, 403);
response = await context.exports.POST(new Request('http://localhost/api/chains/step', { method: 'POST', body: '{' }));
assert.equal(response.status, 400);

upstream = { status: 'completed', output: [{ type: 'image_generation_call', result: 'aGVsbG8=' }] };
response = await post({ ...valid, outputType: 'image', input: { type: 'image', content: 'data:image/png;base64,aGVsbG8=' } });
assert.equal((await response.json()).output.content, 'data:image/png;base64,aGVsbG8=');
assert.equal(calls.at(-1).parsed.tools[0].type, 'image_generation');
assert.equal(calls.at(-1).parsed.tool_choice.type, 'image_generation');
assert.equal(calls.at(-1).parsed.input[0].content[1].type, 'input_image');

upstreamStatus = 429; upstream = { error: { code: 'insufficient_quota', message: 'must not expose upstream diagnostics' } };
response = await post(valid);
assert.equal(response.status, 429);
assert.match((await response.json()).error, /credits/);
upstreamStatus = 200; upstream = { status: 'incomplete', output: [] };
assert.equal((await post(valid)).status, 502);
upstream = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Declined' }] }] };
assert.equal((await post(valid)).status, 422);
context.process.env.OPENAI_API_KEY = '';
assert.equal((await post(valid)).status, 503);
authBlocked = Response.json({error:'Sign in'},{status:401});
let countBeforeAuth = calls.length;
assert.equal((await post(valid)).status,401);
assert.equal(calls.length,countBeforeAuth,'unauthenticated requests cannot spend API credits');
authBlocked = Response.json({error:'Admin required'},{status:403});
assert.equal((await post(valid)).status,403);
assert.equal(calls.length,countBeforeAuth);
console.log('Prompt chain API tests passed: text, vision, images, validation, origin checks, quota, refusal, incomplete responses, and missing key.');
