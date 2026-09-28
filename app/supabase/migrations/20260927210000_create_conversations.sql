create table leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (
                name = btrim(name) and char_length(name) between 1 and 200
              ),
  email       text check (
                email is null
                or (
                  email = btrim(email)
                  and char_length(email) <= 320
                  and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
                )
              ),
  phone       text check (phone is null or char_length(phone) <= 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

create index idx_leads_tenant_created on leads (tenant_id, created_at desc);

create trigger leads_set_updated_at
  before update on leads
  for each row execute function public.set_updated_at();

create table conversations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  lead_id      uuid not null,
  assigned_to  uuid,
  status       text not null default 'OPEN'
               check (status in ('OPEN', 'AI_ACTIVE', 'HUMAN_ACTIVE', 'CLOSED')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (tenant_id, id),
  foreign key (tenant_id, lead_id)
    references leads (tenant_id, id)
    on delete cascade,
  foreign key (tenant_id, assigned_to)
    references tenant_memberships (tenant_id, user_id),
  check (status <> 'HUMAN_ACTIVE' or assigned_to is not null)
);

create index idx_conversations_tenant_updated
  on conversations (tenant_id, updated_at desc);
create index idx_conversations_tenant_status
  on conversations (tenant_id, status, updated_at desc);
create index idx_conversations_assignee
  on conversations (tenant_id, assigned_to, updated_at desc)
  where assigned_to is not null;

create trigger conversations_set_updated_at
  before update on conversations
  for each row execute function public.set_updated_at();

create table conversation_participants (
  tenant_id       uuid not null,
  conversation_id uuid not null,
  user_id         uuid not null,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (tenant_id, conversation_id, user_id),
  foreign key (tenant_id, conversation_id)
    references conversations (tenant_id, id)
    on delete cascade,
  foreign key (tenant_id, user_id)
    references tenant_memberships (tenant_id, user_id)
    on delete cascade
);

create index idx_conversation_participants_user
  on conversation_participants (tenant_id, user_id, conversation_id);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  conversation_id uuid not null,
  sender_type     text not null check (sender_type in ('LEAD', 'AGENT', 'SYSTEM')),
  sender_user_id  uuid,
  content         text not null check (
                    content = btrim(content)
                    and char_length(content) between 1 and 10000
                  ),
  created_at      timestamptz not null default now(),

  foreign key (tenant_id, conversation_id)
    references conversations (tenant_id, id)
    on delete cascade,
  foreign key (tenant_id, sender_user_id)
    references tenant_memberships (tenant_id, user_id),
  check (
    (sender_type = 'AGENT' and sender_user_id is not null)
    or (sender_type in ('LEAD', 'SYSTEM') and sender_user_id is null)
  )
);

create index idx_messages_conversation_timeline
  on messages (tenant_id, conversation_id, created_at, id);

create or replace function public.bump_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update conversations
  set updated_at = greatest(updated_at, new.created_at)
  where tenant_id = new.tenant_id
    and id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_bump_conversation_activity
  after insert on messages
  for each row execute function public.bump_conversation_activity();

create or replace function public.is_tenant_conversation_reader(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
      and role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES', 'ESTIMATOR', 'FINANCE', 'VIEWER')
  );
$$;

create or replace function public.is_tenant_conversation_writer(check_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from tenant_memberships
    where tenant_id = check_tenant_id
      and user_id = auth.uid()
      and is_active
      and role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
  );
$$;

revoke all on function public.is_tenant_conversation_reader(uuid) from public;
revoke all on function public.is_tenant_conversation_writer(uuid) from public;
grant execute on function public.is_tenant_conversation_reader(uuid) to authenticated;
grant execute on function public.is_tenant_conversation_reader(uuid) to anon;
grant execute on function public.is_tenant_conversation_writer(uuid) to authenticated;
grant execute on function public.is_tenant_conversation_writer(uuid) to anon;

alter table leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table conversation_participants enable row level security;

create policy leads_select on leads
  for select using (public.is_tenant_conversation_reader(tenant_id));
create policy leads_insert on leads
  for insert with check (public.is_tenant_conversation_writer(tenant_id));
create policy leads_update on leads
  for update
  using (public.is_tenant_conversation_writer(tenant_id))
  with check (public.is_tenant_conversation_writer(tenant_id));
create policy leads_delete_denied on leads
  for delete using (false);

create policy conversations_select on conversations
  for select using (public.is_tenant_conversation_reader(tenant_id));
