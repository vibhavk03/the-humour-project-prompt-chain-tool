import { StudioError } from './studio-validation';
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new StudioError('Cross-origin requests are not allowed.',403);
}
export async function readBytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new StudioError('No request body.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); throw new StudioError('This upload is too large.',413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function failure(error: unknown) {
  return Response.json({error:error instanceof StudioError?error.message:'The cloud request failed. Your changes have not been saved.'},{status:error instanceof StudioError?error.status:500});
}
