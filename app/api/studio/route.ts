import { requireCloudAccess } from '../../auth/api-access';
import { cleanupMedia, loadChains, loadRuns, rpc, saveRun } from '../../server/studio-cloud';
import { failure, readBytes, sameOrigin } from '../../server/studio-http';
import { StudioError, uuid, validateChain, validateRun } from '../../server/studio-validation';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const access=await requireCloudAccess();
  if (access) return access;
  try {
    const store = new URL(request.url).searchParams.get('store');
    if (!['chains','runs'].includes(store ?? '')) throw new StudioError('Unknown store.');
    return Response.json(store === 'chains' ? await loadChains() : await loadRuns(),{headers:{'Cache-Control':'no-store'}});
  } catch(e) { return failure(e); }
}
export async function PUT(request: Request) {
  const access=await requireCloudAccess();
  if (access) return access;
  try {
    sameOrigin(request);
    let data;
    try { data=JSON.parse((await readBytes(request,2_000_000)).toString()); }
    catch(e) { if(e instanceof StudioError) throw e; throw new StudioError('Invalid JSON.'); }
    if (data.store === 'chains') {
      validateChain(data.value);
      const chain = await rpc('prompt_studio_save_chain',{p_chain:data.value,p_expected_revision:data.value.revision ?? 0});
      return Response.json(chain);
    }
    if (data.store !== 'runs') throw new StudioError('Unknown store.');
    validateRun(data.value);
    await saveRun(data.value);
    return Response.json(data.value);
  } catch(e) { return failure(e); }
}
export async function DELETE(request: Request) {
  const access=await requireCloudAccess();
  if (access) return access;
  try {
    sameOrigin(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!uuid(id)) throw new StudioError('Invalid chain ID.');
    await rpc('prompt_studio_delete_chain',{p_id:id});
    await cleanupMedia();
    return Response.json({deleted:true});
  } catch(e) { return failure(e); }
}
