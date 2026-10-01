import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../src/auth/guard.ts";
import {
  setClientActiveAction,
  updateClientAction,
} from "../../../../src/clients/actions.ts";
import { ClientForm } from "../../../../src/clients/ClientForm.tsx";
import { ClientStatusSection } from "../../../../src/clients/ClientStatusSection.tsx";
import { getClient } from "../../../../src/clients/service.ts";
import { getDb } from "../../../../src/db/client.ts";
import { formatDateTime } from "../../../../src/shared/format/date.ts";
import styles from "../../../../src/users/admin.module.css";
import { StatusBadge } from "../../../../src/users/Badges.tsx";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { user } = await requireModule("clients", `/clients/${id}`);
  const client = await getClient(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    id,
  );
  if (!client) notFound();
  const justCreated = (await searchParams).creado === "1";

  return (
    <div className="container">
      <Link href="/clients" className={styles.breadcrumb}>
        ← Clientes
      </Link>

      <div className={styles.profile}>
        <div className={styles.identity}>
          <h1>{client.name}</h1>
          <span className={styles.muted}>
            {client.identificationType} {client.identificationNumber}
          </span>
        </div>
        <div className={styles.badges}>
          <StatusBadge active={client.active} />
        </div>
      </div>

      {justCreated ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Cliente creado.
        </p>
      ) : null}

      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="data-title">
            <h2 id="data-title" className={styles.cardTitle}>
              Datos del cliente
            </h2>
            <ClientForm
              action={updateClientAction.bind(null, client.id)}
              values={{
                name: client.name,
                identificationType: client.identificationType,
                identificationNumber: client.identificationNumber,
                address: client.address,
                city: client.city,
                email: client.email,
                phone: client.phone,
              }}
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
          </section>
          <ClientStatusSection
            role={user.role}
            active={client.active}
            name={client.name}
            deactivate={setClientActiveAction.bind(null, client.id, false)}
            reactivate={setClientActiveAction.bind(null, client.id, true)}
          />
        </div>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="facts-title">
            <h2 id="facts-title" className={styles.cardTitle}>
              Resumen
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Creado</dt>
                <dd>{formatDateTime(client.createdAt)}</dd>
              </div>
              <div>
                <dt>Última modificación</dt>
                <dd>{formatDateTime(client.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
