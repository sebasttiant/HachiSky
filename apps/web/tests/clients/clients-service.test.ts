import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  CLIENTS_PAGE_SIZE,
  type ClientActor,
  ClientRuleError,
  ClientValidationError,
  createClient,
  getClient,
  listClients,
  setClientActive,
  updateClient,
} from "../../src/clients/service.ts";
import { closeDb, getPool } from "../../src/db/client.ts";
import { runMigrations } from "../../src/db/migrate.ts";
import * as schema from "../../src/db/schema/index.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import {
  cleanAuthTables,
  createTestAuth,
  createTestPool,
  createTestUser,
} from "../auth/support.ts";

const pool = createTestPool();
const auth = createTestAuth(pool);
const db = drizzle(pool, { schema });
const deps = { db };

let actor: ClientActor;
let otherActor: ClientActor;

const acme = {
  name: "Cliente Demo S.A.S.",
  identificationType: "NIT",
  identificationNumber: "900.000.001-1",
  address: "Calle Falsa 123",
  city: "Ciudad Demo",
  email: "contacto@example.test",
  phone: "+57 300 000 0000",
};

before(async () => {
  await assertTestDatabase(getPool());
  await runMigrations();
});

beforeEach(async () => {
  await cleanAuthTables(pool);
  const admin = await createTestUser(auth, "admin@example.test", {
    role: "admin",
  });
  const staff = await createTestUser(auth, "staff@example.test", {
    role: "staff",
  });
  actor = {
    id: admin.id,
    role: "admin",
    ipAddress: "203.0.113.7",
    userAgent: "node-test",
  };
  otherActor = {
    id: staff.id,
    role: "staff",
    ipAddress: null,
    userAgent: null,
  };
});

after(async () => {
  await cleanAuthTables(pool);
  await pool.end();
  await closeDb();
});

async function auditRows(action?: string) {
  const { rows } = await pool.query(
    `select actor_user_id, action, target_user_id, details, ip_address, user_agent
       from audit_log where action like 'client.%' ${action ? "and action = $1" : ""} order by id`,
    action ? [action] : [],
  );
  return rows;
}

async function clientCount() {
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from client",
  );
  return rows[0]?.n ?? -1;
}

async function ruleCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ClientRuleError) return error.code;
    throw error;
  }
  return "no-error";
}

