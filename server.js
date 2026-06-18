const express = require('express');
const path = require('path');
const db = require('./db');
const dbMigrate = require('./dbMigrate');
const { securityHeaders, crearRateLimiter } = require('./security');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Confiar en el proxy (necesario para obtener la IP real tras un reverse proxy).
app.set('trust proxy', 1);

// Cabeceras de seguridad en todas las respuestas.
app.use(securityHeaders);

// Middleware para procesar JSON (con límite de tamaño) y servir el frontend.
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Importar Enrutadores
const usuariosRouter = require('./routes/usuarios');
const adminRouter = require('./routes/admin');
const solicitudesRouter = require('./routes/solicitudes');

// Limitar los intentos de inicio de sesión para mitigar ataques de fuerza bruta.
const loginLimiter = crearRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/login', loginLimiter);

// Registrar Enrutadores
app.use('/api', usuariosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/solicitudes', solicitudesRouter);

// Manejador de rutas de API no encontradas.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

// Manejador central de errores: evita filtrar detalles internos al cliente.
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: 'Ocurrió un error interno en el servidor.' });
});

// MIGRACIÓN Y SEMILLAS DE BASE DE DATOS AL ARRANCAR
dbMigrate.ejecutarMigraciones()
  .then(() => {
    // Arrancar Servidor si las migraciones son exitosas
    app.listen(PORT, () => {
      console.log(`Servidor SVT corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error crítico al iniciar la base de datos de SVT. El servidor no arrancará:', err);
    process.exit(1);
  });
