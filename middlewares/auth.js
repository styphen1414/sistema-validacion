const db = require('../db');

// Middleware para autenticar usuarios mediante el x-user-id de la cabecera
async function autenticar(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'No autorizado. Inicie sesión primero.' });
  }
  try {
    const result = await db.query('SELECT * FROM usuarios WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }
    req.usuario = result.rows[0];
    if (req.usuario.activo === false) {
      return res.status(401).json({ error: 'Tu usuario ha sido desactivado. Acceso denegado.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error de autenticación en el servidor.' });
  }
}

// Middleware para verificar si el usuario tiene rol de administrador
function esAdmin(req, res, next) {
  if (req.usuario && req.usuario.rol === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de administrador.' });
  }
}

module.exports = {
  autenticar,
  esAdmin
};
