import 'server-only';
import type { Chain, Media, Run, Step, StepResult } from '../chains/model';
import { displayedMedia, storedMedia, StudioError } from './studio-validation';
export const bucket = 'prompt-studio-media';

export function configuration() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StudioError('Cloud saving needs a Supabase URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local. Add the server key and restart the app.',503);
  return { url: url.replace(/\/$/,''), key };
}
export async function supabase(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = configuration();
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, { ...init, cache:'no-store', signal: AbortSignal.timeout(30000),
      headers: { apikey:key, Authorization:`Bearer ${key}`, ...init.headers } });
  } catch { throw new StudioError('Could not reach Supabase. Your changes have not been saved. Try again.',502); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (error.code === '40001') throw new StudioError('This chain changed in another tab or device. Reload the workspace before saving so you do not overwrite those changes.',409);
    if (['42P01','PGRST202','PGRST205'].includes(error.code)) throw new StudioError('Cloud tables are not ready. Run supabase/prompt-studio.sql in the Supabase SQL Editor.',503);
    if (response.status === 401 || response.status === 403 || error.code === '42501') throw new StudioError('Supabase access was denied. Check the server secret key and run the SQL migration.',503);
    if (error.code === '23503') throw new StudioError('This chain was deleted elsewhere. Reload your workspace.',409);
    if (error.code === '22023') throw new StudioError('The saved run snapshot cannot be changed. Start a new run.',409);
    throw new StudioError('Supabase could not save or load this data. Check the database migration and Storage bucket, then retry.',502);
  }
  return response;
}
export async function rpc(name: string, args: unknown) {
  const response = await supabase(`/rest/v1/rpc/${name}`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args) });
  return response.status === 204 ? null : response.json();
}
async function rows<T>(query: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 200) {
    const response = await supabase(`/rest/v1/${query}&limit=200&offset=${offset}`);
    const page: T[] = await response.json();
    result.push(...page);
    if (page.length < 200) return result;
  }
}
type ChainRow = {id:string;name:string;description:string;updated_at:string;revision:number;prompt_studio_steps:(Step & {position:number;output_type:'text'|'image'})[]};
type RunRow = {id:string;chain_id:string;chain_name:string;input:Media;status:Run['status'];created_at:string;updated_at:string;prompt_studio_step_runs:{position:number;step_snapshot:Step;status:StepResult['status'];output:Media|null;error:string|null;model:string|null}[]};
export async function loadChains(): Promise<Chain[]> {
  const data = await rows<ChainRow>('prompt_studio_chains?select=*,prompt_studio_steps(*)&order=updated_at.desc,id.asc');
  return data.map(c => ({id:c.id,name:c.name,description:c.description,updatedAt:c.updated_at,revision:c.revision,
    steps:c.prompt_studio_steps.sort((a,b)=>a.position-b.position).map(s=>({id:s.id,name:s.name,prompt:s.prompt,outputType:s.output_type}))}));
}
export async function loadRuns(): Promise<Run[]> {
  const data = await rows<RunRow>('prompt_studio_runs?select=*,prompt_studio_step_runs(*)&order=created_at.desc,id.asc');
  return Promise.all(data.map(async r => {
    const run: Run = {id:r.id,chainId:r.chain_id,chainName:r.chain_name,createdAt:r.created_at,input:displayedMedia(r.input),status:r.status,
      results:r.prompt_studio_step_runs.sort((a,b)=>a.position-b.position).map(s=>({step:s.step_snapshot,status:s.status,
        ...(s.output ? {output:displayedMedia(s.output)} : {}),...(s.error ? {error:s.error} : {}),...(s.model ? {model:s.model} : {})}))};
    // Another browser opening the workspace must not interrupt an active run.
    // A step has a 3-minute maximum, so 15 minutes without a heartbeat is stale.
    if (run.status === 'running' && Date.now()-Date.parse(r.updated_at)>15*60*1000) {
      run.status='interrupted';
      run.results=run.results.map(s=>s.status==='running'?{...s,status:'failed',error:'This run stopped before it finished. Start a new run.'}:s);
      await saveRun(run);
    }
    return run;
  }));
}
export async function saveRun(run: Run) {
  const value = {...run,input:storedMedia(run.input),results:run.results.map(s=>({...s,...(s.output?{output:storedMedia(s.output)}:{})}))};
  await rpc('prompt_studio_save_run',{p_run:value});
}
export async function cleanupMedia() {
  try {
    const response = await supabase('/rest/v1/prompt_studio_media_cleanup?select=path&limit=100&order=created_at.asc');
    const queued: {path:string}[] = await response.json();
    if (!queued.length) return;
    await supabase(`/storage/v1/object/${bucket}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:queued.map(x=>x.path)})});
    for (const {path} of queued) await supabase(`/rest/v1/prompt_studio_media_cleanup?path=eq.${encodeURIComponent(path)}`,{method:'DELETE'});
  } catch { /* Retained queue entries are retried on the next write. */ }
}
