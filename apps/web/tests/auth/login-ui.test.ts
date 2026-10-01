import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import { it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const loader = `
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const require = createRequire(process.cwd() + "/");
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/link") return nextResolve("next/link.js", context);
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true, source: "export default new Proxy({}, { get: (_, k) => k });" };
  if (url.endsWith(".tsx")) {
    const swc = require("next/dist/build/swc/index.js");
    await swc.loadBindings();
    const filename = fileURLToPath(url);
    const out = await swc.transform(await readFile(filename, "utf8"), {
      filename, jsc: { target: "es2022", parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" }
    });
    return { format: "module", shortCircuit: true, source: out.code };
  }
  return nextLoad(url, context);
}`;
register(`data:text/javascript,${encodeURIComponent(loader)}`);

it("renders labeled login fields with password-manager hints and no app navigation", async () => {
  const { LoginForm } = await import("../../src/auth/LoginForm.tsx");
  const html = renderToStaticMarkup(
    createElement(LoginForm, { next: "/work" }),
  );
  assert.match(html, /<label[^>]*for="email"/);
  assert.match(html, /type="email"[^>]*autoComplete="username"/);
  assert.match(html, /<label[^>]*for="password"/);
  assert.match(html, /type="password"[^>]*autoComplete="current-password"/);
  assert.match(html, /type="submit"/);
  assert.doesNotMatch(html, /<nav/);
});

it("offers a show-password toggle that is not a submit button", async () => {
  const { LoginForm } = await import("../../src/auth/LoginForm.tsx");
  const html = renderToStaticMarkup(
    createElement(LoginForm, { next: "/work" }),
  );
  assert.match(
    html,
    /<button[^>]*type="button"[^>]*aria-controls="password"[^>]*aria-pressed="false"/,
  );
  assert.match(html, /Mostrar contraseña/);
});

it("has one message per failure reason, none revealing whether the email exists", async () => {
  const { LOGIN_ERROR_MESSAGES } = await import("../../src/auth/LoginForm.tsx");
  assert.deepEqual(Object.keys(LOGIN_ERROR_MESSAGES).sort(), [
    "invalid",
    "rate_limited",
    "unavailable",
  ]);
  for (const message of Object.values(LOGIN_ERROR_MESSAGES)) {
    assert.doesNotMatch(message, /no existe|no registrad|desconocid/i);
  }
});

it("uses the app's tú form in the login copy (no voseo)", () => {
  const sources = ["app/login/page.tsx", "src/auth/LoginForm.tsx"]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.doesNotMatch(sources, /Ingresá|Verificá|Intentá|intentá|Esperá/);
});

it("keeps login outside the authenticated layout", () => {
  const page = readFileSync("app/login/page.tsx", "utf8");
  const root = readFileSync("app/layout.tsx", "utf8");
  assert.match(page, /LoginForm/);
  assert.match(page, /<Wordmark/);
  assert.doesNotMatch(page, /MainNav|UserArea|<AppHeader/);
  assert.doesNotMatch(root, /AppHeader/);
});

it("renders logout with a non-submit button", async () => {
  const { LogoutButton } = await import("../../src/shell/LogoutButton.tsx");
  const html = renderToStaticMarkup(createElement(LogoutButton));
  assert.match(html, /type="button"/);
  assert.match(html, /Cerrar sesión/);
  const source = readFileSync("src/shell/LogoutButton.tsx", "utf8");
  assert.doesNotMatch(source, /Intentá|intentá/);
});

it("shows the signed-in user's name, job title and logout", async () => {
  const { UserArea } = await import("../../src/shell/UserArea.tsx");
  const html = renderToStaticMarkup(
    createElement(UserArea, {
      name: "Ana Pérez",
      jobTitle: "Asesora de seguros",
    }),
  );
  assert.match(html, /Ana Pérez/);
  assert.match(html, /Asesora de seguros/);
  assert.match(html, /Cerrar sesión/);
});

it("renders the user area in the header only when a user is given", () => {
  const header = readFileSync("src/shell/AppHeader.tsx", "utf8");
  assert.match(header, /user \? <UserArea/);
});

it("derives avatar initials from the user's name", async () => {
  const { initials } = await import("../../src/shell/UserArea.tsx");
  assert.equal(initials("Ana Pérez"), "AP");
  assert.equal(initials("  maría  josé  de la cruz "), "MC");
  assert.equal(initials("Admin"), "A");
  assert.equal(initials("   "), "?");
});

it("labels the logout button even where its text is visually hidden", async () => {
  const { UserArea } = await import("../../src/shell/UserArea.tsx");
  const html = renderToStaticMarkup(
    createElement(UserArea, { name: "Ana Pérez", jobTitle: null }),
  );
  assert.match(html, /<button[^>]*type="button"[^>]*>[\s\S]*Cerrar sesión/);
  assert.match(html, />AP</);
});

it("links to the own password change with an accessible name", async () => {
  const { UserArea } = await import("../../src/shell/UserArea.tsx");
  const html = renderToStaticMarkup(
    createElement(UserArea, { name: "Ana Pérez", jobTitle: null }),
  );
  const link = html.match(/<a\b[^>]*>/)?.[0] ?? "";
  assert.match(link, /href="\/account\/password"/);
  assert.match(link, /aria-label="Cambiar contraseña"/);
});

it("omits the job title when the user has none", async () => {
  const { UserArea } = await import("../../src/shell/UserArea.tsx");
  const html = renderToStaticMarkup(
    createElement(UserArea, { name: "Ana Pérez", jobTitle: null }),
  );
  assert.match(html, /Ana Pérez/);
  assert.doesNotMatch(html, /null/);
});

it("feeds the header from the server-side session", () => {
  const layout = readFileSync("app/(app)/layout.tsx", "utf8");
  assert.match(layout, /getCurrentSession\(\)/);
  assert.match(layout, /<AppHeader user=/);
});
