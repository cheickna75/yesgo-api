require('dotenv').config();
const { sequelize } = require('./src/config/database');
const { User, Ride } = require('./src/models');

const QUARTIERS = {
  'Bamako Centre':   [-7.9978, 12.6502],
  'Hamdallaye':      [-8.0125, 12.6378],
  'Badalabougou':    [-7.9803, 12.6245],
  'Lafiabougou':     [-8.0246, 12.6519],
  'Magnambougou':    [-7.9600, 12.6081],
  'ACI 2000':        [-8.0100, 12.6700],
  'Kalaban Coro':    [-7.9734, 12.5925],
  'Niamakoro':       [-7.9817, 12.5989],
  'Faladiè':         [-7.9439, 12.6072],
  'Kati':            [-8.0694, 12.7475],
  'Sikoroni':        [-8.0430, 12.6630],
  'Banconi':         [-8.0230, 12.6720],
  'Missabougou':     [-7.9292, 12.5883],
  'Sotuba':          [-7.9550, 12.6750],
  'Quinzambougou':   [-7.9980, 12.6600],
};

const point = (nom) => ({
  type: 'Point',
  coordinates: QUARTIERS[nom],
});

const TRAJETS = [
  { dep: 'Hamdallaye',    arr: 'Bamako Centre',  prix: 500,  places: 2, h: '07:30' },
  { dep: 'Banconi',       arr: 'ACI 2000',       prix: 600,  places: 1, h: '08:00' },
  { dep: 'Lafiabougou',   arr: 'Badalabougou',   prix: 750,  places: 3, h: '08:15' },
  { dep: 'Kalaban Coro',  arr: 'Bamako Centre',  prix: 1000, places: 2, h: '08:30' },
  { dep: 'Niamakoro',     arr: 'ACI 2000',       prix: 800,  places: 1, h: '09:00' },
  { dep: 'Faladiè',       arr: 'Badalabougou',   prix: 700,  places: 2, h: '09:30' },
  { dep: 'Kati',          arr: 'Bamako Centre',  prix: 1500, places: 3, h: '07:00' },
  { dep: 'Sikoroni',      arr: 'Quinzambougou',  prix: 400,  places: 2, h: '10:00' },
  { dep: 'Magnambougou',  arr: 'Bamako Centre',  prix: 600,  places: 1, h: '10:30' },
  { dep: 'Sotuba',        arr: 'ACI 2000',       prix: 550,  places: 2, h: '11:00' },
  { dep: 'Missabougou',   arr: 'Badalabougou',   prix: 900,  places: 3, h: '07:45' },
  { dep: 'ACI 2000',      arr: 'Hamdallaye',     prix: 500,  places: 2, h: '12:00' },
];

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connexion DB OK');

    // Trouver ou créer un conducteur de test
    let conducteur = await User.findOne({ where: { telephone: '+22376000001' } });
    if (!conducteur) {
      conducteur = await User.create({
        nom: 'Moussa Konaté',
        telephone: '+22376000001',
        mot_de_passe: 'test123',
        est_conducteur: true,
      });
      console.log('✅ Conducteur créé :', conducteur.nom);
    } else {
      console.log('✅ Conducteur existant :', conducteur.nom);
      // S'assurer qu'il est conducteur
      if (!conducteur.est_conducteur) {
        await conducteur.update({ est_conducteur: true });
      }
    }

    // Créer un deuxième conducteur
    let conducteur2 = await User.findOne({ where: { telephone: '+22376000002' } });
    if (!conducteur2) {
      conducteur2 = await User.create({
        nom: 'Aminata Diallo',
        telephone: '+22376000002',
        mot_de_passe: 'test123',
        est_conducteur: true,
      });
      console.log('✅ Conductrice créée :', conducteur2.nom);
    }

    // Supprimer les anciens trajets de test
    const deleted = await Ride.destroy({
      where: { conducteur_id: [conducteur.id, conducteur2.id] },
    });
    if (deleted > 0) console.log(`🗑️  ${deleted} ancien(s) trajet(s) supprimé(s)`);

    // Date de base : aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Créer les trajets
    let count = 0;
    for (let i = 0; i < TRAJETS.length; i++) {
      const t = TRAJETS[i];
      const [hh, mm] = t.h.split(':').map(Number);
      const date_heure = new Date(today);
      date_heure.setDate(today.getDate() + (i % 3)); // étaler sur 3 jours
      date_heure.setHours(hh, mm, 0, 0);

      await Ride.create({
        depart:        point(t.dep),
        arrivee:       point(t.arr),
        depart_label:  t.dep,
        arrivee_label: t.arr,
        date_heure,
        prix:          t.prix,
        places:        t.places,
        conducteur_id: i % 2 === 0 ? conducteur.id : conducteur2.id,
        statut:        'actif',
      });
      count++;
      console.log(`  ✅ ${t.dep} → ${t.arr} (${t.prix} FCFA)`);
    }

    console.log(`\n🎉 ${count} trajets créés avec succès !`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exit(1);
  }
}

seed();
