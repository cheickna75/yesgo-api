// ─────────────────────────────────────────────────────────────────────────────
// Configuration Beta YesGo
//
// Variables .env :
//   BETA_MODE=true               → active les messages "Beta" côté admin
//   BETA_COMMISSION_RATE=0       → 0 % de commission pendant le lancement
//   BETA_COMMISSION_RATE=0.10    → 10 % (production)
//
// Par défaut : 0 % pendant Beta, 10 % en production
// ─────────────────────────────────────────────────────────────────────────────

const BETA_MODE       = process.env.BETA_MODE !== 'false'; // true par défaut
const COMMISSION_RATE = parseFloat(process.env.BETA_COMMISSION_RATE ?? (BETA_MODE ? '0' : '0.10'));

module.exports = { BETA_MODE, COMMISSION_RATE };
