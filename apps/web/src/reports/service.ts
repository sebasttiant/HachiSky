import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { RoleName } from "../auth/session.ts";
import * as schema from "../db/schema/index.ts";
import {
  canPerformReportOperation,
  canReachReport,
  type ReportOperation,
} from "./permissions.ts";
import { type ReportType, type SectionKind, templateFor } from "./templates.ts";
import {
  type ItemInput,
  type ReportFieldErrors,
  type ReportInput,
  type SectionInput,
  validateActivityIds,
  validateItems,
  validateReport,
  validateSection,
} from "./validation.ts";

const {
  auditLog,
  client,
  report,
  reportActivity,
  reportItem,
  reportSection,
  workActivity,
} = schema;

// Reports. The service is the authority: role, then ownership, then
// validation, then the write.
//
// Two rules are specific to this module and neither may be relaxed in a
// screen. First, a report describes recorded work: the activities it shows
// are read from work_activity and never typed into the report. Second, the
// author may only attach activities they could open themselves, so a report
// cannot become a side door into a colleague's work.
//
// Audit rows carry ids and the section keys that changed, never the text the
// author wrote: the trail is append-only, so what goes in cannot come out.

export type Db = NodePgDatabase<typeof schema>;
export interface ReportDeps {
  db: Db;
}

export interface ReportActor {
  id: string;
  role: RoleName;
  ipAddress: string | null;
  userAgent: string | null;
}

export type ReportRuleCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "client_not_found"
  | "section_not_found"
  | "activity_not_found";

export class ReportRuleError extends Error {
  readonly code: ReportRuleCode;
  constructor(code: ReportRuleCode) {
    super(code);
    this.name = "ReportRuleError";
    this.code = code;
  }
}

