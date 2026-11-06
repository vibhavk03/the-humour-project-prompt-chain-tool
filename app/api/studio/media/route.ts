import { requireCloudAccess } from '../../../auth/api-access';
import { createHash } from 'node:crypto';
import { bucket, supabase } from '../../../server/studio-cloud';
import { failure, readBytes, sameOrigin } from '../../../server/studio-http';
import { StudioError, uuid, validPath } from '../../../server/studio-validation';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const access=await requireCloudAccess();
  if (access) return access;
  try {
    sameOrigin(request);
    const params = new URL(request.url).searchParams;
    const chain=params.get('chain'),run=params.get('run'),step=params.get('step');
    if (!uuid(chain) || !uuid(run) || (step !== 'input' && !uuid(step))) throw new StudioError('Invalid media location.');
    const type = request.headers.get('content-type');
    if (!['image/png','image/jpeg','image/webp'].includes(type ?? '')) throw new StudioError('Choose a PNG, JPEG, or WebP image.');
    const bytes = await readBytes(request,4*1024*1024);
    const valid = type==='image/png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : type==='image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
      : bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP';
    if (!valid) throw new StudioError('The image could not be read. Try another file.');
    // Ensure a saved parent chain exists before uploading media.
    const parent = await supabase(`/rest/v1/prompt_studio_chains?id=eq.${chain}&select=id`);
    if (!(await parent.json()).length) throw new StudioError('Save the chain before uploading run media.',409);
    const hash=createHash('sha256').update(bytes).digest('hex');
    const path=`${chain}/${run}/${step}/${hash}.${type!.split('/')[1]}`;
    // Content-addressed paths make retries idempotent without overwriting other images.
    await supabase(`/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{'Content-Type':type!,'x-upsert':'true'},body:new Uint8Array(bytes)});
    return Response.json({type:'image',storagePath:path,content:`/api/studio/media?path=${encodeURIComponent(path)}`});
  } catch(e) { return failure(e); }
}
export async function GET(request: Request) {
  const access=await requireCloudAccess();
  if (access) return access;
  try {
    const path = new URL(request.url).searchParams.get('path');
    if (!validPath(path)) throw new StudioError('Invalid media path.');
    const response=await supabase(`/storage/v1/object/authenticated/${bucket}/${path}`);
    return new Response(response.body,{headers:{'Content-Type':response.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="${path.split('/').at(-1)}"`}});
  } catch(e) { return failure(e); }
}
