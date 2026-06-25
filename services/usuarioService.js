const db = require('../db');
const solicitudService = require('./solicitudService');

/**
 * Obtiene un usuario por correo electrónico (para el inicio de sesión).
 */
async function obtenerUsuarioPorCorreo(correo) {
  const result = await db.query(
    'SELECT id, correo AS username, nombre, rol, area, cedula, cargo, correo, activo, password FROM usuarios WHERE LOWER(correo) = LOWER($1)',
    [correo]
  );
  return result.rows[0];
}

/**
 * Actualiza la contraseña en texto plano de un usuario antiguo a hash.
 */
async function actualizarContrasenaHash(id, hashedPassword) {
  await db.query('UPDATE usuarios SET password = $1 WHERE id = $2', [hashedPassword, id]);
}

/**
 * Obtiene todos los usuarios del sistema.
 */
async function listarUsuarios() {
  const result = await db.query(
    'SELECT id, correo AS username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos, activo FROM usuarios ORDER BY id'
  );
  return result.rows;
}

/**
 * Crea un usuario nuevo.
 */
async function crearUsuario(userData) {
  const { password, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos, activo } = userData;
  const result = await db.query(
    'INSERT INTO usuarios (password, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos, activo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, correo AS username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos, activo',
    [password, nombre, rol, rol === 'tecnico' ? area : null, cedula, cargo, correo, rol === 'solicitante' ? direccion_proyecto : null, firma_documentos, activo]
  );
  return result.rows[0];
}

/**
 * Desactiva la firma de todos los otros OSI (exclusividad).
 */
async function desactivarFirmasOtrosOsi(excluirId) {
  await db.query("UPDATE usuarios SET firma_documentos = FALSE WHERE area = 'osi' AND id != $1", [excluirId]);
}

/**
 * Actualiza los datos de un usuario (con o sin cambio de contraseña).
 */
async function actualizarUsuario(id, userData) {
  const { nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos, activo, password } = userData;
  
  let queryStr;
  let params;
  if (password) {
    queryStr = 'UPDATE usuarios SET password = $1, nombre = $2, rol = $3, area = $4, cedula = $5, cargo = $6, correo = $7, direccion_proyecto = $8, firma_documentos = $9, activo = $10 WHERE id = $11 RETURNING id, correo AS username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos, activo';
    params = [password, nombre, rol, rol === 'tecnico' ? area : null, cedula, cargo, correo, rol === 'solicitante' ? direccion_proyecto : null, firma_documentos, activo, id];
  } else {
    queryStr = 'UPDATE usuarios SET nombre = $1, rol = $2, area = $3, cedula = $4, cargo = $5, correo = $6, direccion_proyecto = $7, firma_documentos = $8, activo = $9 WHERE id = $10 RETURNING id, correo AS username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos, activo';
    params = [nombre, rol, rol === 'tecnico' ? area : null, cedula, cargo, correo, rol === 'solicitante' ? direccion_proyecto : null, firma_documentos, activo, id];
  }

  const result = await db.query(queryStr, params);
  return result.rows[0];
}

/**
 * Desactiva un usuario y limpia sus solicitudes no aprobadas (BEGIN/COMMIT).
 */
async function desactivarUsuario(id) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      'UPDATE usuarios SET activo = FALSE WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query(
      "DELETE FROM solicitudes WHERE solicitante_id = $1 AND estado != 'aprobado'",
      [id]
    );

    await client.query('COMMIT');
    return id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Activa un usuario.
 */
async function activarUsuario(id) {
  const result = await db.query(
    'UPDATE usuarios SET activo = TRUE WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows[0];
}

/**
 * Obtiene un usuario por ID.
 */
async function obtenerUsuarioPorId(id) {
  const result = await db.query(
    'SELECT id, correo AS username, nombre, rol, area, cedula, cargo, correo, activo FROM usuarios WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

/**
 * Verifica si existe un Director activo (excluyendo opcionalmente un ID).
 */
async function existeDirectorActivo(excluirId = null) {
  let queryStr = "SELECT id FROM usuarios WHERE rol = 'tecnico' AND area = 'director' AND activo = TRUE";
  const params = [];
  if (excluirId) {
    queryStr += " AND id != $1";
    params.push(excluirId);
  }
  const result = await db.query(queryStr, params);
  return result.rows.length > 0;
}

// --- PLANTILLAS DE FORMULARIOS ---

async function listarTiposSolicitud() {
  const result = await db.query(
    'SELECT id, codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso FROM tipos_solicitud ORDER BY id'
  );
  return result.rows;
}

async function actualizarTipoSolicitud(id, formObj, inicializarAprobaciones) {
  const { codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso } = formObj;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'UPDATE tipos_solicitud SET codigo = $1, nombre = $2, descripcion = $3, campos = $4::jsonb, areas_validadoras = $5::jsonb, mail_destinatario = $6, mail_cc = $7, mail_asunto = $8, mail_cuerpo = $9, mail_progreso = $10 WHERE id = $11 RETURNING *',
      [codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const activeSolsRes = await client.query(
      "SELECT id, datos FROM solicitudes WHERE tipo_solicitud_id = $1 AND estado IN ('en_revision', 'observado')",
      [id]
    );

    const parsedAreas = Array.isArray(areas_validadoras) ? areas_validadoras : JSON.parse(areas_validadoras);
    const parsedCampos = Array.isArray(campos) ? campos : JSON.parse(campos);

    for (const sol of activeSolsRes.rows) {
      const areasRecalculadas = solicitudService.calcularAreasValidadoras(parsedCampos, sol.datos, parsedAreas);

      await client.query(
        "UPDATE solicitudes SET areas_validadoras = $1 WHERE id = $2",
        [JSON.stringify(areasRecalculadas), sol.id]
      );

      await inicializarAprobaciones(sol.id, areasRecalculadas, client);
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function crearTipoSolicitud(formObj) {
  const { codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso } = formObj;
  const result = await db.query(
    'INSERT INTO tipos_solicitud (codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10) RETURNING *',
    [codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso]
  );
  return result.rows[0];
}

async function eliminarTipoSolicitud(id) {
  const result = await db.query('DELETE FROM tipos_solicitud WHERE id = $1 RETURNING id', [id]);
  return result.rows[0];
}

module.exports = {
  obtenerUsuarioPorCorreo,
  actualizarContrasenaHash,
  listarUsuarios,
  crearUsuario,
  desactivarFirmasOtrosOsi,
  actualizarUsuario,
  desactivarUsuario,
  activarUsuario,
  obtenerUsuarioPorId,
  existeDirectorActivo,
  listarTiposSolicitud,
  actualizarTipoSolicitud,
  crearTipoSolicitud,
  eliminarTipoSolicitud
};
