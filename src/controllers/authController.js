const jwt = require('jsonwebtoken');
const { User } = require('../models');

const genererToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const register = async (req, res, next) => {
  try {
    const { nom, telephone, mot_de_passe, est_conducteur } = req.body;

    if (!nom || !telephone || !mot_de_passe) {
      return res.status(400).json({ success: false, message: 'nom, telephone et mot_de_passe sont requis.' });
    }
    if (mot_de_passe.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    const existant = await User.findOne({ where: { telephone } });
    if (existant) {
      return res.status(409).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé.' });
    }

    const { type_vehicule } = req.body;
    const estConducteur = est_conducteur || false;
    const user = await User.create({
      nom, telephone, mot_de_passe,
      est_conducteur: estConducteur,
      type_vehicule: estConducteur && type_vehicule ? type_vehicule : null,
      numero_paiement: telephone,
    });
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

const resetPassword = async (req, res, next) => {
  try {
    const { telephone, nouveau_mot_de_passe } = req.body;
    if (!telephone || !nouveau_mot_de_passe) {
      return res.status(400).json({ success: false, message: 'telephone et nouveau_mot_de_passe sont requis.' });
    }
    if (nouveau_mot_de_passe.length < 6) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }
    const user = await User.scope('withPassword').findOne({ where: { telephone } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Aucun compte avec ce numéro.' });
    }
    // Assigner directement pour que beforeSave détecte le changement
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
const multer = require('multer');
const path   = require('path');

const _storage = multer.diskStorage({
  destination: 'uploads/documents/',
  filename: (req, file, cb) => {
    // ex: <userId>_cni_1714000000000.jpg  — extension préservée pour affichage navigateur
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

    console.log('FILES RECEIVED:', req.files);
    console.log('[upload] content-type:', req.headers['content-type']);

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun fichier reçu par le serveur.' });
    }

    try {
      const filenames = files.map(f => `/uploads/documents/${f.filename}`);
      console.log('[upload] sauvegardés:', filenames);
      await req.user.update({ documents_soumis: true, is_verifie: false, document_urls: filenames });
      return res.json({ success: true, message: 'Documents soumis. En attente de vérification.', files: filenames });
    } catch (e) { next(e); }
  });
};

const mettreAJourVehicule = async (req, res, next) => {
  try {
    const { type_vehicule, marque_vehicule, modele_vehicule } = req.body;
    if (!type_vehicule || !['moto', 'auto'].includes(type_vehicule)) {
      return res.status(400).json({ success: false, message: 'type_vehicule doit être "moto" ou "auto".' });
    }
    await req.user.update({
      type_vehicule,
      marque_vehicule: marque_vehicule?.trim() || null,
      modele_vehicule: modele_vehicule?.trim() || null,
    });
    return res.json({
      success: true,
      message: 'Véhicule mis à jour.',
      data: {
        type_vehicule:   req.user.type_vehicule,
        marque_vehicule: req.user.marque_vehicule,
        modele_vehicule: req.user.modele_vehicule,
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
      const url = `${process.env.APP_URL}/uploads/photos/${req.file.filename}`;
      await req.user.update({ photo_profil: url });
      return res.json({ success: true, data: { photo_profil: url } });
    } catch (e) { next(e); }
  });
};

module.exports = { register, login, moi, resetPassword, changerRole, soumettreDocuments, mettreAJourVehicule, mettreAJourNumeroPaiement, uploaderPhotoProfil };
