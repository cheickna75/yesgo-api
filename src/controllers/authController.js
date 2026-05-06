const jwt = require('jsonwebtoken');
const { User } = require('../models');

const genererToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const register = async (req, res, next) => {
  try {
    const { nom, telephone, mot_de_passe, est_conducteur, type_vehicule, otp, code_parrainage } = req.body;

    if (!nom || !telephone || !mot_de_passe) {
      return res.status(400).json({ success: false, message: 'Remplis tous les champs obligatoires.' });
    }
    if (mot_de_passe.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    // Vérification OTP — toujours obligatoire (SMS si Twilio configuré, sinon logs Railway)
    const stored = otpStore.get(`reg_${telephone}`);
    if (!otp || !stored) {
      return res.status(400).json({ success: false, message: 'Code de vérification requis. Demande un nouveau code.' });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(`reg_${telephone}`);
      return res.status(400).json({ success: false, message: 'Le code a expiré. Demande un nouveau code.' });
    }
    if (stored.code !== String(otp)) {
      return res.status(400).json({ success: false, message: 'Code incorrect. Vérifie le SMS reçu.' });
    }
    otpStore.delete(`reg_${telephone}`);

    const existant = await User.findOne({ where: { telephone } });
    if (existant) {
      return res.status(409).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé.' });
    }

    // Parrainage : chercher le parrain si un code est fourni
    let parrain = null;
    if (code_parrainage?.trim()) {
      parrain = await User.findOne({ where: { code_parrainage: code_parrainage.trim().toUpperCase() } });
    }

    const estConducteur = est_conducteur || false;
    const user = await User.create({
      nom, telephone, mot_de_passe,
      est_conducteur: estConducteur,
      type_vehicule: estConducteur && type_vehicule ? type_vehicule : null,
      numero_paiement: telephone,
      parraine_par: parrain?.id || null,
    });

    // Donner 3 mois de bonus commission au parrain
    if (parrain) {
      const until = new Date();
      until.setMonth(until.getMonth() + 3);
      await parrain.update({ commission_bonus_until: until });
    }

    const token = genererToken(user.id);

    return res.status(201).json({
      success: true,
      token,
      data: {
        id: user.id, nom: user.nom, telephone: user.telephone,
        est_conducteur: user.est_conducteur,
        type_vehicule: user.type_vehicule || null,
        documents_soumis: false, is_verifie: false, solde: 0,
        marque_vehicule: null, modele_vehicule: null,
        numero_paiement: telephone,
      },
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { telephone, mot_de_passe } = req.body;

    if (!telephone || !mot_de_passe) {
      return res.status(400).json({ success: false, message: 'telephone et mot_de_passe sont requis.' });
    }

    // scope withPassword pour inclure le champ hash exclu par défaut
    const user = await User.scope('withPassword').findOne({ where: { telephone } });
    if (!user || !(await user.verifierMotDePasse(mot_de_passe))) {
      return res.status(401).json({ success: false, message: 'Numéro ou mot de passe incorrect.' });
    }

    const token = genererToken(user.id);

    return res.json({
      success: true,
      token,
      data: {
        id: user.id, nom: user.nom, telephone: user.telephone,
        est_conducteur: user.est_conducteur, est_admin: user.est_admin,
        documents_soumis: user.documents_soumis, is_verifie: user.is_verifie,
        solde: parseFloat(user.solde || 0),
        type_vehicule: user.type_vehicule || null,
        marque_vehicule: user.marque_vehicule || null,
        modele_vehicule: user.modele_vehicule || null,
        numero_paiement: user.numero_paiement || null,
        photo_profil: user.photo_profil || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

const moi = async (req, res) => {
  res.json({ success: true, data: req.user });
};

// OTP store en mémoire : telephone → { code, expiresAt }
const otpStore = new Map();

// Envoie l'OTP par SMS (Twilio si configuré, sinon console)
const envoyerOTPSMS = async (telephone, code) => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  if (sid && token && from) {
    const twilio = require('twilio')(sid, token);
    await twilio.messages.create({
      body: `Ton code YesGo : ${code}. Valable 10 minutes. Ne le partage pas.`,
      from,
      to: telephone,
    });
  } else {
    // Mode développement : afficher dans les logs Railway
    console.log(`[OTP] ${telephone} → ${code}`);
  }
};

const demanderOTPInscription = async (req, res, next) => {
  try {
    const { telephone } = req.body;
    if (!telephone) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone requis.' });
    }
    const existant = await User.findOne({ where: { telephone } });
    if (existant) {
      return res.status(409).json({ success: false, message: 'Ce numéro est déjà associé à un compte.' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(`reg_${telephone}`, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
    await envoyerOTPSMS(telephone, code);
    return res.json({ success: true, message: 'Code de vérification envoyé par SMS.' });
  } catch (err) {
    next(err);
  }
};

const demanderOTP = async (req, res, next) => {
  try {
    const { telephone } = req.body;
    if (!telephone) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone requis.' });
    }
    const user = await User.findOne({ where: { telephone } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Aucun compte avec ce numéro.' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    otpStore.set(telephone, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
    await envoyerOTPSMS(telephone, code);
    return res.json({ success: true, message: 'Code envoyé par SMS.' });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { telephone, otp, nouveau_mot_de_passe } = req.body;
    if (!telephone || !otp || !nouveau_mot_de_passe) {
      return res.status(400).json({ success: false, message: 'Remplis tous les champs pour réinitialiser ton mot de passe.' });
    }
    if (nouveau_mot_de_passe.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    const stored = otpStore.get(telephone);
    if (!stored) {
      return res.status(400).json({ success: false, message: 'Aucun code en attente. Demande un nouveau code.' });
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(telephone);
      return res.status(400).json({ success: false, message: 'Le code a expiré. Demande un nouveau code.' });
    }
    if (stored.code !== String(otp)) {
      return res.status(400).json({ success: false, message: 'Code incorrect. Vérifie la notification reçue.' });
    }
    otpStore.delete(telephone);
    const user = await User.scope('withPassword').findOne({ where: { telephone } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Aucun compte avec ce numéro.' });
    }
    user.mot_de_passe = nouveau_mot_de_passe;
    await user.save();
    return res.json({ success: true, message: 'Mot de passe mis à jour.' });
  } catch (err) {
    next(err);
  }
};

const changerRole = async (req, res, next) => {
  try {
    const { est_conducteur } = req.body;
    if (typeof est_conducteur !== 'boolean') {
      return res.status(400).json({ success: false, message: 'est_conducteur doit être true ou false.' });
    }
    await req.user.update({ est_conducteur });
    return res.json({
      success: true,
      message: `Rôle mis à jour : ${est_conducteur ? 'conducteur' : 'passager'}.`,
      data: { id: req.user.id, nom: req.user.nom, telephone: req.user.telephone, est_conducteur },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/soumettre-documents  (multipart/form-data)
const multer     = require('multer');
const path       = require('path');
const cloudinary = require('cloudinary').v2;

const _cloudinaryActif = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (_cloudinaryActif) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const _storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/documents'),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const type = path.basename(file.originalname, path.extname(file.originalname)) || 'doc';
    cb(null, `${req.user.id}_${type}_${Date.now()}${ext}`);
  },
});
const _upload = multer({ storage: _storage }).array('documents', 5);

const soumettreDocuments = (req, res, next) => {
  _upload(req, res, async (err) => {
    if (err) {
      console.log('[upload] multer error:', err.message);
      return res.status(400).json({ success: false, message: err.message });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun fichier reçu par le serveur.' });
    }

    try {
      let urls;

      if (_cloudinaryActif) {
        // Upload vers Cloudinary (persistant sur Railway)
        const uploads = await Promise.all(files.map(f =>
          cloudinary.uploader.upload(f.path, {
            folder:    'yesgo/documents',
            public_id: path.basename(f.filename, path.extname(f.filename)),
            resource_type: 'image',
          })
        ));
        urls = uploads.map(r => r.secure_url);
        console.log('[upload] Cloudinary ✅', urls);
      } else {
        // Stockage local (dev uniquement — ephémère sur Railway)
        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
        urls = files.map(f => `${appUrl}/uploads/documents/${f.filename}`);
        console.log('[upload] local ⚠️', urls);
      }

      await req.user.update({ documents_soumis: true, is_verifie: false, document_urls: urls });
      return res.json({ success: true, message: 'Documents soumis. En attente de vérification.', files: urls });
    } catch (e) { next(e); }
  });
};

const mettreAJourVehicule = async (req, res, next) => {
  try {
    const { type_vehicule, marque_vehicule, modele_vehicule, numero_immatriculation } = req.body;
    if (!type_vehicule || !['moto', 'auto'].includes(type_vehicule)) {
      return res.status(400).json({ success: false, message: 'type_vehicule doit être "moto" ou "auto".' });
    }
    await req.user.update({
      type_vehicule,
      marque_vehicule:        marque_vehicule?.trim()        || null,
      modele_vehicule:        modele_vehicule?.trim()        || null,
      numero_immatriculation: numero_immatriculation?.trim() || null,
    });
    return res.json({
      success: true,
      message: 'Véhicule mis à jour.',
      data: {
        type_vehicule:          req.user.type_vehicule,
        marque_vehicule:        req.user.marque_vehicule,
        modele_vehicule:        req.user.modele_vehicule,
        numero_immatriculation: req.user.numero_immatriculation,
      },
    });
  } catch (err) { next(err); }
};

// PUT /api/auth/numero-paiement
const mettreAJourNumeroPaiement = async (req, res, next) => {
  try {
    const { numero_paiement } = req.body;
    if (!numero_paiement?.trim()) {
      return res.status(400).json({ success: false, message: 'numero_paiement est requis.' });
    }
    const numero = numero_paiement.trim().replace(/\s/g, '');
    if (!/^\+?[0-9]{8,15}$/.test(numero)) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone invalide.' });
    }
    await req.user.update({ numero_paiement: numero });
    return res.json({ success: true, message: 'Numéro de paiement mis à jour.', data: { numero_paiement: numero } });
  } catch (err) { next(err); }
};

// POST /api/auth/photo-profil  (multipart/form-data, champ "photo")
const fs = require('fs');

const _storagePhoto = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../uploads/photos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${req.user.id}_photo_${Date.now()}${ext}`);
  },
});
const _uploadPhoto = multer({
  storage: _storagePhoto,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont acceptées.'));
  },
}).single('photo');

const uploaderPhotoProfil = (req, res, next) => {
  _uploadPhoto(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucune photo reçue.' });
    try {
      const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
      const url = `${appUrl}/uploads/photos/${req.file.filename}`;
      await req.user.update({ photo_profil: url });
      return res.json({ success: true, data: { photo_profil: url } });
    } catch (e) { next(e); }
  });
};

// POST /api/auth/partager — enregistre un partage réseau social
const enregistrerPartage = async (req, res, next) => {
  try {
    const { reseau } = req.body;
    const reseauxValides = ['facebook', 'whatsapp', 'instagram', 'snapchat'];
    if (!reseauxValides.includes(reseau)) {
      return res.status(400).json({ success: false, message: 'Réseau invalide.' });
    }

    const reseaux = Array.isArray(req.user.partages_reseaux) ? [...req.user.partages_reseaux] : [];
    if (!reseaux.includes(reseau)) reseaux.push(reseau);

    const updates = { partages_reseaux: reseaux };

    // 3 mois sans commission — uniquement si conducteur ET partage avant le 1er trajet publié
    if (
      reseaux.length >= 2 &&
      !req.user.commission_bonus_until &&
      req.user.est_conducteur &&
      !req.user.premier_trajet_publie
    ) {
      const until = new Date();
      until.setMonth(until.getMonth() + 3);
      updates.commission_bonus_until = until;
    }

    await req.user.update(updates);
    return res.json({
      success:     true,
      partages:    reseaux.length,
      bonus_actif: !!(updates.commission_bonus_until || req.user.commission_bonus_until),
    });
  } catch (err) { next(err); }
};

module.exports = { register, login, moi, demanderOTPInscription, demanderOTP, resetPassword, changerRole, soumettreDocuments, mettreAJourVehicule, mettreAJourNumeroPaiement, uploaderPhotoProfil, enregistrerPartage };
