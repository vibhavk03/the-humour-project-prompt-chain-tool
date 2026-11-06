'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserStorage } from './storage';
import { AccountControls } from '../auth/account-controls';
import { browserBackup } from './legacy-storage';
import { makeChain, newStep, uid, type Chain, type Media, type Run, type Step } from './model';

type IconName = 'spark' | 'plus' | 'arrow' | 'back' | 'grid' | 'flow' | 'play' | 'image' | 'text' | 'trash' | 'copy' | 'check' | 'up' | 'down';
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7 0v4m-2-2h4" />,
    plus: <path d="M12 5v14M5 12h14" />, arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, back: <path d="M20 12H4m6-6-6 6 6 6" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    flow: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M6 10v7h8"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>, image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></>,
    text: <path d="M5 5h14M12 5v15m-4 0h8"/>, trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7m4-7v7"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>, check: <path d="m5 12 4 4L19 6"/>, up: <path d="m6 15 6-6 6 6"/>, down: <path d="m6 9 6 6 6-6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function time(value: string) { return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function MediaView({ media }: { media: Media }) { return media.type === 'image' ? <img className="ps-media" src={media.content} alt="Chain input or generated output" /> : <p className="ps-output-text">{media.content}</p>; }

export default function Studio({account}:{account:{id:string;email:string}}) {
  const {all,put,removeChain,releaseUploads}=useMemo(()=>createBrowserStorage(account.id),[account.id]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Chain | null>(null);
  const [selected, setSelected] = useState('');
  const [dirty, setDirty] = useState(false);
  const [theme, setTheme] = useState('system');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('current');
  const [mobileTab, setMobileTab] = useState('steps');
  const [inputText, setInputText] = useState('');
  const [inputImage, setInputImage] = useState('');
  const [inputMode, setInputMode] = useState('text');
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backup, setBackup] = useState<{chains:Chain[];runs:Run[]}>({chains:[],runs:[]});
  const saveLock = useRef(false);
  const busy = running || saving || importing;
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; detail: string; action: () => void } | null>(null);
  const lock = useRef(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([all<Chain>('chains'), all<Run>('runs')]).then(([c,r]) => {
      const recovered=r.map(run=>run.status==='running' && Date.now()-Date.parse(run.updatedAt||run.createdAt)>15*60*1000?{...run,status:'interrupted' as const,results:run.results.map(s=>s.status==='running'?{...s,status:'failed' as const,error:'This run stopped before it finished. Start a new run.'}:s)}:run);
      setChains(c); setRuns(recovered); setReady(true);
      for (const run of recovered.filter(x=>x.status==='interrupted')) put('runs',run).catch(e=>setError(e.message));
    }).catch(e => setError(e.message));
    browserBackup().then(setBackup);
    Promise.resolve().then(() => {
      try { const saved = localStorage.getItem('prompt-studio-theme');
      if (saved && ['light', 'dark', 'system'].includes(saved)) setTheme(saved); } catch { /* System appearance works without localStorage. */ }
    });
  }, [all,put]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty || lock.current || saveLock.current) e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(t); }, [notice]);
  const step = draft?.steps.find(s => s.id === selected);
  const index = draft?.steps.findIndex(s => s.id === selected) ?? -1;
  const chainRuns = runs.filter(r => r.chainId === draft?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sorted = [...chains].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter(c => `${c.name} ${c.description}`.toLowerCase().includes(search.toLowerCase()));

  function open(chain: Chain) {
    setDraft(structuredClone(chain)); setSelected(chain.steps[0]?.id ?? ''); setDirty(false); setActiveRun(null); setError(''); setInputText(''); setInputImage(''); setTab('current'); setMobileTab('steps');
  }
  async function create(template = 'blank') {
    try { const chain = await put('chains', makeChain(template)); setChains(c => [...c, chain]); open(chain); }
    catch (e) { setError((e as Error).message); }
  }
  function update(change: Partial<Chain>) { if (!draft || busy) return; setDraft({ ...draft, ...change }); setDirty(true); }
  function updateStep(change: Partial<Step>) { if (draft && step) update({ steps: draft.steps.map(s => s.id === step.id ? { ...s, ...change } : s) }); }
  async function save(): Promise<Chain | null> {
    if (!draft || saveLock.current) return null;
    if (!draft.name.trim()) { setError('Give your chain a name before saving.'); return null; }
    const value = { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() };
    saveLock.current = true; setSaving(true);
    try { const saved = await put('chains', value); setChains(c => c.map(x => x.id === saved.id ? saved : x)); setDraft(saved); setDirty(false); return saved; }
    catch (e) { setError((e as Error).message); return null; }
    finally { saveLock.current = false; setSaving(false); }
  }
  function leave() {
    if (busy) return;
    if (dirty) setConfirm({ title: 'Leave without saving?', detail: 'Your unsaved edits will be discarded.', action: () => { setDraft(null); setDirty(false); } });
    else { setDraft(null); setError(''); }
  }
  async function duplicate(chain: Chain) {
    const copy = { ...structuredClone(chain), id: uid(), name: `${chain.name.slice(0,93)} (copy)`, revision: 0, updatedAt: new Date().toISOString(), steps: chain.steps.map(s => ({ ...s, id: uid() })) };
    try { const saved = await put('chains', copy); setChains(c => [...c, saved]); setNotice('Chain duplicated'); } catch (e) { setError((e as Error).message); }
  }
  function deleteChain(chain: Chain) {
    setConfirm({ title: `Delete “${chain.name}”?`, detail: 'This will permanently delete the chain and all of its saved runs from your browser workspace.', action: () => { removeChain(chain.id).then(() => { setChains(c => c.filter(x => x.id !== chain.id)); setRuns(r => r.filter(x => x.chainId !== chain.id)); }).catch(e => setError(e.message)); } });
  }
  function addStep() { if (!draft) return; const next = newStep(); update({ steps: [...draft.steps, next] }); setSelected(next.id); setMobileTab('edit'); }
  function move(delta: number) {
    if (!draft || index + delta < 0 || index + delta >= draft.steps.length) return;
    const steps = [...draft.steps]; [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]]; update({ steps });
  }
  async function upload(f?: File) {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 4 * 1024 * 1024) { setError('Choose a PNG, JPEG, or WebP image under 4 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => setInputImage(String(reader.result)); reader.onerror = () => setError('This file could not be read.'); reader.readAsDataURL(f);
  }
  async function persistRun(run: Run) {
    const saved = await put('runs', run);
    setRuns(r => [saved, ...r.filter(x => x.id !== run.id)]);
  }
  async function execute() {
    if (lock.current || saveLock.current || importing || !draft) return;
    setError('');
    if (!draft.steps.length || draft.steps.some(s => !s.prompt.trim() || !s.name.trim())) { setError('Add at least one step and give every step a name and prompt.'); return; }
    const input: Media = inputMode === 'image' ? { type: 'image', content: inputImage } : { type: 'text', content: inputText.trim() };
    if (!input.content) { setError('Add your starting text or upload an image first.'); setMobileTab('run'); return; }
    lock.current = true; setRunning(true);
    let run: Run | null = null;
    try {
      const chain = await save(); if (!chain) return;
      run = { id: uid(), chainId: chain.id, chainName: chain.name, createdAt: new Date().toISOString(), input, status: 'running', results: chain.steps.map(s => ({ step: structuredClone(s), status: 'pending' })) };
      setActiveRun(structuredClone(run)); setTab('current'); setMobileTab('run');
      await persistRun(run);
      let previous = input;
      for (let i = 0; i < run.results.length; i++) {
        run.results[i].status = 'running'; setActiveRun(structuredClone(run)); await persistRun(run);
        try {
          const response = await fetch('/api/chains/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: run.results[i].step.prompt, outputType: run.results[i].step.outputType, input: previous }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'This step could not be completed.');
          if (!data.output?.content || !['text', 'image'].includes(data.output.type)) throw new Error('The server returned an invalid output.');
          previous = data.output;
          run.results[i] = { ...run.results[i], status: 'completed', output: previous, model: data.model };
        } catch (e) { run.results[i].status = 'failed'; run.results[i].error = (e as Error).message; run.status = 'failed'; }
        setActiveRun(structuredClone(run)); await persistRun(run);
        if (run.status === 'failed') break;
      }
      if (run.status === 'running') run.status = 'completed';
      setActiveRun(structuredClone(run)); await persistRun(run);
    } catch (e) {
      setError((e as Error).message);
      if (run) { run.status = 'interrupted'; setActiveRun(structuredClone(run)); }
    } finally { releaseUploads(); lock.current = false; setRunning(false); }
  }
  async function refreshCloud() {
    setError('');
    try { const [c,r]=await Promise.all([all<Chain>('chains'),all<Run>('runs')]); setChains(c);setRuns(r);setReady(true); }
    catch(e) {setError((e as Error).message);}
  }
  async function importBackup() {
    if (!ready || busy) return;
    setImporting(true); setError('');
    let imported=0;
    try {
      const remote=await all<Chain>('chains'); const remoteRuns=await all<Run>('runs');
      const chainIds=new Set(remote.map(c=>c.id)); const runIds=new Set(remoteRuns.map(r=>r.id));
      for (const chain of backup.chains) {
        if (chainIds.has(chain.id)) continue; // Never overwrite an existing cloud chain.
        const saved=await put('chains',{...chain,revision:0});
        remote.push(saved);chainIds.add(saved.id);imported++;
      }
      for (const old of backup.runs) {
        if (runIds.has(old.id) || !chainIds.has(old.chainId)) continue;
        const run:Run=old.status==='running'?{...old,status:'interrupted',results:old.results.map(s=>s.status==='running'?{...s,status:'failed',error:'Imported after the original run stopped.'}:s)}:old;
        await put('runs',run);imported++;
      }
      setBackup({chains:[],runs:[]}); setNotice(`Imported ${imported} records. Your browser backup is unchanged.`);
    } catch(e) {setError(`${(e as Error).message} Any completed imports are saved; you can retry safely.`);}
    finally {releaseUploads();setImporting(false);await refreshCloud();}
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setNotice('Copied to clipboard'); } catch { setError('Clipboard unavailable. Select and copy the text instead.'); } }

  return <main className="ps" data-theme={theme}>
    <aside className="ps-rail">
      <Link href="/" className="ps-logo" aria-label="Prompt Studio"><Icon name="flow" size={26}/></Link>
      <div className="ps-rail-line"/>
      <button className="ps-rail-active" title="Your chains" aria-label="Your chains" disabled={busy} onClick={leave}><Icon name="grid" size={21}/></button>
      <span className="ps-rail-word">MAKE SOMETHING UNEXPECTED</span>
      <Link href="/" className="ps-rail-home" title="Your workspace" aria-label="Your workspace"><Icon name="back"/></Link>
    </aside>
    <div className="ps-shell">
      <header className="ps-header"><div className="ps-brand">prompt<span>studio</span><span className="ps-beta">BETA</span></div><div className="ps-header-right"><AccountControls email={account.email} disabled={busy} hasUnsavedChanges={dirty}/><span className="ps-local"><span/>{ready ? 'Browser workspace' : 'Opening workspace'}</span><select aria-label="Appearance" value={theme} onChange={e => { setTheme(e.target.value); localStorage.setItem('prompt-studio-theme', e.target.value); }}><option value="system">◐ System</option><option value="light">☀ Light</option><option value="dark">☾ Dark</option></select></div></header>
      {error && <div className="ps-alert" role="alert"><span>{error}</span>{!draft && <button className="ps-btn" onClick={refreshCloud}>Try again</button>}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {!draft ? <div className="ps-dashboard">{backup.chains.length > 0 && <div className="ps-import-banner"><span>{backup.chains.length} browser chains available to import. Existing account chains will be kept.</span><button className="ps-btn" disabled={!ready || busy} onClick={importBackup}>{importing ? 'Importing…' : 'Import browser workspace'}</button></div>}
        <div className="ps-eyebrow"><span/> YOUR CREATIVE WORKSPACE</div>
        <div className="ps-heading-row"><div><h1>Small prompts.<br/><span>Big possibilities.</span></h1><p>Connect your ideas. Let the good stuff happen.</p></div><button className="ps-btn ps-primary" disabled={!ready || busy} onClick={() => create()}><Icon name="plus"/>Create chain</button></div>
        <section className="ps-starter"><div className="ps-starter-copy"><span className="ps-eyebrow">A LITTLE INSPIRATION</span><h2>Skip the blank canvas.</h2><p>Start with a recipe. Make it your own.</p></div><button disabled={!ready || busy} onClick={() => create('captions')} className="ps-template"><span className="ps-template-icon yellow"><Icon name="spark" size={24}/></span><span><strong>Find the funny</strong><small>Image → observation → captions</small><em>3 steps · Text output</em></span><Icon name="arrow"/></button><button disabled={!ready || busy} onClick={() => create('poster')} className="ps-template"><span className="ps-template-icon lavender"><Icon name="image" size={24}/></span><span><strong>Idea to illustration</strong><small>A little thought. A whole visual world.</small><em>2 steps · Image output</em></span><Icon name="arrow"/></button></section>
        <div className="ps-list-header"><h2>Your chains <span className="ps-count">{chains.length}</span></h2><div className="ps-search"><span aria-hidden="true">⌕</span><input aria-label="Search chains" placeholder="Find a chain…" value={search} onChange={e => setSearch(e.target.value)}/></div></div>
        {!ready ? <div className="ps-empty"><span>Opening your browser workspace…</span></div> : sorted.length ? <div className="ps-cards">{sorted.map((chain, i) => <article className="ps-chain-card" key={chain.id}><div className="ps-card-top"><span className={`ps-template-icon ${i % 2 ? 'lavender' : 'yellow'}`}><Icon name="flow" size={23}/></span><div className="ps-card-tools"><button title="Duplicate chain" aria-label={`Duplicate ${chain.name}`} onClick={() => duplicate(chain)}><Icon name="copy" size={16}/></button><button title="Delete chain" aria-label={`Delete ${chain.name}`} onClick={() => deleteChain(chain)}><Icon name="trash" size={16}/></button></div></div><button className="ps-card-open" onClick={() => open(chain)}><h3>{chain.name}</h3><p>{chain.description || 'A new idea, waiting to happen.'}</p><div className="ps-card-flow">{chain.steps.slice(0, 5).map((s, n) => <span key={s.id}>{n > 0 && <span className="ps-flow-arrow">→</span>}<span className="ps-flow-node"><Icon name={s.outputType === 'image' ? 'image' : 'text'} size={14}/></span></span>)}{!chain.steps.length && <small>Add your first step</small>}</div><footer><span>{chain.steps.length} steps <b>·</b> {time(chain.updatedAt)}</span><Icon name="arrow" size={18}/></footer></button></article>)}</div> : <div className="ps-empty"><span className="ps-empty-icon"><Icon name="flow" size={32}/></span><h3>{search ? 'No matching chains' : 'Your next great idea starts here.'}</h3><p>{search ? 'Try another name or description.' : 'Create a chain from scratch or try a recipe above.'}</p>{!search && <button className="ps-btn" onClick={() => create()}><Icon name="plus"/>Create your first chain</button>}</div>}
        <footer className="ps-dashboard-footer"><span>Made for the space between “what if” and “there it is.”</span><span>Saved in this browser · Signed in with Google</span></footer>
      </div> : <div className="ps-editor">
        <div className="ps-editor-toolbar"><button className="ps-icon-btn" aria-label="Back to chains" disabled={busy} onClick={leave}><Icon name="back"/></button><div className="ps-chain-title"><input aria-label="Chain name" maxLength={100} value={draft.name} disabled={busy} onChange={e => update({ name: e.target.value })}/><span>{draft.steps.length} steps <b>·</b> {dirty ? 'Unsaved changes' : 'Saved in this browser'}</span></div><button className="ps-btn ps-save" disabled={busy || !dirty} onClick={async () => { if (await save()) setNotice('Chain saved'); }}><Icon name="check"/>{saving ? 'Saving…' : 'Save changes'}</button><button className="ps-btn ps-primary" disabled={busy} onClick={execute}>{running ? <span className="ps-spinner"/> : <Icon name="play"/>}{running ? 'Running…' : 'Run chain'}</button></div>
        <nav className="ps-mobile-tabs" aria-label="Editor panels">{['steps', 'edit', 'run'].map(t => <button key={t} aria-pressed={mobileTab === t} onClick={() => setMobileTab(t)}>{t === 'edit' ? 'Step editor' : t === 'run' ? 'Run & results' : 'Steps'}</button>)}</nav>
        <div className="ps-editor-grid">
          <section className={`ps-steps ps-panel ${mobileTab === 'steps' ? 'ps-mobile-visible' : ''}`}><div className="ps-panel-title"><h2>The workflow</h2><span className="ps-count">{draft.steps.length}</span></div><p className="ps-panel-hint">Good things happen one step at a time.</p><div className="ps-step-list">{draft.steps.map((s, n) => <button key={s.id} className={`ps-step ${selected === s.id ? 'is-selected' : ''}`} onClick={() => { setSelected(s.id); setMobileTab('edit'); }}><span className="ps-step-number">{String(n + 1).padStart(2, '0')}</span><span><strong>{s.name || 'Untitled step'}</strong><small>{n === 0 ? 'Starting input' : 'Previous output'} → {s.outputType}</small></span><Icon name={s.outputType === 'image' ? 'image' : 'text'} size={16}/></button>)}</div><button className="ps-add-step" disabled={busy || draft.steps.length >= 20} onClick={addStep}><Icon name="plus"/>Add step</button><div className="ps-flow-note"><Icon name="flow"/><p>Each step passes its output to the next. Change the order to change the story.</p></div><label className="ps-label">Chain description<textarea className="ps-description" placeholder="What does this chain do?" value={draft.description} maxLength={500} disabled={busy} onChange={e => update({ description: e.target.value })}/></label></section>
          <section className={`ps-settings ps-panel ${mobileTab === 'edit' ? 'ps-mobile-visible' : ''}`}>
            {step ? <><div className="ps-panel-title"><span className="ps-eyebrow">STEP {String(index + 1).padStart(2, '0')}</span><div className="ps-step-actions"><button aria-label="Move step up" title="Move up" disabled={busy || index === 0} onClick={() => move(-1)}><Icon name="up"/></button><button aria-label="Move step down" title="Move down" disabled={busy || index === draft.steps.length - 1} onClick={() => move(1)}><Icon name="down"/></button><button aria-label="Duplicate step" title="Duplicate step" disabled={busy || draft.steps.length >= 20} onClick={() => { const s = { ...step, id: uid(), name: `${step.name.slice(0,93)} (copy)` }; const steps = [...draft.steps]; steps.splice(index + 1, 0, s); update({ steps }); setSelected(s.id); }}><Icon name="copy" size={17}/></button><button aria-label="Delete step" title="Delete step" disabled={busy} onClick={() => setConfirm({ title: 'Delete this step?', detail: 'Later steps will receive the output of the step before it.', action: () => { const steps = draft.steps.filter(s => s.id !== step.id); update({ steps }); setSelected(steps[Math.max(0, index - 1)]?.id ?? ''); } })}><Icon name="trash" size={17}/></button></div></div><h2>Shape the next step.</h2><p className="ps-panel-hint">A clear instruction makes all the difference.</p><fieldset disabled={busy}><label className="ps-label">Step name<input value={step.name} maxLength={100} onChange={e => updateStep({ name: e.target.value })} placeholder="Give this step a name"/></label><label className="ps-label">Input source<div className="ps-input-source"><Icon name={index === 0 ? 'flow' : draft.steps[index - 1].outputType === 'text' ? 'text' : 'image'}/><span>{index === 0 ? 'Starting input' : `Step ${index}: ${draft.steps[index - 1].name}`}</span><span className="ps-auto">AUTO</span></div></label><label className="ps-label">Prompt<span className="ps-label-hint">What should the AI do?</span><textarea className="ps-prompt" maxLength={12000} value={step.prompt} onChange={e => updateStep({ prompt: e.target.value })} placeholder="Be specific. Describe the task, tone, and what a great result looks like…"/><span className="ps-char-count">{step.prompt.length.toLocaleString()} / 12,000</span></label><label className="ps-label">Output format</label><div className="ps-output-options">{(['text', 'image'] as const).map(type => <button key={type} aria-pressed={step.outputType === type} className={step.outputType === type ? 'is-selected' : ''} onClick={() => updateStep({ outputType: type })}><Icon name={type}/><span><strong>{type === 'text' ? 'Text' : 'Image'}</strong><small>{type === 'text' ? 'Words, ideas & captions' : 'A visual worth sharing'}</small></span>{step.outputType === type && <Icon name="check" size={15}/>}</button>)}</div><div className="ps-model"><span className="ps-status-dot"/> {step.outputType === 'image' ? 'GPT Image 1 Mini' : 'Automatic text model'} <span>via OpenAI</span></div></fieldset></> : <div className="ps-empty"><Icon name="spark" size={32}/><h3>A little direction goes a long way.</h3><p>Add a step to start building your workflow.</p><button className="ps-btn ps-primary" onClick={addStep}><Icon name="plus"/>Add first step</button></div>}
          </section>
          <section className={`ps-results ps-panel ${mobileTab === 'run' ? 'ps-mobile-visible' : ''}`}><div className="ps-result-tabs"><button className={tab === 'current' ? 'is-active' : ''} onClick={() => setTab('current')}>Playground</button><button className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}>History <span className="ps-count">{chainRuns.length}</span></button></div>
            {tab === 'history' ? <div className="ps-history">{chainRuns.length ? chainRuns.map(r => <button key={r.id} disabled={busy} onClick={() => { setActiveRun(r); setTab('current'); }}><span className={`ps-run-dot ${r.status}`}/><span><strong>{r.chainName}</strong><small>{time(r.createdAt)} · {r.results.length} steps</small></span><span className="ps-history-status">{r.status}</span></button>) : <div className="ps-empty"><Icon name="flow" size={28}/><h3>No runs just yet.</h3><p>Your experiments will find a home here.</p></div>}</div> : <><div className="ps-playground-input"><div className="ps-panel-title"><h2>Give it a starting point.</h2><Icon name="spark"/></div><div className="ps-input-tabs">{['text', 'image'].map(t => <button key={t} disabled={busy} aria-pressed={inputMode === t} onClick={() => setInputMode(t)} className={inputMode === t ? 'is-active' : ''}><Icon name={t as 'text' | 'image'} size={15}/>{t === 'text' ? 'Text' : 'Image'}</button>)}</div>{inputMode === 'text' ? <textarea aria-label="Starting text" placeholder="An idea, a scene, a wonderfully weird thought…" value={inputText} disabled={busy} maxLength={40000} onChange={e => setInputText(e.target.value)}/> : <><input ref={file} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }}/><button className="ps-upload" disabled={busy} onClick={() => file.current?.click()}>{inputImage ? <img src={inputImage} alt="Selected starting image"/> : <><Icon name="image" size={30}/><strong>Choose an image</strong><small>PNG, JPEG, WebP · Up to 4 MB</small></>}</button>{inputImage && <button className="ps-text-button" disabled={busy} onClick={() => setInputImage('')}>Remove image</button>}</>}<button className="ps-btn ps-primary ps-run-button" disabled={busy || !draft.steps.length} onClick={execute}>{running ? <span className="ps-spinner"/> : <Icon name="play"/>}{running ? 'A little magic in progress…' : 'Run chain'}{!running && <span>↗</span>}</button><small className="ps-run-hint">Runs use your OpenAI API credits.</small></div>
            {!activeRun ? <div className="ps-awaiting"><div className="ps-orbit"><Icon name="spark" size={30}/></div><h3>This is where it comes together.</h3><p>Add an input and run your chain.<br/>Watch each idea become the next.</p></div> : <div className="ps-run-results"><div className="ps-run-heading"><span className="ps-eyebrow">{activeRun.status === 'running' ? 'IN THE MAKING' : 'RUN RESULTS'}</span><span className={`ps-badge ${activeRun.status}`}>{activeRun.status}</span></div><small>{time(activeRun.createdAt)}</small><details className="ps-run-input"><summary>View original input</summary><MediaView media={activeRun.input}/></details>{activeRun.results.map((r, i) => <article key={r.step.id} className={`ps-result-card ${r.status}`}><div className="ps-result-heading"><span className="ps-result-number">{r.status === 'completed' ? <Icon name="check" size={14}/> : r.status === 'running' ? <span className="ps-spinner"/> : i + 1}</span><strong>{r.step.name}</strong><small>{r.status === 'pending' && activeRun.status !== 'running' ? 'Skipped' : r.status}</small></div>{r.output && <><MediaView media={r.output}/><div className="ps-result-footer"><small>{r.model}</small>{r.output.type === 'text' ? <button onClick={() => copy(r.output!.content)}><Icon name="copy" size={14}/>Copy</button> : <a href={r.output.content} download={`studio-${activeRun.id}-step-${i + 1}.png`}>↓ Download image</a>}</div></>}{r.error && <p className="ps-step-error" role="alert">{r.error}</p>}<details><summary>Prompt used</summary><p className="ps-output-text">{r.step.prompt}</p></details></article>)}</div>}</>}
          </section>
        </div>
      </div>}
    </div>
    {notice && <div className="ps-toast" role="status"><Icon name="check"/>{notice}</div>}
    {confirm && <div className="ps-modal-backdrop" onClick={() => setConfirm(null)}><div className="ps-modal" role="alertdialog" aria-modal="true" aria-labelledby="ps-dialog-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setConfirm(null); if (e.key === 'Tab') { const buttons = e.currentTarget.querySelectorAll('button'); const first = buttons[0]; const last = buttons[buttons.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}><span className="ps-template-icon lavender"><Icon name="flow"/></span><h2 id="ps-dialog-title">{confirm.title}</h2><p>{confirm.detail}</p><div><button autoFocus className="ps-btn" onClick={() => setConfirm(null)}>Cancel</button><button className="ps-btn ps-danger" onClick={() => { confirm.action(); setConfirm(null); }}>Confirm</button></div></div></div>}
  </main>;
}
