#!/usr/bin/env node
/**
 * Capture screenshots of the live app for the Mintlify documentation.
 *
 * Re-run this after any UI change that affects the documented screens.
 *
 * Usage:
 *   npm run screenshots              # uses cached auth or prompts to log in
 *   npm run screenshots:reauth       # forces a fresh interactive login
 *   npm run screenshots -- --only=overview,items   # only those shots
 *   npm run screenshots -- --base=http://localhost:3000   # local dev
 *
 * Env overrides:
 *   SHOT_BASE_URL       — defaults to https://simulador.znit.ai
 *   MINTLIFY_IMAGES_DIR — defaults to ../mintlify-docs/images
 *
 * Auth: the first run is headed; sign in once and the session is cached at
 * scripts/.auth-state.json (gitignored). Cookies last several days; rerun
 * with --reauth when they expire.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const AUTH_FILE = resolve(REPO_ROOT, "scripts/.auth-state.json");
const DEFAULT_OUT = resolve(REPO_ROOT, "..", "mintlify-docs", "images");
const OUTPUT_DIR = process.env.MINTLIFY_IMAGES_DIR
  ? resolve(process.env.MINTLIFY_IMAGES_DIR)
  : DEFAULT_OUT;

// ---- CLI args ----------------------------------------------------------
const argv = process.argv.slice(2);
const reauth = argv.includes("--reauth");
const baseArg = argv.find((a) => a.startsWith("--base="));
const onlyArg = argv.find((a) => a.startsWith("--only="));
const BASE = baseArg ? baseArg.slice("--base=".length) : process.env.SHOT_BASE_URL ?? "https://simulador.znit.ai";
const onlyFilter = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;

// ---- Shot list ---------------------------------------------------------
// Each shot:
//   id        — short name, used by --only filter
//   file      — PNG filename
//   url       — relative to BASE (resolved at runtime for project-scoped urls)
//   wait      — CSS selector to wait for before snapping
//   auth      — true if Clerk session needed
//   fullPage  — pass-through to page.screenshot
//   interact  — async (page) => void; triggers UI state (open drawer, etc.)
//
// `urlBuilder` overrides `url` when the URL depends on a resolved projectId.

const publicShots = [
  { id: "sign-in", file: "sign-in.png", url: "/sign-in",
    wait: 'input[name="identifier"]' },
  { id: "sign-up", file: "sign-up.png", url: "/sign-up",
    wait: 'input[name="emailAddress"], input[name="identifier"]' },
];

const authShotsStatic = [
  { id: "dashboard", file: "dashboard.png", url: "/dashboard",
    wait: "h1", auth: true, fullPage: true },
];

/** @returns {Array<Shot>} */
function projectShots(id) {
  return [
    { id: "overview", file: "overview.png",
      url: `/projects/${id}/overview`,
      wait: "h1", auth: true, fullPage: true },

    { id: "import", file: "import.png",
      url: `/projects/${id}/import`,
      wait: "h1", auth: true },

    { id: "items", file: "items.png",
      url: `/projects/${id}/items`,
      wait: "table, h1", auth: true },

    // Same Itens screen but with the row drawer open. Double-clicks the
    // first non-parent data row; drawer is the floating right panel.
    { id: "items-drawer", file: "items-drawer.png",
      url: `/projects/${id}/items`,
      wait: "table tbody tr", auth: true,
      interact: async (page) => {
        // Skip rows that represent assembly parents (italic font / Comp badge)
        // by picking the first row whose Type column shows A/B/C/D/E/F.
        const row = page.locator("table tbody tr").filter({
          hasText: /\b[A-F]\b/,
        }).first();
        await row.dblclick({ timeout: 8_000 });
        await page.waitForSelector(
          'div.fixed.right-0.top-0.bottom-0',
          { timeout: 8_000 },
        );
        // Let drawer content (mapping fetch) settle
        await page.waitForTimeout(1500);
      } },

    { id: "scenarios", file: "scenarios.png",
      url: `/projects/${id}/scenarios`,
      wait: "h1", auth: true },

    // Upload-new-scenario modal opened from the Scenarios grid card.
    { id: "scenarios-upload", file: "scenarios-upload.png",
      url: `/projects/${id}/scenarios`,
      wait: "h1", auth: true,
      interact: async (page) => {
        await page.getByText("Novo cenário a partir de arquivo").click({
          timeout: 8_000,
        });
        await page.waitForSelector('text=Cria um cenário paralelo', {
          timeout: 8_000,
        });
        await page.waitForTimeout(800);
      } },
  ];
}

