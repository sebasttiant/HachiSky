import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../src/auth/guard.ts";
import {
  setDeclarationActiveAction,
  updateDeclarationAction,
} from "../../../../../src/billing/actions.ts";
import { DeclarationForm } from "../../../../../src/billing/DeclarationForm.tsx";
import { DeclarationStatusSection } from "../../../../../src/billing/DeclarationStatusSection.tsx";
import { getDeclaration } from "../../../../../src/billing/declarations.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { formatDateTime } from "../../../../../src/shared/format/date.ts";
import styles from "../../../../../src/users/admin.module.css";
import { StatusBadge } from "../../../../../src/users/Badges.tsx";

export const metadata: Metadata = { title: "Declaración" };

export default async function DeclarationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // biome-ignore format: tests/auth/route-guards.test.ts matches this call on one line
  const { user } = await requireModule("settings", `/settings/declarations/${id}`);
  const declaration = await getDeclaration(
    { db: getDb() },
    { id: user.id, role: user.role, ipAddress: null, userAgent: null },
    id,
  );
  if (!declaration) notFound();
  const justCreated = (await searchParams).creada === "1";

  return (
    <div className="container">
      <Link href="/settings/declarations" className={styles.breadcrumb}>
        ← Declaraciones
      </Link>

      <div className={styles.profile}>
        <div className={styles.identity}>
          <h1>{declaration.label}</h1>
        </div>
        <div className={styles.badges}>
          <StatusBadge active={declaration.active} />
        </div>
      </div>

      {justCreated ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          Declaración creada.
        </p>
      ) : null}

      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="data-title">
            <h2 id="data-title" className={styles.cardTitle}>
              Datos de la declaración
            </h2>
            <DeclarationForm
              action={updateDeclarationAction.bind(null, declaration.id)}
              values={declaration}
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
          </section>
          <DeclarationStatusSection
            active={declaration.active}
            label={declaration.label}
            deactivate={setDeclarationActiveAction.bind(
              null,
              declaration.id,
              false,
            )}
            reactivate={setDeclarationActiveAction.bind(
              null,
              declaration.id,
              true,
            )}
          />
        </div>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="facts-title">
            <h2 id="facts-title" className={styles.cardTitle}>
              Resumen
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Creada</dt>
                <dd>{formatDateTime(declaration.createdAt)}</dd>
              </div>
              <div>
                <dt>Última modificación</dt>
                <dd>{formatDateTime(declaration.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
