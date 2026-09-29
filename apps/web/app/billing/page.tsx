import type { Metadata } from "next";
import { ComingSoon } from "../../src/shell/ComingSoon.tsx";

export const metadata: Metadata = { title: "Facturación" };

export default function BillingPage() {
  return (
    <ComingSoon
      moduleId="billing"
      title="Facturación"
      intro="Este módulo servirá para llevar las cuentas de cobro a los clientes y el seguimiento de lo que pagan y lo que queda pendiente."
      planned={[
        "Preparar cuentas de cobro a partir del trabajo registrado.",
        "Registrar los pagos recibidos de cada cliente.",
        "Consultar los saldos por cliente.",
      ]}
    />
  );
}
