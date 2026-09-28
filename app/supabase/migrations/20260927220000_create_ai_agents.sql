create table public.ai_agents (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null unique references public.tenants(id) on delete cascade,
  name                 text not null check (name = btrim(name) and char_length(name) between 1 and 120),
  tone                 text not null default 'Friendly and professional'
                       check (char_length(tone) between 1 and 500),
  language             text not null default 'English'
                       check (char_length(language) between 1 and 80),
  business_description text not null default ''
                       check (char_length(business_description) <= 5000),
  services             text[] not null default '{}'
                       check (cardinality(services) <= 100),
  business_hours       text not null default ''
                       check (char_length(business_hours) <= 2000),
  service_area         text not null default ''
                       check (char_length(service_area) <= 1000),
  enabled              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.ai_agent_instructions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  ai_agent_id uuid not null,
  kind        text not null check (kind in ('INSTRUCTIONS', 'KNOWLEDGE')),
  content     text not null default '' check (char_length(content) <= 20000),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, kind),
  foreign key (tenant_id, ai_agent_id)
    references public.ai_agents (tenant_id, id)
    on delete cascade
);

create table public.ai_agent_usage (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  ai_agent_id       uuid not null,
  conversation_id   uuid not null,
  model             text not null check (char_length(model) between 1 and 100),
  response_id       text,
  prompt_tokens     integer not null check (prompt_tokens >= 0),
  completion_tokens integer not null check (completion_tokens >= 0),
  created_at        timestamptz not null default now(),
  foreign key (tenant_id, ai_agent_id)
    references public.ai_agents (tenant_id, id)
    on delete cascade,
  foreign key (tenant_id, conversation_id)
    references public.conversations (tenant_id, id)
    on delete cascade
);

create index idx_ai_agent_usage_tenant_created
  on public.ai_agent_usage (tenant_id, created_at desc);

create trigger ai_agents_set_updated_at
  before update on public.ai_agents
  for each row execute function public.set_updated_at();

create or replace function public.is_tenant_ai_agent_manager(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
      and role in ('OWNER', 'ADMIN')
  );
$$;

revoke all on function public.is_tenant_ai_agent_manager(uuid) from public;
grant execute on function public.is_tenant_ai_agent_manager(uuid) to authenticated;

create or replace function public.provision_ai_agent_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ai_agents (tenant_id, name)
  values (new.id, left(new.name, 110) || ' AI Agent')
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

create trigger tenants_provision_ai_agent
  after insert on public.tenants
  for each row execute function public.provision_ai_agent_for_tenant();

insert into public.ai_agents (tenant_id, name)
select id, left(name, 110) || ' AI Agent'
from public.tenants
on conflict (tenant_id) do nothing;

create policy ai_agents_select on public.ai_agents
  for select using (public.is_tenant_conversation_reader(tenant_id));
create policy ai_agents_insert on public.ai_agents
  for insert with check (public.is_tenant_ai_agent_manager(tenant_id));
create policy ai_agents_update on public.ai_agents
  for update
  using (public.is_tenant_ai_agent_manager(tenant_id))
  with check (public.is_tenant_ai_agent_manager(tenant_id));
create policy ai_agents_delete_denied on public.ai_agents
  for delete using (false);

create policy ai_agent_instructions_select on public.ai_agent_instructions
  for select using (public.is_tenant_conversation_reader(tenant_id));
create policy ai_agent_instructions_insert on public.ai_agent_instructions
  for insert with check (
    public.is_tenant_ai_agent_manager(tenant_id)
    and exists (
      select 1 from public.ai_agents
      where ai_agents.tenant_id = ai_agent_instructions.tenant_id
        and ai_agents.id = ai_agent_instructions.ai_agent_id
    )
  );
create policy ai_agent_instructions_update on public.ai_agent_instructions
  for update
  using (public.is_tenant_ai_agent_manager(tenant_id))
  with check (
    public.is_tenant_ai_agent_manager(tenant_id)
    and exists (
      select 1 from public.ai_agents
      where ai_agents.tenant_id = ai_agent_instructions.tenant_id
        and ai_agents.id = ai_agent_instructions.ai_agent_id
    )
  );
