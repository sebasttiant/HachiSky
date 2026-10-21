import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { getDb } from "../../../../src/db/client.ts";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";
import { CreateUserPanel } from "../../../../src/users/CreateUserPanel.tsx";
import {
  parseUserFilters,
  type RawSearchParams,
} from "../../../../src/users/filters.ts";
import { listUsers } from "../../../../src/users/service.ts";
import { UserFiltersForm } from "../../../../src/users/UserFiltersForm.tsx";
import { UserList } from "../../../../src/users/UserList.tsx";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { user } = await requireModule("settings", "/settings/users");
  const filters = parseUserFilters(await searchParams);
  const { items, hasMore } = await listUsers({ db: getDb() }, filters);
  return (
    <div className="container">
      <Link href="/settings" className={styles.breadcrumb}>
        ← Configuración
      </Link>
      <PageHeader
        moduleId="settings"
        title="Usuarios"
        description="Busca a una persona y gestiona su acceso. Las cuentas no se borran: se desactivan y conservan su historial."
      />
      <div className={styles.stack}>
        <UserFiltersForm filters={filters} />
        <CreateUserPanel />
        <section aria-labelledby="users-title" className={styles.stack}>
          <h2 id="users-title" className="sr-only">
            Lista de usuarios
          </h2>
          <UserList
            items={items}
            hasMore={hasMore}
            filters={filters}
            currentUserId={user.id}
          />
        </section>
      </div>
    </div>
  );
}
