const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Ride, User, Booking } = require('../models');

const isValidPoint = (point) =>
  point &&
  point.type === 'Point' &&
  Array.isArray(point.coordinates) &&
  point.coordinates.length === 2 &&
  Math.abs(point.coordinates[0]) <= 180 &&
  Math.abs(point.coordinates[1]) <= 90;

const createRide = async (req, res, next) => {
  try {
    if (!req.user.est_conducteur) {
      return res.status(403).json({ success: false, message: 'Seuls les conducteurs peuvent proposer un trajet.' });
    }

    const { depart, arrivee, depart_label, arrivee_label, date_heure, prix, places, currency, currency_symbol, type_vehicule } = req.body;

    if (!isValidPoint(depart) || !isValidPoint(arrivee)) {
      return res.status(400).json({
        success: false,
        message: 'Les champs depart et arrivee doivent être des GeoJSON Point valides.',
        exemple: { type: 'Point', coordinates: [-17.4441, 14.6937] },
      });
    }

    // Type véhicule : priorité au paramètre envoyé, puis au profil du conducteur, sinon 'moto'
    const vehiculeType = (type_vehicule && ['moto', 'auto'].includes(type_vehicule))
      ? type_vehicule
      : (req.user.type_vehicule || 'moto');

    const ride = await Ride.create({
      depart,
      arrivee,
      depart_label,
      arrivee_label,
      date_heure,
      prix,
      places,
      conducteur_id: req.user.id,
      currency:        currency        || 'XOF',
      currency_symbol: currency_symbol || 'FCFA',
      type_vehicule:   vehiculeType,
    });

    return res.status(201).json({ success: true, data: ride });
  } catch (err) {
    next(err);
  }
};

const getRides = async (req, res, next) => {
  try {
    const rides = await Ride.findAll({
      where: { statut: 'actif' },
      include: [{ model: User, as: 'conducteur', attributes: ['id', 'nom', 'telephone', 'type_vehicule', 'marque_vehicule', 'modele_vehicule', 'photo_profil'] }],
      order: [['date_heure', 'ASC']],
    });
    return res.json({ success: true, count: rides.length, data: rides });
  } catch (err) {
    next(err);
  }
};

// Calcul de distance great-circle (formule de Haversine) en mètres
const haversineMetres = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const searchRides = async (req, res, next) => {
  try {
    const lat   = parseFloat(req.query.lat);
    const lng   = parseFloat(req.query.lng);
    const rayon = parseFloat(req.query.rayon) || 5; // défaut 5 km

    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres invalides. Fournir lat (±90), lng (±180) et rayon (km).',
        exemple: '/api/rides/search?lat=12.6392&lng=-7.9982&rayon=5',
      });
    }
    if (rayon <= 0 || rayon > 100) {
      return res.status(400).json({ success: false, message: 'Le rayon doit être entre 1 et 100 km.' });
    }

    const rayonMetres = rayon * 1000;

    // Requête SQL brute pour éviter les limitations de Sequelize avec PostGIS
    const rows = await sequelize.query(
      `SELECT
          r.id, r.depart_label, r.arrivee_label, r.date_heure,
          r.prix, r.places, r.statut, r.type_vehicule, r.currency, r.currency_symbol,
          r."createdAt", r."updatedAt",
          ST_AsGeoJSON(r.depart)::json  AS depart,
          ST_AsGeoJSON(r.arrivee)::json AS arrivee,
          r.conducteur_id,
          u.nom  AS conducteur_nom,
          u.telephone AS conducteur_telephone,
          u.type_vehicule AS conducteur_type_vehicule,
          u.marque_vehicule AS conducteur_marque,
          u.modele_vehicule AS conducteur_modele,
          ST_Distance(r.depart::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS dist_m
       FROM rides r
       JOIN users u ON r.conducteur_id = u.id
       WHERE r.statut = 'actif'
         AND ST_DWithin(r.depart::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :rayon)
       ORDER BY dist_m ASC`,
      { replacements: { lat, lng, rayon: rayonMetres }, type: sequelize.QueryTypes.SELECT }
    );

    const data = rows.map((r) => ({
      id: r.id,
      depart: r.depart,
      arrivee: r.arrivee,
      depart_label: r.depart_label,
      arrivee_label: r.arrivee_label,
      date_heure: r.date_heure,
      prix: r.prix,
      places: r.places,
      statut: r.statut,
      type_vehicule: r.type_vehicule,
      currency: r.currency,
      currency_symbol: r.currency_symbol,
      conducteur_id: r.conducteur_id,
      conducteur: {
        nom: r.conducteur_nom,
        telephone: r.conducteur_telephone,
        type_vehicule: r.conducteur_type_vehicule,
        marque_vehicule: r.conducteur_marque,
        modele_vehicule: r.conducteur_modele,
      },
      distance_km: Math.round(r.dist_m / 10) / 100,
    }));

    return res.json({
      success: true,
      count: data.length,
      rayon_km: rayon,
      centre: { lat, lng },
      data,
    });
  } catch (err) {
    next(err);
  }
};

const mesTrajets = async (req, res, next) => {
  try {
    const rides = await Ride.findAll({
      where: { conducteur_id: req.user.id },
      order: [['date_heure', 'DESC']],
    });
    return res.json({ success: true, count: rides.length, data: rides });
  } catch (err) {
    next(err);
  }
};

const modifierTrajet = async (req, res, next) => {
  try {
    const ride = await Ride.findByPk(req.params.id);
    if (!ride) return res.status(404).json({ success: false, message: 'Trajet introuvable.' });
    if (ride.conducteur_id !== req.user.id) return res.status(403).json({ success: false, message: 'Accès refusé.' });
    if (!['actif', 'complet'].includes(ride.statut)) {
      return res.status(400).json({ success: false, message: 'Seuls les trajets actifs peuvent être modifiés.' });
    }

    const { prix, places, date_heure } = req.body;
    const updates = {};
    if (prix !== undefined) {
      const p = parseFloat(prix);
      if (isNaN(p) || p <= 0) return res.status(400).json({ success: false, message: 'Prix invalide.' });
      updates.prix = p;
    }
    if (places !== undefined) {
      const pl = parseInt(places, 10);
      if (isNaN(pl) || pl < 1) return res.status(400).json({ success: false, message: 'Nombre de places invalide.' });
      updates.places = pl;
    }
    if (date_heure !== undefined) {
      if (!date_heure) return res.status(400).json({ success: false, message: 'Date invalide.' });
      updates.date_heure = date_heure;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun champ à modifier.' });
    }

    await ride.update(updates);
    return res.json({ success: true, data: ride });
  } catch (err) { next(err); }
};

const supprimerTrajet = async (req, res, next) => {
  try {
    const ride = await Ride.findByPk(req.params.id);
    if (!ride) return res.status(404).json({ success: false, message: 'Trajet introuvable.' });
    if (ride.conducteur_id !== req.user.id) return res.status(403).json({ success: false, message: 'Accès refusé.' });

    const reservationsActives = await Booking.count({
      where: { ride_id: ride.id, statut: ['en_attente', 'accepte'] },
    });
    if (reservationsActives > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer : ${reservationsActives} réservation(s) en cours. Refusez-les d'abord.`,
      });
    }

    await ride.destroy();
    return res.json({ success: true, message: 'Trajet supprimé.' });
  } catch (err) { next(err); }
};

module.exports = { createRide, getRides, searchRides, mesTrajets, modifierTrajet, supprimerTrajet };
