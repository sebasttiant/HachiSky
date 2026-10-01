import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Structural guarantee: a new page, route handler or Server Function cannot
// be public by accident. Layouts do not re-run on client navigation, so the
// check has to live in each page (and in each data entry point).

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const APP = join(ROOT, "app");

// The only routes reachable without a session.
const PUBLIC_PAGES = new Set(["/login"]);
const PUBLIC_ROUTE_HANDLERS = new Set(["/api/health", "/api/auth/[...all]"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".")
        ? []
        : walk(full);
    }
    return [full];
  });
}

// app/(app)/work/page.tsx -> /work ; route groups do not change the URL.
function routeOf(file: string): string {
  const segments = relative(APP, file)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  return `/${segments.join("/")}`;
}

const appFiles = walk(APP);
const pages = appFiles.filter((file) =>
  /[/\\]page\.(tsx|ts|jsx|js)$/.test(file),
);
const routeHandlers = appFiles.filter((file) =>
  /[/\\]route\.(ts|js)$/.test(file),
);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("page guards", () => {
  it("finds the app pages", () => {
    const routes = pages.map(routeOf).sort();
    for (const expected of [
      "/",
      "/billing",
      "/clients",
      "/clients/new",
      "/clients/[id]",
      "/reports",
      "/work",
      "/settings",
      "/settings/users",
      "/settings/users/[id]",
      "/settings/activity",
      "/account/password",
    ]) {
      assert.ok(routes.includes(expected), `missing ${expected} in ${routes}`);
    }
  });

  it("every non-public page awaits requireSession or requireModule with its own route", () => {
    for (const file of pages) {
      const route = routeOf(file);
      if (PUBLIC_PAGES.has(route)) continue;
      const source = stripComments(readFileSync(file, "utf8"));
      assert.match(
        source,
        /import \{[^}]*\b(requireSession|requireModule)\b[^}]*\} from "[./]*src\/auth\/guard\.ts";/,
        `${route}: must import a guard from src/auth/guard.ts`,
      );
      // A dynamic segment is passed as the real path: /a/[id] -> `/a/${id}`.
      const r = /\[/.test(route)
        ? `\`${route.replace(/\[(\w+)\]/g, "$${$1}")}\``
        : JSON.stringify(route);
      assert.ok(
        source.includes(`await requireSession(${r})`) ||
          new RegExp(
            `await requireModule\\("[a-z]+", ${escapeRegExp(r)}\\)`,
          ).test(source),
        `${route}: must call await requireSession(${r}) or await requireModule(<module>, ${r})`,
      );
      assert.match(
        source,
        /export default async function/,
        `${route}: the page component must be async to await the guard`,
      );
    }
  });
});

