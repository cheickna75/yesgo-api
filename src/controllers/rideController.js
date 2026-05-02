const { Op } = require('sequelize');
const { randomUUID } = require('crypto');
const { sequelize } = require('../config/database');
const { Ride, User, Booking } = require('../models');

// ── Cache mémoire simple (TTL 45s) ───────────────────────────────
const TTL_MS = 45 * 1000;
const _cache = {
  rides:    { data: null, expiresAt: 0 },
  search:   new Map(),   // clé = "lat_lng_rayon"
};
const MAX_SEARCH_ENTRIES = 30;

const cacheGet = (key) => {
  if (key === 'rides') {
    const e = _cache.rides;
    return e.data && Date.now() < e.expiresAt ? e.data : null;
  }
  const e = _cache.search.get(key);
  return e && Date.now() < e.expiresAt ? e.data : null;
};
const cacheSet = (key, data) => {
  if (key === 'rides') {
    _cache.rides = { data, expiresAt: Date.now() + TTL_MS };
  } else {
    if (_cache.search.size >= MAX_SEARCH_ENTRIES) {
      _cache.search.delete(_cache.search.keys().next().value);
    }
    _cache.search.set(key, { data, expiresAt: Date.now() + TTL_MS });
  }
};
const invalidateCache = () => {
  _cache.rides = { data: null, expiresAt: 0 };
  _cache.search.clear();
};

const isValidPoint = (point) =>
  point &&
  point.type === 'Point' &&
  Array.isArray(point.coordinates) &&
  point.coordinates.length === 2 &&
  Math.abs(point.coordinates[0]) <= 180 &&
  Math.abs(point.coordinates[1]) <= 90;

