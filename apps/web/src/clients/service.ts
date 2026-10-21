import { and, asc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { RoleName } from "../auth/session.ts";
import * as schema from "../db/schema/index.ts";
import {
  type ClientOperation,
  canPerformClientOperation,
} from "./permissions.ts";
import {
  type ClientFieldErrors,
  type ClientInput,
  validateClient,
} from "./validation.ts";

const { auditLog, client } = schema;

// Business rules for client records. The service is the authority: every
// operation checks the actor's role, validates and normalizes its own input
// (Server Functions cannot bypass it), and writes the audit row in the same
// transaction as the change.

export type Db = NodePgDatabase<typeof schema>;
export interface ClientsDeps {
  db: Db;
}

export interface ClientActor {
  id: string;
  role: RoleName;
  ipAddress: string | null;
  userAgent: string | null;
}

export type ClientRuleCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "duplicate_identification";

export class ClientRuleError extends Error {
  readonly code: ClientRuleCode;
  constructor(code: ClientRuleCode) {
    super(code);
    this.name = "ClientRuleError";
    this.code = code;
  }
}

export class ClientValidationError extends Error {
  readonly fieldErrors: ClientFieldErrors;
  constructor(fieldErrors: ClientFieldErrors) {
    super("invalid client");
    this.name = "ClientValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export type ClientStatus = "active" | "inactive";

export interface ClientFilters {
  q?: string;
  status?: ClientStatus;
  page?: number;
}

export interface ClientRecord extends ClientInput {
  id: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export const CLIENTS_PAGE_SIZE = 25;
const MAX_QUERY_LENGTH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runs before anything else, so a refused actor never reaches validation or
// the database. A missing actor is "no session"; an unknown role is refused.
function authorize(
  actor: ClientActor | null | undefined,
  operation: ClientOperation,
): ClientActor {
  if (!actor || typeof actor.id !== "string" || actor.id === "") {
    throw new ClientRuleError("unauthenticated");
  }
  if (!canPerformClientOperation(actor.role, operation)) {
    throw new ClientRuleError("forbidden");
  }
  return actor;
}

function pgErrorCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function mapUniqueViolation(error: unknown): never {
  if (pgErrorCode(error) === "23505") {
    throw new ClientRuleError("duplicate_identification");
  }
  throw error;
}

const columns = {
  id: client.id,
  name: client.name,
  identificationType: client.identificationType,
  identificationNumber: client.identificationNumber,
  address: client.address,
  city: client.city,
  email: client.email,
  phone: client.phone,
  active: client.active,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
  createdBy: client.createdBy,
  updatedBy: client.updatedBy,
};

type Row = typeof client.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function toRecord(row: Row): ClientRecord {
  return {
    ...row,
    identificationType:
      row.identificationType as ClientRecord["identificationType"],
  };
}

async function audit(
  tx: Tx,
  actor: ClientActor,
  action: string,
  details: Record<string, unknown>,
) {
  // Details never hold contact data (email, phone, address): the trail is
  // append-only, so anything written here cannot be erased later.
  await tx.insert(auditLog).values({
    actorUserId: actor.id,
    action,
    targetUserId: null,
    details,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

function parse(raw: unknown): ClientInput {
  const result = validateClient(raw);
  if (!result.ok) throw new ClientValidationError(result.fieldErrors);
  return result.data;
}

export async function createClient(
  deps: ClientsDeps,
  actorInput: ClientActor | null | undefined,
  raw: unknown,
): Promise<{ id: string }> {
  const actor = authorize(actorInput, "create");
  const data = parse(raw);
  try {
    return await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(client)
        .values({ ...data, createdBy: actor.id, updatedBy: actor.id })
        .returning({ id: client.id });
      if (!created) throw new Error("client insert returned no row");
      await audit(tx, actor, "client.create", {
        clientId: created.id,
        name: data.name,
        identificationType: data.identificationType,
        identificationNumber: data.identificationNumber,
      });
      return created;
    });
  } catch (error) {
    return mapUniqueViolation(error);
  }
}

const COMPARED_FIELDS = [
  "name",
  "identificationType",
  "identificationNumber",
  "address",
  "city",
  "email",
  "phone",
] as const satisfies readonly (keyof ClientInput)[];

export async function updateClient(
  deps: ClientsDeps,
  actorInput: ClientActor | null | undefined,
  id: string,
  raw: unknown,
): Promise<void> {
  const actor = authorize(actorInput, "edit");
  const data = parse(raw);
  if (!UUID.test(id)) throw new ClientRuleError("not_found");
  try {
    await deps.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(client)
        .where(eq(client.id, id))
        .for("update");
      if (!current) throw new ClientRuleError("not_found");
      const changedFields = COMPARED_FIELDS.filter(
        (field) => current[field] !== data[field],
      );
      if (changedFields.length === 0) return;
      await tx
        .update(client)
        .set({ ...data, updatedBy: actor.id, updatedAt: sql`now()` })
        .where(eq(client.id, id));
      await audit(tx, actor, "client.update", {
        clientId: id,
        name: data.name,
        changedFields,
      });
    });
  } catch (error) {
    mapUniqueViolation(error);
  }
}

export async function setClientActive(
  deps: ClientsDeps,
  actorInput: ClientActor | null | undefined,
  id: string,
  active: boolean,
): Promise<void> {
  const actor = authorize(actorInput, active ? "reactivate" : "deactivate");
  if (!UUID.test(id)) throw new ClientRuleError("not_found");
  await deps.db.transaction(async (tx) => {
    const [current] = await tx
      .select({ name: client.name, active: client.active })
      .from(client)
      .where(eq(client.id, id))
      .for("update");
    if (!current) throw new ClientRuleError("not_found");
    if (current.active === active) return;
    await tx
      .update(client)
      .set({ active, updatedBy: actor.id, updatedAt: sql`now()` })
      .where(eq(client.id, id));
    await audit(tx, actor, active ? "client.activate" : "client.deactivate", {
      clientId: id,
      name: current.name,
    });
  });
}

export async function getClient(
  deps: ClientsDeps,
  actorInput: ClientActor | null | undefined,
  id: string,
): Promise<ClientRecord | null> {
  authorize(actorInput, "view");
  if (!UUID.test(id)) return null;
  const [row] = await deps.db
    .select(columns)
    .from(client)
    .where(eq(client.id, id))
    .limit(1);
  return row ? toRecord(row) : null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function listClients(
  deps: ClientsDeps,
  actorInput: ClientActor | null | undefined,
  filters: ClientFilters,
): Promise<{ items: ClientRecord[]; hasMore: boolean }> {
  authorize(actorInput, "view");
  const conditions: SQL[] = [];
  const q = (filters.q ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (q) {
    // Identification numbers are stored without separators, so the query is
    // also tried with them removed ("900.000.020-2" finds "9000000202").
    const digits = q.replace(/[\s.,-]/g, "").toUpperCase();
    const text = or(
      ilike(client.name, `%${escapeLike(q)}%`),
      digits
        ? ilike(client.identificationNumber, `%${escapeLike(digits)}%`)
        : undefined,
    );
    if (text) conditions.push(text);
  }
  if (filters.status === "active") conditions.push(eq(client.active, true));
  if (filters.status === "inactive") conditions.push(eq(client.active, false));

  const page = Math.max(1, Math.floor(filters.page ?? 1) || 1);
  const rows = await deps.db
    .select(columns)
    .from(client)
    .where(and(...conditions))
    .orderBy(asc(client.name), asc(client.id))
    .limit(CLIENTS_PAGE_SIZE + 1)
    .offset((page - 1) * CLIENTS_PAGE_SIZE);
  return {
    items: rows.slice(0, CLIENTS_PAGE_SIZE).map(toRecord),
    hasMore: rows.length > CLIENTS_PAGE_SIZE,
  };
}