// Every INSERT into audit_log for a client action fails while `run` executes.
async function withAuditFault<T>(run: () => Promise<T>): Promise<T> {
  await pool.query(`create or replace function test_insert_fault() returns trigger
    language plpgsql as $$ begin
      if new.action like 'client.%' then raise exception 'injected fault'; end if;
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

describe("createClient", () => {
  it("persists a normalized, active client with its creator and audits it", async () => {
    const { id } = await createClient(deps, actor, acme);
    const stored = await getClient(deps, actor, id);
    assert.ok(stored);
    assert.equal(stored.name, "Cliente Demo S.A.S.");
    assert.equal(stored.identificationType, "NIT");
    assert.equal(stored.identificationNumber, "9000000011");
    assert.equal(stored.city, "Ciudad Demo");
    assert.equal(stored.active, true);
    assert.equal(stored.createdBy, actor.id);
    assert.equal(stored.updatedBy, actor.id);
    assert.ok(stored.createdAt instanceof Date);

    const rows = await auditRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, "client.create");
    assert.equal(rows[0].actor_user_id, actor.id);
    assert.equal(rows[0].target_user_id, null);
    assert.equal(rows[0].ip_address, "203.0.113.7");
    assert.equal(rows[0].user_agent, "node-test");
    assert.deepEqual(rows[0].details, {
      clientId: id,
      name: "Cliente Demo S.A.S.",
      identificationType: "NIT",
      identificationNumber: "9000000011",
    });
  });

  it("stores optional fields as null", async () => {
    const { id } = await createClient(deps, actor, {
      name: "Persona Demo",
      identificationType: "CC",
      identificationNumber: "1000000001",
    });
    const stored = await getClient(deps, actor, id);
    assert.deepEqual(
      [stored?.address, stored?.city, stored?.email, stored?.phone],
      [null, null, null, null],
    );
  });

  it("rejects invalid input with field errors, saving and auditing nothing", async () => {
    await assert.rejects(
      createClient(deps, actor, {
        name: " ",
        identificationType: "NIT",
        identificationNumber: "",
      }),
      (error: unknown) =>
        error instanceof ClientValidationError &&
        error.fieldErrors.name === "Escribe el nombre o razón social." &&
        error.fieldErrors.identificationNumber ===
          "Escribe el número de identificación.",
    );
    assert.equal(await clientCount(), 0);
    assert.deepEqual(await auditRows(), []);
  });

  it("rejects a duplicate identification even when written with other separators", async () => {
    await createClient(deps, actor, acme);
    const code = await ruleCode(
      createClient(deps, otherActor, {
        ...acme,
        name: "Otro Nombre",
        identificationNumber: "900000001 1",
      }),
    );
    assert.equal(code, "duplicate_identification");
    assert.equal(await clientCount(), 1);
    assert.equal((await auditRows()).length, 1);
  });

  it("allows the same number under another identification type", async () => {
    await createClient(deps, actor, acme);
    await createClient(deps, actor, {
      name: "Persona Demo",
      identificationType: "CC",
      identificationNumber: "9000000011",
    });
    assert.equal(await clientCount(), 2);
  });

  it("rejects the duplicate of an inactive client too", async () => {
    const { id } = await createClient(deps, actor, acme);
    await setClientActive(deps, actor, id, false);
    assert.equal(
      await ruleCode(createClient(deps, actor, acme)),
      "duplicate_identification",
    );
  });

  it("lets exactly one of two concurrent identical creations win", async () => {
    const results = await Promise.allSettled([
      createClient(deps, actor, acme),
      createClient(deps, otherActor, acme),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const loser = results.find((r) => r.status === "rejected");
    assert.ok(
      loser?.status === "rejected" && loser.reason instanceof ClientRuleError,
    );
    assert.equal(await clientCount(), 1);
    assert.equal((await auditRows("client.create")).length, 1);
  });

  it("saves nothing when the audit row cannot be written", async () => {
    await assert.rejects(withAuditFault(() => createClient(deps, actor, acme)));
    assert.equal(await clientCount(), 0);
  });
});

describe("updateClient", () => {
  it("updates the fields, the updater and the timestamp, and audits what changed", async () => {
    const { id } = await createClient(deps, actor, acme);
    const before = await getClient(deps, actor, id);
    await updateClient(deps, otherActor, id, {
      ...acme,
      name: "Cliente Demo Renombrado",
      city: "Otra Ciudad",
    });
    const after = await getClient(deps, actor, id);
    assert.equal(after?.name, "Cliente Demo Renombrado");
    assert.equal(after?.city, "Otra Ciudad");
    assert.equal(after?.createdBy, actor.id);
    assert.equal(after?.updatedBy, otherActor.id);
    assert.ok(before && after && after.updatedAt > before.updatedAt);

    const rows = await auditRows("client.update");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].actor_user_id, otherActor.id);
    assert.deepEqual(rows[0].details, {
      clientId: id,
      name: "Cliente Demo Renombrado",
      changedFields: ["name", "city"],
    });
  });

  it("does not record contact data in the audit trail", async () => {
    const { id } = await createClient(deps, actor, acme);
    await updateClient(deps, actor, id, {
      ...acme,
      email: "nuevo@example.test",
      phone: "+57 301 111 1111",
      address: "Avenida Falsa 1",
    });
    const [row] = await auditRows("client.update");
    assert.deepEqual(row.details.changedFields, ["address", "email", "phone"]);
    assert.doesNotMatch(
      JSON.stringify(row.details),
      /nuevo@example|301 111|Avenida/,
    );
  });

  it("changes nothing and writes no audit row when nothing differs", async () => {
    const { id } = await createClient(deps, actor, acme);
    const before = await getClient(deps, actor, id);
    await updateClient(deps, otherActor, id, {
      ...acme,
      identificationNumber: "9000000011",
    });
    const after = await getClient(deps, actor, id);
    assert.deepEqual(after, before);
    assert.equal((await auditRows("client.update")).length, 0);
  });

  it("rejects invalid input and an unknown client", async () => {
    const { id } = await createClient(deps, actor, acme);
    await assert.rejects(
      updateClient(deps, actor, id, { ...acme, email: "nope" }),
      (error: unknown) =>
        error instanceof ClientValidationError &&
        error.fieldErrors.email === "Escribe un correo válido.",
    );
    assert.equal(
      (await getClient(deps, actor, id))?.email,
      "contacto@example.test",
    );
    assert.equal(
      await ruleCode(
        updateClient(deps, actor, "11111111-1111-4111-8111-111111111111", acme),
      ),
      "not_found",
    );
    assert.equal(
      await ruleCode(updateClient(deps, actor, "not-a-uuid", acme)),
      "not_found",
    );
  });

  it("refuses to take another client's identification, leaving both untouched", async () => {
    await createClient(deps, actor, acme);
    const { id } = await createClient(deps, actor, {
      name: "Persona Demo",
      identificationType: "CC",
      identificationNumber: "1000000001",
    });
    const code = await ruleCode(
      updateClient(deps, actor, id, {
        name: "Persona Demo",
        identificationType: "NIT",
        identificationNumber: "900000001-1",
      }),
    );
    assert.equal(code, "duplicate_identification");
    const stored = await getClient(deps, actor, id);
    assert.equal(stored?.identificationType, "CC");
    assert.equal((await auditRows("client.update")).length, 0);
  });

  it("applies nothing when the audit row cannot be written", async () => {
    const { id } = await createClient(deps, actor, acme);
    await assert.rejects(
      withAuditFault(() =>
        updateClient(deps, actor, id, { ...acme, name: "Otro" }),
      ),
    );
    assert.equal(
      (await getClient(deps, actor, id))?.name,
      "Cliente Demo S.A.S.",
    );
  });
});

describe("setClientActive", () => {
  it("deactivates and reactivates with an audit row each, keeping the record", async () => {
    const { id } = await createClient(deps, actor, acme);
    await setClientActive(deps, actor, id, false);
    const inactive = await getClient(deps, actor, id);
    assert.equal(inactive?.active, false);
    assert.equal(inactive?.updatedBy, actor.id);
    await setClientActive(deps, actor, id, true);
    assert.equal((await getClient(deps, actor, id))?.active, true);
    assert.deepEqual(
      (await auditRows()).map((row) => row.action),
      ["client.create", "client.deactivate", "client.activate"],
    );
    assert.deepEqual((await auditRows("client.deactivate"))[0].details, {
      clientId: id,
      name: "Cliente Demo S.A.S.",
    });
  });

  it("is a no-op without audit when the client is already in that state", async () => {
    const { id } = await createClient(deps, actor, acme);
    await setClientActive(deps, actor, id, true);
    assert.equal((await auditRows()).length, 1);
  });

  it("answers not_found for an unknown id", async () => {
    assert.equal(
      await ruleCode(
        setClientActive(
          deps,
          actor,
          "11111111-1111-4111-8111-111111111111",
          false,
        ),
      ),
      "not_found",
    );
  });

  it("keeps the state when the audit row cannot be written", async () => {
    const { id } = await createClient(deps, actor, acme);
    await assert.rejects(
      withAuditFault(() => setClientActive(deps, actor, id, false)),
    );
    assert.equal((await getClient(deps, actor, id))?.active, true);
  });
});

describe("clients are never deleted", () => {
  it("offers no delete operation and the database keeps referenced users", async () => {
    const service = await import("../../src/clients/service.ts");
    assert.deepEqual(
      Object.keys(service).filter((name) => /delete|remove/i.test(name)),
      [],
    );
    await createClient(deps, actor, acme);
    await assert.rejects(
      pool.query('delete from "user" where id = $1', [actor.id]),
      {
        code: "23001",
      },
    );
  });
});

describe("listClients", () => {
  async function seed() {
    const entries = [
      {
        name: "Alfa Demo Ltda.",
        identificationType: "NIT",
        identificationNumber: "900000010-1",
      },
      {
        name: "Beta Demo S.A.S.",
        identificationType: "NIT",
        identificationNumber: "900000020-2",
      },
      {
        name: "Gamma Persona",
        identificationType: "CC",
        identificationNumber: "1000000003",
      },
    ];
    const ids: string[] = [];
    for (const entry of entries)
      ids.push((await createClient(deps, actor, entry)).id);
    return ids;
  }

  it("lists clients ordered by name, all statuses when none is given", async () => {
    await seed();
    const { items, hasMore } = await listClients(deps, actor, {});
    assert.deepEqual(
      items.map((c) => c.name),
      ["Alfa Demo Ltda.", "Beta Demo S.A.S.", "Gamma Persona"],
    );
    assert.equal(hasMore, false);
  });

  it("searches by name, case-insensitively and by fragment", async () => {
    await seed();
    assert.deepEqual(
      (await listClients(deps, actor, { q: "demo" })).items.map((c) => c.name),
      ["Alfa Demo Ltda.", "Beta Demo S.A.S."],
    );
    assert.deepEqual(
      (await listClients(deps, actor, { q: "GAMMA" })).items.map((c) => c.name),
      ["Gamma Persona"],
    );
  });

  it("searches by identification number, with or without separators", async () => {
    await seed();
    assert.deepEqual(
      (await listClients(deps, actor, { q: "900.000.020-2" })).items.map(
        (c) => c.name,
      ),
      ["Beta Demo S.A.S."],
    );
    assert.deepEqual(
      (await listClients(deps, actor, { q: "1000000" })).items.map(
        (c) => c.name,
      ),
      ["Gamma Persona"],
    );
  });

  it("treats LIKE wildcards in the query literally", async () => {
    await seed();
    assert.equal((await listClients(deps, actor, { q: "%" })).items.length, 0);
    assert.equal((await listClients(deps, actor, { q: "_" })).items.length, 0);
  });

  it("separates active from inactive clients", async () => {
    const [alfa] = await seed();
    await setClientActive(deps, actor, alfa ?? "", false);
    assert.deepEqual(
      (await listClients(deps, actor, { status: "active" })).items.map(
        (c) => c.name,
      ),
      ["Beta Demo S.A.S.", "Gamma Persona"],
    );
    assert.deepEqual(
      (await listClients(deps, actor, { status: "inactive" })).items.map(
        (c) => c.name,
      ),
      ["Alfa Demo Ltda."],
    );
    assert.equal((await listClients(deps, actor, {})).items.length, 3);
  });

  it("paginates with a stable order and reports whether more pages exist", async () => {
    for (let i = 0; i < CLIENTS_PAGE_SIZE + 2; i += 1) {
      await createClient(deps, actor, {
        name: `Cliente ${String(i).padStart(3, "0")}`,
        identificationType: "CC",
        identificationNumber: String(2_000_000 + i),
      });
    }
    const first = await listClients(deps, actor, { page: 1 });
    assert.equal(first.items.length, CLIENTS_PAGE_SIZE);
    assert.equal(first.hasMore, true);
    assert.equal(first.items[0]?.name, "Cliente 000");
    const second = await listClients(deps, actor, { page: 2 });
    assert.deepEqual(
      second.items.map((c) => c.name),
      [
        `Cliente ${String(CLIENTS_PAGE_SIZE).padStart(3, "0")}`,
        `Cliente ${String(CLIENTS_PAGE_SIZE + 1).padStart(3, "0")}`,
      ],
    );
    assert.equal(second.hasMore, false);
    assert.equal(
      (await listClients(deps, actor, { page: 0 })).items.length,
      CLIENTS_PAGE_SIZE,
    );
  });
});

describe("getClient", () => {
  it("returns null for an unknown or malformed id", async () => {
    assert.equal(
      await getClient(deps, actor, "11111111-1111-4111-8111-111111111111"),
      null,
    );
    assert.equal(await getClient(deps, actor, "not-a-uuid"), null);
  });
});

describe("permissions", () => {
  const unknownId = "11111111-1111-4111-8111-111111111111";

  it("lets staff view, search, create and edit", async () => {
    const { id } = await createClient(deps, otherActor, acme);
    assert.equal((await getClient(deps, otherActor, id))?.name, acme.name);
    assert.equal(
      (await listClients(deps, otherActor, { q: "demo" })).items.length,
      1,
    );
    await updateClient(deps, otherActor, id, { ...acme, city: "Otra Ciudad" });
    assert.equal((await getClient(deps, actor, id))?.city, "Otra Ciudad");
  });

  it("refuses staff deactivation without changing state or auditing", async () => {
    const { id } = await createClient(deps, actor, acme);
    assert.equal(
      await ruleCode(setClientActive(deps, otherActor, id, false)),
      "forbidden",
    );
    assert.equal((await getClient(deps, actor, id))?.active, true);
    assert.deepEqual(
      (await auditRows()).map((row) => row.action),
      ["client.create"],
    );
  });

  it("refuses staff reactivation without changing state or auditing", async () => {
    const { id } = await createClient(deps, actor, acme);
    await setClientActive(deps, actor, id, false);
    assert.equal(
      await ruleCode(setClientActive(deps, otherActor, id, true)),
      "forbidden",
    );
    const stored = await getClient(deps, actor, id);
    assert.equal(stored?.active, false);
    assert.equal(stored?.updatedBy, actor.id);
    assert.deepEqual(
      (await auditRows()).map((row) => row.action),
      ["client.create", "client.deactivate"],
    );
  });

  it("checks the permission before the client exists or the input is valid", async () => {
    assert.equal(
      await ruleCode(setClientActive(deps, otherActor, unknownId, false)),
      "forbidden",
    );
    assert.equal(
      await ruleCode(setClientActive(deps, otherActor, "not-a-uuid", true)),
      "forbidden",
    );
  });

  it("refuses every operation without a session", async () => {
    const { id } = await createClient(deps, actor, acme);
    const before = await getClient(deps, actor, id);
    const none = null as unknown as ClientActor;
    const undef = undefined as unknown as ClientActor;
    for (const missing of [none, undef]) {
      assert.equal(
        await ruleCode(
          createClient(deps, missing, {
            ...acme,
            identificationNumber: "123456",
          }),
        ),
        "unauthenticated",
      );
      assert.equal(
        await ruleCode(
          updateClient(deps, missing, id, { ...acme, name: "Otro" }),
        ),
        "unauthenticated",
      );
      assert.equal(
        await ruleCode(setClientActive(deps, missing, id, false)),
        "unauthenticated",
      );
      assert.equal(
        await ruleCode(setClientActive(deps, missing, id, true)),
        "unauthenticated",
      );
      assert.equal(
        await ruleCode(listClients(deps, missing, {})),
        "unauthenticated",
      );
      assert.equal(
        await ruleCode(getClient(deps, missing, id)),
        "unauthenticated",
      );
    }
    assert.deepEqual(await getClient(deps, actor, id), before);
    assert.equal(await clientCount(), 1);
    assert.equal((await auditRows()).length, 1);
  });

  it("refuses an actor whose role is not a known role", async () => {
    const { id } = await createClient(deps, actor, acme);
    for (const role of ["guest", "", undefined, "ADMIN"]) {
      const forged = { ...actor, role } as unknown as ClientActor;
      assert.equal(await ruleCode(listClients(deps, forged, {})), "forbidden");
      assert.equal(await ruleCode(getClient(deps, forged, id)), "forbidden");
      assert.equal(
        await ruleCode(
          createClient(deps, forged, {
            ...acme,
            identificationNumber: "123456",
          }),
        ),
        "forbidden",
      );
      assert.equal(
        await ruleCode(
          updateClient(deps, forged, id, { ...acme, name: "Otro" }),
        ),
        "forbidden",
      );
      assert.equal(
        await ruleCode(setClientActive(deps, forged, id, false)),
        "forbidden",
      );
    }
    assert.equal((await getClient(deps, actor, id))?.active, true);
    assert.equal((await auditRows()).length, 1);
  });

  it("keeps the permission matrix in one place", async () => {
    const { CLIENT_PERMISSIONS } = await import(
      "../../src/clients/permissions.ts"
    );
    assert.deepEqual(CLIENT_PERMISSIONS, {
      view: ["admin", "staff"],
      create: ["admin", "staff"],
      edit: ["admin", "staff"],
      deactivate: ["admin"],
      reactivate: ["admin"],
    });
  });
});
