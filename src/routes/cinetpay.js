const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { createCinetPayCheckout, cinetPayWebhook, cinetPaySuccess } = require('../controllers/cinetpayController');

const router = Router();

router.post('/create-checkout', protect, createCinetPayCheckout);
router.post('/webhook',         cinetPayWebhook);   // appelé par CinetPay — pas d'auth
router.get('/success',          cinetPaySuccess);   // page de retour navigateur

module.exports = router;
