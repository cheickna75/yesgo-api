const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Booking = sequelize.define('Booking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  ride_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  passager_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  statut: {
    type: DataTypes.ENUM('en_attente', 'accepte', 'refuse', 'annule', 'termine'),
    defaultValue: 'en_attente',
  },
  message: {
    type: DataTypes.STRING(300),
    allowNull: true,
  },
  mode_paiement: {
    type: DataTypes.ENUM('wallet', 'especes', 'cash', 'cinetpay'),
    defaultValue: 'cinetpay',
  },
  cinetpay_transaction_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  paiement_confirme: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  places_reservees: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  otp_code: {
    type: DataTypes.STRING(6),
    allowNull: true,
  },
  otp_expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  otp_valide: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  // ── #2 Waypoints — segment de trajet réservé ────────────────────
  waypoint_depart_ordre: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Ordre du waypoint de montée (null = départ principal)',
  },
  waypoint_arrivee_ordre: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Ordre du waypoint de descente (null = arrivée principale)',
  },
}, {
  tableName: 'bookings',
  timestamps: true,
});

module.exports = Booking;
