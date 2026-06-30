const db = require('./db');

/**
 * Inicializa o resetea las aprobaciones asociadas a una solicitud técnica.
 * 
 * @param {number} solicitudId - ID de la solicitud
 * @param {Array<string>} areas - Áreas validadoras configuradas para esta solicitud
 * @param {object} [client=db] - Cliente de base de datos para soporte de transacciones
 */
async function inicializarAprobaciones(solicitudId, areas, client = db, liberarAsignaciones = false) {
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
        if (liberarAsignaciones) {
          await client.query(
            `INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
             VALUES ($1, $2, 'pendiente', NULL, NULL)
             ON CONFLICT (solicitud_id, area)
             DO UPDATE SET estado = 'pendiente', tecnico_id = NULL, fecha = NULL, observacion = NULL`,
            [solicitudId, area]
          );
        } else {
          await client.query(
            `INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
             VALUES ($1, $2, 'pendiente', NULL, NULL)
             ON CONFLICT (solicitud_id, area)
             DO UPDATE SET 
               estado = aprobaciones.estado, 
               tecnico_id = aprobaciones.tecnico_id, 
               fecha = aprobaciones.fecha, 
               observacion = aprobaciones.observacion`,
            [solicitudId, area]
          );
        }
      }
    }
  } catch (error) {
    console.error('Error al inicializar/resetear aprobaciones:', error);
    throw error;
  }
}

/**
 * Evalúa si un campo tiene información de acuerdo a su tipo.
 */
function evaluadorDeCondicion(campo, valor) {
  if (valor === undefined || valor === null) return false;

  if (campo.type === 'checkbox') {
    return valor === true || valor === 'true' || valor === 'X' || valor === 'Sí' || valor === 'on';
  }

  if (['grid', 'fixed_grid', 'fixed_grid_dynamic_cols', 'fixed_grid_fixed_cols'].includes(campo.type)) {
    if (!Array.isArray(valor)) return false;
    const rowLabelKey = campo.row_label || 'Descripción / Fila';
    for (const row of valor) {
      if (typeof row === 'object' && row !== null) {
        for (const [key, val] of Object.entries(row)) {
          if (key !== rowLabelKey && key !== 'Descripción / Fila') {
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  if (Array.isArray(valor)) {
    return valor.some(v => v !== undefined && v !== null && String(v).trim() !== '');
  }

  return String(valor).trim() !== '';
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

  let campos = [];
  if (sol.campos) {
    if (Array.isArray(sol.campos)) {
      campos = sol.campos;
    } else if (typeof sol.campos === 'string') {
      try {
        campos = JSON.parse(sol.campos);
      } catch (e) {}
    }
  }

  let datos = sol.datos || {};
  if (typeof datos === 'string') {
    try {
      datos = JSON.parse(datos);
    } catch (e) {
      datos = {};
    }
  }

  const acronymMap = {
    gibdd: 'GBDD',
    giitrc: 'GIITRC',
    osi: 'OSI',
    director: 'DIR'
  };

  const acronyms = [];
  if (Array.isArray(campos)) {
    campos.forEach(campo => {
      if (campo.condicion_area && campo.condicion_area.trim() !== '') {
        const valor = datos[campo.name];
        if (evaluadorDeCondicion(campo, valor)) {
          const areaLower = campo.condicion_area.trim().toLowerCase();
          if (acronymMap[areaLower] && !acronyms.includes(acronymMap[areaLower])) {
            acronyms.push(acronymMap[areaLower]);
          }
        }
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
