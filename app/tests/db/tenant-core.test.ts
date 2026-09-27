import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asAuthenticated, createTestDb, loginAs } from "./setup";

/**
 * Testa as migrations reais de supabase/migrations/ contra um Postgres de
 * verdade (PGlite, WASM — sem Docker disponível neste ambiente). Cobre:
 * o encadeamento USER -> MEMBERSHIP -> TENANT -> LOCATIONS, isolamento
 * entre tenants via RLS, e as constraints (check/unique/FK) do schema.
 */
describe("núcleo tenant/membership/location (ETAPA 03)", () => {
  let db: PGlite;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    db = await createTestDb();

    const { rows: rowsA } = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      ["dono-a@example.com"],
    );
    const { rows: rowsB } = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      ["dono-b@example.com"],
    );
    userA = rowsA[0].id;
    userB = rowsB[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  it("cria profile automaticamente ao inserir em auth.users", async () => {
    const { rows } = await db.query("select id from profiles where id = $1", [userA]);
    expect(rows).toHaveLength(1);
  });

  it("create_tenant_with_owner cria tenant + membership OWNER + settings + location primária", async () => {
    await loginAs(db, userA);
    const { rows } = await asAuthenticated(db, () =>
      db.query<{ id: string; slug: string }>(
        "select * from create_tenant_with_owner($1, $2, $3, $4)",
        ["Oficina A", "oficina-a", "contato@oficina-a.example.com", "US"],
      ),
    );
    const tenantA = rows[0];
    expect(tenantA.slug).toBe("oficina-a");

    const membership = await db.query(
      "select role from tenant_memberships where tenant_id = $1 and user_id = $2",
      [tenantA.id, userA],
    );
    expect(membership.rows).toEqual([{ role: "OWNER" }]);

    const settings = await db.query("select tenant_id from tenant_settings where tenant_id = $1", [
      tenantA.id,
    ]);
    expect(settings.rows).toHaveLength(1);

    const locations = await db.query(
      "select is_primary from locations where tenant_id = $1",
      [tenantA.id],
    );
    expect(locations.rows).toEqual([{ is_primary: true }]);
  });

  it("isola tenants por RLS: usuário B não vê o tenant/location do usuário A", async () => {
    await loginAs(db, userB);
    const { rows: tenantsVisiveis } = await asAuthenticated(db, () =>
      db.query<{ slug: string }>("select slug from tenants"),
    );
    expect(tenantsVisiveis.map((r) => r.slug)).not.toContain("oficina-a");

    const { rows: locationsVisiveis } = await asAuthenticated(db, () =>
      db.query("select * from locations"),
    );
    expect(locationsVisiveis).toHaveLength(0);
  });

  it("usuário B cria seu próprio tenant e só enxerga o dele", async () => {
    await loginAs(db, userB);
    await asAuthenticated(db, () =>
      db.query("select * from create_tenant_with_owner($1, $2, $3, $4)", [
        "Oficina B",
        "oficina-b",
        "contato@oficina-b.example.com",
        "US",
      ]),
    );

    const { rows } = await asAuthenticated(db, () =>
      db.query<{ slug: string }>("select slug from tenants"),
    );
    expect(rows.map((r) => r.slug).sort()).toEqual(["oficina-b"]);
  });

  it("usuário B não consegue inserir location no tenant do usuário A (RLS bloqueia)", async () => {
    const { rows: tenantARows } = await db.query<{ id: string }>("select id from tenants where slug = 'oficina-a'");
    const tenantAId = tenantARows[0].id;

    await loginAs(db, userB);
    await expect(
      asAuthenticated(db, () =>
        db.query(
          "insert into locations (tenant_id, name, country) values ($1, 'Filial invasora', 'US')",
          [tenantAId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("usuário B (não-OWNER de A) não consegue se auto-promover a membro do tenant A", async () => {
    const { rows: tenantARows } = await db.query<{ id: string }>("select id from tenants where slug = 'oficina-a'");
    const tenantAId = tenantARows[0].id;

    await loginAs(db, userB);
    await expect(
      asAuthenticated(db, () =>
        db.query(
          "insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'ADMIN')",
          [tenantAId, userB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("rejeita status de tenant fora do enum permitido (check constraint)", async () => {
    await expect(
      db.query(
        "insert into tenants (name, slug, email, country, status) values ('X', 'tenant-invalido', 'x@example.com', 'US', 'NAO_EXISTE')",
      ),
    ).rejects.toThrow();
  });

  it("rejeita country fora do formato ISO alpha-2 (check constraint)", async () => {
    await expect(
      db.query(
        "insert into tenants (name, slug, email, country) values ('X', 'tenant-pais-invalido', 'x@example.com', 'USA')",
      ),
    ).rejects.toThrow();
  });

  it("rejeita slug duplicado (unique constraint)", async () => {
    await expect(
      db.query(
        "insert into tenants (name, slug, email, country) values ('Duplicado', 'oficina-a', 'dup@example.com', 'US')",
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("rejeita role fora do enum permitido em tenant_memberships (check constraint)", async () => {
    const { rows: tenantARows } = await db.query<{ id: string }>("select id from tenants where slug = 'oficina-a'");
    await expect(
      db.query(
        "insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'SUPERADMIN')",
        [tenantARows[0].id, userB],
      ),
    ).rejects.toThrow();
  });

  it("permite no máximo uma location is_primary=true por tenant (índice único parcial)", async () => {
    const { rows: tenantARows } = await db.query<{ id: string }>("select id from tenants where slug = 'oficina-a'");
    await expect(
      db.query(
        "insert into locations (tenant_id, name, is_primary, country) values ($1, 'Segunda matriz', true, 'US')",
        [tenantARows[0].id],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("permite múltiplas locations não-primárias no mesmo tenant", async () => {
    const { rows: tenantARows } = await db.query<{ id: string }>("select id from tenants where slug = 'oficina-a'");
    await db.query(
      "insert into locations (tenant_id, name, is_primary, country) values ($1, 'Filial 2', false, 'US')",
      [tenantARows[0].id],
    );
    const { rows } = await db.query<{ total: number }>(
      "select count(*)::int as total from locations where tenant_id = $1",
      [tenantARows[0].id],
    );
    expect(rows[0].total).toBe(2);
  });

  it("apagar o tenant remove memberships, settings e locations em cascata (FK on delete cascade)", async () => {
    const { rows: tenantARows } = await db.query<{ id: string }>("select id from tenants where slug = 'oficina-a'");
    const tenantAId = tenantARows[0].id;

    await db.query("delete from tenants where id = $1", [tenantAId]);

    const memberships = await db.query("select 1 from tenant_memberships where tenant_id = $1", [tenantAId]);
    const settings = await db.query("select 1 from tenant_settings where tenant_id = $1", [tenantAId]);
    const locations = await db.query("select 1 from locations where tenant_id = $1", [tenantAId]);

    expect(memberships.rows).toHaveLength(0);
    expect(settings.rows).toHaveLength(0);
    expect(locations.rows).toHaveLength(0);
  });
});
