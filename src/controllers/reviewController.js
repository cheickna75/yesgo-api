const { Review, Booking, Ride, User } = require('../models');

const creerAvis = async (req, res, next) => {
  try {
    const { booking_id, note, commentaire } = req.body;

    if (!booking_id || !note) {
      return res.status(400).json({ success: false, message: 'booking_id et note sont requis.' });
    }

    const reservation = await Booking.findByPk(booking_id, {
      include: [{ model: Ride, as: 'trajet' }],
    });

    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable.' });
    }
    if (reservation.passager_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez noter que vos propres trajets.' });
    }
    if (!['accepte', 'termine'].includes(reservation.statut)) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez noter qu\'un trajet accepté ou terminé.' });
    }

    const dejaNote = await Review.findOne({
      where: { ride_id: reservation.ride_id, auteur_id: req.user.id, passager_id: null },
    });
    if (dejaNote) {
      return res.status(409).json({ success: false, message: 'Vous avez déjà noté ce trajet.' });
    }

    const avis = await Review.create({
      ride_id:       reservation.ride_id,
      auteur_id:     req.user.id,
      conducteur_id: reservation.trajet.conducteur_id,
      passager_id:   null,
      note,
      commentaire,
    });

    return res.status(201).json({ success: true, data: avis });
  } catch (err) {
    next(err);
  }
};

const noterPassager = async (req, res, next) => {
  try {
    const { booking_id, note, commentaire } = req.body;

    if (!booking_id || !note) {
      return res.status(400).json({ success: false, message: 'booking_id et note sont requis.' });
    }

    const reservation = await Booking.findByPk(booking_id, {
      include: [{ model: Ride, as: 'trajet' }],
    });

    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Réservation introuvable.' });
    }
    if (reservation.trajet.conducteur_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Seul le conducteur peut noter le passager.' });
    }
    if (!['accepte', 'termine'].includes(reservation.statut)) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez noter qu\'un trajet accepté ou terminé.' });
    }

    const dejaNote = await Review.findOne({
      where: { ride_id: reservation.ride_id, auteur_id: req.user.id, passager_id: reservation.passager_id },
    });
    if (dejaNote) {
      return res.status(409).json({ success: false, message: 'Vous avez déjà noté ce passager.' });
    }

    const avis = await Review.create({
      ride_id:       reservation.ride_id,
      auteur_id:     req.user.id,
      conducteur_id: reservation.trajet.conducteur_id,
      passager_id:   reservation.passager_id,
      note,
      commentaire,
    });

    return res.status(201).json({ success: true, data: avis });
  } catch (err) {
    next(err);
  }
};

const avisConduteur = async (req, res, next) => {
  try {
    const { conducteur_id } = req.params;
    const avis = await Review.findAll({
      where: { conducteur_id, passager_id: null },
      include: [{ model: User, as: 'auteur', attributes: ['id', 'nom'] }],
      order: [['createdAt', 'DESC']],
    });

    const moyenne = avis.length
      ? Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10
      : null;

    return res.json({ success: true, moyenne, count: avis.length, data: avis });
  } catch (err) {
    next(err);
  }
};

const avisPassager = async (req, res, next) => {
  try {
    const { passager_id } = req.params;
    const avis = await Review.findAll({
      where: { passager_id },
      include: [{ model: User, as: 'auteur', attributes: ['id', 'nom'] }],
      order: [['createdAt', 'DESC']],
    });

    const moyenne = avis.length
      ? Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10
      : null;

    return res.json({ success: true, moyenne, count: avis.length, data: avis });
  } catch (err) {
    next(err);
  }
};

module.exports = { creerAvis, noterPassager, avisConduteur, avisPassager };
