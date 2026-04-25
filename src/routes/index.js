const { Router } = require('express');
const ridesRouter = require('./rides');
const authRouter = require('./auth');
const bookingsRouter = require('./bookings');
const reviewsRouter = require('./reviews');
const walletRouter  = require('./wallet');
const adminRouter   = require('./admin');
const stripeRouter    = require('./stripe');
const cinetpayRouter  = require('./cinetpay');
const razorpayRouter  = require('./razorpay');
const chatRouter          = require('./chat');
const notificationsRouter = require('./notifications');
const paymentsRouter      = require('./payments');

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'YesGo API opérationnelle',
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth',     authRouter);
router.use('/rides',    ridesRouter);
router.use('/bookings', bookingsRouter);
router.use('/reviews',  reviewsRouter);
router.use('/wallet',   walletRouter);
router.use('/admin',    adminRouter);
router.use('/stripe',   stripeRouter);
router.use('/cinetpay', cinetpayRouter);
router.use('/razorpay', razorpayRouter);
router.use('/chat',          chatRouter);
router.use('/notifications', notificationsRouter);
router.use('/payments',      paymentsRouter);

module.exports = router;
