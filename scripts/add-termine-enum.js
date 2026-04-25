require('dotenv').config();
const { sequelize } = require('../src/config/database');

(async () => {
  await sequelize.authenticate();
  // PostgreSQL : ALTER TYPE ne supporte pas IF NOT EXISTS, on ignore l'erreur si déjà présent
  const queries = [
    `ALTER TYPE "enum_bookings_statut"   ADD VALUE IF NOT EXISTS 'termine'`,
    `ALTER TYPE "enum_rides_statut"      ADD VALUE IF NOT EXISTS 'termine'`,
  ];
  for (const q of queries) {
    try {
      await sequelize.query(q);
      console.log('✅', q);
    } catch (e) {
      console.log('⚠️ (déjà présent ou ignoré):', e.message);
    }
  }
  process.exit(0);
})();
