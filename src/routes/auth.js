const { Router }    = require('express');
const rateLimit      = require('express-rate-limit');
const { register, login, moi, demanderOTPInscription, demanderOTP, resetPassword, changerRole, soumettreDocuments, mettreAJourVehicule, mettreAJourNumeroPaiement, uploaderPhotoProfil } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = Router();

// 5 tentatives max par heure pour le reset de mot de passe
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives de réinitialisation. Réessayez dans 1 heure.' },
});

router.post('/register/otp', demanderOTPInscription);
router.post('/register', register);
router.post('/login', login);
router.get('/moi', protect, moi);
router.post('/reset-password/otp', resetPasswordLimiter, demanderOTP);
router.post('/reset-password', resetPasswordLimiter, resetPassword);
router.post('/changer-role', protect, changerRole);
router.put('/vehicule',         protect, mettreAJourVehicule);
router.put('/numero-paiement',  protect, mettreAJourNumeroPaiement);
router.post('/soumettre-documents', protect, soumettreDocuments);
router.post('/photo-profil',        protect, uploaderPhotoProfil);
router.post('/push-token', protect, async (req, res) => {
  const { push_token } = req.body;
  if (push_token) await req.user.update({ push_token });
  res.json({ success: true });
});

module.exports = router;
