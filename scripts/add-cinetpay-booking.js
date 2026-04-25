require('dotenv').config();
const { sequelize } = require('../src/config/database');

(async () => {
  await sequelize.authenticate();
  const queries = [
    // Ajouter 'cinetpay' à l'enum mode_paiement des bookings
    `ALTER TYPE "enum_bookings_mode_paiement" ADD VALUE IF NOT EXISTS 'cinetpay'`,
    // Ajouter les colonnes nécessaires
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cinetpay_transaction_id VARCHAR(100)`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paiement_confirme BOOLEAN NOT NULL DEFAULT false`,
  ];
  for (const q of queries) {
    try {
      await sequelize.query(q);
      console.log('✅', q.slice(0, 80));
    } catch (e) {
      console.log('⚠️ ', e.message.slice(0, 100));
    }
  }
  process.exit(0);
})();
