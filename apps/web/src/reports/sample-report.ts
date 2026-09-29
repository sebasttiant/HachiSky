// Fictitious data for the report design preview. Never real clients, people
// or figures. `isSample` must stay true until real data feeds this shape.
export interface ReportLine {
  date: string; // ISO yyyy-mm-dd
  description: string;
  minutes: number;
}

export interface SampleReport {
  isSample: true;
  title: string;
  reference: string;
  client: { name: string; contact: string };
  professional: string;
  period: { from: string; to: string };
  lines: readonly ReportLine[];
}

export const sampleReport: SampleReport = {
  isSample: true,
  title: "Informe de actividad",
  reference: "EJEMPLO-0001",
  client: { name: "Comercial Ejemplo S.A.", contact: "Contacto de Ejemplo" },
  professional: "Asesor de Ejemplo",
  period: { from: "2026-03-02", to: "2026-03-13" },
  lines: [
    {
      date: "2026-03-02",
      description: "Revisión de documentación contable del trimestre anterior",
      minutes: 150,
    },
    {
      date: "2026-03-05",
      description: "Reunión de seguimiento y definición de prioridades",
      minutes: 90,
    },
    {
      date: "2026-03-09",
      description: "Conciliación de movimientos y preparación de resumen",
      minutes: 210,
    },
    {
      date: "2026-03-12",
      description: "Elaboración de propuesta de mejoras de proceso",
      minutes: 105,
    },
  ],
};

export function reportTotals(report: SampleReport): {
  minutes: number;
  lines: number;
} {
  return {
    minutes: report.lines.reduce((acc, line) => acc + line.minutes, 0),
    lines: report.lines.length,
  };
}
