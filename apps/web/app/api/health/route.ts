import { NextResponse } from "next/server";
import { getPool } from "../../../src/db/client.ts";
import { checkDatabaseHealth } from "../../../src/db/health.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await checkDatabaseHealth((sql) => getPool().query(sql));
  if (result.failure) {
    // Log a fixed message with only the failure category: never the raw
    // error, which may embed connection details or SQL error text.
    console.error(`Health check failed: ${result.failure}`);
  }
  return NextResponse.json(result.body, { status: result.httpStatus });
}
