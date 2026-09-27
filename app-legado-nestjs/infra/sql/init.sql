-- Script de inicialização do banco — roda automaticamente na primeira vez (via Docker)
-- Cria role de aplicação com permissões restritas e configura RLS

-- Role da aplicação (nunca usar superuser em runtime)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'bodyquote_app') THEN
    CREATE ROLE bodyquote_app LOGIN PASSWORD 'senha_dev';
  END IF;
END
$$;

-- Garante que o role não pode criar objetos (apenas CRUD)
REVOKE CREATE ON SCHEMA public FROM bodyquote_app;
GRANT USAGE ON SCHEMA public TO bodyquote_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bodyquote_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bodyquote_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bodyquote_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bodyquote_app;
