const { Router } = require('express');
const {
  createCheckoutSession,
  stripeSuccess,
  stripeCancel,
} = require('../controllers/stripeController');
const { protect } = require('../middleware/auth');

const router = Router();

// Redirections Stripe (publiques — appelées par le navigateur)
router.get('/success', stripeSuccess);
router.get('/cancel',  stripeCancel);

// Création de session (authentifiée)
router.post('/create-checkout', protect, createCheckoutSession);

module.exports = router;
