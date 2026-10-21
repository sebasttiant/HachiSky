import { and, asc, eq, sql } from "drizzle-orm";
import {
  report,
  reportImage,
  reportIssuedImage,
  reportIssuedSection,
  reportIssuedVersion,
  reportSection,
} from "../db/schema/report.ts";
import { canReachReport } from "./permissions.ts";
import {
  audit,
  authorize,
  lockEditable,
  lockReachable,
  type ReportActor,
  type ReportDeps,
  ReportRuleError,
  ReportValidationError,
  type Tx,
  touch,
} from "./service.ts";
import { REPORT_LIMITS, UUID, validateImageText } from "./validation.ts";

// The figures of a report.
//
// An image belongs to a section rather than to the report, so the document
// prints it where it was meant to go: the screenshot of a step sits under
// that step. Reaching an image is reaching its report and nothing else, so
// every entry point here locks the report first, exactly like service.ts.
//
// This module stores bytes; it never inspects them. Validating and
// re-encoding the upload is src/images/pipeline.ts, and the route hands the
// result in. That seam is what lets these rules be tested without sharp.

export const MAX_IMAGES_PER_SECTION = REPORT_LIMITS.imagesPerSection;

/** What src/images/pipeline.ts produced: a clean PNG and its measurements. */
export interface StoredImage {
  png: Buffer;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
}

export interface ReportImageRecord {
  id: string;
  sectionKey: string;
  position: number;
  title: string;
  caption: string | null;
  width: number;
  height: number;
  byteSize: number;
}

/**
 * Refuses an id that cannot name a row.
 *
 * These ids arrive from a URL. Letting a malformed one reach PostgreSQL
 * turns it into a 22P02 failure, which answers differently from an id that
 * simply does not exist — and that difference is itself something to probe.
 * It also reads as an outage when nothing is wrong.
 */
function assertId(id: string, code: "not_found" | "image_not_found") {
  if (!UUID.test(id)) throw new ReportRuleError(code);
}

/**
 * The section, locked, or `section_not_found`. Scoped to the report the
 * caller already proved it may reach, so a section id from another report is
 * simply absent here.
 */
async function lockSection(tx: Tx, reportId: string, key: string) {
  const [section] = await tx
    .select()
    .from(reportSection)
    .where(
      and(eq(reportSection.reportId, reportId), eq(reportSection.key, key)),
    )
    .for("update");
  if (!section) throw new ReportRuleError("section_not_found");
  return section;
}

/**
 * The image and the key of the section holding it, scoped to one report.
 *
 * An image of another report answers `image_not_found` rather than revealing
 * that the id exists somewhere else — the same rule the report itself
 * follows for unreachable ids.
 */
async function lockImage(tx: Tx, reportId: string, imageId: string) {
  const [row] = await tx
    .select({
      id: reportImage.id,
      sectionId: reportImage.sectionId,
      position: reportImage.position,
      sectionKey: reportSection.key,
    })
    .from(reportImage)
    .innerJoin(reportSection, eq(reportImage.sectionId, reportSection.id))
    .where(
      and(eq(reportImage.id, imageId), eq(reportSection.reportId, reportId)),
    )
    .for("update", { of: [reportImage] });
  if (!row) throw new ReportRuleError("image_not_found");
  return row;
}

/** Renumbers a section's figures to 0..n-1 in their current order. */
async function compact(tx: Tx, sectionId: string) {
  const rows = await tx
    .select({ id: reportImage.id })
    .from(reportImage)
    .where(eq(reportImage.sectionId, sectionId))
    .orderBy(asc(reportImage.position), asc(reportImage.id));
  for (const [index, row] of rows.entries()) {
    await tx
      .update(reportImage)
      .set({ position: index })
      .where(eq(reportImage.id, row.id));
  }
}

