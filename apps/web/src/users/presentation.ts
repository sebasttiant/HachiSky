// Client-safe labels and helpers for the admin panel (no server imports).

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  staff: "Colaborador",
};

export function roleLabel(role: string | null): string {
  return (role && ROLE_LABEL[role]) || "Sin rol";
}

export const ACTION_LABEL: Record<string, string> = {
  "user.create": "Creó la cuenta",
  "user.update": "Editó los datos",
  "user.deactivate": "Desactivó la cuenta",
  "user.activate": "Reactivó la cuenta",
  "user.password_reset": "Asignó una contraseña temporal",
  "user.sessions_revoke": "Cerró todas las sesiones",
  "user.password_change": "Cambió su contraseña",
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

// No 0/O, 1/l/I: the admin may have to dictate it.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// 16 random characters (~93 bits) in four groups: "Hk7m-x9Qa-Tz4p-Wr2c".
export function generateTemporaryPassword(): string {
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-");
}
