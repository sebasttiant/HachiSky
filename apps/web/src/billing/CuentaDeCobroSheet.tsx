import styles from "./CuentaDeCobroSheet.module.css";
import type { DocumentView } from "./document.ts";
import { formatAmount } from "./money.ts";
import { billingImagePath } from "./paths.ts";

// The printed cuenta de cobro, laid out after the owner's reference documents:
// greeting, recipient, the boxed number and recipient block, the item table,
// the total, the payment note, the signature block with the bank line, and the
// tax declaration last.
//
// Items carry no unit price on purpose. The owner fixed the columns as
// PRODUCTO | DESCRIPCIÓN | CANTIDAD | PRECIO TOTAL, with the total entered per
// line and the quantity informative, so a PRECIO UND column would imply a
// multiplication this document does not do.
//
// A draft has no number: it says so instead of showing a provisional one,
// because numbering only exists once issuing does.

function Missing({ children }: { children: string }) {
  return <span className={styles.missing}>{children}</span>;
}

// Only the last four digits reach the page, the same rule the pickers use.
function accountTail(accountNumber: string): string {
  return accountNumber.slice(-4);
}

export function CuentaDeCobroSheet({ view }: { view: DocumentView }) {
  const { client, issuer, signer, bankAccount, declaration } = view;
  return (
    <article className={styles.sheet} aria-label="Cuenta de cobro">
      <div className={styles.worlds} aria-hidden="true" />

      <header className={styles.top}>
        {issuer.logoImageId ? (
          // biome-ignore lint/performance/noImgElement: private, per-version image served by an authenticated route; next/image would proxy it through the public optimizer
          <img
            className={styles.logo}
            src={billingImagePath(issuer.logoImageId)}
            alt={issuer.legalName}
          />
        ) : null}
        <div className={styles.issuer}>
          <p className={styles.issuerName}>{issuer.legalName}</p>
          <p className={styles.issuerLine}>
            {issuer.identificationType} {issuer.identificationNumber}
          </p>
          <p className={styles.issuerLine}>
            {issuer.address} · {issuer.city}
          </p>
          {issuer.email || issuer.phone ? (
            <p className={styles.issuerLine}>
              {[issuer.email, issuer.phone].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </header>

      <p className={styles.greeting}>Saludos Cordiales,</p>

      <p className={styles.recipient}>
        <strong>{client.name}</strong>
        <br />
        {client.identificationType}: {client.identificationNumber}
      </p>

      <section className={styles.identity}>
        <div className={styles.numberBox}>
          <p className={styles.numberLabel}>CUENTA DE COBRO</p>
          <p className={styles.number}>Sin número</p>
          <p className={styles.statusPill}>Borrador</p>
        </div>
        <dl className={styles.partyGrid}>
          <dt>Razón social</dt>
          <dd>{client.name}</dd>
          <dt>Dirección</dt>
          <dd>{client.address ?? <Missing>Sin dirección</Missing>}</dd>
          <dt>Ciudad</dt>
          <dd>{client.city ?? <Missing>Sin ciudad</Missing>}</dd>
          <dt>{client.identificationType}</dt>
          <dd>{client.identificationNumber}</dd>
        </dl>
      </section>

      <table className={styles.items}>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Descripción</th>
            <th scope="col">Cantidad</th>
            <th scope="col" className={styles.amountCol}>
              Precio total
            </th>
          </tr>
        </thead>
        <tbody>
          {view.lines.length === 0 ? (
            <tr>
              <td colSpan={4} className={styles.empty}>
                <Missing>Sin conceptos todavía</Missing>
              </td>
            </tr>
          ) : (
            view.lines.map((line) => (
              <tr key={line.position}>
                <td>{line.product}</td>
                <td>{line.description ?? ""}</td>
                <td>{line.quantity ?? ""}</td>
                <td className={styles.amountCol}>
                  {formatAmount(line.amountMinor, view.currency)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Valor Total
            </th>
            <td className={styles.total}>
              {formatAmount(view.totalMinor, view.currency)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className={styles.note}>
        <strong>Nota:</strong>{" "}
        {view.paymentTerms ?? <Missing>Sin forma de pago</Missing>}
      </p>

      <footer className={styles.closing}>
        <p className={styles.cordially}>CORDIALMENTE,</p>

        {signer ? (
          <div className={styles.signature}>
            {signer.signatureImageId ? (
              // biome-ignore lint/performance/noImgElement: private, per-version image served by an authenticated route; next/image would proxy it through the public optimizer
              <img
                className={styles.signatureImage}
                src={billingImagePath(signer.signatureImageId)}
                alt={`Firma de ${signer.fullName}`}
              />
            ) : (
              <p className={styles.signatureLine}>
                <Missing>Sin firma cargada</Missing>
              </p>
            )}
            <p className={styles.signerName}>{signer.fullName}</p>
            <p className={styles.signerLine}>
              {signer.identificationType}: {signer.identificationNumber}
            </p>
            <p className={styles.signerLine}>
              {signer.jobTitle} en {issuer.legalName} · {signer.email}
            </p>
          </div>
        ) : (
          <p className={styles.signature}>
            <Missing>Sin firmante seleccionado</Missing>
          </p>
        )}

        <p className={styles.bank}>
          {bankAccount ? (
            `Favor consignar a la cuenta de ${bankAccount.accountType} ${bankAccount.bankName} N.º ···${accountTail(bankAccount.accountNumber)} · ${bankAccount.holderName} · ${bankAccount.currency}`
          ) : (
            <Missing>Sin cuenta bancaria seleccionada</Missing>
          )}
        </p>
      </footer>

      <p className={styles.declaration}>
        {declaration ? (
          declaration.body
        ) : (
          <Missing>Sin declaración tributaria</Missing>
        )}
      </p>

      {/* Discreet maker's mark, bottom-right: the software signature, kept small
          so it never competes with the issuer's identity. */}
      <p className={styles.madeWith}>
        {/* biome-ignore lint/performance/noImgElement: tiny static brand derivative, no optimizer */}
        <img
          className={styles.madeWithMark}
          src="/brand/hachisky-mark-96.png"
          alt=""
          width={18}
          height={18}
        />
        <span className={styles.madeWithText}>
          <span className={styles.madeWithName}>HachiSky</span>
          <span className={styles.madeWithBy}>by IL Asesorías</span>
        </span>
      </p>
    </article>
  );
}
