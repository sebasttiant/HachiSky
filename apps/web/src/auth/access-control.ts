import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

// Exactly two roles. Better Auth's built-in `user` role is intentionally NOT
// defined: the admin plugin rejects any role that is not a key of `roles`, so
// `user` can never be assigned through createUser, setRole or updateUser.
export const ac = createAccessControl(defaultStatements);

// `admin` holds every user/session management permission.
const adminRole = ac.newRole({ ...adminAc.statements });

// `staff` holds no `user:*` and no `session:*` permission, so every admin
// plugin endpoint rejects it.
const staffRole = ac.newRole({ user: [], session: [] });

export const roles = { admin: adminRole, staff: staffRole } as const;

export const ROLE_NAMES = Object.keys(roles) as ReadonlyArray<
  keyof typeof roles
>;

export const DEFAULT_ROLE = "staff" satisfies keyof typeof roles;
export const ADMIN_ROLES = ["admin"] satisfies ReadonlyArray<
  keyof typeof roles
>;
