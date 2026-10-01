import { APIError } from "better-auth/api";
import { and, asc, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Auth } from "../auth/auth.ts";
import type { RoleName } from "../auth/session.ts";
import * as schema from "../db/schema/index.ts";

const { auditLog, session, user, userSecurity } = schema;

// Business rules for user administration. Every mutation goes through
// Better Auth's admin API with the acting admin's own headers, so Better Auth
// re-checks the admin permission on each call; app state (forced password
// change, audit trail) lives in app-owned tables.

export type Db = NodePgDatabase<typeof schema>;
type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface UsersDeps {
  auth: Auth;
  db: Db;
  // Test seam between the rule checks and the change they guard, so a test
  // can line up concurrent requests deterministically. Never set by the app.
  hooks?: { afterRuleCheck?: () => Promise<void> };
}

export interface AdminActor {
  id: string;
  headers: Headers;
  ipAddress: string | null;
  userAgent: string | null;
}

export type UserRuleCode =
  | "not_found"
  | "email_taken"
  | "self_demotion"
  | "self_deactivation"
  | "self_password_reset"
  | "self_sessions"
  | "last_admin";

export class UserRuleError extends Error {
  readonly code: UserRuleCode;
  constructor(code: UserRuleCode) {
    super(code);
    this.name = "UserRuleError";
    this.code = code;
  }
}

export type UserStatus = "active" | "inactive";

export interface UserFilters {
  q?: string;
  role?: RoleName;
  status?: UserStatus;
  page?: number;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  jobTitle: string | null;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  lastSeenAt: Date | null;
}

export const USERS_PAGE_SIZE = 25;

// Separate from the bootstrap lock key. Held for the duration of a
// transaction so last-admin checks and the role/ban change they guard are
// serialized across requests.
export const ADMIN_LOCK_KEY = "7433201190041985003";

// Same semantics as isBanActive in src/auth/session.ts.
const isActive = sql<boolean>`not (coalesce(${user.banned}, false) and (${user.banExpires} is null or ${user.banExpires} > now()))`;

const userColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  jobTitle: user.jobTitle,
  active: isActive,
  mustChangePassword: sql<boolean>`coalesce(${userSecurity.mustChangePassword}, false)`,
  createdAt: user.createdAt,
  lastSeenAt:
    sql<Date | null>`(select max(${session.updatedAt}) from ${session} where ${session.userId} = ${user.id})`.mapWith(
      (value: string | Date) => new Date(value),
    ),
};

function selectUsers(executor: Executor) {
  return executor
    .select(userColumns)
    .from(user)
    .leftJoin(userSecurity, eq(userSecurity.userId, user.id));
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listUsers(
  deps: UsersDeps,
  filters: UserFilters,
): Promise<{ items: UserRow[]; hasMore: boolean }> {
  const conditions: SQL[] = [];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    const text = or(ilike(user.name, pattern), ilike(user.email, pattern));
    if (text) conditions.push(text);
  }
  if (filters.role) conditions.push(eq(user.role, filters.role));
  if (filters.status === "active") conditions.push(isActive);
  if (filters.status === "inactive") conditions.push(sql`not ${isActive}`);

  const page = Math.max(1, filters.page ?? 1);
  const rows = await selectUsers(deps.db)
    .where(and(...conditions))
    .orderBy(asc(user.name), asc(user.id))
    .limit(USERS_PAGE_SIZE + 1)
    .offset((page - 1) * USERS_PAGE_SIZE);
  return {
    items: rows.slice(0, USERS_PAGE_SIZE),
    hasMore: rows.length > USERS_PAGE_SIZE,
  };
}

export async function getUser(
  deps: Pick<UsersDeps, "db">,
  id: string,
  executor: Executor = deps.db,
): Promise<UserRow | null> {
  const rows = await selectUsers(executor).where(eq(user.id, id)).limit(1);
  return rows[0] ?? null;
}

export interface AuditEntry {
  id: number;
  occurredAt: Date;
  action: string;
  actorName: string | null;
  details: Record<string, unknown>;
}

export async function listAuditForUser(
  deps: Pick<UsersDeps, "db">,
  targetUserId: string,
  limit = 20,
): Promise<AuditEntry[]> {
  return deps.db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      actorName: user.name,
      details: auditLog.details,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorUserId))
    .where(eq(auditLog.targetUserId, targetUserId))
    .orderBy(desc(auditLog.id))
    .limit(limit);
}