// ---- Main --------------------------------------------------------------

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = []; // { id, file, ok, error? }

  // Public shots (no auth)
  const pubs = filterShots(publicShots);
  if (pubs.length) {
    const browser = await chromium.launch({ headless: true });
    for (const shot of pubs) {
      results.push(await capture(browser, shot, /* useAuth */ false));
    }
    await browser.close();
  }

  // Need auth from here on
  const needsAuth = filterShots(authShotsStatic).length > 0
    || (onlyFilter === null) // default run: also pull project shots
    || [...onlyFilter ?? []].some((id) => projectShotIds().has(id));

  if (!needsAuth) {
    return finish(results);
  }

  if (!existsSync(AUTH_FILE) || reauth) {
    const headed = await chromium.launch({ headless: false });
    await captureLoginInteractively(headed);
    await headed.close();
  }

  const browser = await chromium.launch({ headless: true });

  // Static auth shots
  for (const shot of filterShots(authShotsStatic)) {
    results.push(await capture(browser, shot, /* useAuth */ true));
  }

  // Project-scoped shots — need a projectId
  const projectId = await resolveFirstProjectId(browser);
  if (projectId) {
    for (const shot of filterShots(projectShots(projectId))) {
      results.push(await capture(browser, shot, /* useAuth */ true));
    }
  } else {
    console.warn(
      `Nenhum projeto encontrado em ${BASE}/api/projects. ` +
      `Crie um projeto na conta logada e rode novamente.`,
    );
  }

  await browser.close();
  finish(results);
}

function finish(results) {
  // Index file beside the PNGs
  const index = results
    .filter((r) => r.ok)
    .map((r) => `${r.file}\t${r.url}`)
    .join("\n");
  writeFileSync(resolve(OUTPUT_DIR, "INDEX.txt"), index + "\n");

  // Summary
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(`Saída: ${OUTPUT_DIR}`);
  console.log(`✓ ${ok.length} ok  ✗ ${failed.length} falharam`);
  if (failed.length) {
    for (const f of failed) console.log(`   ✗ ${f.id} (${f.file}) — ${f.error}`);
    process.exitCode = 1;
  }
}

function filterShots(list) {
  if (!onlyFilter) return list;
  return list.filter((s) => onlyFilter.has(s.id));
}

function projectShotIds() {
  return new Set(projectShots("x").map((s) => s.id));
}

// ---- Helpers -----------------------------------------------------------

async function captureLoginInteractively(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  console.log(
    "\nFaça login no navegador. O script detecta quando você cai no " +
    "Dashboard/Onboarding e salva a sessão automaticamente.",
  );
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes("/sign-in") && !url.includes("/sign-up")) {
      console.log(`Detectei redirect: ${url}`);
      break;
    }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(2500);
  await ctx.storageState({ path: AUTH_FILE });
  console.log(`Sessão salva em ${AUTH_FILE}`);
  await ctx.close();
}

async function resolveFirstProjectId(browser) {
  if (!existsSync(AUTH_FILE)) return null;
  const ctx = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/api/projects`);
  const body = await page.textContent("body");
  await ctx.close();
  try {
    const projects = JSON.parse(body ?? "[]");
    return projects[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function capture(browser, shot, useAuth) {
  const ctxOptions = { viewport: { width: 1440, height: 900 } };
  if (useAuth && existsSync(AUTH_FILE)) ctxOptions.storageState = AUTH_FILE;
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  const result = { id: shot.id, file: shot.file, url: shot.url, ok: false };
  try {
    await page.goto(`${BASE}${shot.url}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (shot.wait) {
      await page.waitForSelector(shot.wait, { timeout: 15_000 }).catch(() => {});
    }
    await page.waitForTimeout(1500);
    if (shot.interact) await shot.interact(page);
    const path = resolve(OUTPUT_DIR, shot.file);
    await page.screenshot({ path, fullPage: shot.fullPage ?? false });
    result.ok = true;
    console.log(`✓ ${shot.id.padEnd(20)} ${shot.file}`);
  } catch (e) {
    result.error = e instanceof Error ? e.message.split("\n")[0] : String(e);
    console.warn(`✗ ${shot.id.padEnd(20)} ${shot.file}  — ${result.error}`);
  } finally {
    await ctx.close();
  }
  return result;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
