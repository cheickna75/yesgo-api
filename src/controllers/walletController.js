const { User, Transaction } = require('../models');
const { sequelize } = require('../config/database');
const { COMMISSION_RATE } = require('../config/betaConfig');

const COMMISSION = COMMISSION_RATE;

// Helper partagé avec bookingController
const transfert = async (t, { debiteurId, crediteurId, montant, description, referenceId }) => {
  const commission = Math.round(montant * COMMISSION);
  const netConducteur = montant - commission;

  await User.decrement('solde', { by: montant,       where: { id: debiteurId },  transaction: t });
  await User.increment('solde', { by: netConducteur, where: { id: crediteurId }, transaction: t });

  await Transaction.bulkCreate([
    { user_id: debiteurId,  type: 'debit',      montant,       description, reference_id: referenceId },
    { user_id: crediteurId, type: 'credit',     montant: netConducteur, description, reference_id: referenceId },
    { user_id: crediteurId, type: 'commission', montant: commission,    description: `Commission 10% — ${description}`, reference_id: referenceId },
  ], { transaction: t });
};

// Simuler une recharge (Orange Money / Wave plus tard)
const recharger = async (req, res, next) => {
  const MONTANTS_VALIDES = [1000, 2000, 5000, 10000, 25000, 50000];
  try {
    const { montant } = req.body;
    if (!MONTANTS_VALIDES.includes(Number(montant))) {
      return res.status(400).json({
        success: false,
        message: `Montant invalide. Choisir parmi : ${MONTANTS_VALIDES.join(', ')} FCFA.`,
      });
    }

    await sequelize.transaction(async (t) => {
      await User.increment('solde', { by: montant, where: { id: req.user.id }, transaction: t });
      await Transaction.create({
        user_id: req.user.id, type: 'recharge',
        montant, description: `Recharge simulée de ${montant} FCFA`,
      }, { transaction: t });
    });

    const updated = await User.findByPk(req.user.id);
    return res.json({
      success: true,
      message: `${montant} FCFA ajoutés à votre solde.`,
      solde: parseFloat(updated.solde),
    });
  } catch (err) { next(err); }
};

const monSolde = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    const transactions = await Transaction.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 30,
    });
    return res.json({
      success: true,
      solde: parseFloat(user.solde),
      data: transactions,
    });
  } catch (err) { next(err); }
};

module.exports = { recharger, monSolde, transfert, COMMISSION, COMMISSION_RATE };
