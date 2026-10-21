import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "../../../../src/auth/guard.ts";
import { createClientAction } from "../../../../src/clients/actions.ts";
import { ClientForm } from "../../../../src/clients/ClientForm.tsx";
import { PageHeader } from "../../../../src/shell/PageHeader.tsx";
import styles from "../../../../src/users/admin.module.css";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function NewClientPage() {
  await requireModule("clients", "/clients/new");
  return (
    <div className="container">
      <Link href="/clients" className={styles.breadcrumb}>
        ← Clientes
      </Link>
      <PageHeader
        moduleId="clients"
        title="Nuevo cliente"
        description="Escribe los datos del cliente. El nombre y la identificación son obligatorios."
      />
      <section className={styles.card} aria-labelledby="new-client-title">
        <h2 id="new-client-title" className="sr-only">
          Datos del cliente
        </h2>
        <ClientForm
          action={createClientAction}
          submitLabel="Crear cliente"
          pendingLabel="Creando…"
        />
      </section>
    </div>
  );
}
