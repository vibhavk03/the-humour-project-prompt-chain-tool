import type { Chain, Media, Run, Step } from '../chains/model';
export class StudioError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function text(v: unknown, max: number, required = false): v is string { return typeof v === 'string' && v.length <= max && (!required || !!v.trim()); }
function step(v: unknown): v is Step {
  return object(v) && uuid(v.id) && text(v.name, 100) && text(v.prompt, 12000) && ['text','image'].includes(String(v.outputType));
}
export function validPath(path: unknown): path is string {
  return typeof path === 'string' && /^[\da-f-]{36}\/[\da-f-]{36}\/(input|[\da-f-]{36})\/[\da-f]{64}\.(png|jpeg|webp)$/.test(path);
}
export function mediaPath(media: Media) { return media.storagePath; }
function media(v: unknown, prefix: string): v is Media {
  if (!object(v)) return false;
  if (v.type === 'text') return text(v.content, 40000, true);
  return v.type === 'image' && validPath(v.storagePath) && v.storagePath.startsWith(prefix);
}
export function validateChain(value: unknown): asserts value is Chain {
  if (!object(value) || !uuid(value.id) || !text(value.name,100,true) || !text(value.description,500) ||
    !Array.isArray(value.steps) || value.steps.length > 20 || !value.steps.every(step) ||
    new Set(value.steps.map(s => s.id)).size !== value.steps.length ||
    (value.revision !== undefined && (!Number.isInteger(value.revision) || Number(value.revision) < 0))) {
    throw new StudioError('Provide a chain name and up to 20 valid steps.');
  }
}
export function validateRun(value: unknown): asserts value is Run {
  if (!object(value) || !uuid(value.id) || !uuid(value.chainId) || !text(value.chainName,100,true) ||
    !text(value.createdAt,50,true) || !Number.isFinite(Date.parse(value.createdAt)) ||
    !['running','completed','failed','interrupted'].includes(String(value.status)) ||
    !media(value.input, `${value.chainId}/${value.id}/input/`) || !Array.isArray(value.results) ||
    !value.results.length || value.results.length > 20) throw new StudioError('Invalid run snapshot.');
  const results = value.results;
  if (results.some(s => !object(s) || !step(s.step) || !['pending','running','completed','failed'].includes(String(s.status)) ||
    (s.output !== undefined && !media(s.output, `${value.chainId}/${value.id}/${s.step.id}/`)) ||
    (s.status === 'completed' && !s.output) ||
    (s.error !== undefined && !text(s.error,4000)) || (s.model !== undefined && !text(s.model,200))) ||
    new Set(results.map(s => s.step.id)).size !== results.length ||
    (value.status === 'completed' && results.some(s => s.status !== 'completed'))) throw new StudioError('Invalid step results.');
}
export function storedMedia(v: Media): Media {
  return v.type === 'image' ? { type:'image', content: v.storagePath!, storagePath: v.storagePath } : { type:'text',content:v.content };
}
export function displayedMedia(v: Media): Media {
  return v.type === 'image' ? { ...v, content:`/api/studio/media?path=${encodeURIComponent(v.storagePath!)}` } : v;
}
