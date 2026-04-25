const { Router } = require('express');
const { recharger, monSolde } = require('../controllers/walletController');
const { protect } = require('../middleware/auth');

const router = Router();
router.use(protect);
router.get('/', monSolde);
router.post('/recharger', recharger);

module.exports = router;
