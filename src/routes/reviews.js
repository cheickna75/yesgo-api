const { Router } = require('express');
const { creerAvis, noterPassager, avisConduteur, avisPassager } = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

const router = Router();

router.post('/', protect, creerAvis);
router.post('/passager', protect, noterPassager);
router.get('/conducteur/:conducteur_id', avisConduteur);
router.get('/passager/:passager_id', protect, avisPassager);

module.exports = router;
