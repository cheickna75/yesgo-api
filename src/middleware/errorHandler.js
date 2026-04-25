const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode === 413
    ? 'Image trop volumineuse. Choisissez une photo de plus petite taille.'
    : (err.message || 'Erreur interne du serveur');
  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
