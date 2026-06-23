const db = require('./db');

/**
 * Inicializa o resetea las aprobaciones asociadas a una solicitud técnica.
 * 
 * @param {number} solicitudId - ID de la solicitud
 * @param {Array<string>} areas - Áreas validadoras configuradas para esta solicitud
 * @param {object} [client=db] - Cliente de base de datos para soporte de transacciones
 */
async function inicializarAprobaciones(solicitudId, areas, client = db) {
  try {
    // 1. Eliminar aprobaciones que ya no aplican para esta solicitud (dinámico)
    await client.query(
      'DELETE FROM aprobaciones WHERE solicitud_id = $1 AND NOT (area = ANY($2::varchar[]))',
      [solicitudId, areas]
    );

    const dirUserRes = await client.query("SELECT id FROM usuarios WHERE area = 'director' AND rol = 'tecnico' LIMIT 1");
    const dirUserId = dirUserRes.rows.length > 0 ? dirUserRes.rows[0].id : null;

    for (const area of areas) {
      if (area === 'director') {
        await client.query(
          `INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
           VALUES ($1, $2, 'aprobado', $3, CURRENT_TIMESTAMP)
           ON CONFLICT (solicitud_id, area)
           DO UPDATE SET estado = 'aprobado', tecnico_id = $3, fecha = CURRENT_TIMESTAMP`,
          [solicitudId, area, dirUserId]
        );
      } else {
        await client.query(
          `INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
           VALUES ($1, $2, 'pendiente', NULL, NULL)
           ON CONFLICT (solicitud_id, area)
           DO UPDATE SET estado = 'pendiente', tecnico_id = NULL, fecha = NULL, observacion = NULL`,
          [solicitudId, area]
        );
      }
    }
  } catch (error) {
    console.error('Error al inicializar/resetear aprobaciones:', error);
    throw error;
  }
}

/**
 * Genera el código único de seguimiento institucional para una solicitud.
 * 
 * @param {object} sol - Objeto solicitud
 * @returns {string} Código de seguimiento generado
 */
function generarCodigoSeguimiento(sol) {
  if (!sol) return '';
  const fechaCreacion = new Date(sol.fecha_creacion);
  const mes = String(fechaCreacion.getMonth() + 1).padStart(2, '0');
  const anio = fechaCreacion.getFullYear();
  const codigoClean = (sol.tipo_codigo || 'FORM').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cedulaClean = (sol.solicitante_cedula || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');

  let areas = [];
  if (sol.areas_validadoras) {
    if (Array.isArray(sol.areas_validadoras)) {
      areas = sol.areas_validadoras;
    } else if (typeof sol.areas_validadoras === 'string') {
      try {
        areas = JSON.parse(sol.areas_validadoras);
      } catch (e) {}
    }
  }

  const acronymMap = {
    gibdd: 'GBDD',
    giitrc: 'GIITRC',
    osi: 'OSI',
    director: 'DIR'
  };

  const acronyms = [];
  if (Array.isArray(areas)) {
    areas.forEach(area => {
      const lowerArea = String(area).trim().toLowerCase();
      if (acronymMap[lowerArea]) {
        acronyms.push(acronymMap[lowerArea]);
      }
    });
  }

  acronyms.sort();

  if (acronyms.length > 0) {
    const acronymsStr = acronyms.join('_');
    return `${codigoClean}_${acronymsStr}_${cedulaClean}_${mes}_${anio}`;
  }

  return `${codigoClean}_${cedulaClean}_${mes}_${anio}`;
}

module.exports = {
  inicializarAprobaciones,
  generarCodigoSeguimiento
};
