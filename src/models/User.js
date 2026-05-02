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

  // ── #4 Profil conducteur ─────────────────────────────────────────
  numero_immatriculation: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Plaque d\'immatriculation du véhicule (conducteurs uniquement)',
  },

  // ── #1 Internationalisation ──────────────────────────────────────
  langue: {
    type: DataTypes.STRING(5),
    defaultValue: 'fr',
    allowNull: false,
    comment: 'Langue préférée de l\'utilisateur (fr, en, ar)',
  },

  // ── #5 Gamification / Parrainage ────────────────────────────────
  code_parrainage: {
    type: DataTypes.STRING(10),
    allowNull: true,
    unique: true,
    comment: 'Code unique partageable pour parrainer de nouveaux utilisateurs',
  },
  parraine_par: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: 'user_id du parrain qui a recruté cet utilisateur',
  },
  commission_bonus_until: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Le conducteur ne paie pas de commission jusqu\'à cette date (bonus partage)',
  },
  premier_trajet_publie: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Passe à true dès que le conducteur publie son 1er trajet',
  },
  partages_reseaux: {
    type: DataTypes.JSON,
    defaultValue: [],
    allowNull: true,
    comment: 'Réseaux sur lesquels l\'utilisateur a partagé l\'app (facebook, whatsapp, instagram, snapchat)',
  },

}, {
  tableName: 'users',
  timestamps: true,
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

// Génère un code de parrainage unique à la création
User.beforeCreate(async (user) => {
  if (!user.code_parrainage) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    let exists = true;
    while (exists) {
      code = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      exists = await User.findOne({ where: { code_parrainage: code } });
    }
    user.code_parrainage = code;
  }
});

User.prototype.verifierMotDePasse = function (motDePasse) {
  return bcrypt.compare(motDePasse, this.mot_de_passe);
};

// Vrai si le conducteur bénéficie encore du bonus de commission
User.prototype.aBonusCommission = function () {
  return this.commission_bonus_until && new Date() < new Date(this.commission_bonus_until);
};

module.exports = User;
