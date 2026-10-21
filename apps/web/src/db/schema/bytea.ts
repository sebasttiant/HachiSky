import { customType } from "drizzle-orm/pg-core";

// node-postgres reads and writes bytea as a Buffer.
//
// Shared because more than one module stores validated images: billing keeps
// a signature and an issuer logo, reports keep their figures. The bytes all
// come out of src/images/pipeline.ts.
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});