describe("forced password change", () => {
  it("every guarded access goes through the password gate", () => {
    const guard = stripComments(
      readFileSync(join(ROOT, "src/auth/guard.ts"), "utf8"),
    );
    const body = guard.slice(
      guard.indexOf("export async function requireSession"),
    );
    assert.match(
      body.slice(0, body.indexOf("\n}\n")),
      /passwordGateRedirect\(\s*await getMustChangePassword\(/,
      "requireSession must redirect while a password change is pending",
    );
    assert.match(
      guard,
      /requireModule[\s\S]*await requireSession\(currentPath\)/,
    );
  });

  it("the own password change hands over the new session cookie and always redirects", () => {
    const source = stripComments(
      readFileSync(join(ROOT, "src/account/actions.ts"), "utf8"),
    );
    assert.match(source, /await requireSession\(CHANGE_PASSWORD_PATH\)/);
    assert.match(source, /cookieStore\.set\(/);
    assert.doesNotMatch(
      source,
      /status: "success"/,
      "re-rendering after the change reads the revoked cookie; redirect instead",
    );
    assert.match(source, /redirect\(\s*wasPending/);
  });
});

describe("module guards", () => {
  it("every module page checks its own module", async () => {
    const { MODULES } = await import("../../src/shell/navigation.ts");
    for (const module of MODULES) {
      const file = pages.find((page) => routeOf(page) === module.href);
      assert.ok(file, `no page for ${module.href}`);
      const source = stripComments(readFileSync(file, "utf8"));
      assert.ok(
        source.includes(
          `await requireModule(${JSON.stringify(module.id)}, ${JSON.stringify(module.href)})`,
        ),
        `${module.href}: must call await requireModule(${JSON.stringify(module.id)}, ${JSON.stringify(module.href)})`,
      );
    }
  });

  it("shows only the role's modules in the navigation", () => {
    const layout = stripComments(
      readFileSync(join(APP, "(app)/layout.tsx"), "utf8"),
    );
    assert.match(layout, /visibleModules\(user\.role\)/);
    assert.match(layout, /<AppHeader user=\{user\} modules=\{modules\}/);
    const home = stripComments(
      readFileSync(join(APP, "(app)/page.tsx"), "utf8"),
    );
    assert.match(home, /visibleModules\(user\.role\)/);
    assert.doesNotMatch(home, /\bMODULES\b/);
  });

  it("answers a forbidden module with a real 403 page", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    assert.match(config, /authInterrupts:\s*true/);
    const guard = stripComments(
      readFileSync(join(ROOT, "src/auth/guard.ts"), "utf8"),
    );
    assert.match(guard, /forbidden\(\)/);
    assert.ok(
      appFiles.some((file) => relative(APP, file) === "forbidden.tsx"),
      "app/forbidden.tsx must exist",
    );
  });

  it("renders the signed-in 403 inside the app shell without repeating it", () => {
    const file = join(APP, "(app)/forbidden.tsx");
    assert.ok(appFiles.includes(file), "app/(app)/forbidden.tsx must exist");
    const source = stripComments(readFileSync(file, "utf8"));
    assert.doesNotMatch(source, /<main\b|<header\b|AppHeader|AppFooter/);
  });
});

describe("data entry points", () => {
  it("every route handler is public on purpose or calls requireSession", () => {
    const routes = routeHandlers.map(routeOf).sort();
    assert.deepEqual(
      routes.filter((route) => PUBLIC_ROUTE_HANDLERS.has(route)),
      [...PUBLIC_ROUTE_HANDLERS].sort(),
    );
    for (const file of routeHandlers) {
      const route = routeOf(file);
      if (PUBLIC_ROUTE_HANDLERS.has(route)) continue;
      assert.match(
        stripComments(readFileSync(file, "utf8")),
        /requireSession\(/,
        `${route}: route handler must call requireSession`,
      );
    }
  });

  it("every Server Function module calls requireSession or requireModule", () => {
    const sources = [...appFiles, ...walk(join(ROOT, "src"))].filter((file) =>
      /\.(tsx?|jsx?)$/.test(file),
    );
    for (const file of sources) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (!/^\s*["']use server["'];?/m.test(source)) continue;
      assert.match(
        source,
        /require(Session|Module)\(/,
        `${relative(ROOT, file)}: Server Functions must call requireSession or requireModule`,
      );
    }
  });

  it("every exported Server Function in the users module checks the settings module first", () => {
    const source = stripComments(
      readFileSync(join(ROOT, "src/users/actions.ts"), "utf8"),
    );
    assert.match(source, /^\s*["']use server["'];?/m);
    const exported = [
      ...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{/g),
    ];
    assert.ok(exported.length >= 5, "expected the admin actions");
    for (const match of exported) {
      const body = source.slice((match.index ?? 0) + match[0].length);
      assert.match(
        body.trimStart(),
        /^const (\w+|\{[^}]*\}) = await adminContext\(/,
        `${match[1]}: must start with await adminContext(...)`,
      );
    }
    assert.match(source, /await requireModule\("settings", /);
  });
});

describe("clients Server Functions", () => {
  it("every exported Server Function checks the clients module first", () => {
    const source = stripComments(
      readFileSync(join(ROOT, "src/clients/actions.ts"), "utf8"),
    );
    assert.match(source, /^\s*["']use server["'];?/m);
    const exported = [
      ...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{/g),
    ];
    assert.equal(exported.length, 3, "create, update and set-active actions");
    for (const match of exported) {
      const body = source.slice((match.index ?? 0) + match[0].length);
      assert.match(
        body.trimStart(),
        /^const (\w+|\{[^}]*\}) = await clientContext\(/,
        `${match[1]}: must start with await clientContext(...)`,
      );
    }
    assert.match(source, /await requireModule\("clients", /);
  });
});
