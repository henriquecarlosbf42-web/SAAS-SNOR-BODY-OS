import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../supabase/migrations");
const STUB_AUTH_SQL = path.resolve(import.meta.dirname, "./stub-auth-schema.sql");
const GRANT_AUTHENTICATED_SQL = path.resolve(import.meta.dirname, "./grant-authenticated.sql");

/**
 * Sobe um Postgres real (WASM, via PGlite), aplica o stub mínimo de
 * `auth` e roda as migrations de `supabase/migrations/*.sql` na mesma
 * ordem que a Supabase CLI aplicaria. Usado só em teste — não substitui
 * `supabase start` (Docker) nem validação contra um projeto real.
 */
export async function createTestDb() {
  const db = new PGlite();

  await db.exec(readFileSync(STUB_AUTH_SQL, "utf-8"));

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`Falha aplicando migration ${file}: ${(err as Error).message}`);
    }
  }

  await db.exec(readFileSync(GRANT_AUTHENTICATED_SQL, "utf-8"));

  return db;
}

/** Troca o "usuário logado" da sessão de teste (simula auth.uid()). */
export async function loginAs(db: PGlite, userId: string | null) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
}

export async function asServiceRole<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.role', 'service_role', false)");
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  }
}

/** Roda uma query como o role `authenticated` (não-superuser, sujeito a RLS). */
export async function asAuthenticated<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

/**
 * Roda uma query como o role `anon` — requisição sem sessão nenhuma,
 * igual o Supabase real usa pra quem não está logado (diferente de
 * `authenticated` com `auth.uid()` nulo, que já é coberto por
 * `loginAs(db, null)` + `asAuthenticated`).
 */
export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
