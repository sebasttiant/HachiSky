import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { it } from "node:test";

// Unit tests stub every `.module.css` import, so a missing stylesheet only
// shows up in `next build`. This keeps that failure in `pnpm test`.
const ROOTS = ["app", "src"];
const IMPORT = /from\s+"(\.{1,2}\/[^"]+\.module\.css)"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

it("every relative CSS module import points to an existing file", () => {
  const missing = ROOTS.flatMap(sourceFiles).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(IMPORT)]
      .map((match) => resolve(dirname(file), match[1]))
      .filter((target) => !existsSync(target))
      .map((target) => `${file} -> ${target}`),
  );
  assert.deepEqual(missing, []);
});
