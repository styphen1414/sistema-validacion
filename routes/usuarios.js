const express = require('express');
const router = express.Router();
const db = require('../db');
const { autenticar } = require('../middlewares/auth');

// 1. ENDPOINT DE LOGIN
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }
  try {
    const result = await db.query(
      'SELECT id, username, nombre, rol, area, cedula, cargo, correo FROM usuarios WHERE username = $1 AND password = $2',
      [username, password]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno en el inicio de sesión.' });
  }
});

// 2. OBTENER TIPOS DE SOLICITUD (FORMULARIOS DINÁMICOS)
router.get('/tipos-solicitud', autenticar, async (req, res) => {
  try {
    const result = await db.query('SELECT id, codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso FROM tipos_solicitud ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las plantillas de formularios.' });
  }
});

module.exports = router;
