const Stripe = require('stripe');
const { User, Transaction } = require('../models');
const { sequelize } = require('../config/database');

// Devises sans décimales (Stripe ne multiplie pas par 100)
const ZERO_DECIMAL = new Set([
  'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA',
  'PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF',
]);

const toStripeAmount = (amount, currency) =>
  ZERO_DECIMAL.has((currency || 'XOF').toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);

// Stripe initialisé à la demande (évite crash si clé absente en dev)
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY non définie dans .env');
  }
  return Stripe(process.env.STRIPE_SECRET_KEY);
};

// POST /api/stripe/create-checkout
const createCheckoutSession = async (req, res, next) => {
  try {
    const stripe = getStripe();
    const { montant, currency = 'XOF', currency_symbol = 'FCFA' } = req.body;

    if (!montant || Number(montant) <= 0) {
      return res.status(400).json({ success: false, message: 'Montant invalide.' });
    }

    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `Recharge YesGo — ${montant} ${currency_symbol}`,
            description: 'Rechargement de portefeuille YesGo',
          },
          unit_amount: toStripeAmount(Number(montant), currency),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${appUrl}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/api/stripe/cancel`,
      metadata: {
        userId:  req.user.id,
        montant: String(montant),
        currency,
        currency_symbol,
      },
    });

    return res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) { next(err); }
};

// GET /api/stripe/success  (redirection Stripe après paiement)
const stripeSuccess = async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Paiement réussi</title>
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
        <p>Votre solde a été crédité.<br>Revenez dans l'application.</p>
        <small>Vous pouvez fermer cette fenêtre.</small>
      </div>
    </body>
    </html>
  `);
};

// GET /api/stripe/cancel
const stripeCancel = (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Paiement annulé</title>
      <style>
        body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
               justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
        .card { background: #fff; border-radius: 20px; padding: 40px; text-align: center;
                box-shadow: 0 4px 20px rgba(0,0,0,.1); max-width: 360px; }
        .icon { font-size: 56px; margin-bottom: 16px; }
        h1 { color: #EF4444; font-size: 22px; margin: 0 0 8px; }
        p  { color: #666; font-size: 15px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">❌</div>
        <h1>Paiement annulé</h1>
        <p>Aucun montant n'a été débité.<br>Revenez dans l'application.</p>
      </div>
    </body>
    </html>
  `);
};

// POST /api/stripe/webhook  (corps brut — configuré dans server.js)
const stripeWebhook = async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error('Webhook signature invalide :', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status !== 'paid') return res.json({ received: true });

    const { userId, montant } = session.metadata;
    const montantNum = parseFloat(montant);

    try {
      await sequelize.transaction(async (t) => {
        await User.increment('solde', { by: montantNum, where: { id: userId }, transaction: t });
        await Transaction.create({
          user_id:     userId,
          type:        'recharge',
          montant:     montantNum,
          description: `Recharge Stripe — ${session.metadata.montant} ${session.metadata.currency_symbol}`,
        }, { transaction: t });
      });
      console.log(`Wallet crédité : userId=${userId} +${montantNum}`);
    } catch (err) {
      console.error('Erreur webhook wallet :', err);
      return res.status(500).json({ error: 'Wallet update failed' });
    }
  }

  res.json({ received: true });
};

module.exports = { createCheckoutSession, stripeWebhook, stripeSuccess, stripeCancel };
