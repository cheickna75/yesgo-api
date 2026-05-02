const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

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

  // ── #2 Trajets à étapes (Waypoints) ─────────────────────────────
  // Format : [{ ordre: 1, label: 'Point G', lat: 12.65, lng: -8.01 }, ...]
  waypoints: {
    type: DataTypes.JSONB,
    defaultValue: [],
    allowNull: true,
    comment: 'Étapes intermédiaires ordonnées entre départ et arrivée',
  },

  // ── #3 Trajets récurrents ────────────────────────────────────────
  est_recurrent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Ce trajet se répète automatiquement selon jours_recurrence',
  },
  jours_recurrence: {
    type: DataTypes.JSONB,
    defaultValue: [],
    allowNull: true,
    comment: 'Jours actifs : tableau d\'entiers [0=dim, 1=lun, 2=mar, 3=mer, 4=jeu, 5=ven, 6=sam]',
  },
  recurrence_fin: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date limite de génération des occurrences récurrentes',
  },
  serie_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'UUID partagé par toutes les occurrences d\'une même série récurrente',
  },
  places_initial: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Nombre de places à la création — utilisé pour réinitialiser les occurrences récurrentes',
  },

  // ── #3 Sécurité passager — lien de suivi ────────────────────────
  suivi_token: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
    comment: 'Token unique pour partager un lien de suivi en temps réel à un proche',
  },

}, {
  tableName: 'rides',
  timestamps: true,
});

// Génère automatiquement le token de suivi à la création
Ride.beforeCreate((ride) => {
  if (!ride.suivi_token) {
    ride.suivi_token = crypto.randomBytes(32).toString('hex');
  }
  // Mémorise le nombre de places initial pour les séries récurrentes
  if (ride.places_initial == null) {
    ride.places_initial = ride.places;
  }
});

module.exports = Ride;
