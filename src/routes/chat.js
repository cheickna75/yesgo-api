const { Router } = require('express');
const { protect } = require('../middleware/auth');
const { mesConversations, getMessages, envoyerMessage, conversationDuTrajet } = require('../controllers/chatController');

const router = Router();

router.use(protect);

router.get('/conversations',                   mesConversations);
router.get('/conversations/:id/messages',      getMessages);
router.post('/conversations/:id/messages',     envoyerMessage);
router.get('/ride/:rideId',                    conversationDuTrajet);

module.exports = router;