create policy ai_agent_instructions_delete_denied on public.ai_agent_instructions
  for delete using (false);

alter table public.ai_agents enable row level security;
alter table public.ai_agent_instructions enable row level security;
alter table public.ai_agent_usage enable row level security;

create policy ai_agent_usage_select on public.ai_agent_usage
  for select using (public.is_tenant_ai_agent_manager(tenant_id));
create policy ai_agent_usage_insert_denied on public.ai_agent_usage
  for insert with check (false);
create policy ai_agent_usage_update_denied on public.ai_agent_usage
  for update using (false);
create policy ai_agent_usage_delete_denied on public.ai_agent_usage
  for delete using (false);

drop policy conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update
  using (public.is_tenant_conversation_writer(tenant_id))
  with check (
    public.is_tenant_conversation_writer(tenant_id)
    and status <> 'AI_ACTIVE'
    and (
      assigned_to is null
      or exists (
        select 1
        from public.tenant_memberships
        where tenant_memberships.tenant_id = conversations.tenant_id
          and tenant_memberships.user_id = conversations.assigned_to
          and tenant_memberships.is_active
          and tenant_memberships.role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
      )
    )
  );

create or replace function public.save_ai_agent_configuration(
  p_tenant_id uuid,
  p_name text,
  p_tone text,
  p_language text,
  p_business_description text,
  p_services text[],
  p_business_hours text,
  p_service_area text,
  p_enabled boolean,
  p_instructions text,
  p_knowledge text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_id uuid;
begin
  if auth.uid() is null or not public.is_tenant_ai_agent_manager(p_tenant_id) then
    raise exception 'Permission denied';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 120
     or p_tone is null or char_length(p_tone) not between 1 and 500
     or p_language is null or char_length(p_language) not between 1 and 80
     or p_enabled is null
     or char_length(coalesce(p_business_description, '')) > 5000
     or cardinality(coalesce(p_services, '{}')) > 100
     or char_length(coalesce(p_business_hours, '')) > 2000
     or char_length(coalesce(p_service_area, '')) > 1000
     or char_length(coalesce(p_instructions, '')) > 20000
     or char_length(coalesce(p_knowledge, '')) > 20000 then
    raise exception 'Invalid AI agent configuration';
  end if;

  insert into public.ai_agents (
    tenant_id, name, tone, language, business_description, services,
    business_hours, service_area, enabled
  )
  values (
    p_tenant_id, btrim(p_name), btrim(p_tone), btrim(p_language),
    coalesce(p_business_description, ''), coalesce(p_services, '{}'),
    coalesce(p_business_hours, ''), coalesce(p_service_area, ''), p_enabled
  )
  on conflict (tenant_id) do update set
    name = excluded.name,
    tone = excluded.tone,
    language = excluded.language,
    business_description = excluded.business_description,
    services = excluded.services,
    business_hours = excluded.business_hours,
    service_area = excluded.service_area,
    enabled = excluded.enabled,
    updated_at = now()
  returning id into v_agent_id;

  if not p_enabled then
    update public.conversations
    set status = 'OPEN'
    where tenant_id = p_tenant_id and status = 'AI_ACTIVE';
  end if;

  insert into public.ai_agent_instructions (tenant_id, ai_agent_id, kind, content)
  values
    (p_tenant_id, v_agent_id, 'INSTRUCTIONS', coalesce(p_instructions, '')),
    (p_tenant_id, v_agent_id, 'KNOWLEDGE', coalesce(p_knowledge, ''))
  on conflict (tenant_id, kind) do update set
    ai_agent_id = excluded.ai_agent_id,
    content = excluded.content,
    updated_at = now();
end;
$$;

create or replace function public.set_conversation_ai_active(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select conversations.tenant_id into v_tenant_id
  from public.conversations
  where conversations.id = p_conversation_id
    and conversations.status <> 'CLOSED'
    and public.is_tenant_conversation_writer(conversations.tenant_id)
  for update;

  if v_tenant_id is null or not exists (
    select 1 from public.ai_agents
    where ai_agents.tenant_id = v_tenant_id
      and ai_agents.enabled
  ) then
    raise exception 'Conversation or enabled AI agent not found';
  end if;

  update public.conversations
  set status = 'AI_ACTIVE', assigned_to = null
  where id = p_conversation_id and tenant_id = v_tenant_id;
end;
$$;

create or replace function public.record_customer_message(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_content text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null
     or not public.is_tenant_conversation_writer(p_tenant_id) then
    raise exception 'Permission denied';
  end if;
  if p_content is null
     or char_length(btrim(p_content)) not between 1 and 10000 then
    raise exception 'Invalid customer message';
  end if;

  select status into v_status
  from public.conversations
  where id = p_conversation_id and tenant_id = p_tenant_id
    and status <> 'CLOSED'
  for update;

  if v_status is null then
    raise exception 'Conversation not found or closed';
  end if;

  insert into public.messages (tenant_id, conversation_id, sender_type, content)
  values (p_tenant_id, p_conversation_id, 'LEAD', btrim(p_content));

  return v_status;
end;
$$;

create or replace function public.save_ai_agent_reply_with_usage(
  p_tenant_id uuid,
  p_conversation_id uuid,
  p_actor_id uuid,
  p_content text,
  p_model text,
  p_response_id text,
  p_prompt_tokens integer,
  p_completion_tokens integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_id uuid;
  v_conversation_status text;
  v_agent_enabled boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Permission denied';
  end if;
  if p_actor_id is null or not exists (
    select 1
    from public.tenant_memberships
    where tenant_id = p_tenant_id
      and user_id = p_actor_id
      and is_active
      and role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
  ) then
    raise exception 'Permission denied';
  end if;
  if p_content is null or char_length(btrim(p_content)) not between 1 and 10000
     or p_model is null or char_length(p_model) not between 1 and 100
     or p_prompt_tokens is null or p_prompt_tokens < 0
     or p_completion_tokens is null or p_completion_tokens < 0 then
    raise exception 'Invalid AI response or usage';
  end if;

  select ai_agents.id, conversations.status, ai_agents.enabled
    into v_agent_id, v_conversation_status, v_agent_enabled
  from public.ai_agents
  join public.conversations
    on conversations.tenant_id = ai_agents.tenant_id
  where conversations.id = p_conversation_id
    and conversations.tenant_id = p_tenant_id
  for update of conversations;

  if v_agent_id is null then
    raise exception 'Conversation or AI agent not found';
  end if;

  insert into public.ai_agent_usage (
    tenant_id, ai_agent_id, conversation_id, model, response_id,
    prompt_tokens, completion_tokens
  )
  values (
    p_tenant_id, v_agent_id, p_conversation_id, p_model, p_response_id,
    p_prompt_tokens, p_completion_tokens
  );

  if v_conversation_status = 'AI_ACTIVE' and v_agent_enabled then
    insert into public.messages (tenant_id, conversation_id, sender_type, content)
    values (p_tenant_id, p_conversation_id, 'SYSTEM', btrim(p_content));
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.provision_ai_agent_for_tenant() from public;
revoke all on function public.save_ai_agent_configuration(uuid, text, text, text, text, text[], text, text, boolean, text, text) from public;
revoke all on function public.set_conversation_ai_active(uuid) from public;
revoke all on function public.record_customer_message(uuid, uuid, text) from public;
revoke all on function public.save_ai_agent_reply_with_usage(uuid, uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.save_ai_agent_configuration(uuid, text, text, text, text, text[], text, text, boolean, text, text) to authenticated;
grant execute on function public.set_conversation_ai_active(uuid) to authenticated;
grant execute on function public.record_customer_message(uuid, uuid, text) to authenticated;
grant execute on function public.save_ai_agent_reply_with_usage(uuid, uuid, uuid, text, text, text, integer, integer) to service_role;

grant select, insert, update, delete on
  public.ai_agents, public.ai_agent_instructions, public.ai_agent_usage
  to authenticated, anon;
