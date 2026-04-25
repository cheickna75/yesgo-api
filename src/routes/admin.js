const { Router } = require('express');
const { protect, requireAdmin } = require('../middleware/auth');
const { getStats, getUtilisateurs, toggleActif, getReservations, getAdmins, creerAdmin, getConducteurs, verifierConducteur, getDocumentFiles, resetDocuments } = require('../controllers/adminController');

const router = Router();

router.use(protect, requireAdmin);

router.get('/stats',        getStats);
router.get('/utilisateurs', getUtilisateurs);
router.patch('/utilisateurs/:id/toggle', toggleActif);
router.get('/reservations', getReservations);
router.get('/admins',       getAdmins);
router.post('/admins',      creerAdmin);
router.get('/conducteurs',           getConducteurs);
router.patch('/conducteurs/:id/verifier', verifierConducteur);
router.get('/documents-files', getDocumentFiles);
router.patch('/conducteurs/:id/reset-docs', resetDocuments);

module.exports = router;
