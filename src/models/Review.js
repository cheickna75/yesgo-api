const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Review = sequelize.define('Review', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ride_id:       { type: DataTypes.UUID, allowNull: false },
  auteur_id:     { type: DataTypes.UUID, allowNull: false },
  conducteur_id: { type: DataTypes.UUID, allowNull: false },
  note:          { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
  commentaire:   { type: DataTypes.TEXT, allowNull: true },
  passager_id:   { type: DataTypes.UUID, allowNull: true },
}, {
  tableName: 'reviews',
  timestamps: true,
  indexes: [{ unique: true, fields: ['ride_id', 'auteur_id'] }],
});

module.exports = Review;
