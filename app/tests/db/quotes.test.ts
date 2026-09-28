import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asAuthenticated, createTestDb, loginAs } from "./setup";

describe("Orçamentos (quotes)", () => {
  let db: PGlite;
  let ownerA: string;
  let ownerB: string;
  let estimatorA: string;
  let technicianA: string;
  let tenantA: string;
  let tenantB: string;
  let customerA: string;
  let vehicleA: string;
  let customerB: string;
  let vehicleB: string;
  let quoteA: string;

  beforeAll(async () => {
    db = await createTestDb();

    const users = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1), ($2), ($3), ($4) returning id",
      [
        "quotes-owner-a@example.com",
        "quotes-owner-b@example.com",
        "quotes-estimator@example.com",
        "quotes-technician@example.com",
      ],
    );
    [ownerA, ownerB, estimatorA, technicianA] = users.rows.map((row) => row.id);

    await loginAs(db, ownerA);
    const tenantARows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        "select id from create_tenant_with_owner($1, $2, $3, $4)",
        ["Shop A", "quotes-shop-a", "a@example.com", "US"],
      ),
    );
    tenantA = tenantARows.rows[0].id;

    await loginAs(db, ownerB);
    const tenantBRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        "select id from create_tenant_with_owner($1, $2, $3, $4)",
        ["Shop B", "quotes-shop-b", "b@example.com", "US"],
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

    const vehicleARows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        `insert into vehicles (tenant_id, customer_id, make, model, year)
         values ($1, $2, 'Toyota', 'Camry', 2024) returning id`,
        [tenantA, customerA],
      ),
    );
    vehicleA = vehicleARows.rows[0].id;

    const quoteARows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        `insert into quotes (tenant_id, customer_id, vehicle_id, service_category, damage_description)
         values ($1, $2, $3, 'Collision repair', 'Front bumper dented')
         returning id`,
        [tenantA, customerA, vehicleA],
      ),
    );
    quoteA = quoteARows.rows[0].id;

    await loginAs(db, ownerB);
    const customerBRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        "insert into customers (tenant_id, name) values ($1, 'Customer B') returning id",
        [tenantB],
      ),
    );
    customerB = customerBRows.rows[0].id;

    const vehicleBRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        `insert into vehicles (tenant_id, customer_id, make, model, year)
         values ($1, $2, 'Honda', 'Civic', 2022) returning id`,
        [tenantB, customerB],
      ),
    );
    vehicleB = vehicleBRows.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  it("isola orçamentos entre tenants", async () => {
    await loginAs(db, ownerB);
    const { rows } = await asAuthenticated(db, () => db.query<{ id: string }>("select id from quotes"));
    expect(rows).toHaveLength(0);
  });

  it("impede escrita no tenant de outra oficina", async () => {
    await loginAs(db, ownerB);

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into quotes (tenant_id, customer_id, vehicle_id, service_category, damage_description)
           values ($1, $2, $3, 'Paint job', 'Intruder quote')`,
          [tenantA, customerA, vehicleA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("bloqueia no RLS orçamento vinculado a veículo/cliente de outro tenant", async () => {
    await loginAs(db, ownerA);

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into quotes (tenant_id, customer_id, vehicle_id, service_category, damage_description)
           values ($1, $2, $3, 'Paint job', 'Cross tenant vehicle')`,
          [tenantA, customerA, vehicleB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("mantém a constraint de foreign key composta contra vínculo cross-tenant no banco", async () => {
    await expect(
      db.query(
        `insert into quotes (tenant_id, customer_id, vehicle_id, service_category, damage_description)
         values ($1, $2, $3, 'Paint job', 'Cross tenant vehicle')`,
        [tenantA, customerA, vehicleB],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("permite leitura e escrita a ESTIMATOR", async () => {
    await loginAs(db, estimatorA);
    const { rows } = await asAuthenticated(db, () => db.query("select id from quotes"));
    expect(rows).toHaveLength(1);

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into quotes (tenant_id, customer_id, vehicle_id, service_category, damage_description)
           values ($1, $2, $3, 'Paint job', 'Estimator quote')`,
          [tenantA, customerA, vehicleA],
        ),
      ),
    ).resolves.not.toThrow();
  });

  it("bloqueia leitura e escrita de orçamentos por TECHNICIAN na camada RLS", async () => {
    await loginAs(db, technicianA);

    const { rows } = await asAuthenticated(db, () => db.query("select id from quotes"));
    expect(rows).toHaveLength(0);

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into quotes (tenant_id, customer_id, vehicle_id, service_category, damage_description)
           values ($1, $2, $3, 'Paint job', 'Technician quote')`,
          [tenantA, customerA, vehicleA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("nega acesso anônimo e exclusão física de orçamentos", async () => {
    const { rows } = await asAnon(db, () => db.query("select id from quotes"));
    expect(rows).toHaveLength(0);

    await loginAs(db, ownerA);
    const deletion = await asAuthenticated(db, () =>
      db.query("delete from quotes where id = $1", [quoteA]),
    );
    const stillThere = await db.query("select id from quotes where id = $1", [quoteA]);

    expect(deletion.rowCount).toBe(0);
    expect(stillThere.rows).toHaveLength(1);
  });

  it("gerencia quote_items isolados por tenant e vinculados ao quote certo", async () => {
    await loginAs(db, ownerA);
    const itemRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>(
        `insert into quote_items (tenant_id, quote_id, description, quantity, unit_price, total_price)
         values ($1, $2, 'Bumper replacement', 1, 250.00, 250.00) returning id`,
        [tenantA, quoteA],
      ),
    );
    expect(itemRows.rows).toHaveLength(1);

    await loginAs(db, ownerB);
    const { rows: itemsForB } = await asAuthenticated(db, () =>
      db.query("select id from quote_items"),
    );
    expect(itemsForB).toHaveLength(0);
  });

  it("só aceita status dentro do conjunto permitido (check constraint)", async () => {
    await loginAs(db, ownerA);
    await expect(
      asAuthenticated(db, () =>
        db.query("update quotes set status = 'NOT_A_STATUS' where id = $1", [quoteA]),
      ),
    ).rejects.toThrow(/check constraint|violates/i);
  });
});
