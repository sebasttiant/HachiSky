// The five report kinds, as the sections they are seeded with.
//
// A template is data, not code: adding a kind or renaming a heading is
// editing this file, never a migration, because sections are rows.
//
// `key` is stable and never shown; it is what the audit log records and what
// later versions match on. `heading` is what the reader sees and the author
// may rewrite freely.
//
// The headings follow the documents the owner actually writes (DISPRESCO and
// ABAD infrastructure diagnoses, activity reports and access manuals). No
// client data from those documents is reproduced here — only the shape.

export const REPORT_TYPES = [
  "follow_up",
  "diagnostic",
  "general",
  "infrastructure",
  "manual",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  follow_up: "Seguimiento de actividades",
  diagnostic: "Diagnóstico técnico",
  general: "Informe general de gestión",
  infrastructure: "Diagnóstico de infraestructura",
  manual: "Manual de entrega",
};

export const REPORT_TYPE_DESCRIPTION: Record<ReportType, string> = {
  follow_up: "Lo hecho en una jornada o período, con resultados y pendientes.",
  diagnostic: "Qué se encontró, qué impacto tiene y qué conviene hacer.",
  general: "Resumen de gestión de un período, con actividades agrupadas.",
  infrastructure:
    "Levantamiento por dominio: estado, inventario, hallazgos y plan.",
  manual: "Cómo usar lo entregado, paso a paso, para quien no estuvo.",
};

