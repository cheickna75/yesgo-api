const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  ride_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true, // une seule conversation par trajet
  },
}, {
  tableName: 'conversations',
  timestamps: true,
});

module.exports = Conversation;
