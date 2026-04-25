const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Ride = sequelize.define('Ride', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  // Champ GEOMETRY PostGIS — format GeoJSON { type: 'Point', coordinates: [lng, lat] }
  depart: {
    type: DataTypes.GEOMETRY('POINT', 4326),
    allowNull: false,
  },
  arrivee: {
    type: DataTypes.GEOMETRY('POINT', 4326),
    allowNull: false,
  },
  depart_label: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'Nom lisible du point de départ (ex: Marché Sandaga, Dakar)',
  },
  arrivee_label: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: 'Nom lisible du point d\'arrivée',
  },
  date_heure: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  prix: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: { min: 0 },
  },
  places: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 1, max: 7 },
  },
  type_vehicule: {
    type: DataTypes.ENUM('moto', 'auto'),
    defaultValue: 'moto',
    allowNull: false,
  },
  conducteur_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  statut: {
    type: DataTypes.ENUM('actif', 'complet', 'annule', 'termine'),
    defaultValue: 'actif',
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'XOF',
    allowNull: false,
  },
  currency_symbol: {
    type: DataTypes.STRING(10),
    defaultValue: 'FCFA',
    allowNull: false,
  },
}, {
  tableName: 'rides',
  timestamps: true,
});

module.exports = Ride;
