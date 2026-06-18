const express = require('express');
const router = express.Router();
const usuarioService = require('../services/usuarioService');
const { autenticar } = require('../middlewares/auth');
const { hashPassword, verifyPassword, isHashed, signToken } = require('../security');

// 1. ENDPOINT DE LOGIN
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
  }
  try {
    const usuario = await usuarioService.obtenerUsuarioPorCorreo(username);
    if (!usuario) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    // Verificación de contraseña: hash (scrypt) o, para registros antiguos,
    // comparación en claro con migración automática a hash en el primer login.
    let credencialValida = false;
    if (isHashed(usuario.password)) {
      credencialValida = verifyPassword(password, usuario.password);
    } else if (usuario.password === password) {
      credencialValida = true;
      try {
        await usuarioService.actualizarContrasenaHash(usuario.id, hashPassword(password));
      } catch (e) {
        console.error('No se pudo migrar la contraseña a hash:', e.message);
      }
    }

    if (!credencialValida) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    if (usuario.activo === false) {
      return res.status(400).json({ error: 'Tu usuario ha sido desactivado. Acceso denegado.' });
    }

    // No exponer el hash de la contraseña al cliente.
    delete usuario.password;

    const token = signToken({ sub: usuario.id, rol: usuario.rol });
    res.json({ ...usuario, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno en el inicio de sesión.' });
  }
});

// 2. OBTENER TIPOS DE SOLICITUD (FORMULARIOS DINÁMICOS)
router.get('/tipos-solicitud', autenticar, async (req, res) => {
  try {
    const tipos = await usuarioService.listarTiposSolicitud();
    res.json(tipos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las plantillas de formularios.' });
  }
});

module.exports = router;
