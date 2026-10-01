import { z } from "zod";
import { ROLE_NAMES } from "../auth/access-control.ts";
import type { CreateUserInput, UpdateUserInput } from "./service.ts";

// Validation of the admin panel forms. Messages are shown next to each field.

export const TEMPORARY_PASSWORD_MIN = 12;

const name = z
  .string({ error: "Escribe el nombre completo." })
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, { error: "Escribe el nombre completo." })
      .max(200, { error: "El nombre es demasiado largo." }),
  );

const email = z
  .string({ error: "Escribe un correo válido." })
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email({ error: "Escribe un correo válido." }).max(254));

const jobTitle = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " ") || null)
  .pipe(
    z.string().max(100, { error: "El cargo es demasiado largo." }).nullable(),
  );

const role = z.enum(ROLE_NAMES as [string, ...string[]], {
  error: "Elige un rol.",
});

const temporaryPassword = z
  .string({ error: "Escribe una contraseña temporal." })
  .min(TEMPORARY_PASSWORD_MIN, {
    error: `La contraseña temporal debe tener al menos ${TEMPORARY_PASSWORD_MIN} caracteres.`,
  })
  .max(128, { error: "La contraseña es demasiado larga." });

const createSchema = z.object({
  name,
  email,
  jobTitle,
  role,
  temporaryPassword,
});
const updateSchema = z.object({ name, jobTitle, role });
const resetSchema = z.object({ temporaryPassword });

const changeSchema = z
  .object({
    currentPassword: z
      .string({ error: "Escribe tu contraseña actual." })
      .min(1, { error: "Escribe tu contraseña actual." })
      .max(128, { error: "La contraseña es demasiado larga." }),
    newPassword: z
      .string({ error: "Escribe la nueva contraseña." })
      .min(TEMPORARY_PASSWORD_MIN, {
        error: `La nueva contraseña debe tener al menos ${TEMPORARY_PASSWORD_MIN} caracteres.`,
      })
      .max(128, { error: "La contraseña es demasiado larga." }),
    confirmPassword: z
      .string({ error: "Repite la nueva contraseña." })
      .min(1, { error: "Repite la nueva contraseña." }),
  })
  .superRefine((value, ctx) => {
    if (value.confirmPassword !== value.newPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Las contraseñas no coinciden.",
      });
    }
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "La nueva contraseña debe ser distinta de la actual.",
      });
    }
  })
  .transform(({ currentPassword, newPassword }) => ({
    currentPassword,
    newPassword,
  }));

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

// `F` is the form's fields when they differ from the parsed data.
export type ParseResult<T, F = T> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors: FieldErrors<F> };

function read(data: FormData, fields: readonly string[]) {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const value = data.get(field);
    // A missing or file field stays undefined so the schema rejects it.
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

function parse<T, F = T>(
  schema: z.ZodType,
  data: FormData,
  fields = Object.keys((schema as z.ZodObject).shape),
): ParseResult<T, F> {
  const result = schema.safeParse(read(data, fields));
  if (result.success) return { ok: true, data: result.data as T };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, fieldErrors: fieldErrors as FieldErrors<F> };
}

export function parseCreateUser(data: FormData) {
  return parse<CreateUserInput>(createSchema, data);
}

export function parseUpdateUser(data: FormData) {
  return parse<UpdateUserInput>(updateSchema, data);
}

export function parseResetPassword(data: FormData) {
  return parse<{ temporaryPassword: string }>(resetSchema, data);
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function parseChangePassword(data: FormData) {
  return parse<
    ChangePasswordInput,
    ChangePasswordInput & { confirmPassword: string }
  >(changeSchema, data, ["currentPassword", "newPassword", "confirmPassword"]);
}
