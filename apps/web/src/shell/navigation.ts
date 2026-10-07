export const AVAILABILITY_STATUSES = [
  "available",
  "preview",
  "unavailable",
] as const;

export type Availability = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Disponible",
  preview: "Vista previa",
  unavailable: "No disponible todavía",
};

export type ModuleId =
  | "home"
  | "clients"
  | "work"
  | "reports"
  | "billing"
  | "settings";

export interface AppModule {
  id: ModuleId;
  label: string;
  href: string;
  availability: Availability;
  description: string;
}

export const MODULES: readonly AppModule[] = [
  {
    id: "home",
    label: "Inicio",
    href: "/",
    availability: "available",
    description: "Resumen general y estado del sistema.",
  },
  {
    id: "clients",
    label: "Clientes",
    href: "/clients",
    availability: "available",
    description: "Fichas de clientes, contactos y condiciones de servicio.",
  },
  {
    id: "work",
    label: "Trabajo",
    href: "/work",
    availability: "preview",
    description: "Registro de jornadas y actividades realizadas.",
  },
  {
    id: "reports",
    label: "Informes",
    href: "/reports",
    availability: "preview",
    description: "Informes de actividad listos para compartir con el cliente.",
  },
  {
    id: "billing",
    label: "Facturación",
    href: "/billing",
    availability: "unavailable",
    description: "Cuentas de cobro, pagos y saldos",
  },
  {
    id: "settings",
    label: "Configuración",
    href: "/settings",
    availability: "available",
    description: "Usuarios del equipo, accesos y actividad de administración.",
  },
];

export function isActive(href: string, pathname: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}
