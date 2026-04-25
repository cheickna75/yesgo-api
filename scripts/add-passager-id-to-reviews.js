require('dotenv').config();
const { sequelize } = require('../src/config/database');

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS passager_id UUID;
    `);
    console.log('✅ Colonne passager_id ajoutée à la table reviews.');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  } finally {
    await sequelize.close();
  }
})();
