/**
 * YesGo Load Test — script Node.js natif (pas de dépendances)
 * Usage : node load-test/run.js
 */
const https = require('https');
const http  = require('http');

const BASE = 'https://web-production-b226e.up.railway.app/api';

// ── Helper : requête HTTP/HTTPS avec timeout ─────────────────────
function request(method, path, body, token, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const url  = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data  ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const t0  = Date.now();
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        resolve({ ok: res.statusCode < 500, status: res.statusCode, ms: Date.now() - t0 });
      });
    });
    req.on('error', () => resolve({ ok: false, status: 0, ms: Date.now() - t0 }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, status: 408, ms: timeoutMs }); });
    if (data) req.write(data);
    req.end();
  });
}

// ── Scénarios utilisateurs ────────────────────────────────────────
const scenarios = [
  // 60% — passager consulte la carte
  async () => request('GET', '/rides', null, null),
  async () => request('GET', '/rides', null, null),
  async () => request('GET', '/rides', null, null),

  // 25% — recherche GPS (Bamako)
  async () => request('GET', '/rides/search?lat=12.6392&lng=-8.0029&rayon=10', null, null),
  async () => request('GET', '/rides/search?lat=12.6392&lng=-8.0029&rayon=10', null, null),

  // 15% — tentative de connexion
  async () => request('POST', '/auth/login', { telephone: '+22365076262', mot_de_passe: 'test1234' }, null),
];

function pick() { return scenarios[Math.floor(Math.random() * scenarios.length)]; }

// ── Palette ANSI ──────────────────────────────────────────────────
const C = { reset:'\x1b[0m', bold:'\x1b[1m', green:'\x1b[32m', yellow:'\x1b[33m',
            red:'\x1b[31m', cyan:'\x1b[36m', gray:'\x1b[90m', blue:'\x1b[34m' };

// ── Exécution d'un palier ─────────────────────────────────────────
async function runPalier(name, concurrency, durationSec) {
  console.log(`\n${C.bold}${C.cyan}━━━ ${name} ━━━${C.reset}`);
  console.log(`${C.gray}  ${concurrency} utilisateurs simultanés · ${durationSec}s${C.reset}\n`);

  const results = [];
  const deadline = Date.now() + durationSec * 1000;

  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() < deadline) {
      const res = await pick()();
      results.push(res);
    }
  });

  await Promise.all(workers);

  // ── Stats ─────────────────────────────────────────────────────
  const ms       = results.map(r => r.ms).sort((a, b) => a - b);
  const total    = results.length;
  const errors   = results.filter(r => !r.ok).length;
  const errRate  = ((errors / total) * 100).toFixed(1);
  const rps      = (total / durationSec).toFixed(0);
  const p50      = ms[Math.floor(ms.length * 0.50)] ?? 0;
  const p95      = ms[Math.floor(ms.length * 0.95)] ?? 0;
  const p99      = ms[Math.floor(ms.length * 0.99)] ?? 0;
  const avg      = Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
  const max      = ms[ms.length - 1] ?? 0;

  const statusFor = (p) => {
    if (p < 500)  return C.green;
    if (p < 2000) return C.yellow;
    return C.red;
  };

  const errColor = parseFloat(errRate) < 2 ? C.green
    : parseFloat(errRate) < 10 ? C.yellow : C.red;

  console.log(`  ${C.bold}Requêtes${C.reset}         ${total} total · ${C.bold}${rps} req/s${C.reset}`);
  console.log(`  ${C.bold}Erreurs${C.reset}          ${errColor}${errors} (${errRate}%)${C.reset}`);
  console.log(`  ${C.bold}Temps de réponse${C.reset}`);
  console.log(`    Moyenne     ${statusFor(avg)}${avg} ms${C.reset}`);
  console.log(`    p50         ${statusFor(p50)}${p50} ms${C.reset}`);
  console.log(`    p95         ${statusFor(p95)}${p95} ms${C.reset}`);
  console.log(`    p99         ${statusFor(p99)}${p99} ms${C.reset}`);
  console.log(`    Max         ${statusFor(max)}${max} ms${C.reset}`);

  // ── Verdict ────────────────────────────────────────────────────
  const ok = p95 < 3000 && parseFloat(errRate) < 5;
  if (ok) {
    console.log(`\n  ${C.green}${C.bold}✓ PALIER OK — le serveur tient la charge${C.reset}`);
  } else {
    const raisons = [];
    if (p95 >= 3000) raisons.push(`p95 trop lent (${p95}ms > 3000ms)`);
    if (parseFloat(errRate) >= 5) raisons.push(`trop d'erreurs (${errRate}% > 5%)`);
    console.log(`\n  ${C.red}${C.bold}✗ LIMITE ATTEINTE — ${raisons.join(' · ')}${C.reset}`);
  }

  return { name, total, rps, errors, errRate, p50, p95, p99, avg, ok };
}

