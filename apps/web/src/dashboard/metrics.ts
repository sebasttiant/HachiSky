import { count, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { RoleName } from "../auth/session.ts";
import type { Currency } from "../billing/validation.ts";
import * as schema from "../db/schema/index.ts";

// Every number here is read from a table. Nothing is estimated, and modules
// whose screens are still a preview with sample data contribute no metric,
// because they store nothing real.

export type DashboardDb = NodePgDatabase<typeof schema>;

export interface DashboardDeps {
  db: DashboardDb;
}

export interface DashboardActor {
  id: string;
  role: RoleName;
}

export type DashboardRuleCode = "unauthenticated" | "forbidden";

export class DashboardRuleError extends Error {
  readonly code: DashboardRuleCode;
  constructor(code: DashboardRuleCode) {
    super(code);
    this.name = "DashboardRuleError";
    this.code = code;
  }
}

export interface CurrencyTotal {
  currency: Currency;
  totalMinor: number;
}

export interface DashboardMetrics {
  clients: { active: number; total: number };
  drafts: { count: number; totals: CurrencyTotal[] };
  team: { total: number };
  billingSetup: {
    issuers: number;
    signers: number;
    bankAccounts: number;
    declarations: number;
  };
}

function authorize(actor: DashboardActor | null | undefined): DashboardActor {
  if (!actor || typeof actor.id !== "string" || actor.id === "") {
    throw new DashboardRuleError("unauthenticated");
  }
  // The application defines exactly two roles; `admin` is the top one.
  if (actor.role !== "admin") throw new DashboardRuleError("forbidden");
  return actor;
}

export async function getDashboardMetrics(
  deps: DashboardDeps,
  actorInput: DashboardActor | null | undefined,
): Promise<DashboardMetrics> {
  authorize(actorInput);
  const { db } = deps;

  const [
    clientsTotal,
    clientsActive,
    draftsCount,
    teamTotal,
    issuers,
    signers,
    bankAccounts,
    declarations,
    draftTotals,
  ] = await Promise.all([
    db.select({ value: count() }).from(schema.client),
    db
      .select({ value: count() })
      .from(schema.client)
      .where(eq(schema.client.active, true)),
    db
      .select({ value: count() })
      .from(schema.billingDocument)
      .where(eq(schema.billingDocument.status, "draft")),
    db.select({ value: count() }).from(schema.user),
    db
      .select({ value: count() })
      .from(schema.issuerProfile)
      .where(eq(schema.issuerProfile.active, true)),
    db
      .select({ value: count() })
      .from(schema.signerProfile)
      .where(eq(schema.signerProfile.active, true)),
    db
      .select({ value: count() })
      .from(schema.bankAccount)
      .where(eq(schema.bankAccount.active, true)),
    db
      .select({ value: count() })
      .from(schema.declarationText)
      .where(eq(schema.declarationText.active, true)),
    // COP and USD are never added together: the sum is grouped by currency and
    // stays in each currency's minor units.
    db
      .select({
        currency: schema.billingDocument.currency,
        totalMinor: sql<string>`coalesce(sum(${schema.billingDocumentLine.amountMinor}), 0)`,
      })
      .from(schema.billingDocument)
      .leftJoin(
        schema.billingDocumentLine,
        eq(schema.billingDocumentLine.documentId, schema.billingDocument.id),
      )
      .where(eq(schema.billingDocument.status, "draft"))
      .groupBy(schema.billingDocument.currency),
  ]);

  return {
    clients: {
      total: clientsTotal[0]?.value ?? 0,
      active: clientsActive[0]?.value ?? 0,
    },
    drafts: {
      count: draftsCount[0]?.value ?? 0,
      totals: draftTotals.map((row) => ({
        currency: row.currency as Currency,
        totalMinor: Number(row.totalMinor),
      })),
    },
    team: { total: teamTotal[0]?.value ?? 0 },
    billingSetup: {
      issuers: issuers[0]?.value ?? 0,
      signers: signers[0]?.value ?? 0,
      bankAccounts: bankAccounts[0]?.value ?? 0,
      declarations: declarations[0]?.value ?? 0,
    },
  };
}
