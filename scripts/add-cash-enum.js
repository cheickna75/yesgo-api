require('dotenv').config();
const { sequelize } = require('../src/config/database');

(async () => {
  try {
    await sequelize.authenticate();
    // Ajouter 'cash' à l'enum si absent
    await sequelize.query(`
      ALTER TYPE enum_bookings_mode_paiement ADD VALUE IF NOT EXISTS 'cash';
    `);
    console.log('✅ Valeur cash ajoutée à enum_bookings_mode_paiement.');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  } finally {
    await sequelize.close();
  }
})();