async function audit(
  executor: Executor,
  actor: AdminActor,
  action: string,
  targetUserId: string,
  details: Record<string, unknown>,
) {
  await executor.insert(auditLog).values({
    actorUserId: actor.id,
    action,
    targetUserId,
    details,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

function withAdminLock<T>(db: Db, run: (tx: Executor) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ADMIN_LOCK_KEY}::bigint)`,
    );
    return run(tx);
  });
}

async function countActiveAdmins(executor: Executor) {
  const rows = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(user)
    .where(and(eq(user.role, "admin"), isActive));
  return rows[0]?.n ?? 0;
}

async function requireTarget(executor: Executor, id: string) {
  const target = await getUser({ db: executor as Db }, id, executor);
  if (!target) throw new UserRuleError("not_found");
  return target;
}

async function assertNotLastActiveAdmin(executor: Executor, target: UserRow) {
  if (target.role !== "admin" || !target.active) return;
  if ((await countActiveAdmins(executor)) <= 1) {
    throw new UserRuleError("last_admin");
  }
}

function isEmailTaken(error: unknown) {
  if (!(error instanceof APIError)) return false;
  const code = (error.body as { code?: unknown } | undefined)?.code;
  return (
    code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
    code === "USER_ALREADY_EXISTS"
  );
}

export interface CreateUserInput {
  name: string;
  email: string;
  jobTitle: string | null;
  role: RoleName;
  temporaryPassword: string;
}

export async function createUser(
  deps: UsersDeps,
  actor: AdminActor,
  input: CreateUserInput,
): Promise<{ id: string }> {
  let created: { id: string; email: string };
  try {
    const result = await deps.auth.api.createUser({
      body: {
        email: input.email,
        password: input.temporaryPassword,
        name: input.name,
        role: input.role,
        ...(input.jobTitle ? { data: { jobTitle: input.jobTitle } } : {}),
      },
      headers: actor.headers,
    });
    created = result.user;
  } catch (error) {
    if (isEmailTaken(error)) throw new UserRuleError("email_taken");
    throw error;
  }

  try {
    await deps.db.transaction(async (tx) => {
      await tx
        .insert(userSecurity)
        .values({ userId: created.id, mustChangePassword: true });
      await audit(tx, actor, "user.create", created.id, {
        email: created.email,
        name: input.name,
        jobTitle: input.jobTitle,
        role: input.role,
      });
    });
  } catch (error) {
    // Without the forced change the account would keep a password the admin
    // knows; disable it until an admin retries.
    await deps.auth.api
      .banUser({
        body: { userId: created.id, banReason: "Alta incompleta" },
        headers: actor.headers,
      })
      .catch(() => undefined);
    throw error;
  }
  return { id: created.id };
}

export interface UpdateUserInput {
  name: string;
  jobTitle: string | null;
  role: RoleName;
}

export function updateUser(
  deps: UsersDeps,
  actor: AdminActor,
  id: string,
  input: UpdateUserInput,
): Promise<void> {
  return withAdminLock(deps.db, async (tx) => {
    const target = await requireTarget(tx, id);
    if (target.role === "admin" && input.role !== "admin") {
      if (id === actor.id) throw new UserRuleError("self_demotion");
      await assertNotLastActiveAdmin(tx, target);
    }
    await deps.hooks?.afterRuleCheck?.();
    await deps.auth.api.adminUpdateUser({
      body: {
        userId: id,
        data: { name: input.name, jobTitle: input.jobTitle },
      },
      headers: actor.headers,
    });
    if (input.role !== target.role) {
      await deps.auth.api.setRole({
        body: { userId: id, role: input.role },
        headers: actor.headers,
      });
    }
    await audit(tx, actor, "user.update", id, {
      before: {
        name: target.name,
        jobTitle: target.jobTitle,
        role: target.role,
      },
      after: { name: input.name, jobTitle: input.jobTitle, role: input.role },
    });
  });
}

export function setActive(
  deps: UsersDeps,
  actor: AdminActor,
  id: string,
  active: boolean,
): Promise<void> {
  return withAdminLock(deps.db, async (tx) => {
    const target = await requireTarget(tx, id);
    if (active) {
      await deps.auth.api.unbanUser({
        body: { userId: id },
        headers: actor.headers,
      });
    } else {
      if (id === actor.id) throw new UserRuleError("self_deactivation");
      await assertNotLastActiveAdmin(tx, target);
      await deps.hooks?.afterRuleCheck?.();
      // banUser also deletes every session of the user.
      await deps.auth.api.banUser({
        body: { userId: id, banReason: "Desactivado desde Configuración" },
        headers: actor.headers,
      });
    }
    await audit(
      tx,
      actor,
      active ? "user.activate" : "user.deactivate",
      id,
      {},
    );
  });
}

export async function resetPassword(
  deps: UsersDeps,
  actor: AdminActor,
  id: string,
  temporaryPassword: string,
): Promise<void> {
  if (id === actor.id) throw new UserRuleError("self_password_reset");
  await requireTarget(deps.db, id);
  // Forced change first: if a later step fails, the user still cannot keep
  // using a password the admin knows.
  await deps.db
    .insert(userSecurity)
    .values({ userId: id, mustChangePassword: true })
    .onConflictDoUpdate({
      target: userSecurity.userId,
      set: { mustChangePassword: true },
    });
  await deps.auth.api.setUserPassword({
    body: { userId: id, newPassword: temporaryPassword },
    headers: actor.headers,
  });
  await deps.auth.api.revokeUserSessions({
    body: { userId: id },
    headers: actor.headers,
  });
  await audit(deps.db, actor, "user.password_reset", id, {});
}

export async function revokeSessions(
  deps: UsersDeps,
  actor: AdminActor,
  id: string,
): Promise<void> {
  if (id === actor.id) throw new UserRuleError("self_sessions");
  await requireTarget(deps.db, id);
  await deps.auth.api.revokeUserSessions({
    body: { userId: id },
    headers: actor.headers,
  });
  await audit(deps.db, actor, "user.sessions_revoke", id, {});
}
