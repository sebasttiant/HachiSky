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
  issuerProfile,
  report,
  reportActivity,
  reportImage,
  reportItem,
  reportSection,
  reportIssuedActivity,
  reportIssuedImage,
  reportIssuedItem,
  reportIssuedSection,
  reportIssuedVersion,
  signerProfile,
  user,
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
  | "activity_not_found"
  | "image_not_found"
  | "image_limit_reached"
  | "already_issued"
  | "report_issued"
  | "provider_incomplete";

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

export interface ReportProvider {
  name: string;
  logoImageId: string | null;
}

export interface ReportSigner {
  name: string;
  identificationType: string;
  identificationNumber: string;
  jobTitle: string | null;
  signatureImageId: string | null;
}

export interface ReportRecord extends ReportSummary {
  createdBy: string;
  updatedBy: string;
  // Who signs the document. Read live while the report is a draft; once
  // issued, the name and title frozen on the day it went out.
  authorName: string;
  authorJobTitle: string | null;
  // The provider the document goes out under and who signs for it. Read
  // live from the billing profiles while drafting; frozen at issue.
  issuerProfileId: string | null;
  signerProfileId: string | null;
  provider: ReportProvider | null;
  signer: ReportSigner | null;
  detailLevel: "detailed" | "summary";
  // Set only once issued: the preserved version this record was read from.
  issuedAt: Date | null;
  issuedVersion: number | null;
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

// The provider and the signer are chosen from the billing profiles. An id
// that names nothing — or a profile since deactivated — is refused as a
// field error, never quietly stored: a document must not go out under a
// provider the business no longer uses.
async function assertProfilesUsable(
  tx: Tx,
  input: { issuerProfileId: string | null; signerProfileId: string | null },
) {
  if (input.issuerProfileId) {
    const [row] = await tx
      .select({ active: issuerProfile.active })
      .from(issuerProfile)
      .where(eq(issuerProfile.id, input.issuerProfileId))
      .for("share");
    if (!row?.active) {
      throw new ReportValidationError({
        issuerProfileId: "Elige un proveedor activo.",
      });
    }
  }
  if (input.signerProfileId) {
    const [row] = await tx
      .select({ active: signerProfile.active })
      .from(signerProfile)
      .where(eq(signerProfile.id, input.signerProfileId))
      .for("share");
    if (!row?.active) {
      throw new ReportValidationError({
        signerProfileId: "Elige un firmante activo.",
      });
    }
  }
}

// Locks the report and refuses it unless the actor may reach it. Everything
// that writes goes through here first, so ownership is never assumed from
// what a screen displayed earlier.
//
// Exported for images.ts, the sibling that writes the figures of a section:
// it has to answer ownership the same way, and a second implementation of
// this check is exactly how the two would drift apart.
export async function lockReachable(tx: Tx, actor: ReportActor, id: string) {
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

/**
 * The report, locked, and still a draft. Every write goes through here, so
 * an issued report refuses edits in one place: what went out must not be
 * rewritten from any screen. Reads keep using lockReachable.
 *
 * Exported for images.ts, which writes figures under the same rule.
 */
export async function lockEditable(tx: Tx, actor: ReportActor, id: string) {
  const row = await lockReachable(tx, actor, id);
  if (row.status === "issued") throw new ReportRuleError("report_issued");
  return row;
}

export async function touch(tx: Tx, actor: ReportActor, id: string) {
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
    await assertProfilesUsable(tx, input);
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
        issuerProfileId: input.issuerProfileId,
        signerProfileId: input.signerProfileId,
        detailLevel: input.detailLevel,
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

export interface IdentityOption {
  id: string;
  label: string;
}

// The short lists the report form offers. Billing's own lists stay
// admin-only (they expose the whole profile); a report author only needs
// to pick which active provider the document goes out as and who signs it,
// so this module reads exactly that and nothing more.
export async function listProviderOptions(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
): Promise<IdentityOption[]> {
  authorize(rawActor, "view_reports");
  const rows = await deps.db
    .select({ id: issuerProfile.id, legalName: issuerProfile.legalName })
    .from(issuerProfile)
    .where(eq(issuerProfile.active, true))
    .orderBy(asc(issuerProfile.legalName));
  return rows.map((row) => ({ id: row.id, label: row.legalName }));
}

export async function listSignerOptions(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
): Promise<IdentityOption[]> {
  authorize(rawActor, "view_reports");
  const rows = await deps.db
    .select({
      id: signerProfile.id,
      fullName: signerProfile.fullName,
      jobTitle: signerProfile.jobTitle,
    })
    .from(signerProfile)
    .where(eq(signerProfile.active, true))
    .orderBy(asc(signerProfile.fullName));
  return rows.map((row) => ({
    id: row.id,
    label: `${row.fullName} · ${row.jobTitle}`,
  }));
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
      issuerProfileId: report.issuerProfileId,
      signerProfileId: report.signerProfileId,
      detailLevel: report.detailLevel,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      createdBy: report.createdBy,
      updatedBy: report.updatedBy,
      authorName: user.name,
      authorJobTitle: user.jobTitle,
    })
    .from(report)
    .innerJoin(client, eq(client.id, report.clientId))
    .innerJoin(user, eq(user.id, report.authorUserId))
    .where(eq(report.id, id));

  // Null for both absent and unreachable: the caller cannot tell them apart.
  if (!row || !canReachReport(actor.role, actor.id, row.authorUserId)) {
    return null;
  }

  // An issued report is read from its preserved version, never from the
  // draft rows: what the client received cannot be rewritten afterwards by
  // correcting an activity, renaming a client or changing a job title.
  if (row.status === "issued") {
    const [version] = await deps.db
      .select()
      .from(reportIssuedVersion)
      .where(eq(reportIssuedVersion.reportId, id));
    if (version) {
      const issuedSections = await deps.db
        .select()
        .from(reportIssuedSection)
        .where(eq(reportIssuedSection.versionId, version.id))
        .orderBy(asc(reportIssuedSection.position));
      const issuedItems =
        issuedSections.length === 0
          ? []
          : await deps.db
              .select()
              .from(reportIssuedItem)
              .where(
                inArray(
                  reportIssuedItem.sectionId,
                  issuedSections.map((section) => section.id),
                ),
              )
              .orderBy(asc(reportIssuedItem.position));
      const issuedActivities = await deps.db
        .select()
        .from(reportIssuedActivity)
        .where(eq(reportIssuedActivity.versionId, version.id))
        .orderBy(asc(reportIssuedActivity.position));
      return {
        ...row,
        type: version.type as ReportType,
        clientName: version.clientName,
        title: version.title,
        periodStart: version.periodStart,
        periodEnd: version.periodEnd,
        authorName: version.authorName,
        authorJobTitle: version.authorJobTitle,
        issuerProfileId: null,
        signerProfileId: null,
        provider: version.providerName
          ? {
              name: version.providerName,
              logoImageId: version.providerLogoImageId,
            }
          : null,
        signer: version.signerName
          ? {
              name: version.signerName,
              identificationType: version.signerIdentificationType ?? "",
              identificationNumber: version.signerIdentificationNumber ?? "",
              jobTitle: version.signerJobTitle,
              signatureImageId: version.signerSignatureImageId,
            }
          : null,
        detailLevel: version.detailLevel as ReportRecord["detailLevel"],
        issuedAt: version.issuedAt,
        issuedVersion: version.version,
        sections: issuedSections.map((section) => ({
          id: section.id,
          key: section.key,
          kind: section.kind as SectionKind,
          heading: section.heading,
          body: section.body,
          items: issuedItems
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
        activities: issuedActivities.map((activity) => ({
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

  // While drafting, the provider and signer are read live from their
  // billing profiles, so fixing a logo or a signature fixes the draft.
  let provider: ReportProvider | null = null;
  if (row.issuerProfileId) {
    const [issuer] = await deps.db
      .select({
        legalName: issuerProfile.legalName,
        currentLogoImageId: issuerProfile.currentLogoImageId,
      })
      .from(issuerProfile)
      .where(eq(issuerProfile.id, row.issuerProfileId));
    if (issuer) {
      provider = {
        name: issuer.legalName,
        logoImageId: issuer.currentLogoImageId,
      };
    }
  }
  let signer: ReportSigner | null = null;
  if (row.signerProfileId) {
    const [signerRow] = await deps.db
      .select({
        fullName: signerProfile.fullName,
        identificationType: signerProfile.identificationType,
        identificationNumber: signerProfile.identificationNumber,
        jobTitle: signerProfile.jobTitle,
        currentSignatureImageId: signerProfile.currentSignatureImageId,
      })
      .from(signerProfile)
      .where(eq(signerProfile.id, row.signerProfileId));
    if (signerRow) {
      signer = {
        name: signerRow.fullName,
        identificationType: signerRow.identificationType,
        identificationNumber: signerRow.identificationNumber,
        jobTitle: signerRow.jobTitle,
        signatureImageId: signerRow.currentSignatureImageId,
      };
    }
  }

  return {
    ...row,
    type: row.type as ReportType,
    provider,
    signer,
    detailLevel: row.detailLevel as ReportRecord["detailLevel"],
    issuedAt: null,
    issuedVersion: null,
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
    const current = await lockEditable(tx, actor, id);
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
    if (
      input.issuerProfileId !== current.issuerProfileId ||
      input.signerProfileId !== current.signerProfileId
    ) {
      await assertProfilesUsable(tx, input);
    }

    const changed = (
      [
        "clientId",
        "periodStart",
        "periodEnd",
        "title",
        "issuerProfileId",
        "signerProfileId",
        "detailLevel",
      ] as const
    ).filter((field) => input[field] !== current[field]);
    if (changed.length === 0) return;

    await tx
      .update(report)
      .set({
        clientId: input.clientId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        title: input.title,
        issuerProfileId: input.issuerProfileId,
        signerProfileId: input.signerProfileId,
        detailLevel: input.detailLevel,
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
    await lockEditable(tx, actor, reportId);
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
    await lockEditable(tx, actor, reportId);
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
    await lockEditable(tx, actor, reportId);

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
    await lockEditable(tx, actor, id);
    // Sections, items and activity links go with it by cascade; the
    // activities themselves are untouched.
    await tx.delete(report).where(eq(report.id, id));
    await audit(tx, actor, "report.delete", { reportId: id });
  });
}

/**
 * Issue the report: freeze the version the client receives.
 *
 * Everything the document shows is copied in the same transaction that
 * flips the status — sections, items, figures with their bytes, the
 * activities as they read today, and the author's name and title today.
 * From then on the report answers only from that copy (see getReport) and
 * refuses every edit (see lockEditable). Issuing twice is refused rather
 * than freezing a second, different "final" version.
 */
export async function issueReport(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  id: string,
): Promise<{ version: number; issuedAt: Date }> {
  const actor = authorize(rawActor, "issue_report");

  return deps.db.transaction(async (tx) => {
    const current = await lockReachable(tx, actor, id);
    if (current.status === "issued") {
      throw new ReportRuleError("already_issued");
    }

    const [author] = await tx
      .select({ name: user.name, jobTitle: user.jobTitle })
      .from(user)
      .where(eq(user.id, current.authorUserId));
    const [clientRow] = await tx
      .select({ name: client.name })
      .from(client)
      .where(eq(client.id, current.clientId));
    if (!author || !clientRow) throw new ReportRuleError("not_found");

    // A document that goes to a client carries who it goes out as: the
    // provider's logo and the signer's signature are part of the document,
    // not decoration, so issuing without them is refused.
    if (!current.issuerProfileId || !current.signerProfileId) {
      throw new ReportRuleError("provider_incomplete");
    }
    const [issuer] = await tx
      .select({
        legalName: issuerProfile.legalName,
        currentLogoImageId: issuerProfile.currentLogoImageId,
      })
      .from(issuerProfile)
      .where(eq(issuerProfile.id, current.issuerProfileId));
    const [signerRow] = await tx
      .select({
        fullName: signerProfile.fullName,
        identificationType: signerProfile.identificationType,
        identificationNumber: signerProfile.identificationNumber,
        jobTitle: signerProfile.jobTitle,
        currentSignatureImageId: signerProfile.currentSignatureImageId,
      })
      .from(signerProfile)
      .where(eq(signerProfile.id, current.signerProfileId));
    if (!issuer || !signerRow) throw new ReportRuleError("not_found");

    const [version] = await tx
      .insert(reportIssuedVersion)
      .values({
        reportId: id,
        version: 1,
        issuedBy: actor.id,
        type: current.type,
        clientName: clientRow.name,
        periodStart: current.periodStart,
        periodEnd: current.periodEnd,
        title: current.title,
        authorUserId: current.authorUserId,
        authorName: author.name,
        authorJobTitle: author.jobTitle,
        providerName: issuer.legalName,
        providerLogoImageId: issuer.currentLogoImageId,
        signerName: signerRow.fullName,
        signerIdentificationType: signerRow.identificationType,
        signerIdentificationNumber: signerRow.identificationNumber,
        signerJobTitle: signerRow.jobTitle,
        signerSignatureImageId: signerRow.currentSignatureImageId,
        detailLevel: current.detailLevel,
      })
      .returning({
        id: reportIssuedVersion.id,
        issuedAt: reportIssuedVersion.issuedAt,
      });
    if (!version) throw new Error("issued version insert returned no row");

    const sectionRows = await tx
      .select()
      .from(reportSection)
      .where(eq(reportSection.reportId, id))
      .orderBy(asc(reportSection.position));
    const itemRows =
      sectionRows.length === 0
        ? []
        : await tx
            .select()
            .from(reportItem)
            .where(
              inArray(
                reportItem.sectionId,
                sectionRows.map((section) => section.id),
              ),
            )
            .orderBy(asc(reportItem.position));
    const imageRows =
      sectionRows.length === 0
        ? []
        : await tx
            .select()
            .from(reportImage)
            .where(
              inArray(
                reportImage.sectionId,
                sectionRows.map((section) => section.id),
              ),
            )
            .orderBy(asc(reportImage.position));

    for (const section of sectionRows) {
      const [issuedSection] = await tx
        .insert(reportIssuedSection)
        .values({
          versionId: version.id,
          position: section.position,
          key: section.key,
          kind: section.kind,
          heading: section.heading,
          body: section.body,
        })
        .returning({ id: reportIssuedSection.id });
      if (!issuedSection) throw new Error("issued section insert failed");
      const items = itemRows.filter((item) => item.sectionId === section.id);
      if (items.length > 0) {
        await tx.insert(reportIssuedItem).values(
          items.map((item) => ({
            sectionId: issuedSection.id,
            position: item.position,
            label: item.label,
            body: item.body,
            status: item.status,
            priority: item.priority,
            impact: item.impact,
          })),
        );
      }
      const images = imageRows.filter(
        (image) => image.sectionId === section.id,
      );
      if (images.length > 0) {
        await tx.insert(reportIssuedImage).values(
          images.map((image) => ({
            sectionId: issuedSection.id,
            position: image.position,
            title: image.title,
            caption: image.caption,
            data: image.data,
            sha256: image.sha256,
            byteSize: image.byteSize,
            width: image.width,
            height: image.height,
          })),
        );
      }
    }

    // The activities as values, read live for the last time: after this
    // transaction the issued report never joins work_activity again.
    const activityRows = await tx
      .select({
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
    if (activityRows.length > 0) {
      await tx.insert(reportIssuedActivity).values(
        activityRows.map((activity) => ({
          versionId: version.id,
          position: activity.position,
          title: activity.title,
          clientName: activity.clientName,
          performedOn: activity.performedOn,
          startedAt: activity.startedAt,
          endedAt: activity.endedAt,
          status: activity.status,
          outcome: activity.outcome,
        })),
      );
    }

    await tx
      .update(report)
      .set({ status: "issued", updatedAt: new Date(), updatedBy: actor.id })
      .where(eq(report.id, id));
    // Ids and the version only: an audit row is permanent, so none of what
    // the author wrote goes into it.
    await audit(tx, actor, "report.issue", { reportId: id, version: 1 });
    return { version: 1, issuedAt: version.issuedAt };
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
