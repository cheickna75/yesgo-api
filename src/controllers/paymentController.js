const axios  = require('axios');
const crypto = require('crypto');
const { Booking, Ride, User, Notification } = require('../models');
const { sendPush } = require('../services/pushService');

const CINETPAY_URL          = 'https://api-checkout.cinetpay.com/v2/payment';
const CINETPAY_CHECK_URL    = 'https://api-checkout.cinetpay.com/v2/payment/check';
const CINETPAY_TRANSFER_URL = 'https://client.cinetpay.com/v1/transfer/money/send/contact';

function getCreds() {
  const apiKey = process.env.CINETPAY_API_KEY || process.env.CINETPAY_TEST_API_KEY;
  const siteId = process.env.CINETPAY_SITE_ID || process.env.CINETPAY_TEST_SITE_ID;
  if (!apiKey || !siteId) return null;
  return { apiKey, siteId };
}

function getCommission() {
  return Math.min(100, Math.max(0, parseFloat(process.env.YESGO_COMMISSION_PERCENT) || 10)) / 100;
}

// POST /api/payments/initiate
// Crée la réservation et génère un lien de paiement CinetPay
const initierPaiement = async (req, res, next) => {
  try {
    const creds = getCreds();
    if (!creds) {
      return res.status(503).json({ success: false, message: 'Paiement CinetPay non configuré sur ce serveur.' });
    }

    const { ride_id, message = '', places_reservees = 1 } = req.body;
    if (!ride_id) return res.status(400).json({ success: false, message: 'ride_id est requis.' });

    const trajet = await Ride.findByPk(ride_id, {
      include: [{ model: User, as: 'conducteur', attributes: ['id', 'nom'] }],
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

    const montant  = parseFloat(trajet.prix) * nbPlaces;
    const currency = trajet.currency || 'XOF';
    const sym      = trajet.currency_symbol || 'FCFA';

    // Créer la réservation avant d'appeler CinetPay
    const reservation = await Booking.create({
      ride_id,
      passager_id:       req.user.id,
      message,
      mode_paiement:     'cinetpay',
      places_reservees:  nbPlaces,
      paiement_confirme: false,
      statut:            'en_attente',
    });

    const appUrl        = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const transactionId = `YESGO_BK_${reservation.id}_${Date.now()}`;

    let cinetpayData;
    try {
      const { data } = await axios.post(CINETPAY_URL, {
        apikey:         creds.apiKey,
        site_id:        creds.siteId,
        transaction_id: transactionId,
        amount:         Math.round(montant),
        currency:       currency.toUpperCase(),
        description:    `YesGo — ${trajet.depart_label} → ${trajet.arrivee_label}`,
        return_url:     `${appUrl}/api/payments/success?booking_id=${reservation.id}`,
        notify_url:     `${appUrl}/api/payments/notify`,
        channels:       'ALL',
        metadata:       JSON.stringify({
          booking_id:    reservation.id,
          conducteur_id: trajet.conducteur_id,
          montant:       String(montant),
          currency_symbol: sym,
        }),
        lang: 'fr',
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
      cinetpayData = data;
    } catch (axiosErr) {
      await reservation.destroy();
      const cinetMsg = axiosErr.response?.data?.message || axiosErr.response?.data?.description || axiosErr.message;
      console.error('[CinetPay] Erreur HTTP:', axiosErr.response?.status, cinetMsg, JSON.stringify(axiosErr.response?.data));
      return res.status(502).json({ success: false, message: `CinetPay : ${cinetMsg}` });
    }

    if (cinetpayData.code !== '201') {
      await reservation.destroy();
      console.error('[CinetPay] Code non-201:', cinetpayData.code, cinetpayData.message, JSON.stringify(cinetpayData));
      return res.status(400).json({ success: false, message: cinetpayData.message || 'Erreur CinetPay.' });
    }

    await reservation.update({ cinetpay_transaction_id: transactionId });
    console.log('[CinetPay] ✅ Paiement initié — booking', reservation.id, 'url:', cinetpayData.data.payment_url);

    return res.status(201).json({
      success:     true,
      booking_id:  reservation.id,
      payment_url: cinetpayData.data.payment_url,
      montant,
      currency:    sym,
    });
  } catch (err) { next(err); }
};

// POST /api/payments/notify  — webhook CinetPay après paiement passager
const notifierPaiement = async (req, res) => {
  try {
    const { cpm_trans_id, cpm_trans_status } = req.body;

    if (cpm_trans_status !== 'ACCEPTED') return res.json({ code: '00', message: 'Ignored' });

    const creds = getCreds();
    if (!creds) return res.json({ code: '00', message: 'No credentials' });

    // Double vérification auprès de CinetPay
    const { data: check } = await axios.post(CINETPAY_CHECK_URL, {
      apikey:         creds.apiKey,
      site_id:        creds.siteId,
      transaction_id: cpm_trans_id,
    }, { timeout: 15000 });

    if (check.data?.status !== 'ACCEPTED') return res.json({ code: '00', message: 'Not verified' });

    const meta = JSON.parse(check.data.metadata || '{}');
    const { booking_id, conducteur_id } = meta;

    if (!booking_id) return res.json({ code: '00', message: 'No booking_id' });

    const reservation = await Booking.findByPk(booking_id, {
      include: [{ model: User, as: 'passager', attributes: ['id', 'nom'] }],
    });
    if (!reservation || reservation.paiement_confirme) {
      return res.json({ code: '00', message: 'Already processed or not found' });
    }

    await reservation.update({ paiement_confirme: true });

    // Notifier le conducteur
    const conducteur = await User.findByPk(conducteur_id, { attributes: ['id', 'push_token'] });
    const trajet     = await Ride.findByPk(reservation.ride_id, { attributes: ['depart_label', 'arrivee_label'] });
    const route      = trajet ? `${trajet.depart_label} → ${trajet.arrivee_label}` : '';

    await Notification.create({
      user_id: conducteur_id,
      type:    'nouvelle_reservation',
      titre:   '💳 Nouvelle réservation payée',
      corps:   `${reservation.passager?.nom} a payé sa réservation · ${route}`,
      data:    { booking_id, ride_id: reservation.ride_id },
    });
    if (conducteur?.push_token) {
      await sendPush(conducteur.push_token, '💳 Réservation payée !', `${reservation.passager?.nom} — ${route}`);
    }

    console.log(`[Payment] Booking ${booking_id} paiement confirmé`);
    return res.json({ code: '00', message: 'OK' });
  } catch (err) {
    console.error('[Payment webhook] Erreur:', err.message);
    return res.json({ code: '00', message: 'Error logged' });
  }
};

// Virement automatique vers le mobile money du conducteur
// Appelé depuis terminerCourse — toujours CinetPay Transfer
const payerConducteur = async ({ conducteur, montantBrut, bookingId }) => {
  const password = process.env.CINETPAY_TRANSFER_PASSWORD;
  const creds    = getCreds();
  const taux     = getCommission();

  if (!password || !creds) {
    console.warn('[Payout] Credentials manquants — payout ignoré');
    return { success: false, reason: 'no_credentials' };
  }
  if (!conducteur.numero_paiement) {
    console.warn('[Payout] Conducteur sans numero_paiement — payout ignoré');
    return { success: false, reason: 'no_payment_number' };
  }

  const commission    = Math.round(montantBrut * taux);
  const netConducteur = montantBrut - commission;

  // Normaliser le numéro : retirer +223 / 00223
  const phone = conducteur.numero_paiement.replace(/^(\+223|00223)/, '').replace(/\s/g, '');

  const passwordHash = crypto.createHash('md5').update(password).digest('hex');

  const { data } = await axios.post(CINETPAY_TRANSFER_URL, {
    apikey:   creds.apiKey,
    password: passwordHash,
    data: [{
      prefix:                '223',
      phone,
      amount:                netConducteur,
      notify_url:            `${process.env.APP_URL || 'http://localhost:3000'}/api/payments/payout-notify`,
      client_transaction_id: `PAYOUT_${bookingId}_${Date.now()}`,
    }],
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });

  if (data.code === '0' || data.code === 0) {
    console.log(`[Payout] ✅ Virement initié : ${netConducteur} XOF → ${conducteur.numero_paiement} (commission ${commission} XOF)`);
    return { success: true, net: netConducteur, commission };
  }

  console.error('[Payout] Erreur CinetPay Transfer:', data.message);
  return { success: false, reason: data.message };
};

// POST /api/payments/payout-notify — webhook statut virement
const payoutNotify = (req, res) => {
  const { client_transaction_id, status, phone } = req.body;
  console.log(`[Payout webhook] tx=${client_transaction_id} status=${status} phone=${phone}`);
  res.json({ code: '00' });
};

// GET /api/payments/success — page de retour navigateur
const paiementSuccess = (req, res) => {
  const { booking_id } = req.query;
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Paiement confirmé — YesGo</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: #fff; border-radius: 20px; padding: 40px; text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,.1); max-width: 360px; width: 90%; }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1   { color: #22C55E; font-size: 22px; margin: 0 0 8px; }
    p    { color: #666; font-size: 15px; line-height: 1.5; }
    small{ color: #aaa; font-size: 12px; margin-top: 20px; display: block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Paiement confirmé !</h1>
    <p>Votre réservation est en attente de confirmation du conducteur.<br>
       Revenez dans l'application YesGo.</p>
    <small>Référence : ${booking_id || '—'}</small>
  </div>
</body>
</html>`);
};

module.exports = { initierPaiement, notifierPaiement, paiementSuccess, payerConducteur, payoutNotify };