create policy conversations_insert on conversations
  for insert
  with check (
    public.is_tenant_conversation_writer(tenant_id)
    and exists (
      select 1 from leads
      where leads.tenant_id = conversations.tenant_id
        and leads.id = conversations.lead_id
    )
  );
create policy conversations_update on conversations
  for update
  using (public.is_tenant_conversation_writer(tenant_id))
  with check (
    public.is_tenant_conversation_writer(tenant_id)
    and (
      assigned_to is null
      or exists (
        select 1
        from tenant_memberships
        where tenant_memberships.tenant_id = conversations.tenant_id
          and tenant_memberships.user_id = conversations.assigned_to
          and tenant_memberships.is_active
          and tenant_memberships.role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
      )
    )
  );
create policy conversations_delete_denied on conversations
  for delete using (false);

create policy conversation_participants_select on conversation_participants
  for select
  using (
    public.is_tenant_conversation_reader(tenant_id)
    and (
      user_id = auth.uid()
      or public.is_tenant_conversation_writer(tenant_id)
    )
  );
create policy conversation_participants_insert on conversation_participants
  for insert
  with check (
    public.is_tenant_conversation_reader(tenant_id)
    and (last_read_at is null or last_read_at <= now())
    and (
      user_id = auth.uid()
      or (
        public.is_tenant_conversation_writer(tenant_id)
        and exists (
          select 1
          from tenant_memberships
          where tenant_memberships.tenant_id = conversation_participants.tenant_id
            and tenant_memberships.user_id = conversation_participants.user_id
            and tenant_memberships.is_active
            and tenant_memberships.role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
        )
      )
    )
  );
