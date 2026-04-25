const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:     { type: DataTypes.UUID, allowNull: false },
  type:        { type: DataTypes.ENUM('recharge', 'debit', 'credit', 'remboursement', 'commission'), allowNull: false },
  montant:     { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  description: { type: DataTypes.STRING(200), allowNull: true },
  reference_id:{ type: DataTypes.UUID, allowNull: true }, // booking_id ou ride_id
}, {
  tableName: 'transactions',
  timestamps: true,
  updatedAt: false,
});

module.exports = Transaction;
