import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  updateActivity,
  type WorkActor,
  WorkRuleError,
  WorkValidationError,
} from "../../src/work/service.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

// Recorded work is personal: a colleague reaches only their own rows, an
// administrator reaches every row. Reports are built from these, so what is
// stored has to be exactly what somebody recorded. Synthetic data only.

const pool = createTestPool();
const auth = createTestAuth(pool);
const deps = { db: drizzle(pool, { schema }) };

let admin: WorkActor;
let staff: WorkActor;
let otherStaff: WorkActor;
let clientA: string;
let clientB: string;

const TABLES = "work_activity, client";

const base = {
  performedOn: "2026-10-01",
  startedAt: "08:30",
  endedAt: "12:00",
  title: "Mantenimiento de servidores",
  description: "Revisión de discos y actualización de parches.",
  outcome: "Servidores operativos.",
  status: "completed",
  nextSteps: "Programar revisión mensual.",
};

async function makeClient(name: string, identificationNumber: string) {
  const [row] = await deps.db
    .insert(schema.client)
    .values({
      name,
      identificationType: "NIT",
      identificationNumber,
      createdBy: admin.id,
      updatedBy: admin.id,
    })
    .returning({ id: schema.client.id });
  if (!row) throw new Error("client insert returned no row");
  return row.id;
}

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  await pool.query(`truncate table ${TABLES} cascade`);
  const a = await createTestUser(auth, "admin@example.test", { role: "admin" });
  const s = await createTestUser(auth, "staff@example.test", { role: "staff" });
  const o = await createTestUser(auth, "other@example.test", { role: "staff" });
  admin = {
    id: a.id,
    role: "admin",
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
  staff = { id: s.id, role: "staff", ipAddress: null, userAgent: null };
  otherStaff = { id: o.id, role: "staff", ipAddress: null, userAgent: null };
  clientA = await makeClient("Cliente A", "900111222");
  clientB = await makeClient("Cliente B", "900333444");
});

after(async () => {
  await pool.query(`truncate table ${TABLES} cascade`);
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WorkRuleError) return error.code;
    if (error instanceof WorkValidationError) return "validation";
    throw error;
  }
  return "no-error";
}

async function rowCount() {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from work_activity",
  );
  return rows[0]?.n ?? -1;
}

async function auditRows() {
  const { rows } = await pool.query(
    `select action, details from audit_log where action like 'work.%' order by id`,
  );
  return rows as { action: string; details: Record<string, unknown> }[];
}

// Every INSERT into audit_log for a work action fails while `run` executes.
// Same injection the client service tests use.
async function withAuditFault<T>(run: () => Promise<T>): Promise<T> {
  await pool.query(`create or replace function test_insert_fault() returns trigger
    language plpgsql as $$ begin
      if new.action like 'work.%' then raise exception 'injected fault'; end if;
      return new;
    end $$`);
  await pool.query(
    "create trigger test_insert_fault before insert on audit_log for each row execute function test_insert_fault()",
  );
  try {
    return await run();
  } finally {
    await pool.query("drop trigger if exists test_insert_fault on audit_log");
  }
}

