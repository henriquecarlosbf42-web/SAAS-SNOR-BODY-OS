-- profiles: representação em public da entidade "USER" (auth.users é gerenciado
-- pelo Supabase Auth). 1:1 com auth.users. Não é tenant-scoped: um usuário
-- existe independente de qualquer tenant, a associação vem em tenant_memberships.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  locale      text not null default 'en' check (locale ~ '^[a-z]{2}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_updated_at
  before update on profiles
  for each row execute function public.set_updated_at();

alter table profiles enable row level security;

-- Usuário só lê/edita o próprio perfil. Visibilidade de perfil de outros
-- membros do mesmo tenant fica pra quando a tela de "membros" existir
-- (decisão registrada em DATABASE.md, não implementada nesta etapa).
create policy profiles_select_own on profiles
  for select
  using (id = auth.uid());

create policy profiles_update_own on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Cria profiles automaticamente quando um novo usuário se cadastra no
-- Supabase Auth (padrão oficial do Supabase). SECURITY DEFINER é
-- obrigatório aqui: o gatilho roda no contexto de auth.users (schema
-- gerenciado pelo Supabase), não no contexto do usuário final.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
