import type { ModuleId } from "./navigation.ts";

// Simple stroke icons (24x24), decorative: always aria-hidden.
const PATHS: Record<ModuleId, string[]> = {
  home: ["M3 11.5 12 4l9 7.5", "M5.5 10.5V20h13v-9.5", "M10 20v-5.5h4V20"],
  clients: [
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6",
    "M16 4.5a3.3 3.3 0 0 1 0 6.3",
    "M18 14.3c2.2.6 3.5 2.5 3.5 5.7",
  ],
  work: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7.5V12l3 2"],
  reports: [
    "M6 3h8l4 4v14H6Z",
    "M14 3v4h4",
    "M9 12h6",
    "M9 15.5h6",
    "M9 8.5h2",
  ],
  billing: ["M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z", "M9 8h6", "M9 12h6"],
};

export function ModuleIcon({ id, size = 24 }: { id: ModuleId; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[id].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
