import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asAuthenticated, createTestDb, loginAs } from "./setup";

/**
 * ETAPA 05 — suíte dedicada de isolamento de RLS. Cobre exatamente as
 * garantias pedidas (Tenant A nunca lê/altera/insere/apaga dado de Tenant
 * B; usuário sem autenticação sem acesso indevido) nas 5 tabelas do
 * núcleo (profiles, tenants, tenant_memberships, tenant_settings,
 * locations), mais as policies explícitas de negação adicionadas nesta
 * etapa (profiles/tenants/tenant_settings: insert/delete sempre negados
 * pro client, só passam por função SECURITY DEFINER).
 *
 * Nenhum teste aqui usa service_role — tudo roda como `authenticated` ou
 * `anon`, os mesmos roles que uma requisição real do app usaria.
 */
describe("isolamento de RLS entre tenants (ETAPA 05)", () => {
  let db: PGlite;
  let userA: string;
  let userB: string;
  let tenantAId: string;
  let tenantBId: string;
  let locationAId: string;
  let locationBId: string;

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

    await loginAs(db, userA);
    const { rows: tenantARows } = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select * from create_tenant_with_owner($1, $2, $3, $4)", [
        "Oficina A",
        "isol-oficina-a",
        "contato@isol-a.example.com",
        "US",
      ]),
    );
    tenantAId = tenantARows[0].id;

    await loginAs(db, userB);
    const { rows: tenantBRows } = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select * from create_tenant_with_owner($1, $2, $3, $4)", [
        "Oficina B",
        "isol-oficina-b",
        "contato@isol-b.example.com",
        "US",
      ]),
    );
    tenantBId = tenantBRows[0].id;

    const { rows: locA } = await db.query<{ id: string }>(
      "select id from locations where tenant_id = $1",
      [tenantAId],
    );
    locationAId = locA[0].id;
    const { rows: locB } = await db.query<{ id: string }>(
      "select id from locations where tenant_id = $1",
      [tenantBId],
    );
    locationBId = locB[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  describe("Tenant A nunca consegue CONSULTAR Tenant B", () => {
    it("tenants", async () => {
      await loginAs(db, userA);
      const { rows } = await asAuthenticated(db, () =>
        db.query<{ id: string }>("select id from tenants where id = $1", [tenantBId]),
      );
      expect(rows).toHaveLength(0);
    });

    it("tenant_settings", async () => {
      await loginAs(db, userA);
      const { rows } = await asAuthenticated(db, () =>
        db.query("select tenant_id from tenant_settings where tenant_id = $1", [tenantBId]),
      );
      expect(rows).toHaveLength(0);
    });

    it("locations", async () => {
      await loginAs(db, userA);
      const { rows } = await asAuthenticated(db, () =>
        db.query("select id from locations where id = $1", [locationBId]),
      );
      expect(rows).toHaveLength(0);
    });

    it("tenant_memberships", async () => {
      await loginAs(db, userA);
      const { rows } = await asAuthenticated(db, () =>
        db.query("select id from tenant_memberships where tenant_id = $1", [tenantBId]),
      );
      expect(rows).toHaveLength(0);
    });

    it("profiles: usuário A não lê o profile do usuário B", async () => {
      await loginAs(db, userA);
      const { rows } = await asAuthenticated(db, () =>
        db.query("select id from profiles where id = $1", [userB]),
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("Tenant A nunca consegue ALTERAR Tenant B", () => {
    it("tenants (update não afeta nenhuma linha)", async () => {
      await loginAs(db, userA);
      const result = await asAuthenticated(db, () =>
        db.query("update tenants set name = 'Hackeado' where id = $1", [tenantBId]),
      );
      expect(result.affectedRows ?? 0).toBe(0);

      const { rows } = await db.query<{ name: string }>("select name from tenants where id = $1", [
        tenantBId,
      ]);
      expect(rows[0].name).toBe("Oficina B");
    });

    it("tenant_settings (update não afeta nenhuma linha)", async () => {
      await loginAs(db, userA);
      const result = await asAuthenticated(db, () =>
        db.query("update tenant_settings set invoice_prefix = 'HACK' where tenant_id = $1", [
          tenantBId,
        ]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });

    it("locations (update não afeta nenhuma linha)", async () => {
      await loginAs(db, userA);
      const result = await asAuthenticated(db, () =>
        db.query("update locations set name = 'Hackeado' where id = $1", [locationBId]),
      );
      expect(result.affectedRows ?? 0).toBe(0);

      const { rows } = await db.query<{ name: string }>("select name from locations where id = $1", [
        locationBId,
      ]);
      expect(rows[0].name).toBe("Oficina B");
    });

    it("tenant_memberships (update não afeta nenhuma linha — A não é OWNER de B)", async () => {
      const { rows: membershipB } = await db.query<{ id: string }>(
        "select id from tenant_memberships where tenant_id = $1 and user_id = $2",
        [tenantBId, userB],
      );

      await loginAs(db, userA);
      const result = await asAuthenticated(db, () =>
        db.query("update tenant_memberships set role = 'VIEWER' where id = $1", [membershipB[0].id]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });
  });

  describe("Tenant A nunca consegue INSERIR dados em Tenant B", () => {
    it("locations", async () => {
      await loginAs(db, userA);
      await expect(
        asAuthenticated(db, () =>
          db.query(
            "insert into locations (tenant_id, name, country) values ($1, 'Filial invasora', 'US')",
            [tenantBId],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("tenant_memberships (A tenta se auto-adicionar como membro de B)", async () => {
      await loginAs(db, userA);
      await expect(
        asAuthenticated(db, () =>
          db.query(
            "insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'ADMIN')",
            [tenantBId, userA],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  describe("Tenant A nunca consegue EXCLUIR dados de Tenant B", () => {
    it("locations (delete não afeta nenhuma linha)", async () => {
      await loginAs(db, userA);
      const result = await asAuthenticated(db, () =>
        db.query("delete from locations where id = $1", [locationBId]),
      );
      expect(result.affectedRows ?? 0).toBe(0);

      const { rows } = await db.query("select id from locations where id = $1", [locationBId]);
      expect(rows).toHaveLength(1);
    });

    it("tenant_memberships (delete não afeta nenhuma linha — A não é OWNER de B)", async () => {
      const { rows: membershipB } = await db.query<{ id: string }>(
        "select id from tenant_memberships where tenant_id = $1 and user_id = $2",
        [tenantBId, userB],
      );

      await loginAs(db, userA);
      const result = await asAuthenticated(db, () =>
        db.query("delete from tenant_memberships where id = $1", [membershipB[0].id]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });
  });

  describe("Usuário sem autenticação não possui acesso indevido", () => {
    it("select em nenhuma das 5 tabelas retorna linha, mesmo existindo dado", async () => {
      await loginAs(db, null);

      for (const table of ["tenants", "tenant_settings", "locations", "profiles"]) {
        const { rows } = await asAnon(db, () => db.query(`select * from ${table}`));
        expect(rows, `tabela ${table} deveria estar vazia pro anon`).toHaveLength(0);
      }

      const { rows: memberships } = await asAnon(db, () =>
        db.query("select * from tenant_memberships"),
      );
      expect(memberships).toHaveLength(0);
    });

    it("insert é rejeitado (locations)", async () => {
      await loginAs(db, null);
      await expect(
        asAnon(db, () =>
          db.query("insert into locations (tenant_id, name, country) values ($1, 'X', 'US')", [
            tenantAId,
          ]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it("update é rejeitado (0 linhas afetadas, locations)", async () => {
      await loginAs(db, null);
      const result = await asAnon(db, () =>
        db.query("update locations set name = 'X' where id = $1", [locationAId]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });

    it("delete é rejeitado (0 linhas afetadas, locations)", async () => {
      await loginAs(db, null);
      const result = await asAnon(db, () =>
        db.query("delete from locations where id = $1", [locationAId]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });

    it("create_tenant_with_owner exige autenticação (bootstrap não é um buraco)", async () => {
      await loginAs(db, null);
      await expect(
        asAnon(db, () =>
          db.query("select * from create_tenant_with_owner($1, $2, $3, $4)", [
            "Tenant Fantasma",
            "tenant-fantasma",
            "fantasma@example.com",
            "US",
          ]),
        ),
      ).rejects.toThrow(/autenticação/i);
    });
  });

  describe("policies restritivas explícitas (ETAPA 05): insert/delete direto sempre negado", () => {
    // Nota sobre insert vs delete: `with check (false)` (insert) faz o
    // Postgres levantar erro — a linha chega a ser montada e falha na
    // checagem. `using (false)` (delete) só filtra quais linhas são
    // visíveis pro delete — nenhuma linha visível = 0 linhas afetadas,
    // sem erro (mesma semântica do `update` testado acima). Os dois
    // resultados são "acesso negado", só se manifestam diferente.

    it("profiles: nem o próprio dono insere/apaga direto (só via trigger de signup)", async () => {
      await loginAs(db, userA);

      await expect(
        asAuthenticated(db, () =>
          db.query("insert into profiles (id, full_name) values ($1, 'Fake')", [userA]),
        ),
      ).rejects.toThrow(/row-level security/i);

      const result = await asAuthenticated(db, () =>
        db.query("delete from profiles where id = $1", [userA]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });

    it("tenants: nem o OWNER insere/apaga direto (só via create_tenant_with_owner)", async () => {
      await loginAs(db, userA);

      await expect(
        asAuthenticated(db, () =>
          db.query(
            "insert into tenants (name, slug, email, country) values ('X', 'x-direto', 'x@example.com', 'US')",
          ),
        ),
      ).rejects.toThrow(/row-level security/i);

      const result = await asAuthenticated(db, () =>
        db.query("delete from tenants where id = $1", [tenantAId]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });

    it("tenant_settings: nem o OWNER insere/apaga direto (só via trigger de criação do tenant)", async () => {
      await loginAs(db, userA);

      await expect(
        asAuthenticated(db, () =>
          db.query("insert into tenant_settings (tenant_id) values ($1)", [tenantBId]),
        ),
      ).rejects.toThrow(/row-level security/i);

      const result = await asAuthenticated(db, () =>
        db.query("delete from tenant_settings where tenant_id = $1", [tenantAId]),
      );
      expect(result.affectedRows ?? 0).toBe(0);
    });
  });
});
