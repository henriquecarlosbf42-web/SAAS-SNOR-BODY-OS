-- Script de RLS (Row-Level Security)
-- Executar APÓS prisma migrate deploy em produção

-- ============================================================
-- Habilitar RLS nas tabelas de tenant
-- ============================================================

ALTER TABLE shop_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_services     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_photos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Políticas: acesso apenas ao tenant atual
-- O app seta: SET LOCAL app.current_shop_id = '<id>'
-- ============================================================

CREATE POLICY tenant_isolation ON shop_users
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON shop_subscriptions
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON shop_services
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON shop_availability
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON quotes
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON quote_photos
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON quote_items
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON appointments
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE));

CREATE POLICY tenant_isolation ON audit_logs
  AS PERMISSIVE FOR ALL TO bodyquote_app
  USING (shop_id = current_setting('app.current_shop_id', TRUE)
         OR shop_id IS NULL);  -- logs de sistema sem tenant

-- ============================================================
-- Índices de performance (além dos criados pelo Prisma)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_quotes_shop_status
  ON quotes (shop_id, status);

CREATE INDEX IF NOT EXISTS idx_appointments_shop_date
  ON appointments (shop_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_audit_shop_created
  ON audit_logs (shop_id, created_at DESC);
