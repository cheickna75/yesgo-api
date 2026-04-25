const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { mesNotifications, marquerLue, toutMarquerLu } = require('../controllers/notificationController');

const router = Router();

router.use(protect);

router.get('/',                    mesNotifications);
router.patch('/:id/lu',            marquerLue);
router.patch('/tout-lire',         toutMarquerLu);

module.exports = router;
