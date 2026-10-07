import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "../../../../../src/auth/guard.ts";
import {
  setDefaultIssuerAction,
  setIssuerActiveAction,
  updateIssuerAction,
} from "../../../../../src/billing/actions.ts";
import { IssuerForm } from "../../../../../src/billing/IssuerForm.tsx";
import { IssuerLogoSection } from "../../../../../src/billing/IssuerLogoSection.tsx";
import { IssuerStatusSection } from "../../../../../src/billing/IssuerStatusSection.tsx";
import {
  countIssuerLogoVersions,
  getIssuer,
} from "../../../../../src/billing/issuers.ts";
import { issuerLogoUploadPath } from "../../../../../src/billing/paths.ts";
import { getDb } from "../../../../../src/db/client.ts";
import { formatDateTime } from "../../../../../src/shared/format/date.ts";
import styles from "../../../../../src/users/admin.module.css";
import { StatusBadge } from "../../../../../src/users/Badges.tsx";

export const metadata: Metadata = { title: "Emisor" };

export default async function IssuerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { user } = await requireModule("settings", `/settings/issuers/${id}`);
  const deps = { db: getDb() };
  const actor = {
    id: user.id,
    role: user.role,
    ipAddress: null,
    userAgent: null,
  };
  const issuer = await getIssuer(deps, actor, id);
  if (!issuer) notFound();
  const versionCount = await countIssuerLogoVersions(deps, actor, issuer.id);
  const query = await searchParams;
  const justCreated = query.creado === "1";
  const createdAsDefault = query.predeterminado === "1";

  return (
    <div className="container">
      <Link href="/settings/issuers" className={styles.breadcrumb}>
        ← Emisores
      </Link>

      <div className={styles.profile}>
        <div className={styles.identity}>
          <h1>{issuer.legalName}</h1>
          <span className={styles.muted}>
            {issuer.identificationType} {issuer.identificationNumber} ·{" "}
            {issuer.city}
          </span>
        </div>
        <div className={styles.badges}>
          {issuer.isDefault ? (
            <span className={`${styles.badge} ${styles.badgeAdmin}`}>
              Predeterminado
            </span>
          ) : null}
          <StatusBadge active={issuer.active} />
        </div>
      </div>

      {justCreated ? (
        <p role="status" className={`${styles.alert} ${styles.alertSuccess}`}>
          {createdAsDefault
            ? "Emisor creado. Es el emisor predeterminado porque no había otro. Ahora sube su logo."
            : "Emisor creado. Ahora sube su logo."}
        </p>
      ) : null}

      <div className={styles.detailLayout}>
        <div className={styles.stack}>
          <IssuerLogoSection
            logo={issuer.logo}
            versionCount={versionCount}
            active={issuer.active}
            uploadUrl={issuerLogoUploadPath(issuer.id)}
          />
          <section className={styles.card} aria-labelledby="data-title">
            <h2 id="data-title" className={styles.cardTitle}>
              Datos del emisor
            </h2>
            <IssuerForm
              action={updateIssuerAction.bind(null, issuer.id)}
              values={issuer}
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
          </section>
          <IssuerStatusSection
            active={issuer.active}
            isDefault={issuer.isDefault}
            label={issuer.legalName}
            deactivate={setIssuerActiveAction.bind(null, issuer.id, false)}
            reactivate={setIssuerActiveAction.bind(null, issuer.id, true)}
            makeDefault={setDefaultIssuerAction.bind(null, issuer.id)}
          />
        </div>
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="facts-title">
            <h2 id="facts-title" className={styles.cardTitle}>
              Resumen
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Predeterminado</dt>
                <dd>{issuer.isDefault ? "Sí" : "No"}</dd>
              </div>
              <div>
                <dt>Creado</dt>
                <dd>{formatDateTime(issuer.createdAt)}</dd>
              </div>
              <div>
                <dt>Última modificación</dt>
                <dd>{formatDateTime(issuer.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
