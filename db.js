const { Pool } = require('pg');
require('dotenv').config();

// Creamos un pool de conexiones a la base de datos PostgreSQL
// Los datos se toman automáticamente del archivo .env
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  // Acepta tanto DB_NAME como DB_DATABASE para evitar fallos de configuración.
  database: process.env.DB_NAME || process.env.DB_DATABASE,
});

// Mensaje para confirmar si la conexión es exitosa al arrancar
pool.on('connect', () => {
  console.log('Conectado a la base de datos PostgreSQL con éxito.');
});

pool.on('error', (err) => {
  console.error('Error inesperado en el cliente de base de datos:', err);
});

// Prueba de conexión inmediata al iniciar el servidor
pool.query('SELECT NOW()')
  .then(res => {
    console.log('Conexión inicial exitosa a PostgreSQL. Hora de la BD:', res.rows[0].now);
  })
  .catch(err => {
    console.error('Error crítico: No se pudo conectar a PostgreSQL:', err.message);
  });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
