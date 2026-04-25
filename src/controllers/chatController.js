const { Conversation, Message, ConversationParticipant, User, Ride, Booking } = require('../models');
const { sequelize } = require('../config/database');

// GET /api/chat/conversations
// Liste toutes les conversations de l'utilisateur connecté
const mesConversations = async (req, res, next) => {
  try {
    const conversations = await req.user.getConversations({
      include: [
        {
          association: 'trajet',
          attributes: ['id', 'depart_label', 'arrivee_label', 'date_heure', 'statut'],
          include: [{ association: 'conducteur', attributes: ['id', 'nom', 'telephone'] }],
        },
        {
          association: 'participants',
          attributes: ['id', 'nom', 'telephone'],
          through: { attributes: [] },
        },
        {
          association: 'messages',
          limit: 1,
          order: [['createdAt', 'DESC']],
          include: [{ association: 'expediteur', attributes: ['id', 'nom'] }],
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    return res.json({ success: true, data: conversations });
  } catch (err) { next(err); }
};

// GET /api/chat/conversations/:id/messages
// Récupère les messages d'une conversation (vérifie que l'utilisateur est participant)
const getMessages = async (req, res, next) => {
  try {
    const participant = await ConversationParticipant.findOne({
      where: { conversation_id: req.params.id, user_id: req.user.id },
    });
    if (!participant) {
      return res.status(403).json({ success: false, message: 'Accès refusé à cette conversation.' });
    }

    const messages = await Message.findAll({
      where: { conversation_id: req.params.id },
      include: [{ association: 'expediteur', attributes: ['id', 'nom', 'photo_profil'] }],
      order: [['createdAt', 'ASC']],
    });

    return res.json({ success: true, data: messages });
  } catch (err) { next(err); }
};

// POST /api/chat/conversations/:id/messages
// Envoie un message dans une conversation
const envoyerMessage = async (req, res, next) => {
  try {
    const { contenu } = req.body;
    if (!contenu?.trim()) {
      return res.status(400).json({ success: false, message: 'Le message ne peut pas être vide.' });
    }

    const participant = await ConversationParticipant.findOne({
      where: { conversation_id: req.params.id, user_id: req.user.id },
    });
    if (!participant) {
      return res.status(403).json({ success: false, message: 'Accès refusé à cette conversation.' });
    }

    const message = await Message.create({
      conversation_id: req.params.id,
      sender_id: req.user.id,
      contenu: contenu.trim(),
    });

    // Recharger avec l'expéditeur pour la réponse
    const complet = await Message.findByPk(message.id, {
      include: [{ association: 'expediteur', attributes: ['id', 'nom', 'photo_profil'] }],
    });

    // Mettre à jour updatedAt de la conversation (remonte dans la liste)
    await Conversation.update({ updatedAt: new Date() }, { where: { id: req.params.id } });

    return res.status(201).json({ success: true, data: complet });
  } catch (err) { next(err); }
};

// GET /api/chat/ride/:rideId
// Récupère (ou crée) la conversation liée à un trajet
const conversationDuTrajet = async (req, res, next) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    // Vérifier que l'utilisateur est conducteur ou passager accepté sur ce trajet
    const trajet = await Ride.findByPk(rideId, {
      attributes: ['id', 'conducteur_id'],
    });
    if (!trajet) {
      return res.status(404).json({ success: false, message: 'Trajet introuvable.' });
    }

    const estConducteur = trajet.conducteur_id === userId;
    const reservationPassager = estConducteur ? null : await Booking.findOne({
      where: { ride_id: rideId, passager_id: userId, statut: ['accepte', 'termine'] },
    });

    if (!estConducteur && !reservationPassager) {
      return res.status(403).json({ success: false, message: 'Accès refusé : vous n\'êtes pas participant à ce trajet.' });
    }

    // Trouver ou créer la conversation
    let conv = await Conversation.findOne({ where: { ride_id: rideId } });

    if (!conv) {
      await sequelize.transaction(async (t) => {
        conv = await Conversation.create({ ride_id: rideId }, { transaction: t });

        // Ajouter le conducteur
        await ConversationParticipant.findOrCreate({
          where: { conversation_id: conv.id, user_id: trajet.conducteur_id },
          transaction: t,
        });

        // Ajouter le passager (celui qui ouvre, ou tous les passagers acceptés)
        if (!estConducteur) {
          await ConversationParticipant.findOrCreate({
            where: { conversation_id: conv.id, user_id: userId },
            transaction: t,
          });
        } else {
          // Le conducteur ouvre : ajouter tous les passagers acceptés
          const passagers = await Booking.findAll({
            where: { ride_id: rideId, statut: ['accepte', 'termine'] },
            attributes: ['passager_id'],
            transaction: t,
          });
          for (const b of passagers) {
            await ConversationParticipant.findOrCreate({
              where: { conversation_id: conv.id, user_id: b.passager_id },
              transaction: t,
            });
          }
        }
      });
    } else {
      // Conversation existante : s'assurer que l'utilisateur est bien participant
      await ConversationParticipant.findOrCreate({
        where: { conversation_id: conv.id, user_id: userId },
      });
    }

    // Recharger avec toutes les associations
    const convComplete = await Conversation.findByPk(conv.id, {
      include: [
        {
          association: 'trajet',
          attributes: ['id', 'depart_label', 'arrivee_label', 'date_heure'],
          include: [{ association: 'conducteur', attributes: ['id', 'nom', 'telephone'] }],
        },
        {
          association: 'participants',
          attributes: ['id', 'nom', 'telephone'],
          through: { attributes: [] },
        },
      ],
    });

    return res.json({ success: true, data: convComplete });
  } catch (err) { next(err); }
};

module.exports = { mesConversations, getMessages, envoyerMessage, conversationDuTrajet };
