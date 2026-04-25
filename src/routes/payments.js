const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { initierPaiement, notifierPaiement, paiementSuccess, payoutNotify } = require('../controllers/paymentController');

const router = Router();

router.post('/initiate',       protect, initierPaiement);  // passager initie le paiement
router.post('/notify',         notifierPaiement);           // webhook paiement CinetPay
router.post('/payout-notify',  payoutNotify);               // webhook virement CinetPay
router.get('/success',         paiementSuccess);            // page de retour navigateur

module.exports = router;