export async function addImage(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
  sectionKey: string,
  rawText: unknown,
  image: StoredImage,
): Promise<string> {
  const actor = authorize(rawActor, "edit_report");
  assertId(reportId, "not_found");
  const result = validateImageText(rawText);
  if (!result.ok) throw new ReportValidationError(result.fieldErrors);

  return deps.db.transaction(async (tx) => {
    await lockEditable(tx, actor, reportId);
    const section = await lockSection(tx, reportId, sectionKey);

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(reportImage)
      .where(eq(reportImage.sectionId, section.id));
    if (count >= MAX_IMAGES_PER_SECTION) {
      throw new ReportRuleError("image_limit_reached");
    }

    const [row] = await tx
      .insert(reportImage)
      .values({
        sectionId: section.id,
        position: count,
        title: result.data.title,
        caption: result.data.caption,
        data: image.png,
        sha256: image.sha256,
        byteSize: image.byteSize,
        width: image.width,
        height: image.height,
        createdBy: actor.id,
      })
      .returning({ id: reportImage.id });

    await touch(tx, actor, reportId);
    // Ids and the section key. The title and the caption are content, and an
    // audit row is permanent.
    await audit(tx, actor, "report.image_add", {
      reportId,
      sectionKey,
      imageId: row.id,
    });
    return row.id;
  });
}

export async function listImages(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
): Promise<ReportImageRecord[]> {
  const actor = authorize(rawActor, "view_reports");
  assertId(reportId, "not_found");

  return deps.db.transaction(async (tx) => {
    const current = await lockReachable(tx, actor, reportId);
    // Once issued, the figures are the frozen copies: the draft figure may
    // be gone, and the document must still print what went out.
    if (current.status === "issued") {
      const [version] = await tx
        .select({ id: reportIssuedVersion.id })
        .from(reportIssuedVersion)
        .where(eq(reportIssuedVersion.reportId, reportId));
      if (!version) return [];
      return tx
        .select({
          id: reportIssuedImage.id,
          sectionKey: reportIssuedSection.key,
          position: reportIssuedImage.position,
          title: reportIssuedImage.title,
          caption: reportIssuedImage.caption,
          width: reportIssuedImage.width,
          height: reportIssuedImage.height,
          byteSize: reportIssuedImage.byteSize,
        })
        .from(reportIssuedImage)
        .innerJoin(
          reportIssuedSection,
          eq(reportIssuedImage.sectionId, reportIssuedSection.id),
        )
        .where(eq(reportIssuedSection.versionId, version.id))
        .orderBy(
          asc(reportIssuedSection.position),
          asc(reportIssuedImage.position),
        );
    }
    const rows = await tx
      .select({
        id: reportImage.id,
        sectionKey: reportSection.key,
        position: reportImage.position,
        title: reportImage.title,
        caption: reportImage.caption,
        width: reportImage.width,
        height: reportImage.height,
        byteSize: reportImage.byteSize,
      })
      .from(reportImage)
      .innerJoin(reportSection, eq(reportImage.sectionId, reportSection.id))
      .where(eq(reportSection.reportId, reportId))
      .orderBy(asc(reportSection.position), asc(reportImage.position));
    return rows;
  });
}

/**
 * The exact stored bytes, for the route that serves them.
 *
 * Takes the image id alone because that is all a URL carries. An id in a
 * report the actor may not reach, and an id that does not exist, answer the
 * same way: nobody learns which figures exist by probing.
 */
export async function readImageBytes(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  imageId: string,
): Promise<{ data: Buffer; sha256: string; byteSize: number }> {
  const actor = authorize(rawActor, "view_reports");
  assertId(imageId, "image_not_found");

  return deps.db.transaction(async (tx) => {
    // Authorize from metadata first. In particular, do not load the image
    // bytes into application memory and only then discover that this actor
    // may not reach the report.
    // The frozen figure of an issued report first: its id names the copy
    // that went out, and its reach follows the report's author as before.
    const [issuedOwner] = await tx
      .select({ authorUserId: report.authorUserId })
      .from(reportIssuedImage)
      .innerJoin(
        reportIssuedSection,
        eq(reportIssuedImage.sectionId, reportIssuedSection.id),
      )
      .innerJoin(
        reportIssuedVersion,
        eq(reportIssuedSection.versionId, reportIssuedVersion.id),
      )
      .innerJoin(report, eq(reportIssuedVersion.reportId, report.id))
      .where(eq(reportIssuedImage.id, imageId));
    if (issuedOwner) {
      if (!canReachReport(actor.role, actor.id, issuedOwner.authorUserId)) {
        throw new ReportRuleError("image_not_found");
      }
      const [row] = await tx
        .select({
          data: reportIssuedImage.data,
          sha256: reportIssuedImage.sha256,
          byteSize: reportIssuedImage.byteSize,
        })
        .from(reportIssuedImage)
        .where(eq(reportIssuedImage.id, imageId));
      if (!row) throw new ReportRuleError("image_not_found");
      return row;
    }
    const [owner] = await tx
      .select({
        reportId: reportSection.reportId,
        authorUserId: report.authorUserId,
      })
      .from(reportImage)
      .innerJoin(reportSection, eq(reportImage.sectionId, reportSection.id))
      .innerJoin(report, eq(reportSection.reportId, report.id))
      .where(eq(reportImage.id, imageId));
    if (!owner || !canReachReport(actor.role, actor.id, owner.authorUserId)) {
      throw new ReportRuleError("image_not_found");
    }

    const [row] = await tx
      .select({
        data: reportImage.data,
        sha256: reportImage.sha256,
        byteSize: reportImage.byteSize,
      })
      .from(reportImage)
      .where(eq(reportImage.id, imageId));
    if (!row) throw new ReportRuleError("image_not_found");

    return row;
  });
}