export class ReportValidationError extends Error {
  readonly fieldErrors: ReportFieldErrors;
  constructor(fieldErrors: ReportFieldErrors) {
    super("invalid report");
    this.name = "ReportValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export interface ReportSummary {
  id: string;
  type: ReportType;
  clientId: string;
  clientName: string;
  title: string;
  periodStart: string | null;
  periodEnd: string | null;
  status: string;
  authorUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SectionRecord {
  id: string;
  key: string;
  kind: SectionKind;
  heading: string;
  body: string | null;
  items: ItemRecord[];
}

export interface ItemRecord extends ItemInput {
  id: string;
  position: number;
}

export interface LinkedActivity {
  id: string;
  title: string;
  clientName: string;
  performedOn: string;
  startedAt: string | null;
  endedAt: string | null;
  status: string;
  outcome: string | null;
}

export interface ReportRecord extends ReportSummary {
  createdBy: string;
  updatedBy: string;
  sections: SectionRecord[];
  activities: LinkedActivity[];
}

export function authorize(
  actor: ReportActor | null | undefined,
  operation: ReportOperation,
): ReportActor {
  if (!actor || typeof actor.id !== "string" || actor.id === "") {
    throw new ReportRuleError("unauthenticated");
  }
  if (!canPerformReportOperation(actor.role, operation)) {
    throw new ReportRuleError("forbidden");
  }
  return actor;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function audit(
  tx: Tx,
  actor: ReportActor,
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

/** PostgreSQL returns `HH:MM:SS`; the form speaks `HH:MM`. */
function shortTime(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5);
}

async function assertClientExists(tx: Tx, clientId: string) {
  const [row] = await tx
    .select({ id: client.id })
    .from(client)
    .where(eq(client.id, clientId))
    .for("share");
  if (!row) throw new ReportRuleError("client_not_found");
}

// Locks the report and refuses it unless the actor may reach it. Everything
// that writes goes through here first, so ownership is never assumed from
// what a screen displayed earlier.
async function lockReachable(tx: Tx, actor: ReportActor, id: string) {
  const [row] = await tx
    .select()
    .from(report)
    .where(eq(report.id, id))
    .for("update");
  // Unreachable and absent are the same answer on purpose: nobody learns
  // which report ids exist by probing.
  if (!row || !canReachReport(actor.role, actor.id, row.authorUserId)) {
    throw new ReportRuleError("not_found");
  }
  return row;
}

async function touch(tx: Tx, actor: ReportActor, id: string) {
  await tx
    .update(report)
    .set({ updatedAt: new Date(), updatedBy: actor.id })
    .where(eq(report.id, id));
}

export async function createReport(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  raw: unknown,
): Promise<string> {
  const actor = authorize(rawActor, "create_report");
  const result = validateReport(raw);
  if (!result.ok) throw new ReportValidationError(result.fieldErrors);
  const input: ReportInput = result.data;

  return deps.db.transaction(async (tx) => {
    await assertClientExists(tx, input.clientId);
    const [row] = await tx
      .insert(report)
      .values({
        type: input.type,
        clientId: input.clientId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        title: input.title,
        status: "draft",
        authorUserId: actor.id,
        createdBy: actor.id,
        updatedBy: actor.id,
      })
      .returning({ id: report.id });

    // The template is seeded as rows so the author can rewrite any heading
    // without the document losing the structure it was created with.
    const sections = templateFor(input.type);
    await tx.insert(reportSection).values(
      sections.map((section, position) => ({
        reportId: row.id,
        position,
        key: section.key,
        kind: section.kind,
        heading: section.heading,
        body: null,
      })),
    );

    await audit(tx, actor, "report.create", {
      reportId: row.id,
      type: input.type,
      clientId: input.clientId,
      sections: sections.map((section) => section.key),
    });
    return row.id;
  });
}

export async function listReports(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  filters: { clientId?: string; type?: ReportType } = {},
): Promise<ReportSummary[]> {
  const actor = authorize(rawActor, "view_reports");
  const where = [
    // Staff see only what they authored; an administrator sees everything.
    actor.role === "admin" ? undefined : eq(report.authorUserId, actor.id),
    filters.clientId ? eq(report.clientId, filters.clientId) : undefined,
    filters.type ? eq(report.type, filters.type) : undefined,
  ].filter((part) => part !== undefined);

  const rows = await deps.db
    .select({
      id: report.id,
      type: report.type,
      clientId: report.clientId,
      clientName: client.name,
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status: report.status,
      authorUserId: report.authorUserId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    })
    .from(report)
    .innerJoin(client, eq(client.id, report.clientId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(report.updatedAt));

  return rows.map((row) => ({ ...row, type: row.type as ReportType }));
}

export async function getReport(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  id: string,
): Promise<ReportRecord | null> {
  const actor = authorize(rawActor, "view_reports");

  const [row] = await deps.db
    .select({
      id: report.id,
      type: report.type,
      clientId: report.clientId,
      clientName: client.name,
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status: report.status,
      authorUserId: report.authorUserId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      createdBy: report.createdBy,
      updatedBy: report.updatedBy,
    })
    .from(report)
    .innerJoin(client, eq(client.id, report.clientId))
    .where(eq(report.id, id));

  // Null for both absent and unreachable: the caller cannot tell them apart.
  if (!row || !canReachReport(actor.role, actor.id, row.authorUserId)) {
    return null;
  }

  const sectionRows = await deps.db
    .select()
    .from(reportSection)
    .where(eq(reportSection.reportId, id))
    .orderBy(asc(reportSection.position));

  const itemRows =
    sectionRows.length === 0
      ? []
      : await deps.db
          .select()
          .from(reportItem)
          .where(
            inArray(
              reportItem.sectionId,
              sectionRows.map((section) => section.id),
            ),
          )
          .orderBy(asc(reportItem.position));

  // The activities are read live from work_activity: the report shows what
  // is recorded now, not a copy that could have drifted away from it.
  const activityRows = await deps.db
    .select({
      id: workActivity.id,
      title: workActivity.title,
      clientName: client.name,
      performedOn: workActivity.performedOn,
      startedAt: workActivity.startedAt,
      endedAt: workActivity.endedAt,
      status: workActivity.status,
      outcome: workActivity.outcome,
      position: reportActivity.position,
    })
    .from(reportActivity)
    .innerJoin(workActivity, eq(workActivity.id, reportActivity.activityId))
    .innerJoin(client, eq(client.id, workActivity.clientId))
    .where(eq(reportActivity.reportId, id))
    .orderBy(asc(reportActivity.position));

  return {
    ...row,
    type: row.type as ReportType,
    sections: sectionRows.map((section) => ({
      id: section.id,
      key: section.key,
      kind: section.kind as SectionKind,
      heading: section.heading,
      body: section.body,
      items: itemRows
        .filter((item) => item.sectionId === section.id)
        .map((item) => ({
          id: item.id,
          position: item.position,
          label: item.label,
          body: item.body,
          status: item.status as ItemRecord["status"],
          priority: item.priority as ItemRecord["priority"],
          impact: item.impact,
        })),
    })),
    activities: activityRows.map((activity) => ({
      id: activity.id,
      title: activity.title,
      clientName: activity.clientName,
      performedOn: activity.performedOn,
      startedAt: shortTime(activity.startedAt),
      endedAt: shortTime(activity.endedAt),
      status: activity.status,
      outcome: activity.outcome,
    })),
  };
}

export async function updateReport(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(rawActor, "edit_report");
  const result = validateReport(raw);
  if (!result.ok) throw new ReportValidationError(result.fieldErrors);
  const input = result.data;

  await deps.db.transaction(async (tx) => {
    const current = await lockReachable(tx, actor, id);
    // The type decides which sections exist, so changing it would orphan
    // what the author already wrote. A different type is a different report.
    if (input.type !== current.type) {
      throw new ReportValidationError({
        type: "No se puede cambiar el tipo de un informe ya creado.",
      });
    }
    if (input.clientId !== current.clientId) {
      await assertClientExists(tx, input.clientId);
    }

    const changed = (
      ["clientId", "periodStart", "periodEnd", "title"] as const
    ).filter((field) => input[field] !== current[field]);
    if (changed.length === 0) return;

    await tx
      .update(report)
      .set({
        clientId: input.clientId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        title: input.title,
        updatedAt: new Date(),
        updatedBy: actor.id,
      })
      .where(eq(report.id, id));

    // The author stays the author: an administrator correcting a draft does
    // not take it over.
    await audit(tx, actor, "report.update", {
      reportId: id,
      changedFields: changed,
    });
  });
}

export async function updateSection(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
  key: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(rawActor, "edit_report");
  const result = validateSection(raw);
  if (!result.ok) throw new ReportValidationError(result.fieldErrors);
  const input: SectionInput = result.data;

  await deps.db.transaction(async (tx) => {
    await lockReachable(tx, actor, reportId);
    const [section] = await tx
      .select()
      .from(reportSection)
      .where(
        and(eq(reportSection.reportId, reportId), eq(reportSection.key, key)),
      )
      .for("update");
    if (!section) throw new ReportRuleError("section_not_found");

    if (section.heading === input.heading && section.body === input.body) {
      return;
    }

    await tx
      .update(reportSection)
      .set({ heading: input.heading, body: input.body })
      .where(eq(reportSection.id, section.id));
    await touch(tx, actor, reportId);

    // The key, never the text: an audit row is permanent.
    await audit(tx, actor, "report.section_update", {
      reportId,
      sectionKey: key,
    });
  });
}

export async function replaceItems(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
  key: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(rawActor, "edit_report");

  await deps.db.transaction(async (tx) => {
    await lockReachable(tx, actor, reportId);
    const [section] = await tx
      .select()
      .from(reportSection)
      .where(
        and(eq(reportSection.reportId, reportId), eq(reportSection.key, key)),
      )
      .for("update");
    if (!section) throw new ReportRuleError("section_not_found");

    const result = validateItems(raw, section.kind as SectionKind);
    if (!result.ok) throw new ReportValidationError(result.fieldErrors);

    // Replace rather than merge: the form submits the whole list, and the
    // order on screen is the order stored.
    await tx.delete(reportItem).where(eq(reportItem.sectionId, section.id));
    if (result.data.length > 0) {
      await tx.insert(reportItem).values(
        result.data.map((item, position) => ({
          sectionId: section.id,
          position,
          label: item.label,
          body: item.body,
          status: item.status,
          priority: item.priority,
          impact: item.impact,
        })),
      );
    }
    await touch(tx, actor, reportId);

    await audit(tx, actor, "report.items_update", {
      reportId,
      sectionKey: key,
      count: result.data.length,
    });
  });
}

export async function setActivities(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(rawActor, "edit_report");
  const result = validateActivityIds(raw);
  if (!result.ok) throw new ReportValidationError(result.fieldErrors);
  const ids = result.data;

  await deps.db.transaction(async (tx) => {
    await lockReachable(tx, actor, reportId);

    if (ids.length > 0) {
      const rows = await tx
        .select({
          id: workActivity.id,
          authorUserId: workActivity.authorUserId,
        })
        .from(workActivity)
        .where(inArray(workActivity.id, ids));

      // An activity the author could not open is refused, not silently
      // skipped: attaching one would turn a report into a way to read a
      // colleague's work. Missing and unreachable give the same answer.
      const reachable = new Set(
        rows
          .filter((row) =>
            canReachReport(actor.role, actor.id, row.authorUserId),
          )
          .map((row) => row.id),
      );
      if (ids.some((id) => !reachable.has(id))) {
        throw new ReportRuleError("activity_not_found");
      }
    }

    await tx
      .delete(reportActivity)
      .where(eq(reportActivity.reportId, reportId));
    if (ids.length > 0) {
      await tx.insert(reportActivity).values(
        ids.map((activityId, position) => ({
          reportId,
          activityId,
          position,
        })),
      );
    }
    await touch(tx, actor, reportId);

    await audit(tx, actor, "report.activities_update", {
      reportId,
      activityIds: ids,
    });
  });
}

export async function deleteReport(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  id: string,
): Promise<void> {
  const actor = authorize(rawActor, "delete_report");

  await deps.db.transaction(async (tx) => {
    await lockReachable(tx, actor, id);
    // Sections, items and activity links go with it by cascade; the
    // activities themselves are untouched.
    await tx.delete(report).where(eq(report.id, id));
    await audit(tx, actor, "report.delete", { reportId: id });
  });
}

/** Activities the actor may attach: their own, or every one for an admin. */
export async function selectableActivities(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  clientId: string,
): Promise<LinkedActivity[]> {
  const actor = authorize(rawActor, "view_reports");
  const where = [
    eq(workActivity.clientId, clientId),
    actor.role === "admin"
      ? undefined
      : eq(workActivity.authorUserId, actor.id),
  ].filter((part) => part !== undefined);

  const rows = await deps.db
    .select({
      id: workActivity.id,
      title: workActivity.title,
      clientName: client.name,
      performedOn: workActivity.performedOn,
      startedAt: workActivity.startedAt,
      endedAt: workActivity.endedAt,
      status: workActivity.status,
      outcome: workActivity.outcome,
    })
    .from(workActivity)
    .innerJoin(client, eq(client.id, workActivity.clientId))
    .where(and(...where))
    .orderBy(desc(workActivity.performedOn), desc(workActivity.createdAt));

  return rows.map((row) => ({
    ...row,
    startedAt: shortTime(row.startedAt),
    endedAt: shortTime(row.endedAt),
  }));
}
