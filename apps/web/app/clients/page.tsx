import type { Metadata } from "next";
import { ComingSoon } from "../../src/shell/ComingSoon.tsx";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientsPage() {
  return (
    <ComingSoon
      moduleId="clients"
      title="Clientes"
      intro="Aquí se administrará la cartera de clientes de IL Asesorías, con toda su información en un solo lugar."
      planned={[
        "Crear y consultar fichas de clientes.",
        "Guardar contactos y condiciones de servicio.",
        "Ver el historial de trabajo asociado a cada cliente.",
      ]}
    />
  );
}
