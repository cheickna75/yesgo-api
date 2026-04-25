const { Router } = require('express');
const { createRide, getRides, searchRides, mesTrajets } = require('../controllers/rideController');
const { protect } = require('../middleware/auth');

const router = Router();

router.get('/', getRides);
router.get('/search', searchRides);
router.get('/mes-trajets', protect, mesTrajets);
router.post('/', protect, createRide);

module.exports = router;
