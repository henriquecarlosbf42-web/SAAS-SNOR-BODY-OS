import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asAuthenticated, asServiceRole, createTestDb, loginAs } from "./setup";

describe("tenant AI agents, authorization, and usage", () => {
  let db: PGlite;
  let ownerA: string;
  let ownerB: string;
  let viewerA: string;
  let tenantA: string;
  let tenantB: string;
  let conversationA: string;

  beforeAll(async () => {
    db = await createTestDb();
    const users = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1), ($2), ($3) returning id",
      ["ai-owner-a@example.com", "ai-owner-b@example.com", "ai-viewer@example.com"],
    );
    [ownerA, ownerB, viewerA] = users.rows.map((row) => row.id);

    await loginAs(db, ownerA);
    const tenantARows = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select id from create_tenant_with_owner($1, $2, $3, $4)", [
        "AI Shop A",
        "ai-shop-a",
        "ai-a@example.com",
        "US",
      ]),
    );
    tenantA = tenantARows.rows[0].id;

    await loginAs(db, ownerB);
    const tenantBRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select id from create_tenant_with_owner($1, $2, $3, $4)", [
        "AI Shop B",
        "ai-shop-b",
        "ai-b@example.com",
        "US",
      ]),
    );
    tenantB = tenantBRows.rows[0].id;

    await db.query(
      "insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'VIEWER')",
      [tenantA, viewerA],
    );
    const lead = await db.query<{ id: string }>(
      "insert into leads (tenant_id, name) values ($1, 'AI Lead') returning id",
      [tenantA],
    );
    const conversation = await db.query<{ id: string }>(
      "insert into conversations (tenant_id, lead_id) values ($1, $2) returning id",
      [tenantA, lead.rows[0].id],
    );
    conversationA = conversation.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  it("provisions one independent AI agent per tenant", async () => {
    await loginAs(db, ownerA);
    const { rows } = await asAuthenticated(db, () =>
      db.query<{ tenant_id: string; name: string }>(
        "select tenant_id, name from ai_agents order by tenant_id",
      ),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantA);
  });

  it("isolates AI instructions and usage by tenant", async () => {
    await loginAs(db, ownerA);
    await asAuthenticated(db, () =>
      db.query(
        `select save_ai_agent_configuration($1, 'Shop A AI', 'Friendly', 'English', 'Repair shop',
          array['Paint'], 'Weekdays', 'Austin', true, 'Ask before booking.', 'Paint facts.')`,
        [tenantA],
      ),
    );
    await loginAs(db, ownerB);

    const { rows: agents } = await asAuthenticated(db, () =>
      db.query<{ tenant_id: string }>("select tenant_id from ai_agents"),
    );
    const { rows: instructions } = await asAuthenticated(db, () =>
      db.query<{ tenant_id: string }>("select tenant_id from ai_agent_instructions"),
    );
    const { rows: usage } = await asAuthenticated(db, () =>
      db.query<{ tenant_id: string }>("select tenant_id from ai_agent_usage"),
    );

    expect(agents.map((row) => row.tenant_id)).toEqual([tenantB]);
    expect(instructions).toHaveLength(0);
    expect(usage).toHaveLength(0);
  });

  it("denies unauthorized and cross-tenant AI configuration and activation", async () => {
    await loginAs(db, viewerA);
    await expect(
      asAuthenticated(db, () =>
        db.query(
          `select save_ai_agent_configuration($1, 'Agent', 'Friendly', 'English', '',
            '{}', '', '', true, '', '')`,
          [tenantA],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAuthenticated(db, () => db.query("select set_conversation_ai_active($1)", [conversationA])),
    ).rejects.toThrow(/conversation or enabled ai agent not found/i);
    await expect(
      asAuthenticated(db, () =>
        db.query(
          `select save_ai_agent_reply_with_usage($1, $2, $3, 'Forged reply', 'gpt-4o-mini',
            'forged-response', 1, 1)`,
          [tenantA, conversationA, viewerA],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);

    await loginAs(db, ownerB);
    await expect(
      asAuthenticated(db, () =>
        db.query("select record_customer_message($1, $2, 'Cross-tenant')", [
          tenantA,
          conversationA,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asServiceRole(db, () =>
        db.query(
          `select save_ai_agent_reply_with_usage($1, $2, $3, 'Cross-tenant reply', 'gpt-4o-mini',
            'forged-response', 1, 1)`,
          [tenantA, conversationA, ownerB],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAnon(db, () => db.query("select set_conversation_ai_active($1)", [conversationA])),
    ).rejects.toThrow(/permission denied/i);
  });

  it("tracks tokens atomically with an AI reply and allows human takeover", async () => {
    await loginAs(db, ownerA);
    await asAuthenticated(db, () =>
      db.query(
        `select save_ai_agent_configuration($1, 'Shop A AI', 'Friendly', 'English', 'Repair shop',
          array['Paint'], 'Weekdays', 'Austin', true, 'Ask before booking.', 'Paint facts.')`,
        [tenantA],
      ),
    );
    await expect(
      asAuthenticated(db, () =>
        db.query("update conversations set status = 'AI_ACTIVE' where id = $1", [conversationA]),
      ),
    ).rejects.toThrow(/row-level security/i);
    await asAuthenticated(db, () =>
      db.query("select set_conversation_ai_active($1)", [conversationA]),
    );
    await asAuthenticated(db, () =>
      db.query("select record_customer_message($1, $2, 'Can you repair a scratch?')", [
        tenantA,
        conversationA,
      ]),
    );
    await expect(
      asAuthenticated(db, () =>
        db.query(
          `select save_ai_agent_reply_with_usage($1, $2, $3, 'Forged', 'gpt-4o-mini',
            'client-response', 1, 1)`,
          [tenantA, conversationA, ownerA],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await asServiceRole(db, () =>
      db.query(
        `select save_ai_agent_reply_with_usage($1, $2, $3, 'Yes, we offer paint repair.', 'gpt-4o-mini',
          'response-test', 42, 12)`,
        [tenantA, conversationA, ownerA],
      ),
    );

    const { rows: usage } = await asAuthenticated(db, () =>
      db.query<{ prompt_tokens: number; completion_tokens: number; tenant_id: string }>(
        "select prompt_tokens, completion_tokens, tenant_id from ai_agent_usage",
      ),
    );
    const { rows: replies } = await asAuthenticated(db, () =>
      db.query<{ sender_type: string; content: string }>(
        "select sender_type, content from messages where sender_type = 'SYSTEM'",
      ),
    );
    expect(usage).toEqual([{ prompt_tokens: 42, completion_tokens: 12, tenant_id: tenantA }]);
    expect(replies).toEqual([{ sender_type: "SYSTEM", content: "Yes, we offer paint repair." }]);

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into ai_agent_usage (tenant_id, ai_agent_id, conversation_id, model, prompt_tokens, completion_tokens)
           select $1, ai_agents.id, $2, 'gpt-4o-mini', 1, 1 from ai_agents where tenant_id = $1`,
          [tenantA, conversationA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);

    await asAuthenticated(db, () => db.query("select take_over_conversation($1)", [conversationA]));
    const { rows: skippedReply } = await asServiceRole(db, () =>
      db.query<{ save_ai_agent_reply_with_usage: boolean }>(
        `select save_ai_agent_reply_with_usage($1, $2, $3, 'Late AI reply', 'gpt-4o-mini',
          'late-response', 5, 2)`,
        [tenantA, conversationA, ownerA],
      ),
    );
    expect(skippedReply[0].save_ai_agent_reply_with_usage).toBe(false);

    const { rows: status } = await asAuthenticated(db, () =>
      db.query<{ status: string }>("select status from conversations where id = $1", [
        conversationA,
      ]),
    );
    expect(status[0].status).toBe("HUMAN_ACTIVE");
    const { rows: usageAfterHandoff } = await asAuthenticated(db, () =>
      db.query<{ count: number }>("select count(*)::int as count from ai_agent_usage"),
    );
    expect(usageAfterHandoff[0].count).toBe(2);
  });
});
