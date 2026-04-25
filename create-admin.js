/**
 * Crée un compte administrateur.
 * Usage : node create-admin.js
 */
require('dotenv').config();
require('./src/models');
const { User } = require('./src/models');
const { connectDB } = require('./src/config/database');

const ADMIN = {
  nom:          'Admin YesGo',
  telephone:    '+22376351993',
  mot_de_passe: 'MohamedCISSE75020',
  est_admin:    true,
  est_conducteur: false,
};

(async () => {
  await connectDB();

  const existant = await User.findOne({ where: { telephone: ADMIN.telephone } });
  if (existant) {
    await existant.update({ est_admin: true });
    console.log('✅ Compte existant promu administrateur :', existant.telephone);
  } else {
    const admin = await User.create(ADMIN);
    console.log('✅ Administrateur créé :');
    console.log('   Téléphone :', admin.telephone);
    console.log('   Mot de passe : admin123');
    console.log('   ⚠️  Changez ce mot de passe en production !');
  }

  process.exit(0);
})();
