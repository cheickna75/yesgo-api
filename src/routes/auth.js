const { Router } = require('express');
const { register, login, moi, resetPassword, changerRole, soumettreDocuments, mettreAJourVehicule, mettreAJourNumeroPaiement, uploaderPhotoProfil } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/moi', protect, moi);
router.post('/reset-password', resetPassword);
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
