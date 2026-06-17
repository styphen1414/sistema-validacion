const express = require('express');
const path = require('path');
const db = require('./db');
const dbMigrate = require('./dbMigrate');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para procesar JSON y servir archivos estáticos del frontend
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Importar Enrutadores
const usuariosRouter = require('./routes/usuarios');
const adminRouter = require('./routes/admin');
const solicitudesRouter = require('./routes/solicitudes');

// Registrar Enrutadores
app.use('/api', usuariosRouter);
app.use('/api/admin', adminRouter);
app.use('/api/solicitudes', solicitudesRouter);

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