// ── #3 Génère toutes les occurrences d'une série récurrente ──────
const genererOccurrences = (baseData, jours, firstDate, finDate) => {
  const occurrences = [];
  const fin = new Date(finDate);
  fin.setHours(23, 59, 59, 999);

  const first = new Date(firstDate);
  const hours = first.getHours();
  const minutes = first.getMinutes();

  // Cap à 90 jours pour éviter les abus
  const maxDate = new Date(first);
  maxDate.setDate(maxDate.getDate() + 90);
  const endDate = fin < maxDate ? fin : maxDate;

  const now = new Date();
  const current = new Date(first);
  current.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    if (jours.includes(current.getDay())) {
      const dt = new Date(current);
      dt.setHours(hours, minutes, 0, 0);
      if (dt > now) {
        occurrences.push({ ...baseData, date_heure: dt });
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return occurrences;
};

const createRide = async (req, res, next) => {
  try {
    if (!req.user.est_conducteur) {
      return res.status(403).json({ success: false, message: 'Seuls les conducteurs peuvent proposer un trajet.' });
    }

    const {
      depart, arrivee, depart_label, arrivee_label, date_heure,
      prix, places, currency, currency_symbol, type_vehicule,
      waypoints, est_recurrent, jours_recurrence, recurrence_fin,
    } = req.body;

    if (!isValidPoint(depart) || !isValidPoint(arrivee)) {
      return res.status(400).json({
        success: false,
        message: 'Les champs depart et arrivee doivent être des GeoJSON Point valides.',
        exemple: { type: 'Point', coordinates: [-17.4441, 14.6937] },
      });
    }

    // Validation waypoints
    let waypointsData = [];
    if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
      if (waypoints.length > 5) {
        return res.status(400).json({ success: false, message: 'Maximum 5 étapes intermédiaires.' });
      }
      for (const wp of waypoints) {
        if (!wp.label || typeof wp.lat !== 'number' || typeof wp.lng !== 'number') {
          return res.status(400).json({ success: false, message: 'Chaque étape doit avoir label, lat, lng.' });
        }
        if (typeof wp.prix !== 'number' || wp.prix <= 0) {
          return res.status(400).json({ success: false, message: `L'étape "${wp.label}" doit avoir un prix > 0.` });
        }
      }
      // Vérifier que les prix des étapes sont croissants et inférieurs au prix final
      const prixFinal = parseFloat(prix);
      for (let i = 0; i < waypoints.length; i++) {
        if (waypoints[i].prix >= prixFinal) {
          return res.status(400).json({ success: false, message: `Le prix de l'étape ${i + 1} doit être inférieur au prix final (${prixFinal}).` });
        }
        if (i > 0 && waypoints[i].prix <= waypoints[i - 1].prix) {
          return res.status(400).json({ success: false, message: `Les prix des étapes doivent être croissants dans l'ordre du trajet.` });
        }
      }
      waypointsData = waypoints.map((wp, i) => ({
        ordre: i + 1, label: wp.label, lat: wp.lat, lng: wp.lng, prix: wp.prix,
      }));
    }

    // Validation récurrence
    if (est_recurrent) {
      if (!Array.isArray(jours_recurrence) || jours_recurrence.length === 0) {
        return res.status(400).json({ success: false, message: 'Sélectionne au moins un jour de récurrence.' });
      }
      if (!recurrence_fin) {
        return res.status(400).json({ success: false, message: 'La date de fin de récurrence est requise.' });
      }
    }

    const vehiculeType = (type_vehicule && ['moto', 'auto'].includes(type_vehicule))
      ? type_vehicule
      : (req.user.type_vehicule || 'moto');

    const baseData = {
      depart,
      arrivee,
      depart_label,
      arrivee_label,
      prix,
      places,
      conducteur_id:   req.user.id,
      currency:        currency        || 'XOF',
      currency_symbol: currency_symbol || 'FCFA',
      type_vehicule:   vehiculeType,
      waypoints:       waypointsData,
    };

    let est_premier_trajet = false;
    if (!req.user.premier_trajet_publie) {
      await req.user.update({ premier_trajet_publie: true });
      est_premier_trajet = true;
    }

    // ── Trajet récurrent : génère toutes les occurrences ──────────
    if (est_recurrent) {
      const serieId = randomUUID();
      const recData = {
        ...baseData,
        date_heure,
        est_recurrent:     true,
        jours_recurrence,
        recurrence_fin,
        serie_id:          serieId,
        places_initial:    parseInt(places, 10),
      };

      const occurrences = genererOccurrences(recData, jours_recurrence, date_heure, recurrence_fin);
      if (occurrences.length === 0) {
        return res.status(400).json({ success: false, message: 'Aucune occurrence future dans la plage de dates sélectionnée.' });
      }

      const rides = await Ride.bulkCreate(occurrences, { individualHooks: true });
      invalidateCache();
      return res.status(201).json({
        success:           true,
        count:             rides.length,
        serie_id:          serieId,
        est_premier_trajet,
        message:           `${rides.length} trajet(s) récurrent(s) créé(s).`,
      });
    }

    // ── Trajet unique ─────────────────────────────────────────────
    const ride = await Ride.create({ ...baseData, date_heure });
    invalidateCache();
    return res.status(201).json({ success: true, data: ride, est_premier_trajet });
  } catch (err) {
    next(err);
  }
};

const getRides = async (req, res, next) => {
  try {
    const cached = cacheGet('rides');
    if (cached) return res.json({ success: true, count: cached.length, data: cached, cached: true });

    const rows = await sequelize.query(
      `SELECT
          r.id, r.depart_label, r.arrivee_label, r.date_heure,
          r.prix, r.places, r.statut, r.conducteur_id,
          r.type_vehicule, r.currency, r.currency_symbol,
          r.waypoints,
          r."createdAt", r."updatedAt",
          ST_AsGeoJSON(r.depart)::json  AS depart,
          ST_AsGeoJSON(r.arrivee)::json AS arrivee,
          u.id              AS u_id,
          u.nom             AS u_nom,
          u.telephone       AS u_telephone,
          u.type_vehicule   AS u_type_vehicule,
          u.marque_vehicule AS u_marque_vehicule,
          u.modele_vehicule AS u_modele_vehicule,
          u.photo_profil    AS u_photo_profil
       FROM rides r
       JOIN users u ON r.conducteur_id = u.id
       WHERE r.statut NOT IN ('termine', 'annule')
         AND (
           (
             NOT EXISTS (
               SELECT 1 FROM bookings b
               WHERE b.ride_id = r.id AND b.statut IN ('en_attente', 'accepte')
             )
             AND r.date_heure >= NOW() - INTERVAL '1 hour'
           )
           OR
           (
             EXISTS (
               SELECT 1 FROM bookings b
               WHERE b.ride_id = r.id AND b.statut IN ('en_attente', 'accepte')
             )
             AND r.date_heure >= NOW() - INTERVAL '2 hours'
           )
         )
       ORDER BY r.date_heure ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const data = rows.map((r) => ({
      id:              r.id,
      depart:          r.depart,
      arrivee:         r.arrivee,
      depart_label:    r.depart_label,
      arrivee_label:   r.arrivee_label,
      date_heure:      r.date_heure,
      prix:            r.prix,
      places:          r.places,
      statut:          r.statut,
      conducteur_id:   r.conducteur_id,
      type_vehicule:   r.type_vehicule,
      currency:        r.currency,
      currency_symbol: r.currency_symbol,
      waypoints:       r.waypoints || [],
      conducteur: {
        id:              r.u_id,
        nom:             r.u_nom,
        telephone:       r.u_telephone,
        type_vehicule:   r.u_type_vehicule,
        marque_vehicule: r.u_marque_vehicule,
        modele_vehicule: r.u_modele_vehicule,
        photo_profil:    r.u_photo_profil,
      },
    }));

    cacheSet('rides', data);
    return res.json({ success: true, count: data.length, data });
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
    const rayon = parseFloat(req.query.rayon) || 5;

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
    const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}_${rayon}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ success: true, count: cached.length, data: cached, cached: true });
    }

    const rows = await sequelize.query(
      `SELECT
          r.id, r.depart_label, r.arrivee_label, r.date_heure,
          r.prix, r.places, r.statut, r.type_vehicule, r.currency, r.currency_symbol,
          r.waypoints,
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
       WHERE r.statut NOT IN ('termine', 'annule')
         AND ST_DWithin(r.depart::geography, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :rayon)
         AND (
           (
             NOT EXISTS (
               SELECT 1 FROM bookings b
               WHERE b.ride_id = r.id AND b.statut IN ('en_attente', 'accepte')
             )
             AND r.date_heure >= NOW() - INTERVAL '1 hour'
           )
           OR
           (
             EXISTS (
               SELECT 1 FROM bookings b
               WHERE b.ride_id = r.id AND b.statut IN ('en_attente', 'accepte')
             )
             AND r.date_heure >= NOW() - INTERVAL '2 hours'
           )
         )
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
      waypoints: r.waypoints || [],
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

    cacheSet(cacheKey, data);
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

    const { prix, places, date_heure, depart, arrivee, depart_label, arrivee_label } = req.body;
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
    if (depart !== undefined) {
      if (!isValidPoint(depart)) return res.status(400).json({ success: false, message: 'Point de départ invalide.' });
      updates.depart = depart;
    }
    if (arrivee !== undefined) {
      if (!isValidPoint(arrivee)) return res.status(400).json({ success: false, message: 'Point d\'arrivée invalide.' });
      updates.arrivee = arrivee;
    }
    if (depart_label !== undefined) updates.depart_label = depart_label;
    if (arrivee_label !== undefined) updates.arrivee_label = arrivee_label;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun champ à modifier.' });
    }

    await ride.update(updates);
    invalidateCache();
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
    invalidateCache();
    return res.json({ success: true, message: 'Trajet supprimé.' });
  } catch (err) { next(err); }
};

module.exports = { createRide, getRides, searchRides, mesTrajets, modifierTrajet, supprimerTrajet };
