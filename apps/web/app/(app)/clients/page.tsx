import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../src/auth/guard.ts";
import { ClientFiltersForm } from "../../../src/clients/ClientFiltersForm.tsx";
import {
  ClientList,
  NEW_CLIENT_PATH,
} from "../../../src/clients/ClientList.tsx";
import {
  parseClientFilters,
  type RawSearchParams,
  toServiceFilters,
} from "../../../src/clients/filters.ts";
import { listClients } from "../../../src/clients/service.ts";
import { getDb } from "../../../src/db/client.ts";
import { PageHeader } from "../../../src/shell/PageHeader.tsx";
import styles from "../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { user } = await requireModule("clients", "/clients");
  const filters = parseClientFilters(await searchParams);
  const { items, hasMore } = await listClients(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    toServiceFilters(filters),
  );
  return (
    <div className="container">
      <PageHeader
        moduleId="clients"
        title="Clientes"
        description="Busca un cliente o crea uno nuevo. Los clientes no se borran: se desactivan y conservan su información."
        actions={
          <Link
            href={NEW_CLIENT_PATH}
            className={`${styles.button} ${styles.primary}`}
          >
            Nuevo cliente
          </Link>
        }
      />
      <div className={styles.stack}>
        <ClientFiltersForm filters={filters} />
        <section aria-labelledby="clients-title" className={styles.stack}>
          <h2 id="clients-title" className="sr-only">
            Lista de clientes
          </h2>
          <ClientList items={items} hasMore={hasMore} filters={filters} />
        </section>
      </div>
    </div>
  );
}
