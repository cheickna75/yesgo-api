const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { createRazorpayCheckout, razorpayWebhook } = require('../controllers/razorpayController');

const router = Router();

router.post('/create-checkout', protect, createRazorpayCheckout);
router.post('/webhook',         razorpayWebhook);

module.exports = router;
