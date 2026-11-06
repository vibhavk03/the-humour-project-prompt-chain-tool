import type { Chain, Run } from './model';
// Read-only access to the previous browser workspace. Import never deletes it.
export async function browserBackup(): Promise<{chains:Chain[];runs:Run[]}> {
  if (typeof indexedDB === 'undefined') return {chains:[],runs:[]};
  return new Promise((resolve) => {
    const open=indexedDB.open('humour-prompt-studio');
    open.onupgradeneeded=()=>{open.transaction?.abort();resolve({chains:[],runs:[]});};
    open.onerror=()=>resolve({chains:[],runs:[]});
    open.onsuccess=()=>{
      const db=open.result;
      if (!db.objectStoreNames.contains('chains') || !db.objectStoreNames.contains('runs')) {db.close();resolve({chains:[],runs:[]});return;}
      const tx=db.transaction(['chains','runs'],'readonly');
      const chains=tx.objectStore('chains').getAll();
      const runs=tx.objectStore('runs').getAll();
      tx.oncomplete=()=>{db.close();resolve({chains:chains.result,runs:runs.result});};
      tx.onerror=()=>{db.close();resolve({chains:[],runs:[]});};
    };
  });
}
