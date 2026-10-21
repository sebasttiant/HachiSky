import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { RoleName } from "../auth/session.ts";
import * as schema from "../db/schema/index.ts";
import {
  canPerformWorkOperation,
  canReachActivity,
  type WorkOperation,
} from "./permissions.ts";
import {
  type ActivityFieldErrors,
  type ActivityInput,
  type ActivityStatus,
  UUID,
  validateActivity,
} from "./validation.ts";

const { auditLog, client, workActivity } = schema;

// Recorded work. The service is the authority: it checks the role, then
// ownership, then validates, then writes — each step before the next can do
// damage. Audit rows carry ids and changed field names only, never what the
// colleague wrote: the trail is append-only, so anything put there cannot be
// taken back out.

export type Db = NodePgDatabase<typeof schema>;
export interface WorkDeps {
  db: Db;
}

export interface WorkActor {
  id: string;
  role: RoleName;
  ipAddress: string | null;
  userAgent: string | null;
}

export type WorkRuleCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "client_not_found";

export class WorkRuleError extends Error {
  readonly code: WorkRuleCode;
  constructor(code: WorkRuleCode) {
    super(code);
    this.name = "WorkRuleError";
    this.code = code;
  }
}

export class WorkValidationError extends Error {
  readonly fieldErrors: ActivityFieldErrors;
  constructor(fieldErrors: ActivityFieldErrors) {
    super("invalid activity");
    this.name = "WorkValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export interface ActivityRecord extends ActivityInput {
  id: string;
  clientName: string;
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export function authorize(
  actor: WorkActor | null | undefined,
  operation: WorkOperation,
): WorkActor {
  if (!actor || typeof actor.id !== "string" || actor.id === "") {
    throw new WorkRuleError("unauthenticated");
  }
  if (!canPerformWorkOperation(actor.role, operation)) {
    throw new WorkRuleError("forbidden");
  }
  return actor;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function audit(
  tx: Tx,
  actor: WorkActor,
  action: string,
  details: Record<string, unknown>,
) {
  await tx.insert(auditLog).values({
    actorUserId: actor.id,
    action,
    targetUserId: null,
    details,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

function parse(raw: unknown): ActivityInput {
  const result = validateActivity(raw);
  if (!result.ok) throw new WorkValidationError(result.fieldErrors);
  return result.data;
}

// The client must exist. FOR SHARE makes a concurrent change to it wait for
// this write rather than racing it.
async function assertClientExists(tx: Tx, clientId: string) {
  const [row] = await tx
    .select({ id: client.id })
    .from(client)
    .where(eq(client.id, clientId))
    .for("share");
  if (!row) throw new WorkRuleError("client_not_found");
}

const ACTIVITY_FIELDS = [
  "clientId",
  "performedOn",
  "startedAt",
  "endedAt",
  "title",
  "description",
  "outcome",
  "status",
  "nextSteps",
] as const satisfies readonly (keyof ActivityInput)[];

type ActivityRow = typeof workActivity.$inferSelect;

function toRecord(row: ActivityRow, clientName: string): ActivityRecord {
  return {
    ...row,
    clientName,
    status: row.status as ActivityStatus,
    // Postgres returns time as HH:MM:SS; the form speaks HH:MM.
    startedAt: row.startedAt?.slice(0, 5) ?? null,
    endedAt: row.endedAt?.slice(0, 5) ?? null,
  };
}

function selectActivities(db: Db) {
  return db
    .select({ activity: workActivity, clientName: client.name })
    .from(workActivity)
    .innerJoin(client, eq(client.id, workActivity.clientId))
    .$dynamic();
}

export interface ActivityFilter {
  clientId?: string;
  from?: string;
  to?: string;
}

export async function listActivities(
  deps: WorkDeps,
  actorInput: WorkActor | null | undefined,
  filter: ActivityFilter = {},
): Promise<ActivityRecord[]> {
  const actor = authorize(actorInput, "view_activities");
  const where = [];
  // Staff never see a colleague's work, whatever they filter by.
  if (actor.role !== "admin") {
    where.push(eq(workActivity.authorUserId, actor.id));
  }
  if (filter.clientId !== undefined) {
    if (!UUID.test(filter.clientId)) return [];
    where.push(eq(workActivity.clientId, filter.clientId));
  }
  if (filter.from !== undefined) {
    where.push(gte(workActivity.performedOn, filter.from));
  }
  if (filter.to !== undefined) {
    where.push(lte(workActivity.performedOn, filter.to));
  }
  const rows = await selectActivities(deps.db)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(
      desc(workActivity.performedOn),
      asc(workActivity.startedAt),
      asc(workActivity.id),
    );
  return rows.map((row) => toRecord(row.activity, row.clientName));
}

export async function getActivity(
  deps: WorkDeps,
  actorInput: WorkActor | null | undefined,
  id: string,
): Promise<ActivityRecord | null> {
  const actor = authorize(actorInput, "view_activities");
  if (!UUID.test(id)) return null;
  const [row] = await selectActivities(deps.db)
    .where(eq(workActivity.id, id))
    .limit(1);
  if (!row) return null;
  // Not "forbidden": a colleague is not told which ids exist.
  if (!canReachActivity(actor.role, actor.id, row.activity.authorUserId)) {
    return null;
  }
  return toRecord(row.activity, row.clientName);
}

export async function createActivity(
  deps: WorkDeps,
  actorInput: WorkActor | null | undefined,
  raw: unknown,
): Promise<{ id: string }> {
  const actor = authorize(actorInput, "create_activity");
  const data = parse(raw);
  return deps.db.transaction(async (tx) => {
    await assertClientExists(tx, data.clientId);
    const [created] = await tx
      .insert(workActivity)
      .values({
        ...data,
        // You record your own work; an administrator correcting it later
        // does not take it over.
        authorUserId: actor.id,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning({ id: workActivity.id });
    if (!created) throw new Error("activity insert returned no row");
    await audit(tx, actor, "work.activity_create", {
      activityId: created.id,
      clientId: data.clientId,
    });
    return created;
  });
}

export async function updateActivity(
  deps: WorkDeps,
  actorInput: WorkActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "edit_activity");
  const data = parse(raw);
  if (!UUID.test(id)) throw new WorkRuleError("not_found");
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workActivity)
      .where(eq(workActivity.id, id))
      .for("update");
    if (!current) throw new WorkRuleError("not_found");
    if (!canReachActivity(actor.role, actor.id, current.authorUserId)) {
      throw new WorkRuleError("not_found");
    }
    const stored = toRecord(current, "");
    const changedFields = ACTIVITY_FIELDS.filter(
      (field) => stored[field] !== data[field],
    );
    if (changedFields.length === 0) return;
    if (changedFields.includes("clientId")) {
      await assertClientExists(tx, data.clientId);
    }
    await tx
      .update(workActivity)
      .set({ ...data, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(workActivity.id, id));
    // Field names only: what was written about a client stays out of the
    // append-only trail.
    await audit(tx, actor, "work.activity_update", {
      activityId: id,
      changedFields,
    });
  });
}

export async function deleteActivity(
  deps: WorkDeps,
  actorInput: WorkActor | null | undefined,
  id: string,
): Promise<void> {
  const actor = authorize(actorInput, "delete_activity");
  if (!UUID.test(id)) throw new WorkRuleError("not_found");
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ authorUserId: workActivity.authorUserId })
      .from(workActivity)
      .where(eq(workActivity.id, id))
      .for("update");
    if (!current) throw new WorkRuleError("not_found");
    if (!canReachActivity(actor.role, actor.id, current.authorUserId)) {
      throw new WorkRuleError("not_found");
    }
    await tx.delete(workActivity).where(eq(workActivity.id, id));
    await audit(tx, actor, "work.activity_delete", { activityId: id });
  });
}
