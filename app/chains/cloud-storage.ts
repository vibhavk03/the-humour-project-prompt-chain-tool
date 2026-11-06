import type { Chain, Media, Run } from './model';
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url,{...init,cache:'no-store'}); }
  catch { throw new Error('Could not connect to the cloud. Your changes have not been saved.'); }
  const data = await response.json().catch(()=>null);
  if (!response.ok) throw new Error(data?.error || 'Cloud saving failed. Please retry.');
  return data;
}
export function all<T extends Chain | Run>(store: 'chains' | 'runs'): Promise<T[]> {
  return request(`/api/studio?store=${store}`);
}
// Reuse uploaded image references while a run progresses, instead of repeatedly
// transferring all previous base64 images with each status update.
const uploads = new Map<string,Media>();
async function upload(media: Media, chain: string, run: string, step: string): Promise<Media> {
  if (media.type === 'text' || media.storagePath) return media;
  const key=`${chain}/${run}/${step}/${media.content}`;
  const existing = uploads.get(key);
  if (existing) return existing;
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(media.content);
  if (!match) throw new Error('This image could not be uploaded. Choose a new image.');
  const binary=atob(match[2]);
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if (bytes.length>4*1024*1024) throw new Error('Images must be under 4 MB to save to the cloud.');
  const saved=await request<Media>(`/api/studio/media?chain=${chain}&run=${run}&step=${step}`,{
    method:'POST',headers:{'Content-Type':match[1]},body:bytes,
  });
  uploads.set(key,saved);
  return saved;
}
export function releaseUploads() { uploads.clear(); }
export async function put<T extends Chain | Run>(store: 'chains' | 'runs', value: T): Promise<T> {
  let saved: Chain | Run=value;
  if (store==='runs') {
    const run=value as Run;
    saved={...run,input:await upload(run.input,run.chainId,run.id,'input'),results:[]};
    for (const result of run.results) saved.results.push({...result,...(result.output?{output:await upload(result.output,run.chainId,run.id,result.step.id)}:{})});
  }
  return request<T>('/api/studio',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({store,value:saved})});
}
export async function removeChain(id: string) { await request(`/api/studio?id=${id}`,{method:'DELETE'}); }
