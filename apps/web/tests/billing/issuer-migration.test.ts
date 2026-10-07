import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { buildPoolConfig, closeDb, getPool } from "../../src/db/client.ts";
import { assertTestDatabase } from "../../src/db/test-guard.ts";
import { loadEnv } from "../../src/shared/config/env.ts";

// Migration 0006 (issuer profiles) on throwaway databases: a fresh one, and
// ones stopped at 0005 with synthetic data, then upgraded. Nothing here is
// real company data.

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));
const PREFIX = `hachisky_issuer_mig_${process.pid}`;
const created: string[] = [];
let counter = 0;

before(async () => {
  await assertTestDatabase(getPool());
});

after(async () => {
  for (const name of created) {
    await getPool().query(`drop database if exists "${name}"`);
  }
  await closeDb();
});

async function freshDatabase(): Promise<Pool> {
  counter += 1;
  const name = `${PREFIX}_${counter}`;
  await getPool().query(`drop database if exists "${name}"`);
  await getPool().query(`create database "${name}"`);
  created.push(name);
  return new Pool({ ...buildPoolConfig(loadEnv()), database: name, max: 2 });
}

// A copy of the migrations folder whose journal stops at `lastIdx`, so a
// database can be left exactly where an older deployment left it.
function migrationsUpTo(lastIdx: number): string {
  const dir = mkdtempSync(join(tmpdir(), "hachisky-migrations-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { idx: number }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

async function migrateTo(pool: Pool, lastIdx: number) {
  const dir = migrationsUpTo(lastIdx);
  try {
    await migrate(drizzle(pool), { migrationsFolder: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function migrateAll(pool: Pool) {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
}

async function tables(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  return rows.map((row) => row.table_name);
}

async function insertUser(pool: Pool, id: string) {
  await pool.query(
    `insert into "user" (id, name, email, role) values ($1, $2, $3, 'admin')`,
    [id, `Usuario ${id}`, `${id}@example.test`],
  );
}

async function insertImage(
  pool: Pool,
  values: {
    purpose: "issuer_logo" | "signature";
    signerId?: string;
    createdBy: string;
    createdAt: string;
  },
): Promise<string> {
  const data = randomBytes(64);
  const { rows } = await pool.query<{ id: string }>(
    `insert into billing_image
       (purpose, signer_profile_id, data, sha256, byte_size, width, height, created_at, created_by)
     values ($1, $2, $3, $4, $5, 10, 10, $6, $7) returning id`,
    [
      values.purpose,
      values.signerId ?? null,
      data,
      createHash("sha256").update(data).digest("hex"),
      data.length,
      values.createdAt,
      values.createdBy,
    ],
  );
  const id = rows[0]?.id;
  assert.ok(id);
  return id;
}

async function insertAccount(pool: Pool, userId: string, number: string) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into bank_account
       (bank_name, account_type, account_number, holder_name,
        holder_identification_type, holder_identification_number, currency,
        created_by, updated_by)
     values ('Banco Demo', 'ahorros', $1, 'Titular Demo', 'CC', '1000000001',
             'COP', $2, $2) returning id`,
    [number, userId],
  );
  const id = rows[0]?.id;
  assert.ok(id);
  return id;
}

// Everything that identifies an image version, including a hash of the bytes
// computed by Postgres (not by the application).
async function imageSnapshot(pool: Pool) {
  const { rows } = await pool.query(
    `select id, purpose, signer_profile_id, sha256,
            encode(sha256(data), 'hex') as data_hash, byte_size, width, height,
            created_at, created_by
       from billing_image order by id`,
  );
  return rows;
}

async function auditSnapshot(pool: Pool) {
  const { rows } = await pool.query("select * from audit_log order by id");
  return rows;
}

async function signerSnapshot(pool: Pool) {
  const { rows } = await pool.query("select * from signer_profile order by id");
  return rows;
}

describe("migration 0006 on a fresh database", () => {
  it("creates issuer_profile and issuer_logo, links bank accounts and drops issuer_settings", async () => {
    const pool = await freshDatabase();
    try {
      await migrateAll(pool);
      const names = await tables(pool);
      assert.ok(names.includes("issuer_profile"), names.join());
      assert.ok(names.includes("issuer_logo"), names.join());
      assert.ok(!names.includes("issuer_settings"), names.join());
      const { rows } = await pool.query<{ is_nullable: string }>(
        `select is_nullable from information_schema.columns
          where table_name = 'bank_account' and column_name = 'issuer_profile_id'`,
      );
      assert.deepEqual(rows, [{ is_nullable: "YES" }]);
      assert.equal(
        (await pool.query("select * from issuer_profile")).rowCount,
        0,
      );
    } finally {
      await pool.end();
    }
  });
});

describe("migration 0006 on a database with an issuer", () => {
  it("copies the issuer as the default profile and keeps logos, signer, accounts and audit intact", async () => {
    const pool = await freshDatabase();
    try {
      await migrateTo(pool, 5);
      await insertUser(pool, "creator");
      await insertUser(pool, "editor");
      const firstLogo = await insertImage(pool, {
        purpose: "issuer_logo",
        createdBy: "creator",
        createdAt: "2026-09-01T10:00:00Z",
      });
      const secondLogo = await insertImage(pool, {
        purpose: "issuer_logo",
        createdBy: "editor",
        createdAt: "2026-09-02T10:00:00Z",
      });
      await pool.query(
        `insert into issuer_settings
           (id, legal_name, identification_type, identification_number,
            address, city, phone, email, payment_terms, logo_image_id,
            created_at, updated_at, created_by, updated_by)
         values (1, 'Emisor Demo S.A.S.', 'NIT', '9000000022',
                 'Calle Falsa 123', 'Ciudad Demo', '3000000000',
                 'emisor@example.test', E'Pago a 30 días.\nSin descuentos.',
                 $1, '2026-08-01T08:00:00Z', '2026-09-03T09:30:00Z',
                 'creator', 'editor')`,
        [secondLogo],
      );
      const { rows: signerRows } = await pool.query<{ id: string }>(
        `insert into signer_profile
           (full_name, identification_type, identification_number, job_title,
            email, created_by, updated_by)
         values ('Firmante Demo', 'CC', '1000000009', 'Representante legal',
                 'firmante@example.test', 'creator', 'creator') returning id`,
      );
      const signerId = signerRows[0]?.id;
      assert.ok(signerId);
      const signature = await insertImage(pool, {
        purpose: "signature",
        signerId,
        createdBy: "creator",
        createdAt: "2026-09-04T10:00:00Z",
      });
      await pool.query(
        "update signer_profile set current_signature_image_id = $1 where id = $2",
        [signature, signerId],
      );
      const accountA = await insertAccount(pool, "creator", "000111222");
      const accountB = await insertAccount(pool, "editor", "000333444");
      await pool.query(
        `insert into audit_log (actor_user_id, action, details)
         values ('creator', 'billing.issuer_configure', '{"changedFields":["legalName"]}'),
                ('editor', 'billing.issuer_logo_upload', $1)`,
        [JSON.stringify({ imageId: secondLogo })],
      );

      const imagesBefore = await imageSnapshot(pool);
      const auditBefore = await auditSnapshot(pool);
      const signersBefore = await signerSnapshot(pool);

      await migrateAll(pool);

      const { rows: profiles } = await pool.query(
        "select * from issuer_profile",
      );
      assert.equal(profiles.length, 1);
      const profile = profiles[0];
      assert.ok(profile);
      assert.equal(profile.legal_name, "Emisor Demo S.A.S.");
      assert.equal(profile.identification_type, "NIT");
      assert.equal(profile.identification_number, "9000000022");
      assert.equal(profile.address, "Calle Falsa 123");
      assert.equal(profile.city, "Ciudad Demo");
      assert.equal(profile.phone, "3000000000");
      assert.equal(profile.email, "emisor@example.test");
      assert.equal(profile.payment_terms, "Pago a 30 días.\nSin descuentos.");
      assert.equal(profile.active, true);
      assert.equal(profile.is_default, true);
      assert.equal(profile.current_logo_image_id, secondLogo);
      assert.equal(
        profile.created_at.toISOString(),
        "2026-08-01T08:00:00.000Z",
      );
      assert.equal(
        profile.updated_at.toISOString(),
        "2026-09-03T09:30:00.000Z",
      );
      assert.equal(profile.created_by, "creator");
      assert.equal(profile.updated_by, "editor");

      const { rows: owned } = await pool.query(
        "select image_id, issuer_profile_id from issuer_logo order by image_id",
      );
      assert.deepEqual(
        owned,
        [firstLogo, secondLogo]
          .sort()
          .map((id) => ({ image_id: id, issuer_profile_id: profile.id })),
      );

      const { rows: accounts } = await pool.query(
        "select id, issuer_profile_id from bank_account order by id",
      );
      assert.deepEqual(
        accounts,
        [accountA, accountB]
          .sort()
          .map((id) => ({ id, issuer_profile_id: profile.id })),
      );

      assert.deepEqual(await imageSnapshot(pool), imagesBefore);
      assert.deepEqual(await auditSnapshot(pool), auditBefore);
      assert.deepEqual(await signerSnapshot(pool), signersBefore);
      assert.ok(!(await tables(pool)).includes("issuer_settings"));
    } finally {
      await pool.end();
    }
  });

  it("copies an issuer without a logo and leaves its current logo empty", async () => {
    const pool = await freshDatabase();
    try {
      await migrateTo(pool, 5);
      await insertUser(pool, "creator");
      await pool.query(
        `insert into issuer_settings
           (id, legal_name, identification_type, identification_number,
            address, city, created_by, updated_by)
         values (1, 'Emisor Demo S.A.S.', 'NIT', '9000000022',
                 'Calle Falsa 123', 'Ciudad Demo', 'creator', 'creator')`,
      );
      await migrateAll(pool);
      const { rows } = await pool.query(
        "select current_logo_image_id, is_default, active, phone, email, payment_terms from issuer_profile",
      );
      assert.deepEqual(rows, [
        {
          current_logo_image_id: null,
          is_default: true,
          active: true,
          phone: null,
          email: null,
          payment_terms: null,
        },
      ]);
      assert.equal((await pool.query("select * from issuer_logo")).rowCount, 0);
    } finally {
      await pool.end();
    }
  });
});

describe("migration 0006 on a database without an issuer", () => {
  it("invents no profile: accounts stay unassigned and stray logos stay unowned", async () => {
    const pool = await freshDatabase();
    try {
      await migrateTo(pool, 5);
      await insertUser(pool, "creator");
      await insertImage(pool, {
        purpose: "issuer_logo",
        createdBy: "creator",
        createdAt: "2026-09-01T10:00:00Z",
      });
      await insertAccount(pool, "creator", "000111222");
      await insertAccount(pool, "creator", "000333444");
      const imagesBefore = await imageSnapshot(pool);

      await migrateAll(pool);

      assert.equal(
        (await pool.query("select * from issuer_profile")).rowCount,
        0,
      );
      assert.equal((await pool.query("select * from issuer_logo")).rowCount, 0);
      const { rows } = await pool.query(
        "select issuer_profile_id from bank_account",
      );
      assert.deepEqual(rows, [
        { issuer_profile_id: null },
        { issuer_profile_id: null },
      ]);
      assert.deepEqual(await imageSnapshot(pool), imagesBefore);
    } finally {
      await pool.end();
    }
  });
});
