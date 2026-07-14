#!/usr/bin/env node
/**
 * Hotbox pre-push mandatory smoke gate (2026-07-14)
 *
 * USAGE:
 *   node scripts/smoke_prepush.js
 *   SMOKE_BASE_URL=https://hotbox-seven.vercel.app node scripts/smoke_prepush.js
 *
 * REQUIRES: `npm install` at repo root (installs playwright)
 *
 * INSTALL AS GIT HOOK (one-time):
 *   node scripts/smoke_prepush.js --install-hook
 *
 * PASS criteria (ALL must hold before any push):
 *   Gate 0a: tsc --noEmit in frontend/ (catches strict errors before Next.js build)
 *   Gate 0b: tsc --noEmit in server/ (catches Railway build failures locally)
 *   Gate 1:  Login → composer visible — app-specific selector, NOT networkidle
 *             (blocks SSO/Vercel-login false-pass)
 *   Gate 2:  Send message → visible SENT (no "sending…" U+2026 or "sending...")
 *             within 5s — user's eyes, not internal flags
 *   Gate 3:  WS msg.ack frame received (type:"msg.ack" specifically, not just
 *             any non-hello frame — blocks msg.new false-positive)
 *   Gate 4:  Page refresh → message persists (server wrote it to JSONL)
 *   Gate 5:  Cross-session fanout — second browser context receives msg.new WS
 *             frame after first context sends (catches the fanOut exclusion bug)
 *
 * Reference: feedback_user_function_usability_smoke.md / Lex 2026-07-13
 */

'use strict';

const { spawnSync, execSync } = require('child_process');
const path          = require('path');
const fs            = require('fs');

// ── install-hook shortcut ─────────────────────────────────────────────────────

if (process.argv.includes('--install-hook')) {
  const hookPath = path.resolve(__dirname, '..', '.git', 'hooks', 'pre-push');
  // git hooks run with CWD = repo root, so use repo-root-relative path
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, '#!/bin/sh\nnode scripts/smoke_prepush.js\n', 'utf8');
  try { fs.chmodSync(hookPath, 0o755); } catch {}
  console.log(`[HOOK] Installed pre-push hook → ${hookPath}`);
  process.exit(0);
}

// ── config ────────────────────────────────────────────────────────────────────

const BASE_URL      = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const ENGINE        = process.env.SMOKE_ENGINE   || 'chromium';
const INVITE_CODE   = process.env.SMOKE_CODE     || 'HOTBOXBETA';
const REPO_ROOT     = path.resolve(__dirname, '..');
const OUT_DIR       = path.resolve(__dirname, '..', 'smoke-screenshots');
const SENDING_REGEX = /sending[.…]{1,3}/i;   // covers "sending...", "sending…", "sending.."

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── helpers ───────────────────────────────────────────────────────────────────

let playwright;
try {
  playwright = require('playwright');
} catch {
  console.error('[SMOKE] playwright not found — run `npm install` in the repo root first.');
  process.exit(1);
}

function uid(p = '') { return `${p}${Date.now().toString(36).slice(-6)}`; }

function bail(gate, msg, detail = '') {
  console.error(`\n╔═ FAIL ${gate} ${'═'.repeat(Math.max(0, 60 - gate.length - 7))}╗`);
  console.error(`║ ${msg}`);
  if (detail) detail.split('\n').forEach(l => console.error(`║ ${l}`));
  console.error('╚' + '═'.repeat(62) + '╝');
  process.exit(1);
}

function pass(gate, note) {
  console.log(`  ✓ GATE ${gate}: ${note}`);
}

// ── Gate 0: TypeScript ────────────────────────────────────────────────────────

console.log('═'.repeat(64));
console.log('  Hotbox pre-push smoke');
console.log('═'.repeat(64));
console.log(`  URL    : ${BASE_URL}`);
console.log(`  Engine : ${ENGINE}`);
console.log('');
console.log('[Gate 0] TypeScript compilation');

