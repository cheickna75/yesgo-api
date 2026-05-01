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
  await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
  console.log('Modèles synchronisés avec la base de données.');

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
