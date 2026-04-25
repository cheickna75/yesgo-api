const bcrypt = require('bcryptjs');
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nom: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  telephone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    validate: { is: /^\+?[0-9]{8,15}$/ },
  },
  mot_de_passe: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  est_conducteur: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  solde: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    allowNull: false,
  },
  push_token: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  est_admin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  actif: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  documents_soumis: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_verifie: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  document_urls: {
    type: DataTypes.JSON,
    defaultValue: [],
    allowNull: true,
  },
  type_vehicule: {
    type: DataTypes.ENUM('moto', 'auto'),
    allowNull: true,
  },
  marque_vehicule: {
    type: DataTypes.STRING(60),
    allowNull: true,
  },
  modele_vehicule: {
    type: DataTypes.STRING(60),
    allowNull: true,
  },
  numero_paiement: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Numéro Orange Money ou Moov Money du conducteur pour recevoir ses gains',
  },
  photo_profil: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'users',
  timestamps: true,
  // Jamais retourner le mot de passe dans les réponses JSON
  defaultScope: {
    attributes: { exclude: ['mot_de_passe'] },
  },
  scopes: {
    withPassword: { attributes: {} },
  },
});

// Hash automatique avant création ou modification du mot de passe
User.beforeSave(async (user) => {
  if (user.changed('mot_de_passe')) {
    user.mot_de_passe = await bcrypt.hash(user.mot_de_passe, 12);
  }
});

User.prototype.verifierMotDePasse = function (motDePasse) {
  return bcrypt.compare(motDePasse, this.mot_de_passe);
};

module.exports = User;
