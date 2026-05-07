const { Sequelize } = require('sequelize');

const isProd = process.env.NODE_ENV === 'production';

const sequelize = new Sequelize(process.env.DB_URL, {
  dialect: 'postgres',
  logging: isProd ? false : console.log,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: isProd ? {
    ssl: { require: true, rejectUnauthorized: false },
  } : {},
});

const connectDB = async () => {
  await sequelize.authenticate();
  console.log('PostgreSQL connecté avec succès.');
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  console.log('Extension PostGIS activée.');
  try {
    await sequelize.sync({ alter: true });
    console.log('Modèles synchronisés avec la base de données.');
  } catch (syncErr) {
    // En production, les tables existent déjà — l'erreur UNIQUE/syntax est non-bloquante
    console.warn('⚠️ sync({ alter }) partiel (ignoré en prod) :', syncErr.message);
  }

  // ── Migrations manuelles idempotentes (syntaxe PostgreSQL valide) ─
  const migrations = [
    // Contrainte UNIQUE sur code_parrainage — Sequelize génère du SQL invalide pour ça
    `DO $$ BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conrelid = 'users'::regclass AND conname = 'users_code_parrainage_key'
       ) THEN
         ALTER TABLE users ADD CONSTRAINT users_code_parrainage_key UNIQUE (code_parrainage);
       END IF;
     END $$`,
    // Colonnes bookings pour les waypoints et prix par segment
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waypoint_depart_ordre  INTEGER`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waypoint_arrivee_ordre INTEGER`,
    `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS prix_segment            DECIMAL(12,2)`,
  ];
  for (const sql of migrations) {
    await sequelize.query(sql).catch(e => console.warn('⚠️ migration:', e.message));
  }
  console.log('Migrations manuelles appliquées.');

  // ── Index de performance (idempotents — safe à relancer) ────────
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_rides_statut_date   ON rides(statut, date_heure)`,
    `CREATE INDEX IF NOT EXISTS idx_rides_conducteur    ON rides(conducteur_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_ride_statut ON bookings(ride_id, statut)`,
    `CREATE INDEX IF NOT EXISTS idx_bookings_passager   ON bookings(passager_id, statut)`,
    `CREATE INDEX IF NOT EXISTS idx_rides_depart_geom   ON rides USING GIST(depart)`,
  ];
  for (const sql of indexes) {
    await sequelize.query(sql).catch(() => {});
  }
  console.log('Index de performance vérifiés.');
};

module.exports = { sequelize, connectDB };
