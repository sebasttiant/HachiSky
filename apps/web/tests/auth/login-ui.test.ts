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

it("renders the user area in the header only when a user is given", () => {
  const header = readFileSync("src/shell/AppHeader.tsx", "utf8");
  assert.match(header, /user \? \(\s*<UserArea/);
});

it("derives avatar initials from the user's name", async () => {
  const { initials } = await import("../../src/shell/UserArea.tsx");
  assert.equal(initials("Ana Pérez"), "AP");
  assert.equal(initials("  maría  josé  de la cruz "), "MC");
  assert.equal(initials("Admin"), "A");
  assert.equal(initials("   "), "?");
});

async function renderUserArea(
  props: { jobTitle?: string | null; role?: "admin" | "staff" } = {},
) {
  const { UserArea } = await import("../../src/shell/UserArea.tsx");
  return renderToStaticMarkup(
    createElement(UserArea, {
      name: "Ana Pérez",
      role: props.role ?? "admin",
      jobTitle: props.jobTitle === undefined ? null : props.jobTitle,
    }),
  );
}

function splitMenu(html: string) {
  const trigger = html.match(
    /<button\b[^>]*aria-expanded[^>]*>[\s\S]*?<\/button>/,
  );
  assert.ok(trigger, "expected a disclosure trigger button");
  const controls = trigger[0].match(/aria-controls="([^"]+)"/)?.[1];
  assert.ok(controls, "trigger must reference its panel");
  const panelStart = html.indexOf(`id="${controls}"`);
  assert.ok(panelStart > -1, "panel id must match aria-controls");
  const outside = html.replace(html.slice(panelStart), "");
  return {
    trigger: trigger[0],
    panelTag: html.slice(html.lastIndexOf("<", panelStart), panelStart + 60),
    panel: html.slice(panelStart),
    outside,
  };
}

it("opens the account actions from a closed disclosure button", async () => {
  const { trigger, panelTag } = splitMenu(await renderUserArea());
  assert.match(trigger, /type="button"/);
  assert.match(trigger, /aria-expanded="false"/);
  assert.match(panelTag, /\bhidden\b/);
  assert.doesNotMatch(trigger, /role="menu"/);
});

it("keeps the user's name in the trigger's accessible content", async () => {
  const { trigger } = splitMenu(await renderUserArea());
  assert.match(trigger, /Ana Pérez/);
  assert.match(trigger, />AP</);
});

it("lists name, role, change-password link and logout inside the panel", async () => {
  const { panel } = splitMenu(
    await renderUserArea({ jobTitle: "Asesora de seguros" }),
  );
  assert.match(panel, /Ana Pérez/);
  assert.match(panel, /Administrador/);
  assert.match(panel, /Asesora de seguros/);
  const link = panel.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
  assert.match(link, /href="\/account\/password"/);
  assert.match(link, /Cambiar contraseña/);
  assert.match(panel, /<button[^>]*type="button"[^>]*>[\s\S]*Cerrar sesión/);
});

it("shows the staff role label", async () => {
  const { panel } = splitMenu(await renderUserArea({ role: "staff" }));
  assert.match(panel, /Colaborador/);
});

it("keeps the key link and logout out of the bar", async () => {
  const { outside } = splitMenu(await renderUserArea());
  assert.doesNotMatch(outside, /<a\b/);
  assert.doesNotMatch(outside, /Cerrar sesión/);
  assert.doesNotMatch(outside, /Cambiar contraseña/);
});

it("omits the job title when the user has none", async () => {
  const html = await renderUserArea({ jobTitle: null });
  assert.match(html, /Ana Pérez/);
  assert.doesNotMatch(html, /null/);
});

it("closes the menu on Escape, outside interaction, focus loss and link follow", () => {
  const source = readFileSync("src/shell/UserArea.tsx", "utf8");
  assert.match(source, /"use client"/);
  assert.match(source, /Escape/);
  assert.match(source, /pointerdown/);
  assert.match(source, /focusin/);
  assert.match(source, /<Link[^>]*onClick/);
});

it("passes the session role from the header to the user menu", () => {
  const header = readFileSync("src/shell/AppHeader.tsx", "utf8");
  assert.match(header, /role: RoleName/);
  assert.match(header, /role=\{user\.role\}/);
});

it("keeps the logout flow: signOut then a full navigation to /login", () => {
  const source = readFileSync("src/shell/LogoutButton.tsx", "utf8");
  assert.match(source, /signOut\(\)/);
  assert.match(source, /window\.location\.replace\("\/login"\)/);
});

it("feeds the header from the server-side session", () => {
  const layout = readFileSync("app/(app)/layout.tsx", "utf8");
  assert.match(layout, /getCurrentSession\(\)/);
  assert.match(layout, /<AppHeader user=/);
});