export async function updateImageText(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
  imageId: string,
  rawText: unknown,
): Promise<void> {
  const actor = authorize(rawActor, "edit_report");
  assertId(reportId, "not_found");
  assertId(imageId, "image_not_found");
  const result = validateImageText(rawText);
  if (!result.ok) throw new ReportValidationError(result.fieldErrors);

  await deps.db.transaction(async (tx) => {
    await lockEditable(tx, actor, reportId);
    const image = await lockImage(tx, reportId, imageId);

    await tx
      .update(reportImage)
      .set({ title: result.data.title, caption: result.data.caption })
      .where(eq(reportImage.id, image.id));
    await touch(tx, actor, reportId);
    await audit(tx, actor, "report.image_update", {
      reportId,
      sectionKey: image.sectionKey,
      imageId: image.id,
    });
  });
}

export async function removeImage(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
  imageId: string,
): Promise<void> {
  const actor = authorize(rawActor, "edit_report");
  assertId(reportId, "not_found");
  assertId(imageId, "image_not_found");

  await deps.db.transaction(async (tx) => {
    await lockEditable(tx, actor, reportId);
    const image = await lockImage(tx, reportId, imageId);

    await tx.delete(reportImage).where(eq(reportImage.id, image.id));
    // The order a reader sees must stay contiguous, or a later insert would
    // land on a position that already exists.
    await compact(tx, image.sectionId);
    await touch(tx, actor, reportId);
    await audit(tx, actor, "report.image_remove", {
      reportId,
      sectionKey: image.sectionKey,
      imageId: image.id,
    });
  });
}

export async function moveImage(
  deps: ReportDeps,
  rawActor: ReportActor | null | undefined,
  reportId: string,
  imageId: string,
  direction: "up" | "down",
): Promise<void> {
  const actor = authorize(rawActor, "edit_report");
  assertId(reportId, "not_found");
  assertId(imageId, "image_not_found");

  await deps.db.transaction(async (tx) => {
    await lockEditable(tx, actor, reportId);
    const image = await lockImage(tx, reportId, imageId);

    const target = image.position + (direction === "up" ? -1 : 1);
    const [neighbour] = await tx
      .select({ id: reportImage.id })
      .from(reportImage)
      .where(
        and(
          eq(reportImage.sectionId, image.sectionId),
          eq(reportImage.position, target),
        ),
      )
      .for("update");
    // At either end there is nothing to swap with, and asking is not an
    // error: the button simply did nothing.
    if (!neighbour) return;

    // The report row lock serialises every report write, so these two updates
    // cannot race another reorder. There is deliberately no transient -1:
    // the database rejects negative positions even inside a transaction.
    await tx
      .update(reportImage)
      .set({ position: image.position })
      .where(eq(reportImage.id, neighbour.id));
    await tx
      .update(reportImage)
      .set({ position: target })
      .where(eq(reportImage.id, image.id));

    await touch(tx, actor, reportId);
    await audit(tx, actor, "report.image_move", {
      reportId,
      sectionKey: image.sectionKey,
      imageId: image.id,
    });
  });
}
