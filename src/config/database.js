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
};

module.exports = { sequelize, connectDB };
