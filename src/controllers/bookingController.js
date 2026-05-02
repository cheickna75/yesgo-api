const { Booking, Ride, User, Conversation, ConversationParticipant, Notification, Transaction } = require('../models');
const { sequelize } = require('../config/database');
const { sendPush } = require('../services/pushService');
const { payerConducteur } = require('./paymentController');

// POST /api/bookings  — réservation en espèces (cash)
const creerReservation = async (req, res, next) => {
  try {
    const { ride_id, message = '', places_reservees = 1, waypoint_depart_ordre = null, waypoint_arrivee_ordre = null } = req.body;
    if (!ride_id) return res.status(400).json({ success: false, message: 'ride_id est requis.' });

    const trajet = await Ride.findByPk(ride_id, {
      include: [{ model: User, as: 'conducteur', attributes: ['id', 'nom', 'push_token'] }],
    });
    if (!trajet) return res.status(404).json({ success: false, message: 'Trajet introuvable.' });
    if (trajet.statut !== 'actif') return res.status(400).json({ success: false, message: 'Ce trajet n\'est plus disponible.' });
    if (trajet.conducteur_id === req.user.id) return res.status(400).json({ success: false, message: 'Vous ne pouvez pas réserver votre propre trajet.' });

    const nbPlaces = Math.max(1, parseInt(places_reservees, 10) || 1);
    if (trajet.places < nbPlaces) {
      return res.status(400).json({ success: false, message: `Seulement ${trajet.places} place(s) disponible(s).` });
    }

    const dejaReserve = await Booking.findOne({
      where: { ride_id, passager_id: req.user.id, statut: ['en_attente', 'accepte'] },
    });
    if (dejaReserve) {
      return res.status(409).json({ success: false, message: 'Vous avez déjà une réservation active sur ce trajet.' });
    }

    const reservation = await Booking.create({
      ride_id,
      passager_id:           req.user.id,
      message,
      mode_paiement:         'cash',
      places_reservees:      nbPlaces,
      paiement_confirme:     false,
      statut:                'en_attente',
      waypoint_depart_ordre:  waypoint_depart_ordre  ?? null,
      waypoint_arrivee_ordre: waypoint_arrivee_ordre ?? null,
    });

    await trajet.decrement('places', { by: nbPlaces });
    await trajet.reload();
    if (trajet.places <= 0) await trajet.update({ statut: 'complet' });

    const route = `${trajet.depart_label} → ${trajet.arrivee_label}`;
    await Notification.create({
      user_id: trajet.conducteur_id,
      type:    'nouvelle_reservation',
      titre:   '🚖 Nouvelle demande de trajet',
      corps:   `${req.user.nom} demande ${nbPlaces} place(s) · ${route} · Paiement en espèces`,
      data:    { booking_id: reservation.id, ride_id },
    });
    if (trajet.conducteur?.push_token) {
      await sendPush(trajet.conducteur.push_token, '🚖 Nouvelle demande', `${req.user.nom} — ${route} (espèces)`);
    }

    // Temps réel — notifier le conducteur immédiatement
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${trajet.conducteur_id}`).emit('nouvelle_reservation', {
        booking_id:   reservation.id,
        ride_id,
        passager_nom: req.user.nom,
        places:       nbPlaces,
        route,
      });
    }

    return res.status(201).json({ success: true, data: reservation });
  } catch (err) { next(err); }
};

const mesReservations = async (req, res, next) => {
  try {
    const reservations = await Booking.findAll({
      where: { passager_id: req.user.id },
      include: [{
        model: Ride,
        as: 'trajet',
        attributes: ['id', 'depart_label', 'arrivee_label', 'date_heure', 'prix', 'places', 'statut', 'currency_symbol', 'type_vehicule'],
        include: [{ model: User, as: 'conducteur', attributes: ['id', 'nom', 'telephone'] }],
      }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, count: reservations.length, data: reservations });
  } catch (err) { next(err); }
};

const reservationsConducteur = async (req, res, next) => {
  try {
    const reservations = await Booking.findAll({
      include: [{
        model: Ride,
        as: 'trajet',
        where: { conducteur_id: req.user.id },
        attributes: ['id', 'depart_label', 'arrivee_label', 'date_heure', 'prix', 'currency_symbol', 'type_vehicule'],
      }, {
        model: User,
        as: 'passager',
        attributes: ['id', 'nom', 'telephone'],
      }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, count: reservations.length, data: reservations });
  } catch (err) { next(err); }
};

// PATCH /api/bookings/:id/statut  — conducteur accepte/refuse, passager annule
const mettreAJourStatut = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    const statutsValides = ['accepte', 'refuse', 'annule'];

    if (!statutsValides.includes(statut)) {
      return res.status(400).json({ success: false, message: `Statut invalide. Valeurs acceptées : ${statutsValides.join(', ')}.` });
    }

    const reservation = await Booking.findByPk(id, {
      include: [
        { model: Ride, as: 'trajet' },
        { model: User, as: 'passager', attributes: ['id', 'nom', 'push_token'] },
      ],
    });

    if (!reservation) return res.status(404).json({ success: false, message: 'Réservation introuvable.' });

    const estConducteur = reservation.trajet.conducteur_id === req.user.id;
    const estPassager   = reservation.passager_id === req.user.id;

    if (statut === 'annule' && !estPassager) {
      return res.status(403).json({ success: false, message: 'Seul le passager peut annuler.' });
    }
    if (['accepte', 'refuse'].includes(statut) && !estConducteur) {
      return res.status(403).json({ success: false, message: 'Seul le conducteur peut accepter ou refuser.' });
    }

    const ancienStatut = reservation.statut;
    const nbPlaces     = reservation.places_reservees || 1;
    const route        = `${reservation.trajet.depart_label} → ${reservation.trajet.arrivee_label}`;

    await sequelize.transaction(async (t) => {
      await reservation.update({ statut }, { transaction: t });

      if (statut === 'accepte' && ancienStatut === 'en_attente') {
        // places déjà décrémentées à la création de la réservation
        await reservation.trajet.reload({ transaction: t });
        if (reservation.trajet.places <= 0) {
          await reservation.trajet.update({ statut: 'complet' }, { transaction: t });
        }
      }

      if (['refuse', 'annule'].includes(statut) && ['en_attente', 'accepte'].includes(ancienStatut)) {
        await reservation.trajet.increment('places', { by: nbPlaces }, { transaction: t });
        await reservation.trajet.reload({ transaction: t });
        if (reservation.trajet.statut === 'complet') {
          await reservation.trajet.update({ statut: 'actif' }, { transaction: t });
        }
      }
    });

    // Ouvrir la conversation dès l'acceptation
    if (statut === 'accepte' && ancienStatut === 'en_attente') {
      const [conv] = await Conversation.findOrCreate({ where: { ride_id: reservation.ride_id } });
      await ConversationParticipant.findOrCreate({
        where: { conversation_id: conv.id, user_id: reservation.trajet.conducteur_id },
      });
      await ConversationParticipant.findOrCreate({
        where: { conversation_id: conv.id, user_id: reservation.passager_id },
      });
    }

    // Notifications
    if (statut === 'accepte') {
      const nomConducteur = req.user.nom || 'Le conducteur';
      await Notification.create({
        user_id: reservation.passager_id,
        type:    'reservation_acceptee',
        titre:   '✅ Demande de trajet acceptée !',
        corps:   `${nomConducteur} a accepté votre demande · ${route}. Ouvrez le tchat pour le contacter.`,
        data:    { booking_id: reservation.id, ride_id: reservation.ride_id, screen: 'Chat' },
      });
      if (reservation.passager?.push_token) {
        await sendPush(
          reservation.passager.push_token,
          '✅ Demande acceptée !',
          `${nomConducteur} a accepté votre trajet · ${route}`
        );
      }
    } else if (statut === 'refuse') {
      await Notification.create({
        user_id: reservation.passager_id,
        type:    'reservation_refusee',
        titre:   '❌ Réservation refusée',
        corps:   `Le conducteur a refusé votre demande pour ${route}.`,
        data:    { booking_id: reservation.id },
      });
      if (reservation.passager?.push_token) {
        await sendPush(reservation.passager.push_token, '❌ Réservation refusée', `Le conducteur a refusé : ${route}`);
      }
    }

    // Temps réel — notifier le passager immédiatement
    if (['accepte', 'refuse'].includes(statut)) {
      const io = req.app.get('io');
      if (io) {
        io.to(`user-${reservation.passager_id}`).emit('statut_reservation', {
          booking_id:    reservation.id,
          statut,
          route,
          conducteur_nom: req.user.nom,
        });
      }
    }

    return res.json({ success: true, data: reservation });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/otp/generer  — passager génère le code de départ
const genererOTP = async (req, res, next) => {
  try {
    const reservation = await Booking.findByPk(req.params.id, {
      include: [{ model: Ride, as: 'trajet', attributes: ['conducteur_id', 'depart_label', 'arrivee_label'] }],
    });

    if (!reservation) return res.status(404).json({ success: false, message: 'Réservation introuvable.' });
    if (reservation.passager_id !== req.user.id) return res.status(403).json({ success: false, message: 'Accès refusé.' });
    if (reservation.statut !== 'accepte') {
      return res.status(400).json({ success: false, message: 'OTP uniquement pour une réservation acceptée.' });
    }
    if (reservation.otp_valide) {
      return res.status(400).json({ success: false, message: 'La course est déjà en cours.' });
    }

    const code      = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await reservation.update({ otp_code: code, otp_expires_at: expiresAt, otp_valide: false });

    return res.json({ success: true, otp_code: code, expires_at: expiresAt });
  } catch (err) { next(err); }
};

// POST /api/bookings/:id/otp/valider  — conducteur valide le code
const validerOTP = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Code OTP requis.' });

    const reservation = await Booking.findByPk(req.params.id, {
      include: [{ model: Ride, as: 'trajet', attributes: ['conducteur_id', 'depart_label', 'arrivee_label'] }],
    });

    if (!reservation) return res.status(404).json({ success: false, message: 'Réservation introuvable.' });
    if (reservation.trajet.conducteur_id !== req.user.id) return res.status(403).json({ success: false, message: 'Accès refusé.' });
    if (reservation.statut !== 'accepte') return res.status(400).json({ success: false, message: 'Statut invalide.' });
    if (reservation.otp_valide) return res.status(400).json({ success: false, message: 'Code déjà utilisé.' });
    if (!reservation.otp_code) return res.status(400).json({ success: false, message: 'Aucun code généré par le passager.' });
    if (new Date() > new Date(reservation.otp_expires_at)) {
      return res.status(400).json({ success: false, message: 'Code OTP expiré.' });
    }
    if (reservation.otp_code !== String(code).trim()) {
      return res.status(400).json({ success: false, message: 'Code incorrect.' });
    }

    await reservation.update({ otp_valide: true });

    return res.json({
      success: true,
      message: `Course démarrée ! ${reservation.trajet.depart_label} → ${reservation.trajet.arrivee_label}`,
    });
  } catch (err) { next(err); }
};

// PATCH /api/bookings/:id/terminer  — conducteur déclare l'arrivée + déclenche le payout
const terminerCourse = async (req, res, next) => {
  try {
    const reservation = await Booking.findByPk(req.params.id, {
      include: [
        {
          model: Ride, as: 'trajet',
          attributes: ['id', 'conducteur_id', 'depart_label', 'arrivee_label', 'statut', 'prix'],
          include: [{ model: User, as: 'conducteur', attributes: ['id', 'nom', 'telephone', 'numero_paiement', 'push_token'] }],
        },
        { model: User, as: 'passager', attributes: ['id', 'nom', 'push_token'] },
      ],
    });

    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable.' });
    }
    if (reservation.trajet.conducteur_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Seul le conducteur peut terminer la course.' });
    }
    if (reservation.statut !== 'accepte') {
      return res.status(400).json({ success: false, message: 'La course doit être en statut accepté.' });
    }
    const isCash = reservation.mode_paiement === 'cash';

    if (!isCash && !reservation.otp_valide) {
      return res.status(400).json({ success: false, message: 'Le code de départ n\'a pas encore été validé.' });
    }

    const conducteur = reservation.trajet.conducteur;

    // Numéro de paiement obligatoire uniquement pour les virements CinetPay
    if (!isCash && !conducteur.numero_paiement) {
      return res.status(400).json({
        success: false,
        code:    'NO_PAYMENT_NUMBER',
        message: 'Vous devez renseigner votre numéro Orange Money ou Moov Money dans votre profil avant de terminer une course.',
      });
    }

    const route     = `${reservation.trajet.depart_label} → ${reservation.trajet.arrivee_label}`;
    const montant   = parseFloat(reservation.trajet.prix) * (reservation.places_reservees || 1);

    // Marquer la réservation et le trajet comme terminés
    await sequelize.transaction(async (t) => {
      await reservation.update({ statut: 'termine' }, { transaction: t });

      const reservationsActives = await Booking.count({
        where: { ride_id: reservation.ride_id, statut: 'accepte' },
        transaction: t,
      });
      if (reservationsActives === 0) {
        await reservation.trajet.update({ statut: 'termine' }, { transaction: t });
      }
    });

    // Virement CinetPay uniquement pour les paiements en ligne
    if (!isCash) {
      payerConducteur({
        conducteur,
        montantBrut: montant,
        bookingId:   reservation.id,
      }).catch((err) => console.error('[Payout] Erreur:', err.message));
    } else {
      // Enregistrer la transaction cash pour l'historique du conducteur
      await Transaction.create({
        user_id:      conducteur.id,
        type:         'credit',
        montant:      montant,
        description:  `Espèces · ${route}`,
        reference_id: reservation.id,
      });
    }

    // Notification passager
    await Notification.create({
      user_id: reservation.passager_id,
      type:    'reservation_acceptee',
      titre:   '🏁 Course terminée !',
      corps:   `Vous êtes bien arrivé · ${route}. Pensez à noter votre conducteur.`,
      data:    { booking_id: reservation.id, screen: 'Bookings' },
    });
    if (reservation.passager?.push_token) {
      await sendPush(reservation.passager.push_token, '🏁 Vous êtes arrivé !', `${route} — Notez votre conducteur.`);
    }

    return res.json({ success: true, message: 'Course terminée. Le virement est en cours vers votre compte mobile money.' });
  } catch (err) { next(err); }
};

module.exports = { creerReservation, mesReservations, reservationsConducteur, mettreAJourStatut, genererOTP, validerOTP, terminerCourse };
