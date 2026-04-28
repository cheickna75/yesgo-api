require('dotenv').config();
const path        = require('path');
const fs          = require('fs');
const express     = require('express');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');

// Garantir l'existence des dossiers uploads au démarrage
const uploadsDir = path.join(__dirname, 'uploads', 'documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const photosDir = path.join(__dirname, 'uploads', 'photos');
if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });
console.log('[server] uploads dir:', uploadsDir);
const { connectDB } = require('./src/config/database');
require('./src/models'); // charge les modèles et leurs associations
const routes = require('./src/routes/index');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — autorise toutes les origines (API mobile + admin panel)
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting global : 200 req/15min par IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes. Réessayez dans quelques minutes.' },
});
app.use('/api', globalLimiter);

// Rate limiting strict sur les routes d'authentification : 20 req/15min
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});
app.use('/api/auth', authLimiter);

// Webhook Stripe — corps brut requis, DOIT être avant express.json()
const { stripeWebhook } = require('./src/controllers/stripeController');
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Laisser multer gérer le multipart AVANT express.json
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.startsWith('multipart/form-data')) return next(); // skip json parser
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.startsWith('multipart/form-data')) return next();
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

// Interface admin (HTML statique)
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Documents uploadés — CORS ouvert pour affichage dans l'admin
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  if (!req.path.startsWith('/uploads')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

app.use('/api', routes);

// 404 JSON pour toutes les routes non trouvées
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route introuvable : ${req.method} ${req.originalUrl}` });
});

app.use(errorHandler);

// Démarrer le serveur AVANT la connexion DB pour que le healthcheck réponde immédiatement
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur le port ${PORT} [${process.env.NODE_ENV}]`);
});

connectDB().catch((err) => {
  console.error('Échec connexion base de données :', err.message);
});