// What a section's rows mean. Prose sections have none.
export const SECTION_KINDS = [
  "prose",
  "findings",
  "status_table",
  "inventory",
  "steps",
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export interface TemplateSection {
  key: string;
  heading: string;
  kind: SectionKind;
  /** Shown while the section is empty, to say what belongs in it. */
  hint: string;
}

const FOLLOW_UP: readonly TemplateSection[] = [
  {
    key: "period",
    heading: "Período",
    kind: "prose",
    hint: "Qué días cubre este informe.",
  },
  {
    key: "activities",
    heading: "Actividades realizadas",
    kind: "prose",
    hint: "Las actividades registradas se adjuntan aparte. Acá va lo que las conecta.",
  },
  {
    key: "results",
    heading: "Resultados",
    kind: "prose",
    hint: "Qué quedó funcionando o resuelto.",
  },
  {
    key: "pending",
    heading: "Pendientes y próximos pasos",
    kind: "prose",
    hint: "Qué queda abierto y quién sigue.",
  },
];

const DIAGNOSTIC: readonly TemplateSection[] = [
  {
    key: "objective",
    heading: "Objetivo y alcance",
    kind: "prose",
    hint: "Qué se revisó y qué quedó fuera.",
  },
  {
    key: "situation",
    heading: "Situación encontrada",
    kind: "prose",
    hint: "Cómo estaba cuando se llegó.",
  },
  {
    key: "scope_items",
    heading: "Equipos y servicios revisados",
    kind: "inventory",
    hint: "Lo que se inspeccionó, uno por línea.",
  },
  {
    key: "findings",
    heading: "Hallazgos",
    kind: "findings",
    hint: "Cada hallazgo con su impacto y su prioridad.",
  },
  {
    key: "actions",
    heading: "Acciones realizadas",
    kind: "prose",
    hint: "Qué se hizo durante la revisión.",
  },
  {
    key: "recommendations",
    heading: "Recomendaciones y plan de acción",
    kind: "prose",
    hint: "Qué conviene hacer, en qué orden.",
  },
  {
    key: "conclusions",
    heading: "Conclusiones",
    kind: "prose",
    hint: "El cierre, en pocas líneas.",
  },
];

const GENERAL: readonly TemplateSection[] = [
  {
    key: "period",
    heading: "Período",
    kind: "prose",
    hint: "Qué lapso cubre la gestión.",
  },
  {
    key: "summary",
    heading: "Resumen ejecutivo",
    kind: "prose",
    hint: "Lo esencial para quien solo lee esta parte.",
  },
  {
    key: "activities",
    heading: "Actividades agrupadas",
    kind: "prose",
    hint: "Las actividades del período, por tema.",
  },
  {
    key: "results",
    heading: "Resultados",
    kind: "prose",
    hint: "Qué cambió respecto al período anterior.",
  },
  {
    key: "pending",
    heading: "Pendientes",
    kind: "prose",
    hint: "Qué sigue abierto.",
  },
  {
    key: "recommendations",
    heading: "Recomendaciones",
    kind: "prose",
    hint: "Qué conviene priorizar.",
  },
  {
    key: "conclusions",
    heading: "Conclusiones",
    kind: "prose",
    hint: "El cierre, en pocas líneas.",
  },
];

const INFRASTRUCTURE: readonly TemplateSection[] = [
  {
    key: "control",
    heading: "Control del documento",
    kind: "prose",
    hint: "Versión, fecha y para quién se preparó.",
  },
  {
    key: "evidence",
    heading: "Fuentes de evidencia",
    kind: "prose",
    hint: "En qué se basa lo que sigue: qué se vio, cuándo y cómo. Sin esto, un diagnóstico no es auditable.",
  },
  {
    key: "summary",
    heading: "Resumen ejecutivo",
    kind: "prose",
    hint: "Lo esencial para quien decide y no lee el resto.",
  },
  {
    key: "status",
    heading: "Semáforo por dominio",
    kind: "status_table",
    hint: "Cada dominio con su estado: bien, en observación o en riesgo.",
  },
  {
    key: "architecture",
    heading: "Arquitectura identificada",
    kind: "prose",
    hint: "Cómo está armado hoy.",
  },
  {
    key: "inventory",
    heading: "Inventario",
    kind: "inventory",
    hint: "Equipos y servicios encontrados. Cuando existan sedes, se agrupa por sede.",
  },
  {
    key: "findings",
    heading: "Hallazgos",
    kind: "findings",
    hint: "Cada hallazgo con su impacto y su prioridad.",
  },
  {
    key: "plan",
    heading: "Plan de acción",
    kind: "prose",
    hint: "Qué hacer, en qué orden y con qué urgencia.",
  },
  {
    key: "conclusions",
    heading: "Conclusiones",
    kind: "prose",
    hint: "El cierre, en pocas líneas.",
  },
];

const MANUAL: readonly TemplateSection[] = [
  {
    key: "control",
    heading: "Datos del documento",
    kind: "prose",
    hint: "Versión, fecha y a quién está dirigido.",
  },
  {
    key: "objective",
    heading: "Objetivo del manual",
    kind: "prose",
    hint: "Qué va a poder hacer quien lo lea.",
  },
  {
    key: "problem",
    heading: "El problema que resuelve",
    kind: "prose",
    hint: "Cómo era antes y cómo es ahora.",
  },
  {
    key: "concepts",
    heading: "Conceptos que deben quedar claros",
    kind: "inventory",
    hint: "Cada término con su explicación, en lenguaje llano.",
  },
  {
    key: "requirements",
    heading: "Qué se necesita",
    kind: "inventory",
    hint: "Lo que hay que tener a mano antes de empezar.",
  },
  {
    key: "steps",
    heading: "Paso a paso",
    kind: "steps",
    hint: "Cada paso en orden. Las imágenes se agregan después.",
  },
  {
    key: "delivery",
    heading: "Evidencia de entrega",
    kind: "prose",
    hint: "Quién recibió el manual y cuándo.",
  },
];

// Credentials are deliberately absent from the manual template. The owner's
// reference manuals distribute real usernames and passwords, which would
// mean storing a client's working credentials here and printing them into a
// shareable document. That is a different class of data from anything else
// in this product and it has not been decided, so nothing guesses at it.
export const REPORT_TEMPLATES: Record<ReportType, readonly TemplateSection[]> =
  {
    follow_up: FOLLOW_UP,
    diagnostic: DIAGNOSTIC,
    general: GENERAL,
    infrastructure: INFRASTRUCTURE,
    manual: MANUAL,
  };

export function isReportType(value: unknown): value is ReportType {
  return (
    typeof value === "string" &&
    (REPORT_TYPES as readonly string[]).includes(value)
  );
}

export function templateFor(type: ReportType): readonly TemplateSection[] {
  return REPORT_TEMPLATES[type];
}

// Which classifications a section's rows may carry. Anything else is refused
// rather than quietly stored, so a status never appears on a step.
export const ITEM_FIELDS: Record<
  SectionKind,
  { status: boolean; priority: boolean; impact: boolean }
> = {
  prose: { status: false, priority: false, impact: false },
  findings: { status: false, priority: true, impact: true },
  status_table: { status: true, priority: false, impact: false },
  inventory: { status: false, priority: false, impact: false },
  steps: { status: false, priority: false, impact: false },
};

export const ITEM_STATUS_LABEL = {
  ok: "Bien",
  watch: "En observación",
  risk: "En riesgo",
} as const;

export const ITEM_PRIORITY_LABEL = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
} as const;
