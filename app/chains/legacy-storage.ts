import type { Chain, Run } from './model';
// Read-only access to the previous browser workspace. Import never deletes it.
async function readBackup(name:string): Promise<{chains:Chain[];runs:Run[]}> {
  if (typeof indexedDB === 'undefined') return {chains:[],runs:[]};
  return new Promise((resolve) => {
    const open=indexedDB.open(name);
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

export async function browserBackup(userId:string):Promise<{chains:Chain[];runs:Run[]}> {
  const current=await readBackup(`humour-prompt-studio-${userId}`);
  const legacy=await readBackup('humour-prompt-studio');
  return {
    chains:[...current.chains,...legacy.chains.filter(c=>!current.chains.some(x=>x.id===c.id))],
    runs:[...current.runs,...legacy.runs.filter(r=>!current.runs.some(x=>x.id===r.id))],
  };
}
