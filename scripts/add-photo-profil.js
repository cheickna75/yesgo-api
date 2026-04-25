require('dotenv').config();
const { sequelize } = require('../src/config/database');

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS photo_profil VARCHAR(500) DEFAULT NULL;
    `);
    console.log('✅ Colonne photo_profil ajoutée à la table users.');
  } catch (e) {
    console.error('❌ Erreur migration:', e.message);
  } finally {
    await sequelize.close();
  }
})();
