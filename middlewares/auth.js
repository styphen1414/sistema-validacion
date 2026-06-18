const db = require('../db');
const { verifyToken } = require('../security');

// Middleware para autenticar usuarios mediante un token JWT (Authorization: Bearer ...)
async function autenticar(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'No autorizado. Inicie sesión primero.' });
  }

  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Inicie sesión nuevamente.' });
  }

  try {
    const result = await db.query('SELECT * FROM usuarios WHERE id = $1', [payload.sub]);
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
