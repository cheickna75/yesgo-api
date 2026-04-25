const { Notification } = require('../models');

// GET /api/notifications
const mesNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    const nonLues = notifications.filter((n) => !n.lu).length;
    return res.json({ success: true, data: notifications, non_lues: nonLues });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/:id/lu
const marquerLue = async (req, res, next) => {
  try {
    await Notification.update(
      { lu: true },
      { where: { id: req.params.id, user_id: req.user.id } }
    );
    return res.json({ success: true });
  } catch (err) { next(err); }
};

// PATCH /api/notifications/tout-lire
const toutMarquerLu = async (req, res, next) => {
  try {
    await Notification.update(
      { lu: true },
      { where: { user_id: req.user.id, lu: false } }
    );
    return res.json({ success: true });
  } catch (err) { next(err); }
};

module.exports = { mesNotifications, marquerLue, toutMarquerLu };