create policy conversation_participants_update_own on conversation_participants
  for update
  using (
    user_id = auth.uid()
    and public.is_tenant_conversation_reader(tenant_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_tenant_conversation_reader(tenant_id)
    and (last_read_at is null or last_read_at <= now())
  );
create policy conversation_participants_delete_denied on conversation_participants
  for delete using (false);

create policy messages_select on messages
  for select using (public.is_tenant_conversation_reader(tenant_id));
create policy messages_insert_agent on messages
  for insert
  with check (
    sender_type = 'AGENT'
    and sender_user_id = auth.uid()
    and created_at <= now()
    and public.is_tenant_conversation_writer(tenant_id)
    and exists (
      select 1
      from conversations
      where conversations.tenant_id = messages.tenant_id
        and conversations.id = messages.conversation_id
        and conversations.status = 'HUMAN_ACTIVE'
        and conversations.assigned_to = auth.uid()
    )
    and exists (
      select 1
      from conversation_participants
      where conversation_participants.tenant_id = messages.tenant_id
        and conversation_participants.conversation_id = messages.conversation_id
        and conversation_participants.user_id = auth.uid()
    )
  );
create policy messages_update_denied on messages
  for update using (false);
create policy messages_delete_denied on messages
  for delete using (false);

create or replace function public.create_lead_conversation(
  p_tenant_id uuid,
  p_name text,
  p_email text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_conversation_id uuid;
begin
  if auth.uid() is null
     or not public.is_tenant_conversation_writer(p_tenant_id) then
    raise exception 'Permission denied';
  end if;
  if p_name is null
     or char_length(btrim(p_name)) not between 1 and 200
     or (
       nullif(btrim(p_email), '') is not null
       and (
         char_length(btrim(p_email)) > 320
         or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       )
     )
     or (p_phone is not null and char_length(p_phone) > 40) then
    raise exception 'Invalid lead details';
  end if;

  insert into leads (tenant_id, name, email, phone)
  values (p_tenant_id, btrim(p_name), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''))
  returning id into v_lead_id;

  insert into conversations (tenant_id, lead_id)
  values (p_tenant_id, v_lead_id)
  returning id into v_conversation_id;

  insert into conversation_participants (tenant_id, conversation_id, user_id, last_read_at)
  values (p_tenant_id, v_conversation_id, auth.uid(), now());

  return v_conversation_id;
end;
$$;

create or replace function public.set_conversation_assignee(
  p_conversation_id uuid,
  p_agent_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from conversations
  where id = p_conversation_id
    and public.is_tenant_conversation_writer(tenant_id);

  if v_tenant_id is null or not exists (
    select 1
    from tenant_memberships
    where tenant_id = v_tenant_id
      and user_id = p_agent_id
      and is_active
      and role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
  ) then
    raise exception 'Conversation or agent not found';
  end if;

  update conversations
  set assigned_to = p_agent_id
  where id = p_conversation_id and tenant_id = v_tenant_id;

  insert into conversation_participants (tenant_id, conversation_id, user_id)
  values (v_tenant_id, p_conversation_id, p_agent_id)
  on conflict (tenant_id, conversation_id, user_id) do nothing;
end;
$$;

create or replace function public.take_over_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id
  from conversations
  where id = p_conversation_id
    and status <> 'CLOSED'
    and public.is_tenant_conversation_writer(tenant_id);

  if v_tenant_id is null then
    raise exception 'Conversation not found or closed';
  end if;

  update conversations
  set status = 'HUMAN_ACTIVE', assigned_to = auth.uid()
  where id = p_conversation_id and tenant_id = v_tenant_id;

  insert into conversation_participants (tenant_id, conversation_id, user_id, last_read_at)
  values (v_tenant_id, p_conversation_id, auth.uid(), now())
  on conflict (tenant_id, conversation_id, user_id)
  do update set last_read_at = now();
end;
$$;

create or replace function public.change_conversation_status(
  p_conversation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  if p_status is null or p_status not in ('OPEN', 'CLOSED') then
    raise exception 'Unsupported conversation status transition';
  end if;

  select tenant_id into v_tenant_id
  from conversations
  where id = p_conversation_id
    and public.is_tenant_conversation_writer(tenant_id);

  if v_tenant_id is null then
    raise exception 'Conversation not found';
  end if;

  update conversations
  set status = p_status
  where id = p_conversation_id and tenant_id = v_tenant_id;
end;
$$;

create or replace function public.list_conversation_agents(p_tenant_id uuid)
returns table (user_id uuid, full_name text, role text)
language sql
security definer
stable
set search_path = public
as $$
  select profiles.id, coalesce(profiles.full_name, profiles.id::text), tenant_memberships.role
  from tenant_memberships
  join profiles on profiles.id = tenant_memberships.user_id
  where tenant_memberships.tenant_id = p_tenant_id
    and tenant_memberships.is_active
    and tenant_memberships.role in ('OWNER', 'ADMIN', 'MANAGER', 'SALES')
    and public.is_tenant_conversation_reader(p_tenant_id)
  order by coalesce(profiles.full_name, profiles.id::text);
$$;

create or replace function public.conversation_unread_counts(p_tenant_id uuid)
returns table (conversation_id uuid, unread_count bigint)
language sql
security definer
stable
set search_path = public
as $$
  select conversations.id,
         count(messages.id) filter (
           where messages.sender_user_id is distinct from auth.uid()
             and messages.created_at > coalesce(
               conversation_participants.last_read_at,
               '-infinity'::timestamptz
             )
         )
  from conversations
  left join conversation_participants
    on conversation_participants.tenant_id = conversations.tenant_id
   and conversation_participants.conversation_id = conversations.id
   and conversation_participants.user_id = auth.uid()
  left join messages
    on messages.tenant_id = conversations.tenant_id
   and messages.conversation_id = conversations.id
  where conversations.tenant_id = p_tenant_id
    and public.is_tenant_conversation_reader(p_tenant_id)
  group by conversations.id, conversation_participants.last_read_at;
$$;

create or replace function public.conversation_latest_messages(p_tenant_id uuid)
returns table (
  conversation_id uuid,
  content text,
  created_at timestamptz,
  sender_type text,
  sender_user_id uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select distinct on (messages.conversation_id)
         messages.conversation_id,
         messages.content,
         messages.created_at,
         messages.sender_type,
         messages.sender_user_id
  from messages
  where messages.tenant_id = p_tenant_id
    and public.is_tenant_conversation_reader(p_tenant_id)
  order by messages.conversation_id, messages.created_at desc, messages.id desc;
$$;

revoke all on function public.create_lead_conversation(uuid, text, text, text) from public;
revoke all on function public.set_conversation_assignee(uuid, uuid) from public;
revoke all on function public.take_over_conversation(uuid) from public;
revoke all on function public.change_conversation_status(uuid, text) from public;
revoke all on function public.list_conversation_agents(uuid) from public;
revoke all on function public.conversation_unread_counts(uuid) from public;
revoke all on function public.conversation_latest_messages(uuid) from public;

grant execute on function public.create_lead_conversation(uuid, text, text, text) to authenticated;
grant execute on function public.set_conversation_assignee(uuid, uuid) to authenticated;
grant execute on function public.take_over_conversation(uuid) to authenticated;
grant execute on function public.change_conversation_status(uuid, text) to authenticated;
grant execute on function public.list_conversation_agents(uuid) to authenticated;
grant execute on function public.conversation_unread_counts(uuid) to authenticated;
grant execute on function public.conversation_latest_messages(uuid) to authenticated;