async function pause(sec, label) {
  process.stdout.write(`\n${C.gray}  ⏳ Pause ${sec}s ${label}...${C.reset}`);
  await new Promise(r => setTimeout(r, sec * 1000));
  console.log(' OK');
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════╗`);
  console.log(`║   YesGo — Load Test progressif   ║`);
  console.log(`╚══════════════════════════════════╝${C.reset}`);
  console.log(`${C.gray}  Cible : ${BASE}${C.reset}`);

  // Vérification serveur
  process.stdout.write(`\n${C.gray}  Ping serveur...${C.reset} `);
  const ping = await request('GET', '/rides', null, null, 5000);
  if (!ping.ok && ping.status !== 200) {
    console.log(`${C.red}HORS LIGNE (${ping.status}) — abandon.${C.reset}\n`);
    process.exit(1);
  }
  console.log(`${C.green}OK (${ping.ms}ms)${C.reset}`);

  const rapports = [];
  const paliers = [
    { name: 'Palier 1 — Chauffe',        concurrency: 10,  duration: 30 },
    { name: 'Palier 2 — Charge normale',  concurrency: 30,  duration: 30 },
    { name: 'Palier 3 — Charge soutenue', concurrency: 50,  duration: 30 },
    { name: 'Palier 4 — Pic',             concurrency: 100, duration: 30 },
  ];

  for (let i = 0; i < paliers.length; i++) {
    const p = paliers[i];
    const r = await runPalier(p.name, p.concurrency, p.duration);
    rapports.push(r);

    if (!r.ok) {
      console.log(`\n${C.yellow}  ⚠  Arrêt — seuil de performance dépassé à ${p.concurrency} utilisateurs.${C.reset}`);
      console.log(`${C.gray}  Les paliers suivants ne seraient pas significatifs.${C.reset}`);
      break;
    }

    if (i < paliers.length - 1) {
      await pause(5, `avant ${paliers[i+1].name}`);
    }
  }

  // ── Rapport final ──────────────────────────────────────────────
  console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════╗`);
  console.log(`║         Rapport final             ║`);
  console.log(`╚══════════════════════════════════╝${C.reset}\n`);

  const hdr = `${'Palier'.padEnd(30)} ${'req/s'.padStart(6)} ${'p95'.padStart(7)} ${'Erreurs'.padStart(8)} ${'Verdict'.padStart(8)}`;
  console.log(`${C.gray}  ${hdr}${C.reset}`);
  console.log(`${C.gray}  ${'─'.repeat(hdr.length)}${C.reset}`);

  for (const r of rapports) {
    const v   = r.ok ? `${C.green}✓ OK${C.reset}` : `${C.red}✗ KO${C.reset}`;
    const p95c = r.p95 < 1000 ? C.green : r.p95 < 2000 ? C.yellow : C.red;
    console.log(
      `  ${r.name.padEnd(30)} ${String(r.rps).padStart(6)} ` +
      `${p95c}${String(r.p95+'ms').padStart(7)}${C.reset} ` +
      `${String(r.errRate+'%').padStart(8)} ${v}`
    );
  }

  const maxOk = rapports.filter(r => r.ok).pop();
  if (maxOk) {
    console.log(`\n${C.green}${C.bold}  → Capacité stable : ${maxOk.name} (${maxOk.rps} req/s, p95=${maxOk.p95}ms)${C.reset}`);
  }
  console.log();
}

main().catch(e => { console.error(e); process.exit(1); });
