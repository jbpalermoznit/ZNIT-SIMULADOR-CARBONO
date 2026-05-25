#!/usr/bin/env node
/**
 * Capture screenshots of the live app for the Mintlify documentation.
 *
 * First run is interactive: opens a real browser, waits for the operator
 * to sign in via Clerk, then persists the session into
 * scripts/.auth-state.json. Subsequent runs reuse that file and run
 * headless until the cookies expire.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs            # uses cached auth or
 *                                                   # prompts to log in
 *   node scripts/capture-screenshots.mjs --reauth   # forces fresh login
 *
 * Output goes to ../mintlify-docs/images/ so the operator can commit it
 * straight into the docs repo afterwards.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const AUTH_FILE = resolve(REPO_ROOT, "scripts/.auth-state.json");
const OUTPUT_DIR = resolve(REPO_ROOT, "..", "mintlify-docs", "images");

const BASE = process.env.SHOT_BASE_URL ?? "https://simulador.znit.ai";

const reauth = process.argv.includes("--reauth");

// ------------------------------------------------------------------
// Shot list
// ------------------------------------------------------------------
// Each entry produces one PNG named after `file`. `url` may be relative to
// BASE. `wait` is an optional CSS selector to wait for before snapping
// (useful for client-side hydrated UI).

/** @type {Array<{file: string; url: string; wait?: string; fullPage?: boolean; auth?: boolean}>} */
const shots = [
  // Public
  { file: "sign-in.png",       url: "/sign-in",  wait: 'input[name="identifier"]' },
  { file: "sign-up.png",       url: "/sign-up",  wait: 'input[name="emailAddress"], input[name="identifier"]' },

  // Authenticated — caller must pick a project first; we navigate by URL
  // after pulling the first project id from the API.
  { file: "dashboard.png",     url: "/dashboard", wait: "h1", auth: true, fullPage: true },
];

// ------------------------------------------------------------------
// Login helper
// ------------------------------------------------------------------

async function captureLoginInteractively(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  console.log(
    "\nFaça login no navegador que abriu. O script detecta automaticamente " +
    "quando você cair no Dashboard ou Onboarding e salva a sessão."
  );
  // Poll until the URL leaves /sign-in (Clerk redirects to /dashboard or
  // /onboarding after a successful login). Max 5 minutes.
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (!url.includes("/sign-in") && !url.includes("/sign-up")) {
      console.log(`Detectei redirect: ${url}`);
      break;
    }
    await page.waitForTimeout(2000);
  }
  // Give the post-login route a moment to settle so cookies are fully set
  await page.waitForTimeout(2500);
  await ctx.storageState({ path: AUTH_FILE });
  console.log(`Sessão salva em ${AUTH_FILE}`);
  await ctx.close();
}

// ------------------------------------------------------------------
// Resolve a project id for the authenticated screenshots
// ------------------------------------------------------------------

async function resolveProjectShots(browser) {
  if (!existsSync(AUTH_FILE)) return [];
  const ctx = await browser.newContext({
    storageState: AUTH_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/api/projects`);
  const body = await page.textContent("body");
  await ctx.close();
  let projects = [];
  try {
    projects = JSON.parse(body ?? "[]");
  } catch {}
  const proj = projects[0];
  if (!proj) return [];
  const id = proj.id;
  return [
    { file: "overview.png",        url: `/projects/${id}/overview`,  wait: "h1", auth: true, fullPage: true },
    { file: "import.png",          url: `/projects/${id}/import`,    wait: "h1", auth: true, fullPage: false },
    { file: "items.png",           url: `/projects/${id}/items`,     wait: "table, h1", auth: true, fullPage: false },
    { file: "scenarios.png",       url: `/projects/${id}/scenarios`, wait: "h1", auth: true, fullPage: false },
  ];
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // First, the public shots (no auth)
  const publicShots = shots.filter((s) => !s.auth);

  const headlessBrowser = await chromium.launch({ headless: true });
  for (const shot of publicShots) {
    await capture(headlessBrowser, shot, /* useAuth */ false);
  }
  await headlessBrowser.close();

  // Authenticated path — need a session
  if (!existsSync(AUTH_FILE) || reauth) {
    const headedBrowser = await chromium.launch({ headless: false });
    await captureLoginInteractively(headedBrowser);
    await headedBrowser.close();
  }

  // Now capture the auth-only shots
  const browser = await chromium.launch({ headless: true });
  const projectShots = await resolveProjectShots(browser);
  if (projectShots.length === 0) {
    console.warn(
      "Nenhum projeto encontrado na conta logada. Crie um projeto em " +
      `${BASE}/dashboard e rode novamente para capturar Itens/Cenários/etc.`
    );
  }
  const allAuth = [...shots.filter((s) => s.auth), ...projectShots];
  for (const shot of allAuth) {
    await capture(browser, shot, /* useAuth */ true);
  }
  await browser.close();

  // Index file
  const index = [...publicShots, ...allAuth].map((s) => `${s.file}\t${s.url}`).join("\n");
  writeFileSync(resolve(OUTPUT_DIR, "INDEX.txt"), index + "\n");
  console.log(`\nPronto. ${OUTPUT_DIR}`);
}

async function capture(browser, shot, useAuth) {
  const ctxOptions = { viewport: { width: 1440, height: 900 } };
  if (useAuth && existsSync(AUTH_FILE)) ctxOptions.storageState = AUTH_FILE;
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}${shot.url}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if (shot.wait) {
      await page.waitForSelector(shot.wait, { timeout: 15_000 }).catch(() => {});
    }
    // Small settle delay for animations / lazy data
    await page.waitForTimeout(1500);
    const path = resolve(OUTPUT_DIR, shot.file);
    await page.screenshot({ path, fullPage: shot.fullPage ?? false });
    console.log(`✓ ${shot.file}  (${shot.url})`);
  } catch (e) {
    console.warn(`✗ ${shot.file}  (${shot.url})  ${e instanceof Error ? e.message : e}`);
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
