// Fictitious data for the workday form preview. Never real clients.
export interface SampleActivity {
  description: string;
  minutes: number;
}

export interface SampleWorkday {
  isSample: true;
  clients: readonly { id: string; name: string }[];
  date: string; // ISO yyyy-mm-dd
  startTime: string;
  endTime: string;
  activities: readonly SampleActivity[];
  notes: string;
}

export const sampleWorkday: SampleWorkday = {
  isSample: true,
  clients: [
    { id: "ejemplo-1", name: "Comercial Ejemplo S.A." },
    { id: "ejemplo-2", name: "Taller Ejemplo Ltda." },
    { id: "ejemplo-3", name: "Servicios Ejemplo SpA" },
  ],
  date: "2026-03-09",
  startTime: "09:00",
  endTime: "13:00",
  activities: [
    { description: "Conciliación de movimientos bancarios", minutes: 120 },
    { description: "Preparación de resumen mensual", minutes: 90 },
    { description: "Llamada de seguimiento con el cliente", minutes: 30 },
  ],
  notes: "Pendiente: solicitar los comprobantes faltantes del mes.",
};