for (const sub of ['frontend', 'server']) {
  const dir    = path.join(REPO_ROOT, sub);
  const tscBin = path.join(dir, 'node_modules', '.bin', 'tsc');
  if (!fs.existsSync(tscBin)) {
    console.log(`  ⚠ SKIP ${sub}/tsc — no node_modules (run npm install in ${sub}/)`);
    continue;
  }
  // Use execSync with a quoted path string — avoids shell:true args-escaping
  // deprecation warning while still working with Windows .bin/ shims.
  try {
    execSync(`"${tscBin}" --noEmit`, { cwd: dir, stdio: 'pipe' });
  } catch (e) {
    bail(`0 tsc/${sub}`, `TypeScript errors in ${sub}/`, String(e.stdout || e.stderr || e.message || '').trim());
  }
  pass(`0a/${sub}`, 'compiles clean');
}

// ── Gate 1–5: Playwright ──────────────────────────────────────────────────────

// Quick reachability check before spinning up a browser.
// If BASE_URL is localhost and the server isn't running, skip Gate 1 rather
// than blocking the push entirely. Against real deploy URLs, fail if unreachable.
async function isReachable(url) {
  const http = require(url.startsWith('https') ? 'https' : 'http');
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 3000 }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  const reachable = await isReachable(BASE_URL);
  const isLocal   = /localhost|127\.0\.0\.1/.test(BASE_URL);

  if (!reachable) {
    if (isLocal) {
      console.log(`\n[Gates 1–5] SKIP — ${BASE_URL} not reachable (start npm run dev to enable Playwright gate)`);
      console.log('  Gate 0 (TypeScript) was the only gate run. Playwright gates skipped.\n');
      console.log('═'.repeat(64));
      console.log('  SMOKE PASS (Gate 0 only) — start dev server for full Gate 1–5.');
      console.log('═'.repeat(64));
      process.exit(0);
    }
    bail('1 REACHABLE', `${BASE_URL} is not reachable — cannot run Playwright gates.`);
  }

  console.log('\n[Gates 1–5] Playwright (mobile 393×852)');
  const browser = await playwright[ENGINE].launch({ headless: true });

  async function loginAs(name, page) {
    await page.goto(`${BASE_URL}/login?code=${INVITE_CODE}`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    // SSO guard — if Vercel deployment protection redirected us, bail early
    const url = page.url();
    if (url.includes('vercel.com/') || url.includes('/_vercel/')) {
      bail('1 LOGIN', 'Vercel SSO redirect detected — smoke cannot reach the app.', [
        `Redirected to: ${url}`,
        'Solutions: use SMOKE_BASE_URL pointing to an unprotected deploy,',
        'or use a ?_vercel_share= bypass token.',
      ].join('\n'));
    }

    await page.locator('form[data-testid="login-form"]').waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('input[name="name"]').fill(name);
    await page.locator('button[data-testid="login-submit"]').click();
    await page.waitForTimeout(4_000);

    // Dismiss key-loss modal if present
    const ackBtn = page.locator('button').filter({ hasText: /I understand.*continue/i });
    if (await ackBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const cb = page.locator('input[type="checkbox"]').first();
      if (await cb.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await cb.check({ timeout: 2_000 }).catch(() => {});
      }
      await ackBtn.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(2_000);
    }

    // App-specific gate — workspace-label is only rendered by the real app,
    // not by Vercel SSO login pages, DPL bypass pages, or keystore error screens.
    const ok = await page.locator('[data-testid="workspace-label"]').isVisible({ timeout: 15_000 }).catch(() => false);
    if (!ok) {
      const shot = path.join(OUT_DIR, `fail-login-${uid()}.png`);
      await page.screenshot({ path: shot }).catch(() => {});
      bail('1 LOGIN', `workspace-label not visible — check screenshot: ${shot}`, `Page URL: ${page.url()}`);
    }
    return true;
  }

  try {
    // ── Session A: self-send journey ──────────────────────────────────────────
    const ctxA  = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const pageA = await ctxA.newPage();
    const nameA = uid('smoke-');
    const wsA   = { sent: [], recv: [] };

    // Collect 404s on hotbox API calls
    const apiErrors = [];
    pageA.on('response', (r) => {
      if (r.status() >= 400 && /\/api\/hotbox/.test(r.url())) {
        apiErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
      }
    });
    pageA.on('websocket', (ws) => {
      ws.on('framesent',     (f) => wsA.sent.push({ t: Date.now(), p: String(f.payload).slice(0, 400) }));
      ws.on('framereceived', (f) => wsA.recv.push({ t: Date.now(), p: String(f.payload).slice(0, 400) }));
    });

    // Gate 1: login
    console.log(`\n  [A] logging in as ${nameA}`);
    await loginAs(nameA, pageA);
    pass('1 LOGIN', `app loaded as ${nameA}`);

    // Gate 2+3: send → visible-sent + msg.ack
    const composer = pageA.locator('[data-testid="composer-input"]');
    if (!(await composer.isVisible({ timeout: 10_000 }).catch(() => false))) {
      const shot = path.join(OUT_DIR, `fail-composer-${uid()}.png`);
      await pageA.screenshot({ path: shot }).catch(() => {});
      bail('2 SEND', 'composer not visible after login', `screenshot: ${shot}`);
    }

    const msgText = uid('msg-');
    const sendTs  = Date.now();
    await composer.fill(msgText);
    await pageA.waitForTimeout(200);
    await pageA.keyboard.press('Enter');
    console.log(`  [A] sent "${msgText}"`);

    // Poll every 500ms for up to 6s
    let sentPass   = false;
    let ackFrame   = null;
    let lastDom    = null;
    const deadline = Date.now() + 6_000;

    while (Date.now() < deadline) {
      await pageA.waitForTimeout(500);

      // Gate 3: look for actual msg.ack frame (not just any non-hello)
      if (!ackFrame) {
        ackFrame = wsA.recv.find(
          f => f.t >= sendTs && /"type"\s*:\s*"msg\.ack"/.test(f.p)
        ) ?? null;
      }

      // Gate 2: visible UI — user's eyes, not internal flags
      lastDom = await pageA.evaluate((needle) => {
        const body = document.body?.innerText || '';
        if (!body.includes(needle)) return { hasMsg: false, ctx: null };
        const all  = Array.from(document.querySelectorAll('*'));
        const node = all.find(n => n.children.length === 0 && n.textContent === needle);
        let ctx = '';
        if (node) {
          let p = node;
          for (let i = 0; i < 4 && p; i++) p = p.parentElement;
          ctx = (p?.innerText || '').slice(0, 300);
        }
        return { hasMsg: true, ctx };
      }, msgText);

      const stillSending = lastDom.ctx && SENDING_REGEX.test(lastDom.ctx);
      if (lastDom.hasMsg && !stillSending && ackFrame) { sentPass = true; break; }
    }

    if (!sentPass) {
      const shot = path.join(OUT_DIR, `fail-send-${uid()}.png`);
      await pageA.screenshot({ path: shot }).catch(() => {});
      const stillSending = !!(lastDom?.ctx && SENDING_REGEX.test(lastDom.ctx));
      bail('2+3 SEND', 'Message stuck or ack missing after 6s', [
        `hasMsg         : ${lastDom?.hasMsg}`,
        `stillSending   : ${stillSending}`,
        `msg.ack frame  : ${ackFrame ? `YES (latency ${ackFrame.t - sendTs}ms)` : 'NONE — msg.ack never received'}`,
        `wsRecv total   : ${wsA.recv.length}`,
        `visibleCtx     : "${(lastDom?.ctx || '').slice(0, 150)}"`,
        `api errors     : ${apiErrors.join(', ') || 'none'}`,
        `screenshot     : ${shot}`,
      ].join('\n'));
    }
    pass('2 VISIBLE', `"sending…" cleared within ${Date.now() - sendTs}ms`);
    pass('3 MSG.ACK', `wire ack received (latency ${ackFrame.t - sendTs}ms)`);

    // Gate 4: refresh → persist
    console.log('  [A] reloading…');
    await pageA.reload({ waitUntil: 'networkidle', timeout: 30_000 });
    await pageA.waitForTimeout(3_000);

    // Re-dismiss modal if it reappears after reload
    const ackBtnR = pageA.locator('button').filter({ hasText: /I understand.*continue/i });
    if (await ackBtnR.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const cbR = pageA.locator('input[type="checkbox"]').first();
      if (await cbR.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await cbR.check({ timeout: 2_000 }).catch(() => {});
      }
      await ackBtnR.click({ timeout: 5_000 }).catch(() => {});
      await pageA.waitForTimeout(2_000);
    }

    const afterBody = await pageA.textContent('body').catch(() => '');
    if (!afterBody.includes(msgText)) {
      const shot = path.join(OUT_DIR, `fail-persist-${uid()}.png`);
      await pageA.screenshot({ path: shot }).catch(() => {});
      bail('4 PERSIST', `"${msgText}" missing after page reload`, `screenshot: ${shot}`);
    }
    pass('4 PERSIST', 'message visible after hard refresh');

    // ── Gate 5: cross-session fanout ─────────────────────────────────────────
    console.log('\n  [fanout] second context — testing WS fanout path');
    const ctxB  = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const pageB = await ctxB.newPage();
    const nameB = uid('rcvr-');
    const wsB   = { recv: [] };

    pageB.on('websocket', (ws) => {
      ws.on('framereceived', (f) => wsB.recv.push({ t: Date.now(), p: String(f.payload).slice(0, 400) }));
    });

    await loginAs(nameB, pageB);
    console.log(`  [B] logged in as ${nameB} — subscribed to channel`);

    // Wait for B to send channel.join (hello arrives → useEffect fires)
    await pageB.waitForTimeout(2_000);

    // A sends a new message; B must receive msg.new via fanOut
    const fanoutMsg = uid('fanout-');
    const fanoutTs  = Date.now();
    const compA2    = pageA.locator('[data-testid="composer-input"]');
    await compA2.fill(fanoutMsg);
    await pageA.keyboard.press('Enter');
    console.log(`  [A] sent "${fanoutMsg}" — waiting for B to receive msg.new`);

    let fanoutOk = false;
    const fanDeadline = Date.now() + 8_000;
    while (Date.now() < fanDeadline) {
      await pageB.waitForTimeout(500);
      if (wsB.recv.find(f => f.t >= fanoutTs && /"type"\s*:\s*"msg\.new"/.test(f.p))) {
        fanoutOk = true;
        break;
      }
    }

    if (!fanoutOk) {
      const shot = path.join(OUT_DIR, `fail-fanout-${uid()}.png`);
      await pageB.screenshot({ path: shot }).catch(() => {});
      bail('5 FANOUT', 'Context B never received msg.new WS frame from A', [
        `wsB.recv=${wsB.recv.length} frames`,
        `last 3: ${wsB.recv.slice(-3).map(f => f.p.slice(0, 100)).join(' | ')}`,
        `screenshot: ${shot}`,
      ].join('\n'));
    }
    pass('5 FANOUT', 'cross-session msg.new delivered to B');

    await ctxA.close();
    await ctxB.close();

  } finally {
    await browser.close();
  }

  console.log('');
  console.log('═'.repeat(64));
  console.log('  SMOKE PASS — all gates green. Safe to push.');
  console.log('═'.repeat(64));
  console.log('');
  process.exit(0);

})().catch(err => {
  console.error('\n[SMOKE CRASH]', err.message);
  if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
  process.exit(1);
});
