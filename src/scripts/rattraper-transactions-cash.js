/**
 * Script one-shot : crée les transactions manquantes pour les courses cash déjà terminées.
 * Lancez avec :  node src/scripts/rattraper-transactions-cash.js
 */

require('dotenv').config();
const { sequelize } = require('../config/database');
const { Booking, Ride, User, Transaction } = require('../models');

(async () => {
  await sequelize.authenticate();
  console.log('Connexion DB OK\n');

  // 1. Toutes les réservations cash terminées
  const bookings = await Booking.findAll({
    where: { mode_paiement: 'cash', statut: 'termine' },
    include: [
      {
        model: Ride,
        as: 'trajet',
        attributes: ['conducteur_id', 'prix', 'depart_label', 'arrivee_label'],
        include: [{ model: User, as: 'conducteur', attributes: ['id', 'nom'] }],
      },
    ],
  });

  console.log(`${bookings.length} réservation(s) cash terminée(s) trouvée(s).`);

  let creees = 0;
  let ignorees = 0;

  for (const booking of bookings) {
    const conducteur = booking.trajet?.conducteur;
    if (!conducteur) { console.warn(`  [SKIP] booking ${booking.id} — conducteur introuvable`); continue; }

    // Vérifier si la transaction existe déjà
    const deja = await Transaction.findOne({
      where: { reference_id: booking.id, user_id: conducteur.id, type: 'credit' },
    });

    if (deja) {
      console.log(`  [OK déjà] booking ${booking.id} — transaction existante`);
      ignorees++;
      continue;
    }

    const montant = parseFloat(booking.trajet.prix) * (booking.places_reservees || 1);
    const route   = `${booking.trajet.depart_label} → ${booking.trajet.arrivee_label}`;

    await Transaction.create({
      user_id:      conducteur.id,
      type:         'credit',
      montant,
      description:  `Espèces · ${route}`,
      reference_id: booking.id,
    });

    console.log(`  [CRÉÉ] booking ${booking.id} — ${montant} FCFA pour ${conducteur.nom}`);
    creees++;
  }

  console.log(`\nRésultat : ${creees} transaction(s) créée(s), ${ignorees} ignorée(s).`);
  await sequelize.close();
})();
