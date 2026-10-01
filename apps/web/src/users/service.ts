import { APIError } from "better-auth/api";
import { and, asc, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import type { Auth } from "../auth/auth.ts";
import type { RoleName } from "../auth/session.ts";
import * as schema from "../db/schema/index.ts";

const { adminBootstrap, auditLog, session, user, userSecurity } = schema;

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
  | "last_admin"
  | "wrong_current_password"
  | "same_password";

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

export async function countUsers(
  deps: Pick<UsersDeps, "db">,
): Promise<{ active: number; inactive: number; mustChangePassword: number }> {
  const rows = await deps.db
    .select({
      active: sql<number>`count(*) filter (where ${isActive})::int`,
      inactive: sql<number>`count(*) filter (where not ${isActive})::int`,
      mustChangePassword: sql<number>`count(*) filter (where ${isActive} and coalesce(${userSecurity.mustChangePassword}, false))::int`,
    })
    .from(user)
    .leftJoin(userSecurity, eq(userSecurity.userId, user.id));
  return rows[0] ?? { active: 0, inactive: 0, mustChangePassword: 0 };
}

export async function listUsers(
  deps: Pick<UsersDeps, "db">,
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

export const AUDIT_PAGE_SIZE = 50;

export interface AuditListEntry extends AuditEntry {
  targetUserId: string | null;
  targetName: string | null;
}

export async function listAudit(
  deps: Pick<UsersDeps, "db">,
  filters: { action?: string; page: number },
): Promise<{ items: AuditListEntry[]; hasMore: boolean }> {
  const actor = alias(user, "actor");
  const target = alias(user, "target");
  const page = Math.max(1, filters.page);
  const rows = await deps.db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      actorName: actor.name,
      details: auditLog.details,
      targetUserId: auditLog.targetUserId,
      targetName: target.name,
    })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorUserId))
    .leftJoin(target, eq(target.id, auditLog.targetUserId))
    .where(filters.action ? eq(auditLog.action, filters.action) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE + 1)
    .offset((page - 1) * AUDIT_PAGE_SIZE);
  return {
    items: rows.slice(0, AUDIT_PAGE_SIZE),
    hasMore: rows.length > AUDIT_PAGE_SIZE,
  };
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

function apiErrorCode(error: unknown) {
  if (!(error instanceof APIError)) return undefined;
  return (error.body as { code?: unknown } | undefined)?.code;
}

function isEmailTaken(error: unknown) {
  const code = apiErrorCode(error);
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

// Ban reason of an account whose creation has not finished. Visible in the
// panel as an inactive user.
export const PENDING_CREATION_BAN_REASON = "Alta incompleta";

// Fail-closed creation. The account is born banned, so if anything after
// `auth.api.createUser` fails (the forced change, the audit, the activation)
// it stays blocked instead of keeping a password the admin knows without a
// forced change. Nothing is compensated or swallowed: the first error reaches
// the caller and the account is listed as inactive until an admin reactivates
// it, which records the forced change first (see setActive).
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
        data: {
          ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
          banned: true,
          banReason: PENDING_CREATION_BAN_REASON,
        },
      },
      headers: actor.headers,
    });
    created = result.user;
  } catch (error) {
    if (isEmailTaken(error)) throw new UserRuleError("email_taken");
    throw error;
  }

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
  await deps.auth.api.unbanUser({
    body: { userId: created.id },
    headers: actor.headers,
  });
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

// A user without a `user_security` row has nothing pending. Panel-created
// users always get one before they are activated, so a missing row on
// reactivation means an incomplete creation: record the forced change before
// the unban. The recorded bootstrap admin chose their own password and keeps
// the original meaning of a missing row. Written outside the caller's
// transaction (autocommit) so it is durable before Better Auth unbans on its
// own connection.
async function ensureForcedChangeRecorded(db: Db, id: string) {
  const bootstrap = await db
    .select({ id: adminBootstrap.adminUserId })
    .from(adminBootstrap)
    .where(eq(adminBootstrap.adminUserId, id))
    .limit(1);
  if (bootstrap.length > 0) return;
  await db
    .insert(userSecurity)
    .values({ userId: id, mustChangePassword: true })
    .onConflictDoNothing({ target: userSecurity.userId });
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
      await ensureForcedChangeRecorded(deps.db, id);
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

export async function getMustChangePassword(
  deps: Pick<UsersDeps, "db">,
  userId: string,
): Promise<boolean> {
  const rows = await deps.db
    .select({ value: userSecurity.mustChangePassword })
    .from(userSecurity)
    .where(eq(userSecurity.userId, userId))
    .limit(1);
  return rows[0]?.value ?? false;
}

// `self` is the signed-in user changing their own password. Better Auth
// verifies the current password, then replaces every session with a new one;
// the caller must send `setCookies` back so this browser stays signed in.
export async function changeOwnPassword(
  deps: UsersDeps,
  self: AdminActor,
  input: { currentPassword: string; newPassword: string },
): Promise<{ setCookies: string[] }> {
  if (input.newPassword === input.currentPassword) {
    throw new UserRuleError("same_password");
  }
  let responseHeaders: Headers;
  try {
    ({ headers: responseHeaders } = await deps.auth.api.changePassword({
      body: { ...input, revokeOtherSessions: true },
      headers: self.headers,
      returnHeaders: true,
    }));
  } catch (error) {
    if (apiErrorCode(error) === "INVALID_PASSWORD") {
      throw new UserRuleError("wrong_current_password");
    }
    throw error;
  }
  await deps.db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .insert(userSecurity)
      .values({
        userId: self.id,
        mustChangePassword: false,
        passwordChangedAt: now,
      })
      .onConflictDoUpdate({
        target: userSecurity.userId,
        set: { mustChangePassword: false, passwordChangedAt: now },
      });
    await audit(tx, self, "user.password_change", self.id, {});
  });
  return { setCookies: responseHeaders.getSetCookie() };
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
