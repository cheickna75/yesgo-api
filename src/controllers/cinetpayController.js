const { User, Transaction } = require('../models');
const { sequelize } = require('../config/database');

const CINETPAY_URL       = 'https://api-checkout.cinetpay.com/v2/payment';
const CINETPAY_CHECK_URL = 'https://api-checkout.cinetpay.com/v2/payment/check';

// Sélection automatique prod → test → null (simulation)
function getCinetPayCredentials() {
  if (process.env.CINETPAY_API_KEY && process.env.CINETPAY_SITE_ID) {
    return { apiKey: process.env.CINETPAY_API_KEY, siteId: process.env.CINETPAY_SITE_ID, isTest: false };
  }
  if (process.env.CINETPAY_TEST_API_KEY && process.env.CINETPAY_TEST_SITE_ID) {
    return { apiKey: process.env.CINETPAY_TEST_API_KEY, siteId: process.env.CINETPAY_TEST_SITE_ID, isTest: true };
  }
  return null;
}

// POST /api/cinetpay/create-checkout
const createCinetPayCheckout = async (req, res, next) => {
  try {
    const creds = getCinetPayCredentials();
    if (!creds) {
      // Aucune clé configurée → demander au mobile de basculer en simulation
      return res.status(503).json({
        success: false,
        code:    'USE_SIMULATION',
        message: 'Aucune clé CinetPay configurée. Mode simulation activé.',
      });
    }

    const { montant, currency = 'XOF', currency_symbol = 'FCFA' } = req.body;
    if (!montant || Number(montant) <= 0) {
      return res.status(400).json({ success: false, message: 'Montant invalide.' });
    }

    const appUrl       = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const transactionId = `YESGO_${req.user.id}_${Date.now()}`;

    const payload = {
      apikey:         creds.apiKey,
      site_id:        creds.siteId,
      transaction_id: transactionId,
      amount:         Math.round(Number(montant)),
      currency:       currency.toUpperCase(),
      description:    `Recharge YesGo — ${montant} ${currency_symbol}`,
      return_url:     `${appUrl}/api/cinetpay/success`,
      notify_url:     `${appUrl}/api/cinetpay/webhook`,
      channels:       'ALL',
      metadata:       JSON.stringify({ userId: req.user.id, montant: String(montant), currency_symbol }),
      lang:           'fr',
    };

    const resp = await fetch(CINETPAY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const data = await resp.json();

    if (data.code !== '201') {
      return res.status(400).json({ success: false, message: data.message || 'Erreur CinetPay' });
    }

    return res.json({
      success: true,
      url:     data.data.payment_url,
      token:   data.data.payment_token,
      isTest:  creds.isTest,
    });
  } catch (err) { next(err); }
};

// POST /api/cinetpay/webhook  — appelé par CinetPay après paiement
const cinetPayWebhook = async (req, res) => {
  const { cpm_trans_id, cpm_trans_status } = req.body;

  // CinetPay attend toujours une réponse 200 avec code "00"
  if (cpm_trans_status !== 'ACCEPTED') {
    return res.json({ code: '00', message: 'Ignored' });
  }

  try {
    // Vérification auprès de CinetPay avant de créditer
    const creds = getCinetPayCredentials();
    if (!creds) return res.json({ code: '00', message: 'No credentials' });

    const checkResp = await fetch(CINETPAY_CHECK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey:         creds.apiKey,
        site_id:        creds.siteId,
        transaction_id: cpm_trans_id,
      }),
    });
    const check = await checkResp.json();

    if (check.data?.status !== 'ACCEPTED') {
      return res.json({ code: '00', message: 'Not verified' });
    }

    const meta           = JSON.parse(check.data.metadata || '{}');
    const userId         = meta.userId;
    const montant        = parseFloat(meta.montant || check.data.amount);
    const currency_symbol = meta.currency_symbol || check.data.currency;

    if (!userId) {
      console.error('CinetPay webhook: userId manquant dans metadata', meta);
      return res.json({ code: '00', message: 'No userId' });
    }

    await sequelize.transaction(async (t) => {
      await User.increment('solde', { by: montant, where: { id: userId }, transaction: t });
      await Transaction.create({
        user_id:     userId,
        type:        'recharge',
        montant,
        description: `Recharge CinetPay — ${montant} ${currency_symbol}`,
      }, { transaction: t });
    });

    console.log(`[CinetPay] Wallet crédité : userId=${userId} +${montant}`);
    return res.json({ code: '00', message: 'OK' });
  } catch (err) {
    console.error('[CinetPay] Webhook error:', err.message);
    return res.status(500).json({ code: '01', message: 'Server error' });
  }
};

// GET /api/cinetpay/success — page de retour après paiement
const cinetPaySuccess = (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Recharge réussie</title>
      <style>
        body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
               justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
        .card { background: #fff; border-radius: 20px; padding: 40px; text-align: center;
                box-shadow: 0 4px 20px rgba(0,0,0,.1); max-width: 360px; }
        .icon { font-size: 56px; margin-bottom: 16px; }
        h1 { color: #22C55E; font-size: 22px; margin: 0 0 8px; }
        p  { color: #666; font-size: 15px; line-height: 1.5; }
        small { color: #aaa; font-size: 12px; margin-top: 20px; display: block; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">✅</div>
        <h1>Recharge réussie !</h1>
        <p>Votre solde a été crédité.<br>Revenez dans l'application YesGo.</p>
        <small>Vous pouvez fermer cette fenêtre.</small>
      </div>
    </body>
    </html>
  `);
};

module.exports = { createCinetPayCheckout, cinetPayWebhook, cinetPaySuccess };
