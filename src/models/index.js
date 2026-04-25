const User                   = require('./User');
const Ride                   = require('./Ride');
const Booking                = require('./Booking');
const Review                 = require('./Review');
const Transaction            = require('./Transaction');
const Notification           = require('./Notification');
const Conversation           = require('./Conversation');
const Message                = require('./Message');
const ConversationParticipant = require('./ConversationParticipant');

// ── Rides ────────────────────────────────────────────────────────────────────
User.hasMany(Ride,   { foreignKey: 'conducteur_id', as: 'trajets' });
Ride.belongsTo(User, { foreignKey: 'conducteur_id', as: 'conducteur' });

// ── Bookings ─────────────────────────────────────────────────────────────────
Ride.hasMany(Booking,    { foreignKey: 'ride_id',     as: 'reservations' });
Booking.belongsTo(Ride,  { foreignKey: 'ride_id',     as: 'trajet' });
User.hasMany(Booking,    { foreignKey: 'passager_id', as: 'reservations' });
Booking.belongsTo(User,  { foreignKey: 'passager_id', as: 'passager' });

// ── Reviews ──────────────────────────────────────────────────────────────────
Review.belongsTo(User, { foreignKey: 'auteur_id',     as: 'auteur' });
Review.belongsTo(User, { foreignKey: 'conducteur_id', as: 'conducteur' });
Review.belongsTo(Ride, { foreignKey: 'ride_id',       as: 'trajet' });
User.hasMany(Review,   { foreignKey: 'conducteur_id', as: 'avis_recus' });

// ── Transactions ─────────────────────────────────────────────────────────────
Transaction.belongsTo(User, { foreignKey: 'user_id', as: 'utilisateur' });
User.hasMany(Transaction,   { foreignKey: 'user_id', as: 'transactions' });

// ── Notifications ────────────────────────────────────────────────────────────
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'destinataire' });
User.hasMany(Notification,   { foreignKey: 'user_id', as: 'notifications' });

// ── Chat ─────────────────────────────────────────────────────────────────────
Ride.hasOne(Conversation,         { foreignKey: 'ride_id', as: 'conversation' });
Conversation.belongsTo(Ride,      { foreignKey: 'ride_id', as: 'trajet' });

Conversation.hasMany(Message,     { foreignKey: 'conversation_id', as: 'messages' });
Message.belongsTo(Conversation,   { foreignKey: 'conversation_id', as: 'conversation' });
Message.belongsTo(User,           { foreignKey: 'sender_id',       as: 'expediteur' });

Conversation.belongsToMany(User, {
  through: ConversationParticipant,
  foreignKey: 'conversation_id',
  otherKey:   'user_id',
  as: 'participants',
});
User.belongsToMany(Conversation, {
  through: ConversationParticipant,
  foreignKey: 'user_id',
  otherKey:   'conversation_id',
  as: 'conversations',
});

module.exports = { User, Ride, Booking, Review, Transaction, Notification, Conversation, Message, ConversationParticipant };
