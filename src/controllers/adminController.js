const { Op, fn, col, literal } = require('sequelize');
const { User, Ride, Booking, Transaction } = require('../models');
const { sequelize } = require('../config/database');
const { COMMISSION_RATE, BETA_MODE } = require('../config/betaConfig');

const getStats = async (req, res, next) => {
  try {
    const [
      totalUtilisateurs,
      totalTrajets,
      totalReservations,
      reservationsAcceptees,
      totalCommissions,
      totalRecharges,
    ] = await Promise.all([
      User.count(),
      Ride.count(),
      Booking.count(),
      Booking.count({ where: { statut: 'accepte' } }),
      Transaction.sum('montant', { where: { type: 'commission' } }),
      Transaction.sum('montant', { where: { type: 'recharge' } }),
    ]);

    return res.json({
      success: true,
      data: {
        totalUtilisateurs,
        totalTrajets,
        totalReservations,
        reservationsAcceptees,
        totalCommissions: parseFloat(totalCommissions || 0).toFixed(2),
        totalRecharges:   parseFloat(totalRecharges   || 0).toFixed(2),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getUtilisateurs = async (req, res, next) => {
  try {
    const utilisateurs = await User.findAll({
      attributes: ['id', 'nom', 'telephone', 'est_conducteur', 'est_admin', 'actif', 'solde', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: utilisateurs });
  } catch (err) {
    next(err);
  }
};

const toggleActif = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    if (user.est_admin) return res.status(403).json({ success: false, message: 'Impossible de désactiver un administrateur.' });

    await user.update({ actif: !user.actif });
    return res.json({
      success: true,
      message: user.actif ? 'Compte réactivé.' : 'Compte désactivé.',
      data: { id: user.id, actif: user.actif },
    });
  } catch (err) {
    next(err);
  }
};

const getReservations = async (req, res, next) => {
  try {
    const reservations = await Booking.findAll({
      include: [
        {
          association: 'trajet',
          attributes: ['depart_label', 'arrivee_label', 'prix', 'date_heure'],
          include: [{ association: 'conducteur', attributes: ['nom', 'telephone'] }],
        },
        { association: 'passager', attributes: ['nom', 'telephone'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });

    const COMMISSION = COMMISSION_RATE;
    const data = reservations.map((b) => ({
      id:            b.id,
      statut:        b.statut,
      createdAt:     b.createdAt,
      passager:      b.passager,
      trajet:        b.trajet,
      prix:          parseFloat(b.trajet?.prix || 0),
      commission:    parseFloat(((b.trajet?.prix || 0) * COMMISSION).toFixed(2)),
    }));

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// Lister tous les utilisateurs ayant soumis des documents d'identité
const getConducteurs = async (req, res, next) => {
  try {
    const conducteurs = await User.findAll({
      attributes: ['id', 'nom', 'telephone', 'est_conducteur', 'documents_soumis', 'is_verifie', 'actif', 'document_urls', 'createdAt'],
      order: [['documents_soumis', 'DESC'], ['is_verifie', 'ASC'], ['createdAt', 'DESC']],
    });
    return res.json({ success: true, data: conducteurs });
  } catch (err) { next(err); }
};

// Vérifier (ou dé-vérifier) un conducteur
const verifierConducteur = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    const nouvelEtat = !user.is_verifie;
    await user.update({ is_verifie: nouvelEtat });

    return res.json({
      success: true,
      message: nouvelEtat ? `${user.nom} est maintenant vérifié ✅` : `Vérification retirée pour ${user.nom}`,
      data: { id: user.id, is_verifie: nouvelEtat },
    });
  } catch (err) { next(err); }
};

// Lister les administrateurs
const getAdmins = async (req, res, next) => {
  try {
    const admins = await User.findAll({
      where: { est_admin: true },
      attributes: ['id', 'nom', 'telephone', 'actif', 'createdAt'],
      order: [['createdAt', 'ASC']],
    });
    return res.json({ success: true, data: admins });
  } catch (err) { next(err); }
};

// Créer ou promouvoir un compte admin
const creerAdmin = async (req, res, next) => {
  try {
    const { nom, telephone, mot_de_passe } = req.body;

    if (!telephone) {
      return res.status(400).json({ success: false, message: 'Le numéro de téléphone est requis.' });
    }

    const existant = await User.findOne({ where: { telephone } });

    if (existant) {
      // Promouvoir un utilisateur existant
      if (existant.est_admin) {
        return res.status(409).json({ success: false, message: 'Ce compte est déjà administrateur.' });
      }
      await existant.update({ est_admin: true });
      return res.json({
        success: true,
        message: `${existant.nom} a été promu administrateur.`,
        data: { id: existant.id, nom: existant.nom, telephone: existant.telephone },
      });
    }

    // Créer un nouveau compte admin
    if (!nom || !mot_de_passe) {
      return res.status(400).json({ success: false, message: 'Nom et mot de passe requis pour créer un nouveau compte.' });
    }
    if (mot_de_passe.length < 8) {
      return res.status(400).json({ success: false, message: 'Le mot de passe doit contenir au moins 8 caractères.' });
    }

    const admin = await User.create({
      nom,
      telephone,
      mot_de_passe,
      est_admin:    true,
      est_conducteur: false,
    });

    return res.status(201).json({
      success: true,
      message: `Administrateur "${nom}" créé avec succès.`,
      data: { id: admin.id, nom: admin.nom, telephone: admin.telephone },
    });
  } catch (err) { next(err); }
};

// Lister tous les fichiers uploadés dans uploads/documents/
const fs   = require('fs');
const path = require('path');

const getDocumentFiles = async (req, res, next) => {
  try {
    const dir = path.join(__dirname, '../../uploads/documents');
    if (!fs.existsSync(dir)) return res.json({ success: true, data: [] });

    const filenames = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    const users = await User.findAll({ attributes: ['id', 'nom', 'telephone', 'est_conducteur', 'document_urls'] });
    const userMap = {};
    users.forEach(u => { userMap[String(u.id)] = u; });

    const data = filenames.map(filename => {
      // Nom de fichier : userId_fieldname_timestamp.ext
      const userId = filename.split('_')[0];
      const user   = userMap[userId] || null;
      const stat   = fs.statSync(path.join(dir, filename));
      const fieldname = filename.split('_')[1] || 'document'; // cni ou permis
      return {
        filename,
        path: `/uploads/documents/${filename}`,
        fieldname,
        size: stat.size,
        date: stat.mtime,
        user: user ? { id: user.id, nom: user.nom, telephone: user.telephone, est_conducteur: user.est_conducteur } : null,
      };
    });

    data.sort((a, b) => new Date(b.date) - new Date(a.date));
    return res.json({ success: true, data });
  } catch (err) { next(err); }
};

// Réinitialiser les documents d'un utilisateur (état incohérent)
const resetDocuments = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    await user.update({ documents_soumis: false, is_verifie: false, document_urls: [] });
    return res.json({ success: true, message: `Documents de ${user.nom} réinitialisés.` });
  } catch (err) { next(err); }
};

module.exports = { getStats, getUtilisateurs, toggleActif, getReservations, getAdmins, creerAdmin, getConducteurs, verifierConducteur, getDocumentFiles, resetDocuments };
