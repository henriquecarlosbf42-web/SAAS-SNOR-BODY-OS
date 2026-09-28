import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asAnon, asAuthenticated, createTestDb, loginAs } from "./setup";

describe("conversations, participants and messages", () => {
  let db: PGlite;
  let ownerA: string;
  let ownerB: string;
  let salesA: string;
  let viewerA: string;
  let technicianA: string;
  let tenantA: string;
  let tenantB: string;
  let leadA: string;
  let leadB: string;
  let conversationA: string;
  let conversationB: string;

  beforeAll(async () => {
    db = await createTestDb();
    const users = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1), ($2), ($3), ($4), ($5) returning id",
      [
        "conversation-owner-a@example.com",
        "conversation-owner-b@example.com",
        "conversation-sales-a@example.com",
        "conversation-viewer-a@example.com",
        "conversation-technician-a@example.com",
      ],
    );
    [ownerA, ownerB, salesA, viewerA, technicianA] = users.rows.map((row) => row.id);

    await loginAs(db, ownerA);
    const tenantARows = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select id from create_tenant_with_owner($1, $2, $3, $4)", [
        "Conversation Shop A",
        "conversation-shop-a",
        "a@example.com",
        "US",
      ]),
    );
    tenantA = tenantARows.rows[0].id;

    await loginAs(db, ownerB);
    const tenantBRows = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select id from create_tenant_with_owner($1, $2, $3, $4)", [
        "Conversation Shop B",
        "conversation-shop-b",
        "b@example.com",
        "US",
      ]),
    );
    tenantB = tenantBRows.rows[0].id;

    await db.query(
      `insert into tenant_memberships (tenant_id, user_id, role)
       values ($1, $2, 'SALES'), ($1, $3, 'VIEWER'), ($1, $4, 'TECHNICIAN')`,
      [tenantA, salesA, viewerA, technicianA],
    );

    const leads = await db.query<{ id: string; tenant_id: string }>(
      `insert into leads (tenant_id, name, email)
       values ($1, 'Lead A', 'lead-a@example.com'),
              ($2, 'Lead B', 'lead-b@example.com')
       returning id, tenant_id`,
      [tenantA, tenantB],
    );
    leadA = leads.rows.find((row) => row.tenant_id === tenantA)!.id;
    leadB = leads.rows.find((row) => row.tenant_id === tenantB)!.id;

    const conversations = await db.query<{ id: string; tenant_id: string }>(
      `insert into conversations (tenant_id, lead_id)
       values ($1, $2), ($3, $4)
       returning id, tenant_id`,
      [tenantA, leadA, tenantB, leadB],
    );
    conversationA = conversations.rows.find((row) => row.tenant_id === tenantA)!.id;
    conversationB = conversations.rows.find((row) => row.tenant_id === tenantB)!.id;

    await db.query(
      `insert into conversation_participants (tenant_id, conversation_id, user_id, last_read_at)
       values ($1, $2, $3, now()), ($1, $2, $4, now()), ($5, $6, $7, now())`,
      [tenantA, conversationA, ownerA, salesA, tenantB, conversationB, ownerB],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it("isolates inbox, leads and messages between tenants", async () => {
    await db.query(
      "insert into messages (tenant_id, conversation_id, sender_type, content) values ($1, $2, 'LEAD', 'Private message')",
      [tenantA, conversationA],
    );
    await loginAs(db, ownerB);

    const { rows: conversations } = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select id from conversations"),
    );
    const { rows: leads } = await asAuthenticated(db, () =>
      db.query<{ id: string }>("select id from leads"),
    );
    const { rows: messages } = await asAuthenticated(db, () => db.query("select id from messages"));
    const { rows: participants } = await asAuthenticated(db, () =>
      db.query<{ conversation_id: string }>(
        "select conversation_id from conversation_participants",
      ),
    );

    expect(conversations.map((row) => row.id)).toEqual([conversationB]);
    expect(leads.map((row) => row.id)).toEqual([leadB]);
    expect(messages).toHaveLength(0);
    expect(participants.map((row) => row.conversation_id)).toEqual([conversationB]);
    const { rows: hiddenUnreadCounts } = await asAuthenticated(db, () =>
      db.query("select * from conversation_unread_counts($1)", [tenantA]),
    );
    expect(hiddenUnreadCounts).toHaveLength(0);
  });

  it("rejects a conversation whose lead belongs to another tenant", async () => {
    await loginAs(db, ownerA);

    await expect(
      asAuthenticated(db, () =>
        db.query("insert into conversations (tenant_id, lead_id) values ($1, $2)", [
          tenantA,
          leadB,
        ]),
      ),
    ).rejects.toThrow(/row-level security|foreign key/i);
  });

  it("rejects a message whose tenant does not own its conversation", async () => {
    await expect(
      db.query(
        `insert into messages (tenant_id, conversation_id, sender_type, content)
         values ($1, $2, 'LEAD', 'Cross-tenant message')`,
        [tenantB, conversationA],
      ),
    ).rejects.toThrow(/foreign key/i);

    await loginAs(db, ownerB);
    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into messages (tenant_id, conversation_id, sender_type, content)
           values ($1, $2, 'LEAD', 'Unauthorized message')`,
          [tenantA, conversationA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("allows a reader role to view conversations but not create or assign them", async () => {
    await loginAs(db, viewerA);
    const { rows } = await asAuthenticated(db, () =>
      db.query("select id from conversations where id = $1", [conversationA]),
    );
    expect(rows).toHaveLength(1);

    await expect(
      asAuthenticated(db, () =>
        db.query("insert into leads (tenant_id, name) values ($1, 'Unauthorized lead')", [tenantA]),
      ),
    ).rejects.toThrow(/row-level security/i);

    await expect(
      asAuthenticated(db, () =>
        db.query("select set_conversation_assignee($1, $2)", [conversationA, ownerA]),
      ),
    ).rejects.toThrow(/conversation or agent not found/i);
  });

  it("denies conversations to technicians and unauthenticated users", async () => {
    await loginAs(db, technicianA);
    const { rows } = await asAuthenticated(db, () => db.query("select id from conversations"));
    expect(rows).toHaveLength(0);

    const { rows: anonymousRows } = await asAnon(db, () =>
      db.query("select id from conversations"),
    );
    expect(anonymousRows).toHaveLength(0);
    await expect(
      asAnon(db, () =>
        db.query("insert into leads (tenant_id, name) values ($1, 'Anonymous')", [tenantA]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("creates a tenant-scoped lead conversation for an authorized sales agent", async () => {
    await loginAs(db, salesA);
    const { rows } = await asAuthenticated(db, () =>
      db.query<{ create_lead_conversation: string }>(
        "select create_lead_conversation($1, $2, $3, $4)",
        [tenantA, "New lead", "new@example.com", ""],
      ),
    );
    const newConversationId = rows[0].create_lead_conversation;
    const { rows: created } = await asAuthenticated(db, () =>
      db.query<{ tenant_id: string; lead_id: string; status: string }>(
        "select tenant_id, lead_id, status from conversations where id = $1",
        [newConversationId],
      ),
    );
    expect(created).toEqual([
      {
        tenant_id: tenantA,
        lead_id: expect.any(String),
        status: "OPEN",
      },
    ]);
  });

  it("assigns an agent, supports human takeover, and only then allows agent messages", async () => {
    await loginAs(db, ownerA);
    await asAuthenticated(db, () =>
      db.query("select set_conversation_assignee($1, $2)", [conversationA, salesA]),
    );
    await loginAs(db, salesA);

    await expect(
      asAuthenticated(db, () =>
        db.query(
          `insert into messages (tenant_id, conversation_id, sender_type, sender_user_id, content)
           values ($1, $2, 'AGENT', $3, 'Before takeover')`,
          [tenantA, conversationA, salesA],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);

    await asAuthenticated(db, () => db.query("select take_over_conversation($1)", [conversationA]));

    await asAuthenticated(db, () =>
      db.query(
        `insert into messages (tenant_id, conversation_id, sender_type, sender_user_id, content)
         values ($1, $2, 'AGENT', $3, 'Human reply')`,
        [tenantA, conversationA, salesA],
      ),
    );

    const { rows } = await asAuthenticated(db, () =>
      db.query<{ status: string; assigned_to: string }>(
        "select status, assigned_to from conversations where id = $1",
        [conversationA],
      ),
    );
    expect(rows).toEqual([{ status: "HUMAN_ACTIVE", assigned_to: salesA }]);
  });

  it("computes unread counts from each participant's read timestamp", async () => {
    await db.query("delete from messages where tenant_id = $1", [tenantA]);
    await db.query(
      `insert into messages (tenant_id, conversation_id, sender_type, content)
       values ($1, $2, 'LEAD', 'Unread for owner and sales')`,
      [tenantA, conversationA],
    );
    await loginAs(db, ownerA);
    const { rows } = await asAuthenticated(db, () =>
      db.query<{ conversation_id: string; unread_count: number }>(
        "select * from conversation_unread_counts($1)",
        [tenantA],
      ),
    );

    expect(rows.find((row) => row.conversation_id === conversationA)?.unread_count).toBe(1);

    await asAuthenticated(db, () =>
      db.query(
        `update conversation_participants
         set last_read_at = now()
         where tenant_id = $1 and conversation_id = $2 and user_id = $3`,
        [tenantA, conversationA, ownerA],
      ),
    );
    const { rows: readRows } = await asAuthenticated(db, () =>
      db.query<{ conversation_id: string; unread_count: number }>(
        "select * from conversation_unread_counts($1)",
        [tenantA],
      ),
    );
    expect(readRows.find((row) => row.conversation_id === conversationA)?.unread_count).toBe(0);
  });

  it("closes and reopens conversations, while refusing unsupported status changes", async () => {
    await loginAs(db, ownerA);
    await asAuthenticated(db, () =>
      db.query("select change_conversation_status($1, 'CLOSED')", [conversationA]),
    );
    const closed = await db.query<{ status: string }>(
      "select status from conversations where id = $1",
      [conversationA],
    );
    expect(closed.rows[0].status).toBe("CLOSED");

    await expect(
      asAuthenticated(db, () =>
        db.query("select change_conversation_status($1, 'AI_ACTIVE')", [conversationA]),
      ),
    ).rejects.toThrow(/unsupported conversation status/i);
    await asAuthenticated(db, () =>
      db.query("select change_conversation_status($1, 'OPEN')", [conversationA]),
    );
  });
});
