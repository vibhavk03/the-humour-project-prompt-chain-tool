-- Disposable Supabase database only, after applying supabase/prompt-studio.sql.
-- psql "$PROMPT_STUDIO_TEST_DATABASE_URL" -v admin_a=UUID -v admin_b=UUID -v non_admin=UUID -f scripts/test-cloud-rls.sql
-- IDs must identify existing profiles: two admins and a non-admin. All writes roll back.
\set ON_ERROR_STOP on
begin;
select set_config('test.admin_a', :'admin_a', true), set_config('test.admin_b', :'admin_b', true), set_config('test.non_admin', :'non_admin', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.admin_a'), true);
do $$
declare
  c jsonb := '{"id":"11111111-1111-4111-8111-111111111111","name":"RLS test","description":"","steps":[]}';
  r jsonb := '{"id":"22222222-2222-4222-8222-222222222222","chainId":"11111111-1111-4111-8111-111111111111","chainName":"RLS test","createdAt":"2026-11-05T12:00:00Z","input":{"type":"text","content":"test"},"status":"running","results":[]}';
begin
  assert public.prompt_studio_is_admin(), 'admin A fixture must be an admin';
  assert not has_table_privilege('authenticated','public.prompt_studio_chains','TRUNCATE'), 'authenticated cannot bypass RLS using truncate';
  perform public.prompt_studio_save_chain(c,0);
  perform public.prompt_studio_save_run(r);
  assert (select owner_id = auth.uid() from public.prompt_studio_chains where id = (c->>'id')::uuid), 'owner defaults to session';
  insert into storage.objects(bucket_id,name,owner_id) values ('prompt-studio-media','11111111-1111-4111-8111-111111111111/test.png',auth.uid()::text);
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('test.admin_b'), true);
do $$
begin
  assert public.prompt_studio_is_admin(), 'admin B fixture must be an admin';
  assert not exists(select 1 from public.prompt_studio_chains where id='11111111-1111-4111-8111-111111111111'), 'other account cannot read chain';
  assert not exists(select 1 from public.prompt_studio_runs where id='22222222-2222-4222-8222-222222222222'), 'other account cannot read run';
  assert not exists(select 1 from storage.objects where bucket_id='prompt-studio-media' and name='11111111-1111-4111-8111-111111111111/test.png'), 'other account cannot read image';
  perform public.prompt_studio_delete_chain('11111111-1111-4111-8111-111111111111');
  begin
    perform public.prompt_studio_save_chain('{"id":"11111111-1111-4111-8111-111111111111","name":"Hijack","steps":[]}',0);
    raise exception 'other account overwrote chain';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.prompt_studio_runs(id,chain_id,chain_name,input,status,created_at)
    values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Hijack','{}','running',now());
    raise exception 'other account wrote a run';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values ('prompt-studio-media','11111111-1111-4111-8111-111111111111/forged.png',auth.uid()::text);
    raise exception 'other account uploaded under foreign chain';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('test.non_admin'), true);
do $$
begin
  assert not public.prompt_studio_is_admin(), 'non-admin fixture must not be an admin';
  begin
    perform public.prompt_studio_save_chain('{"id":"44444444-4444-4444-8444-444444444444","name":"Denied","steps":[]}',0);
    raise exception 'non-admin created chain';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub', current_setting('test.admin_a'), true);
do $$
begin
  assert exists(select 1 from public.prompt_studio_chains where id='11111111-1111-4111-8111-111111111111'), 'foreign deletion preserved chain';
  perform public.prompt_studio_delete_chain('11111111-1111-4111-8111-111111111111');
  delete from storage.objects where bucket_id='prompt-studio-media' and name='11111111-1111-4111-8111-111111111111/test.png';
  assert found, 'owner can clean up image after chain deletion';
end;
$$;
rollback;
\echo 'RLS tests passed: session ownership, cross-account reads/writes/uploads denied, non-admin denied, owner cleanup.'
