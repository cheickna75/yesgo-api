const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DB_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

const connectDB = async () => {
  await sequelize.authenticate();
  console.log('PostgreSQL connecté avec succès.');
  await sequelize.sync({ alter: process.env.NODE_ENV !== 'production' });
  console.log('Modèles synchronisés avec la base de données.');
};

module.exports = { sequelize, connectDB };
