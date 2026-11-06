import type { Chain, Run } from './model';
// Previous account-scoped browser storage, retained for backup compatibility and tests.
// The studio now writes to cloud-storage.ts.
export function createBrowserStorage(userId:string) {
  if (!/^[a-f\d-]{36}$/i.test(userId)) throw new Error('Invalid account workspace.');
  function database():Promise<IDBDatabase> {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(`humour-prompt-studio-${userId}`,1);
      request.onupgradeneeded=()=>{request.result.createObjectStore('chains',{keyPath:'id'});request.result.createObjectStore('runs',{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(new Error('Browser storage is unavailable. Allow site storage to save your chains.'));
    });
  }
  async function all<T extends Chain|Run>(store:'chains'|'runs'):Promise<T[]> {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readonly');const request=tx.objectStore(store).getAll();
      tx.oncomplete=()=>{db.close();resolve(request.result);};
      tx.onerror=()=>{db.close();reject(new Error('Could not open your browser workspace.'));};
    });
  }
  async function put<T extends Chain|Run>(store:'chains'|'runs',value:T):Promise<T> {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(store,'readwrite');const table=tx.objectStore(store);
      let saved:T;let conflict=false;
      if(store==='chains') {
        const read=table.get(value.id);
        read.onsuccess=()=>{
          const current=read.result as Chain|undefined;
          if ((current?.revision??0)!==((value as Chain).revision??0)) {conflict=true;tx.abort();return;}
          saved={...value,revision:(current?.revision??0)+1,updatedAt:new Date().toISOString()};table.put(saved);
        };
      } else {saved={...value,updatedAt:new Date().toISOString()};table.put(saved);}
      tx.oncomplete=()=>{db.close();resolve(saved);};
      tx.onabort=tx.onerror=()=>{db.close();reject(new Error(conflict?'This chain changed in another tab. Reload before saving.':'Could not save. Browser storage may be full. Download important results and free some space.'));};
    });
  }
  async function removeChain(id:string) {
    const db=await database();
    return new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(['chains','runs'],'readwrite');tx.objectStore('chains').delete(id);
      const cursor=tx.objectStore('runs').openCursor();
      cursor.onsuccess=()=>{const c=cursor.result;if(c){if(c.value.chainId===id)c.delete();c.continue();}};
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{db.close();reject(new Error('Could not delete the chain.'));};
    });
  }
  return {all,put,removeChain,releaseUploads:()=>{}};
}
