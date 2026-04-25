const { Router } = require('express');
const { creerReservation, mesReservations, reservationsConducteur, mettreAJourStatut, genererOTP, validerOTP, terminerCourse } = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');

const router = Router();

router.use(protect);

router.post('/',                creerReservation);
router.get('/mes-reservations', mesReservations);
router.get('/conducteur',       reservationsConducteur);
router.patch('/:id/statut',     mettreAJourStatut);
router.post('/:id/otp/generer', genererOTP);
router.post('/:id/otp/valider', validerOTP);
router.patch('/:id/terminer',   terminerCourse);

module.exports = router;
