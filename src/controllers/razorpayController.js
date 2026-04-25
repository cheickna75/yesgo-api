// ─────────────────────────────────────────────────────────────────────────────
// Razorpay — stub prêt à brancher pour l'Asie (INR, PKR, BDT, NPR, LKR, AED…)
//
// Pour activer :
//   1. npm install razorpay
//   2. Ajouter dans .env : RAZORPAY_KEY_ID=xxx  RAZORPAY_KEY_SECRET=yyy
//   3. Remplacer les stubs ci-dessous par l'implémentation réelle
//      (Razorpay Orders API → hosted checkout ou Payment Link)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/razorpay/create-checkout
const createRazorpayCheckout = async (req, res, next) => {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({
        success: false,
        code:    'RAZORPAY_NOT_CONFIGURED',
        message: 'Razorpay n\'est pas encore activé pour cette région. Utilisez un autre moyen de paiement.',
      });
    }

    // TODO: implémenter l'intégration Razorpay
    // const Razorpay = require('razorpay');
    // const instance = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    // const order = await instance.orders.create({ amount: montant * 100, currency, receipt: transactionId });
    // const paymentLink = await instance.paymentLink.create({ amount: ..., currency, ... });
    // return res.json({ success: true, url: paymentLink.short_url });

    return res.status(501).json({ success: false, message: 'Razorpay — intégration à venir.' });
  } catch (err) { next(err); }
};

// POST /api/razorpay/webhook
const razorpayWebhook = async (req, res) => {
  // TODO: vérifier la signature X-Razorpay-Signature avec RAZORPAY_WEBHOOK_SECRET
  // et créditer le wallet après event `payment.captured`
  return res.json({ received: true });
};

module.exports = { createRazorpayCheckout, razorpayWebhook };
