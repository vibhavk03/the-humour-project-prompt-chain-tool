-- Run against a disposable database after applying supabase/prompt-studio.sql.
-- All test data is rolled back, including on assertion failure.
\set ON_ERROR_STOP on
begin;
set local role service_role;
do $$
declare
  cid uuid := '00000000-0000-4000-8000-000000000001';
  sid1 uuid := '00000000-0000-4000-8000-000000000002';
  sid2 uuid := '00000000-0000-4000-8000-000000000003';
  rid uuid := '00000000-0000-4000-8000-000000000004';
  a jsonb; b jsonb; c jsonb; saved jsonb; r jsonb; rev integer;
begin
  a:=jsonb_build_object('id',sid1,'name','Describe','prompt','Describe the input','outputType','text');
  b:=jsonb_build_object('id',sid2,'name','Caption','prompt','Write a caption','outputType','text');
  c:=jsonb_build_object('id',cid,'name','Test chain','description','SQL integration test','steps',jsonb_build_array(a,b));
  saved:=public.prompt_studio_save_chain(c,0);
  assert (saved->>'revision')::integer=1, 'create revision';
  assert (select count(*) from public.prompt_studio_steps where chain_id=cid)=2, 'create steps';
  saved:=public.prompt_studio_save_chain(jsonb_set(c,'{steps}',jsonb_build_array(b,a)),1);
  assert (select id from public.prompt_studio_steps where chain_id=cid and position=0)=sid2, 'reorder saved';
  assert (saved->>'revision')::integer=2, 'save revision';
  begin
    perform public.prompt_studio_save_chain(c,1);
    raise exception 'Stale save was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.prompt_studio_save_chain(jsonb_set(c,'{steps}',jsonb_build_array(a,a)),2);
    raise exception 'Duplicate step save was accepted';
  exception when unique_violation then null;
  end;
  select revision into rev from public.prompt_studio_chains where id=cid;
  assert rev=2, 'failed save rolled back chain';
  assert (select id from public.prompt_studio_steps where chain_id=cid and position=0)=sid2, 'failed save rolled back steps';

  r:=jsonb_build_object('id',rid,'chainId',cid,'chainName','Original chain name','createdAt','2026-11-05T12:00:00Z',
    'input',jsonb_build_object('type','text','content','Dog at a laptop'),'status','running',
    'results',jsonb_build_array(jsonb_build_object('step',a,'status','running')));
  perform public.prompt_studio_save_run(r);
  r:=jsonb_set(r,'{results,0,status}','"completed"');
  r:=jsonb_set(r,'{results,0,output}',jsonb_build_object('type','image','content','saved-image','storagePath',cid||'/'||rid||'/'||sid1||'/example.png'));
  r:=jsonb_set(r,'{status}','"completed"');
  perform public.prompt_studio_save_run(r);
  saved:=public.prompt_studio_save_chain(jsonb_set(c,'{steps}',jsonb_build_array(b)),2);
  assert (select step_snapshot->>'prompt' from public.prompt_studio_step_runs where run_id=rid)='Describe the input', 'snapshot survived step deletion';
  begin
    perform public.prompt_studio_save_run(jsonb_set(r,'{results,0,step,prompt}','"changed"'));
    raise exception 'History snapshot was overwritten';
  exception when invalid_parameter_value then null;
  end;
  assert not has_table_privilege('anon','public.prompt_studio_chains','SELECT'), 'anon cannot read tables';
  assert not has_function_privilege('anon','public.prompt_studio_save_chain(jsonb,integer)','EXECUTE'), 'anon cannot call save';
  perform public.prompt_studio_delete_chain(cid);
  assert (select count(*) from public.prompt_studio_runs where chain_id=cid)=0, 'run cascade';
  assert (select count(*) from public.prompt_studio_step_runs where run_id=rid)=0, 'step-run cascade';
  assert (select count(*) from public.prompt_studio_media_cleanup where path like cid||'/%')=1, 'media queued for cleanup';
end;
$$;
rollback;
\echo 'Cloud SQL tests passed: atomic save, reorder, stale conflicts, rollback, immutable snapshots, permissions, cascade, media cleanup.'
