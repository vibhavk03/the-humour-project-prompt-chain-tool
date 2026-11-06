-- Run this whole file in the Supabase SQL Editor. It is safe to rerun.
-- These tables are isolated from the existing humour project's tables.
begin;

create table if not exists public.prompt_studio_chains (
  id uuid primary key,
  owner_id uuid, -- Reserved for the later login implementation.
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '' check (length(description) <= 500),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.prompt_studio_steps (
  id uuid primary key,
  chain_id uuid not null references public.prompt_studio_chains(id) on delete cascade,
  position integer not null check (position between 0 and 19),
  name text not null check (length(name) <= 100),
  prompt text not null check (length(prompt) <= 12000),
  output_type text not null check (output_type in ('text','image')),
  unique (chain_id, position)
);
create table if not exists public.prompt_studio_runs (
  id uuid primary key,
  chain_id uuid not null references public.prompt_studio_chains(id) on delete cascade,
  chain_name text not null,
  input jsonb not null,
  status text not null check (status in ('running','completed','failed','interrupted')),
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists prompt_studio_runs_chain_idx on public.prompt_studio_runs(chain_id, created_at desc);
create table if not exists public.prompt_studio_step_runs (
  run_id uuid not null references public.prompt_studio_runs(id) on delete cascade,
  position integer not null check (position between 0 and 19),
  step_snapshot jsonb not null, -- No FK to editable steps: history survives editing/deleting steps.
  status text not null check (status in ('pending','running','completed','failed')),
  output jsonb,
  error text,
  model text,
  primary key (run_id, position)
);
create table if not exists public.prompt_studio_media_cleanup (
  path text primary key,
  created_at timestamptz not null default now()
);

alter table public.prompt_studio_chains enable row level security;
alter table public.prompt_studio_steps enable row level security;
alter table public.prompt_studio_runs enable row level security;
alter table public.prompt_studio_step_runs enable row level security;
alter table public.prompt_studio_media_cleanup enable row level security;
-- No anonymous policies. Only the app's server credential accesses these tables.
revoke all on public.prompt_studio_chains, public.prompt_studio_steps, public.prompt_studio_runs,
  public.prompt_studio_step_runs, public.prompt_studio_media_cleanup from anon, authenticated;
grant all on public.prompt_studio_chains, public.prompt_studio_steps, public.prompt_studio_runs,
  public.prompt_studio_step_runs, public.prompt_studio_media_cleanup to service_role;

create or replace function public.prompt_studio_save_chain(p_chain jsonb, p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  chain_id uuid := (p_chain->>'id')::uuid;
  current_revision integer;
  saved public.prompt_studio_chains;
begin
  perform pg_advisory_xact_lock(hashtextextended(chain_id::text, 0));
  select revision into current_revision from public.prompt_studio_chains where id = chain_id;
  if coalesce(current_revision, 0) <> p_expected_revision then
    raise exception 'This chain changed in another workspace. Reload before saving.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_chain->'steps') <> 'array' or jsonb_array_length(p_chain->'steps') > 20 then
    raise exception 'Invalid steps' using errcode = '22023';
  end if;
  insert into public.prompt_studio_chains(id, name, description)
  values(chain_id, p_chain->>'name', coalesce(p_chain->>'description',''))
  on conflict(id) do update set name = excluded.name, description = excluded.description,
    revision = public.prompt_studio_chains.revision + 1, updated_at = clock_timestamp()
  returning * into saved;
  delete from public.prompt_studio_steps where prompt_studio_steps.chain_id = saved.id;
  insert into public.prompt_studio_steps(id, chain_id, position, name, prompt, output_type)
  select (s->>'id')::uuid, saved.id, (n - 1)::integer, s->>'name', s->>'prompt', s->>'outputType'
  from jsonb_array_elements(p_chain->'steps') with ordinality as items(s,n);
  return jsonb_build_object('id',saved.id,'name',saved.name,'description',saved.description,
    'updatedAt',saved.updated_at,'revision',saved.revision,'steps',p_chain->'steps');
end;
$$;

create or replace function public.prompt_studio_save_run(p_run jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  run_id uuid := (p_run->>'id')::uuid;
  previous public.prompt_studio_runs;
  old_steps jsonb;
  new_steps jsonb;
  old_results jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(run_id::text, 1));
  select * into previous from public.prompt_studio_runs where id = run_id;
  if found then
    select jsonb_agg(step_snapshot order by position) into old_steps
    from public.prompt_studio_step_runs where prompt_studio_step_runs.run_id = previous.id;
    select jsonb_agg(s->'step' order by n) into new_steps
    from jsonb_array_elements(p_run->'results') with ordinality as items(s,n);
    if previous.chain_id <> (p_run->>'chainId')::uuid or previous.input <> p_run->'input'
      or old_steps is distinct from new_steps or previous.chain_name <> p_run->>'chainName'
      or previous.created_at <> (p_run->>'createdAt')::timestamptz then
      raise exception 'Run snapshots cannot be changed' using errcode = '22023';
    end if;
    if previous.status <> 'running' then
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('step',step_snapshot,'status',status,
        'output',output,'error',error,'model',model)) order by position) into old_results
      from public.prompt_studio_step_runs where prompt_studio_step_runs.run_id = previous.id;
      if previous.status <> p_run->>'status' or old_results is distinct from p_run->'results' then
        raise exception 'Completed runs cannot be changed' using errcode = '22023';
      end if;
      return;
    end if;
  end if;
  insert into public.prompt_studio_runs(id, chain_id, chain_name, input, status, created_at)
  values(run_id, (p_run->>'chainId')::uuid, p_run->>'chainName', p_run->'input',
    p_run->>'status', (p_run->>'createdAt')::timestamptz)
  on conflict(id) do update set status = excluded.status, updated_at = clock_timestamp();
  delete from public.prompt_studio_step_runs where prompt_studio_step_runs.run_id = (p_run->>'id')::uuid;
  insert into public.prompt_studio_step_runs(run_id, position, step_snapshot, status, output, error, model)
  select run_id, (n-1)::integer, s->'step', s->>'status', nullif(s->'output','null'::jsonb), s->>'error', s->>'model'
  from jsonb_array_elements(p_run->'results') with ordinality as items(s,n);
end;
$$;

create or replace function public.prompt_studio_delete_chain(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  -- Keep cleanup durable: a temporary Storage outage must not lose the list of files.
  insert into public.prompt_studio_media_cleanup(path)
  select distinct m->>'storagePath' from (
    select input as m from public.prompt_studio_runs where chain_id = p_id
    union all
    select s.output from public.prompt_studio_step_runs s join public.prompt_studio_runs r on r.id = s.run_id where r.chain_id = p_id
  ) media where m->>'storagePath' is not null on conflict do nothing;
  delete from public.prompt_studio_chains where id = p_id;
end;
$$;

revoke all on function public.prompt_studio_save_chain(jsonb,integer) from public, anon, authenticated;
revoke all on function public.prompt_studio_save_run(jsonb) from public, anon, authenticated;
revoke all on function public.prompt_studio_delete_chain(uuid) from public, anon, authenticated;
grant execute on function public.prompt_studio_save_chain(jsonb,integer) to service_role;
grant execute on function public.prompt_studio_save_run(jsonb) to service_role;
grant execute on function public.prompt_studio_delete_chain(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('prompt-studio-media','prompt-studio-media',false,4194304,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
commit;