describe("work activities", () => {
  it("stores and returns back every field that was recorded", async () => {
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
    });
    const saved = await getActivity(deps, staff, id);
    assert.ok(saved);
    assert.equal(saved.clientId, clientA);
    assert.equal(saved.clientName, "Cliente A");
    assert.equal(saved.performedOn, "2026-10-01");
    assert.equal(saved.startedAt, "08:30");
    assert.equal(saved.endedAt, "12:00");
    assert.equal(saved.title, base.title);
    assert.equal(saved.description, base.description);
    assert.equal(saved.outcome, base.outcome);
    assert.equal(saved.status, "completed");
    assert.equal(saved.nextSteps, base.nextSteps);
    assert.equal(saved.authorUserId, staff.id);
  });

  it("records work by the day when no hours are given", async () => {
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
      startedAt: "",
      endedAt: "",
    });
    const saved = await getActivity(deps, staff, id);
    assert.equal(saved?.startedAt, null);
    assert.equal(saved?.endedAt, null);
  });

  it("keeps a colleague out of work they did not record", async () => {
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
    });
    // Not told the row exists at all.
    assert.equal(await getActivity(deps, otherStaff, id), null);
    assert.equal(
      await code(
        updateActivity(deps, otherStaff, id, {
          ...base,
          clientId: clientA,
          title: "Otro",
        }),
      ),
      "not_found",
    );
    assert.equal(await code(deleteActivity(deps, otherStaff, id)), "not_found");
    const still = await getActivity(deps, staff, id);
    assert.equal(still?.title, base.title);
  });

  it("lets an administrator reach and correct anyone's work", async () => {
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
    });
    assert.ok(await getActivity(deps, admin, id));
    await updateActivity(deps, admin, id, {
      ...base,
      clientId: clientA,
      title: "Título corregido",
    });
    const saved = await getActivity(deps, admin, id);
    assert.equal(saved?.title, "Título corregido");
    // Correcting an entry does not take its authorship.
    assert.equal(saved?.authorUserId, staff.id);
  });

  it("refuses a caller without a session and writes nothing", async () => {
    assert.equal(
      await code(createActivity(deps, null, { ...base, clientId: clientA })),
      "unauthenticated",
    );
    assert.equal(
      await code(listActivities(deps, undefined)),
      "unauthenticated",
    );
    assert.equal(await rowCount(), 0);
    assert.deepEqual(await auditRows(), []);
  });

  it("refuses an unknown client", async () => {
    assert.equal(
      await code(
        createActivity(deps, staff, {
          ...base,
          clientId: "00000000-0000-4000-8000-000000000000",
        }),
      ),
      "client_not_found",
    );
    assert.equal(await rowCount(), 0);
  });

  it("rejects input the report could not stand on", async () => {
    const bad: Record<string, unknown>[] = [
      { title: "" },
      { title: "x".repeat(201) },
      { status: "archivada" },
      { status: "" },
      { performedOn: "2026-02-30" },
      { performedOn: "01/10/2026" },
      { startedAt: "12:00", endedAt: "08:00" },
      { startedAt: "08:00", endedAt: "" },
      { startedAt: "", endedAt: "12:00" },
      { startedAt: "25:00", endedAt: "26:00" },
      { description: "x".repeat(5001) },
      { outcome: "x".repeat(2001) },
      { nextSteps: "x".repeat(2001) },
    ];
    for (const patch of bad) {
      assert.equal(
        await code(
          createActivity(deps, staff, { ...base, clientId: clientA, ...patch }),
        ),
        "validation",
        `expected ${JSON.stringify(patch)} to be rejected`,
      );
    }
    assert.equal(await rowCount(), 0);
  });

  it("lists a colleague's own work only, newest day first", async () => {
    await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
      performedOn: "2026-10-01",
    });
    await createActivity(deps, staff, {
      ...base,
      clientId: clientB,
      performedOn: "2026-10-05",
    });
    await createActivity(deps, otherStaff, {
      ...base,
      clientId: clientA,
      performedOn: "2026-10-03",
    });

    const mine = await listActivities(deps, staff);
    assert.equal(mine.length, 2);
    assert.deepEqual(
      mine.map((row) => row.performedOn),
      ["2026-10-05", "2026-10-01"],
    );

    const all = await listActivities(deps, admin);
    assert.equal(all.length, 3);
  });

  it("filters by client and by date range", async () => {
    await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
      performedOn: "2026-10-01",
    });
    await createActivity(deps, staff, {
      ...base,
      clientId: clientB,
      performedOn: "2026-10-05",
    });

    const byClient = await listActivities(deps, staff, { clientId: clientA });
    assert.equal(byClient.length, 1);
    assert.equal(byClient[0]?.clientId, clientA);

    const byRange = await listActivities(deps, staff, {
      from: "2026-10-03",
      to: "2026-10-31",
    });
    assert.equal(byRange.length, 1);
    assert.equal(byRange[0]?.performedOn, "2026-10-05");
  });

  it("keeps a colleague scoped to their own work even when filtering", async () => {
    await createActivity(deps, otherStaff, { ...base, clientId: clientA });
    const mine = await listActivities(deps, staff, { clientId: clientA });
    assert.deepEqual(mine, []);
  });

  it("writes no audit row when nothing actually changed", async () => {
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
    });
    await updateActivity(deps, staff, id, { ...base, clientId: clientA });
    assert.deepEqual(
      (await auditRows()).map((row) => row.action),
      ["work.activity_create"],
    );
  });

  it("never puts what was written about a client in the audit trail", async () => {
    const secret = "El servidor contable guarda la nómina de la empresa.";
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
      description: secret,
    });
    await updateActivity(deps, staff, id, {
      ...base,
      clientId: clientA,
      description: `${secret} Ampliado.`,
      outcome: "Otro resultado.",
    });
    const serialized = JSON.stringify(await auditRows());
    assert.doesNotMatch(serialized, /nómina/i);
    assert.doesNotMatch(serialized, /Otro resultado/);
    // The field names are there, so the change is still traceable.
    assert.match(serialized, /description/);
    assert.match(serialized, /outcome/);
  });

  it("removes an entry its author no longer wants", async () => {
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
    });
    await deleteActivity(deps, staff, id);
    assert.equal(await rowCount(), 0);
    assert.equal((await auditRows()).at(-1)?.action, "work.activity_delete");
  });

  it("rolls the change back when the audit row cannot be written", async () => {
    const { id } = await createActivity(deps, staff, {
      ...base,
      clientId: clientA,
    });
    await withAuditFault(async () => {
      await assert.rejects(
        updateActivity(deps, staff, id, {
          ...base,
          clientId: clientA,
          title: "No debe quedar",
        }),
      );
    });
    const saved = await getActivity(deps, staff, id);
    assert.equal(saved?.title, base.title);
  });
});
