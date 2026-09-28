import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asAuthenticated, createTestDb, loginAs } from "./setup";

describe("CRM de clientes e veículos", () => {
  let db: PGlite;
  let ownerA: string;
  let ownerB: string;
  let estimatorA: string;
  let technicianA: string;
  let tenantA: string;
  let tenantB: string;
  let customerA: string;
  let customerB: string;

  beforeAll(async () => {
    db = await createTestDb();

    const users = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1), ($2), ($3), ($4) returning id",
      [
        "crm-owner-a@example.com",
        "crm-owner-b@example.com",
        "crm-estimator@example.com",
        "crm-technician@example.com",
      ],
    );
    [ownerA, ownerB, estimatorA, technicianA] = users.rows.map((row) => row.id);

    await loginAs(db, ownerA);
    const tenantARows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        "select id from create_tenant_with_owner($1, $2, $3, $4)",
        ["Shop A", "crm-shop-a", "a@example.com", "US"],
      ),
    );
    tenantA = tenantARows.rows[0].id;

    await loginAs(db, ownerB);
    const tenantBRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        "select id from create_tenant_with_owner($1, $2, $3, $4)",
        ["Shop B", "crm-shop-b", "b@example.com", "US"],
      ),
    );
    tenantB = tenantBRows.rows[0].id;

    await db.query(
      `insert into tenant_memberships (tenant_id, user_id, role)
       values ($1, $2, 'ESTIMATOR'), ($1, $3, 'TECHNICIAN')`,
      [tenantA, estimatorA, technicianA],
    );

    await loginAs(db, ownerA);
    const customerARows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        "insert into customers (tenant_id, name) values ($1, 'Customer A') returning id",
        [tenantA],
      ),
    );
    customerA = customerARows.rows[0].id;

    const vehicleRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        `insert into vehicles (tenant_id, customer_id, make, model, year)
         values ($1, $2, 'Toyota', 'Camry', 2024) returning id`,
        [tenantA, customerA],
      ),
    );
    await db.query("select id from vehicles where id = $1", [vehicleRows.rows[0].id]);

    await loginAs(db, ownerB);
    const customerBRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        "insert into customers (tenant_id, name) values ($1, 'Customer B') returning id",
        [tenantB],
      ),
    );
    customerB = customerBRows.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  it("isola clientes e veículos entre tenants", async () => {
    await loginAs(db, ownerB);
    const { rows: customers } = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select id from customers"),
    );
    const { rows: vehicles } = await asAuthenticated(db, () =>
      db.query("select id from vehicles"),
    );

    expect(customers.map((row) => row.id)).toEqual([customerB]);
    expect(vehicles).toHaveLength(0);
  });

  it("impede escrita no tenant de outra oficina", async () => {
    await loginAs(db, ownerB);

    await expect(
      asAuthenticated(db, () =>
        db.query("insert into customers (tenant_id, name) values ($1, 'Intruder')", [tenantA]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("bloqueia no RLS veículo vinculado a cliente de outro tenant", async () => {
    await loginAs(db, ownerA);

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into vehicles (tenant_id, customer_id, make, model, year)
           values ($1, $2, 'Honda', 'Civic', 2023)`,
          [tenantA, customerB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("mantém a constraint composta contra vínculo cross-tenant no banco", async () => {
    await expect(
      db.query(
        `insert into vehicles (tenant_id, customer_id, make, model, year)
         values ($1, $2, 'Honda', 'Civic', 2023)`,
        [tenantA, customerB],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("permite leitura a ESTIMATOR, mas bloqueia criação", async () => {
    await loginAs(db, estimatorA);
    const { rows } = await asAuthenticated(db, () => db.query("select id from customers"));
    expect(rows).toHaveLength(1);

    await expect(
      asAuthenticated(db, () =>
        db.query("insert into customers (tenant_id, name) values ($1, 'Read only')", [tenantA]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("bloqueia leitura do CRM por TECHNICIAN na camada RLS", async () => {
    await loginAs(db, technicianA);

    const { rows: customers } = await asAuthenticated(db, () =>
      db.query("select id from customers"),
    );
    const { rows: vehicles } = await asAuthenticated(db, () =>
      db.query("select id from vehicles"),
    );

    expect(customers).toHaveLength(0);
    expect(vehicles).toHaveLength(0);
  });

  it("nega acesso anônimo e exclusão física de registros", async () => {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec("set role anon");
    try {
      const { rows } = await db.query("select id from customers");
      expect(rows).toHaveLength(0);
    } finally {
      await db.exec("reset role");
    }

    await loginAs(db, ownerA);
    const deletion = await asAuthenticated(db, () =>
      db.query("delete from customers where id = $1", [customerA]),
    );
    const archivedCustomer = await db.query("select id from customers where id = $1", [customerA]);

    expect(deletion.rowCount).toBe(0);
    expect(archivedCustomer.rows).toHaveLength(1);
  });

  it("rejeita VIN ativo duplicado dentro do tenant", async () => {
    await loginAs(db, ownerA);
    await asAuthenticated(db, () =>
      db.query(
        `insert into vehicles (tenant_id, customer_id, make, model, year, vin)
         values ($1, $2, 'Ford', 'Focus', 2020, '1HGCM82633A004352')`,
        [tenantA, customerA],
      ),
    );

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into vehicles (tenant_id, customer_id, make, model, year, vin)
           values ($1, $2, 'Honda', 'Accord', 2021, '1hgcm82633a004352')`,
          [tenantA, customerA],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("impede associar veículo novo a cliente arquivado", async () => {
    await loginAs(db, ownerA);
    await asAuthenticated(db, () =>
      db.query("update customers set deleted_at = now() where id = $1", [customerA]),
    );

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into vehicles (tenant_id, customer_id, make, model, year)
           values ($1, $2, 'Honda', 'Civic', 2023)`,
          [tenantA, customerA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
