const db = require('../db');

/**
 * Obtiene el tipo de solicitud para validación al crear.
 */
async function obtenerTipoSolicitud(tipoId) {
  const result = await db.query('SELECT areas_validadoras, campos, codigo FROM tipos_solicitud WHERE id = $1', [tipoId]);
  return result.rows[0];
}

/**
 * Evalúa si un campo tiene información de acuerdo a su tipo.
 */
function evaluadorDeCondicion(campo, valor) {
  if (valor === undefined || valor === null) return false;

  // Si es checkbox, debe estar seleccionado (true, 'true', 'X', 'Sí', 'on')
  if (campo.type === 'checkbox') {
    return valor === true || valor === 'true' || valor === 'X' || valor === 'Sí' || valor === 'on';
  }

  // Si es una tabla/grilla de datos, debe contener al menos un valor de celda no vacío
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

  // Si es un arreglo (ej: text_list)
  if (Array.isArray(valor)) {
    return valor.some(v => v !== undefined && v !== null && String(v).trim() !== '');
  }

  // Para cualquier otro tipo, no debe estar vacío
  return String(valor).trim() !== '';
}

/**
 * Calcula dinámicamente las áreas validadoras para una solicitud en base a las condiciones de sus campos.
 */
function calcularAreasValidadoras(campos, datos, defaultAreas) {
  const areas = new Set(defaultAreas || []);

  // Asegurar que 'seguridad' siempre esté presente
  areas.add('seguridad');

  if (Array.isArray(campos) && datos) {
    for (const campo of campos) {
      if (campo.condicion_area && campo.condicion_area.trim() !== '') {
        const valor = datos[campo.name];
        if (evaluadorDeCondicion(campo, valor)) {
          areas.add(campo.condicion_area.trim());
        }
      }
    }
  }

  return Array.from(areas);
}

/**
 * Crea una nueva solicitud en base de datos usando transacción.
 */
async function crearSolicitud(solicitanteId, tipoSolicitudId, datos, estado, areas, inicializarAprobaciones) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const templateRes = await client.query('SELECT campos FROM tipos_solicitud WHERE id = $1', [tipoSolicitudId]);
    const campos = templateRes.rows[0]?.campos || [];

    const insertRes = await client.query(
      'INSERT INTO solicitudes (solicitante_id, tipo_solicitud_id, datos, estado, areas_validadoras, campos) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING *',
      [solicitanteId, tipoSolicitudId, datos, estado, JSON.stringify(areas), JSON.stringify(campos)]
    );
    const solicitud = insertRes.rows[0];

    if (estado === 'en_revision') {
      await inicializarAprobaciones(solicitud.id, areas, client);
    }

    await client.query('COMMIT');
    return solicitud;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al hacer rollback en crearSolicitud:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Busca y pagina las solicitudes de la bandeja.
 */
async function buscarBandeja(filtros) {
  const { id, rol, area, page, limit, estado, search } = filtros;
  
  const params = [];
  const whereClauses = [];

  const addParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  let fromClause = `
    FROM solicitudes s
    JOIN usuarios u ON s.solicitante_id = u.id
    JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
  `;

  if (rol === 'solicitante') {
    whereClauses.push(`s.solicitante_id = ${addParam(id)}`);
  } else if (rol === 'tecnico') {
    whereClauses.push(`s.estado != 'borrador'`);

    const areaParam = addParam(area);
    whereClauses.push(`s.areas_validadoras @> jsonb_build_array(${areaParam}::text)`);

    if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
      const tecnicoParam = addParam(id);
      fromClause += ` LEFT JOIN aprobaciones ap ON ap.solicitud_id = s.id AND ap.area = ${areaParam}`;
      whereClauses.push(`(ap.tecnico_id IS NULL OR ap.tecnico_id = ${tecnicoParam})`);
    }
  }

  if (estado && estado !== 'todos' && estado.trim() !== '') {
    whereClauses.push(`s.estado = ${addParam(estado.trim())}`);
  }

  if (search && search.trim() !== '') {
    const searchPattern = `%${search.trim()}%`;
    const searchParam = addParam(searchPattern);
    whereClauses.push(
      `(u.nombre ILIKE ${searchParam} OR u.cedula ILIKE ${searchParam} OR ts.nombre ILIKE ${searchParam} OR ts.codigo ILIKE ${searchParam})`
    );
  }

  const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(DISTINCT s.id) AS total
    ${fromClause}
    ${whereString}
  `;
  const countResult = await db.query(countQuery, params);
  const totalItems = parseInt(countResult.rows[0].total, 10) || 0;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const limitParam = addParam(limitNum);
  const offsetParam = addParam(offset);

  const dataQuery = `
    SELECT s.id, s.tipo_solicitud_id, s.datos, s.estado, s.fecha_creacion, s.fecha_actualizacion, s.areas_validadoras,
           u.nombre AS solicitante_nombre, u.cedula AS solicitante_cedula, ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo, ts.campos,
           COALESCE((
             SELECT json_agg(json_build_object('area', a.area, 'estado', a.estado))
             FROM aprobaciones a
             WHERE a.solicitud_id = s.id
           ), '[]'::json) AS estados_aprobaciones,
           (
             SELECT o.area
             FROM observaciones o
             WHERE o.solicitud_id = s.id
             ORDER BY o.fecha DESC
             LIMIT 1
           ) AS ultima_observacion_area
    ${fromClause}
    ${whereString}
    ORDER BY s.fecha_actualizacion DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const dataResult = await db.query(dataQuery, params);

  return {
    solicitudes: dataResult.rows,
    total: totalItems,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(totalItems / limitNum)
  };
}

/**
 * Obtiene los conteos estadísticos de solicitudes de la bandeja.
 */
async function obtenerEstadisticas(usuario) {
  const { id, rol, area } = usuario;
  const params = [];
  const whereClauses = [];

  const addParam = (val) => {
    params.push(val);
    return `$${params.length}`;
  };

  let fromClause = `
    FROM solicitudes s
    JOIN usuarios u ON s.solicitante_id = u.id
    JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
  `;

  if (rol === 'solicitante') {
    whereClauses.push(`s.solicitante_id = ${addParam(id)}`);
  } else if (rol === 'tecnico') {
    whereClauses.push(`s.estado != 'borrador'`);

    const areaParam = addParam(area);
    whereClauses.push(`s.areas_validadoras @> jsonb_build_array(${areaParam}::text)`);

    if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
      const tecnicoParam = addParam(id);
      fromClause += ` LEFT JOIN aprobaciones ap ON ap.solicitud_id = s.id AND ap.area = ${areaParam}`;
      whereClauses.push(`(ap.tecnico_id IS NULL OR ap.tecnico_id = ${tecnicoParam})`);
    }
  }

  const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const statsQuery = `
    SELECT s.estado, COUNT(DISTINCT s.id) AS count
    ${fromClause}
    ${whereString}
    GROUP BY s.estado
  `;

  const result = await db.query(statsQuery, params);
  
  const counts = {
    todos: 0,
    borrador: 0,
    en_revision: 0,
    observado: 0,
    aprobado: 0
  };

  let total = 0;
  result.rows.forEach(row => {
    const est = row.estado;
    const cnt = parseInt(row.count, 10) || 0;
    if (counts[est] !== undefined) {
      counts[est] = cnt;
    }
    total += cnt;
  });
  counts.todos = total;

  return counts;
}

/**
 * Obtiene el detalle base de una solicitud.
 */
async function obtenerSolicitudDetalle(id) {
  const result = await db.query(
    `SELECT s.id, s.solicitante_id, s.tipo_solicitud_id, s.datos, s.estado, s.fecha_creacion, s.fecha_actualizacion, s.areas_validadoras, s.campos AS solicitud_campos,
            u.nombre AS solicitante_nombre, u.cedula AS solicitante_cedula, ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo, ts.campos AS plantilla_campos,
            ts.areas_validadoras AS plantilla_areas_validadoras
     FROM solicitudes s
     JOIN usuarios u ON s.solicitante_id = u.id
     JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
     WHERE s.id = $1`,
    [id]
  );
  const sol = result.rows[0];
  if (sol) {
    if (sol.estado === 'aprobado' && sol.solicitud_campos) {
      sol.campos = sol.solicitud_campos;
    } else {
      sol.campos = sol.plantilla_campos;
    }
  }
  return sol;
}

/**
 * Obtiene las aprobaciones de una solicitud.
 */
async function obtenerAprobaciones(solicitudId) {
  const result = await db.query(
    `SELECT a.area, a.estado, a.fecha, a.observacion, a.tecnico_id, u.nombre AS tecnico_nombre
     FROM aprobaciones a
     LEFT JOIN usuarios u ON a.tecnico_id = u.id
     WHERE a.solicitud_id = $1`,
    [solicitudId]
  );
  return result.rows;
}

/**
 * Obtiene las observaciones de una solicitud.
 */
async function obtenerObservaciones(solicitudId) {
  const result = await db.query(
    `SELECT o.area, o.texto, o.fecha, u.nombre AS autor_nombre
     FROM observaciones o
     JOIN usuarios u ON o.autor_id = u.id
     WHERE o.solicitud_id = $1
     ORDER BY o.fecha DESC`,
    [solicitudId]
  );
  return result.rows;
}

/**
 * Obtiene el estado de aprobación y el técnico asignado de un área para una solicitud.
 */
async function obtenerAprobacionArea(solicitudId, area) {
  const result = await db.query(
    "SELECT tecnico_id, estado FROM aprobaciones WHERE solicitud_id = $1 AND area = $2",
    [solicitudId, area]
  );
  return result.rows[0];
}

/**
 * Actualiza una solicitud y su estado.
 */
async function actualizarSolicitud(id, datos, nuevoEstado, inicializarAprobaciones, areasValidadoras) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Get current template campos to store in the request
    const solRes = await client.query('SELECT tipo_solicitud_id FROM solicitudes WHERE id = $1', [id]);
    const tipoId = solRes.rows[0]?.tipo_solicitud_id;
    const templateRes = await client.query('SELECT campos FROM tipos_solicitud WHERE id = $1', [tipoId]);
    const campos = templateRes.rows[0]?.campos || [];

    await client.query(
      'UPDATE solicitudes SET datos = $1, estado = $2, areas_validadoras = $3, campos = $4::jsonb, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $5',
      [datos, nuevoEstado, JSON.stringify(areasValidadoras), JSON.stringify(campos), id]
    );

    let dispararCorreo = false;
    if (nuevoEstado === 'en_revision') {
      await inicializarAprobaciones(id, areasValidadoras, client);
      dispararCorreo = true;
    }

    await client.query('COMMIT');
    return { dispararCorreo };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al hacer rollback en actualizarSolicitud:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Aprueba la sección técnica de una solicitud (transaccional).
 */
async function aprobarSeccion(solicitudId, tecnicoId, area, observacion) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const apRes = await client.query(
      `UPDATE aprobaciones 
       SET estado = 'aprobado', tecnico_id = $1, fecha = CURRENT_TIMESTAMP, observacion = $2 
       WHERE solicitud_id = $3 AND area = $4
       RETURNING *`,
      [tecnicoId, observacion || null, solicitudId, area]
    );

    if (apRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    if (observacion && observacion.trim() !== '') {
      await client.query(
        `INSERT INTO observaciones (solicitud_id, area, autor_id, texto) 
         VALUES ($1, $2, $3, $4)`,
        [solicitudId, area, tecnicoId, `[Aprobado con Observación] ${observacion}`]
      );
    }

    const todasAprobadasRes = await client.query(
      "SELECT COUNT(*) FROM aprobaciones WHERE solicitud_id = $1 AND estado = 'pendiente'",
      [solicitudId]
    );
    const pendientes = parseInt(todasAprobadasRes.rows[0].count, 10);

    let esAprobacionTotal = false;
    if (pendientes === 0) {
      esAprobacionTotal = true;
      await client.query(
        "UPDATE solicitudes SET estado = 'aprobado', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1",
        [solicitudId]
      );
    }

    await client.query('COMMIT');
    return { esAprobacionTotal };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al hacer rollback en aprobarSeccion:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Registra una observación simple sin reiniciar el flujo.
 */
async function registrarObservacionSimple(solicitudId, area, autorId, texto) {
  await db.query(
    'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
    [solicitudId, area, autorId, texto]
  );
}

/**
 * Registra una observación de flujo que marca la solicitud como observada (transaccional).
 */
async function registrarObservacionYReabrir(solicitudId, area, autorId, texto) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
      [solicitudId, area, autorId, texto]
    );

    await client.query(
      "UPDATE solicitudes SET estado = 'observado', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1",
      [solicitudId]
    );

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al hacer rollback en registrarObservacionYReabrir:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Asigna una solicitud a un técnico.
 */
async function asignarTecnico(solicitudId, area, tecnicoId) {
  await db.query(
    'UPDATE aprobaciones SET tecnico_id = $1 WHERE solicitud_id = $2 AND area = $3',
    [tecnicoId, solicitudId, area]
  );
}

/**
 * Libera/desasigna una solicitud.
 */
async function desasignarTecnico(solicitudId, area, tecnicoId) {
  await db.query(
    'UPDATE aprobaciones SET tecnico_id = NULL WHERE solicitud_id = $1 AND area = $2 AND tecnico_id = $3',
    [solicitudId, area, tecnicoId]
  );
}

/**
 * Limpia el objeto de datos en base a los campos actuales del formulario,
 * eliminando claves inexistentes o vaciando/reseteando valores cuyos tipos de campo cambiaron
 * para evitar mostrar estructuras de datos incompatibles (ej. JSON strings en vez de cadenas).
 */
function limpiarDatosConCampos(datos, campos) {
  if (!datos || typeof datos !== 'object') return {};
  const nuevosDatos = {};
  const camposMap = new Map();
  
  const camposArray = Array.isArray(campos) ? campos : [];
  camposArray.forEach(c => {
    if (c && c.name) {
      camposMap.set(c.name, c);
    }
  });

  for (const [key, value] of Object.entries(datos)) {
    if (camposMap.has(key)) {
      const campo = camposMap.get(key);
      const type = campo.type;
      let valueIsInvalid = false;

      if (type === 'firmante' || type === 'firmante_seccion') {
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (!parsed || typeof parsed !== 'object') valueIsInvalid = true;
          } catch (e) {
            valueIsInvalid = true;
          }
        } else if (typeof value !== 'object' || value === null) {
          valueIsInvalid = true;
        }
      } else if (type === 'firmante_list' || type === 'text_list' || type === 'grid' || type === 'fixed_grid' || type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
        if (!Array.isArray(value)) {
          valueIsInvalid = true;
        }
      } else {
        if (typeof value === 'object' && value !== null) {
          valueIsInvalid = true;
        }
      }

      if (valueIsInvalid) {
        if (type === 'checkbox') {
          nuevosDatos[key] = '';
        } else if (type === 'firmante' || type === 'firmante_seccion') {
          nuevosDatos[key] = JSON.stringify({ nombre: '', cedula: '', cargo: '' });
        } else if (type === 'firmante_list' || type === 'text_list' || type === 'grid' || type === 'fixed_grid' || type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
          nuevosDatos[key] = [];
        } else {
          nuevosDatos[key] = '';
        }
      } else {
        nuevosDatos[key] = value;
      }
    }
  }
  return nuevosDatos;
}

/**
 * Reabre el proceso de revisión completa (transaccional).
 */
async function reabrirProcesoRevision(solicitudId, autorArea, autorId, texto, areasValidadoras, inicializarAprobaciones) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Obtener los datos actuales de la solicitud para su limpieza
    const solRes = await client.query('SELECT tipo_solicitud_id, datos FROM solicitudes WHERE id = $1', [solicitudId]);
    const tipoId = solRes.rows[0]?.tipo_solicitud_id;
    const datos = solRes.rows[0]?.datos || {};

    // Obtener los campos actualizados de la plantilla
    const templateRes = await client.query('SELECT campos FROM tipos_solicitud WHERE id = $1', [tipoId]);
    const campos = templateRes.rows[0]?.campos || [];

    // Limpiar campos obsoletos o con tipos cambiados en datos
    const datosLimpios = limpiarDatosConCampos(datos, campos);

    const nuevoEstado = autorArea === 'solicitante' ? 'borrador' : 'en_revision';

    await client.query(
      "UPDATE solicitudes SET estado = $1, campos = $2::jsonb, datos = $3::jsonb, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $4",
      [nuevoEstado, JSON.stringify(campos), JSON.stringify(datosLimpios), solicitudId]
    );

    await inicializarAprobaciones(solicitudId, areasValidadoras, client);

    await client.query(
      'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
      [solicitudId, autorArea, autorId, `REAPERTURA DEL PROCESO: ${texto}`]
    );

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al hacer rollback en reabrirProcesoRevision:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Obtiene la información de la solicitud y sus firmantes requerida para la generación del PDF.
 */
async function obtenerDatosPDF(solicitudId) {
  const solRes = await db.query(
    `SELECT s.id, s.datos, s.estado, s.fecha_creacion, s.fecha_actualizacion, s.areas_validadoras, s.campos AS solicitud_campos,
            u.nombre AS solicitante_nombre, u.cedula AS solicitante_cedula,
            u.cargo AS solicitante_cargo, u.correo AS solicitante_correo,
            u.direccion_proyecto AS solicitante_direccion_proyecto,
            ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo, ts.campos AS plantilla_campos
     FROM solicitudes s
     JOIN usuarios u ON s.solicitante_id = u.id
     JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
     WHERE s.id = $1`,
    [solicitudId]
  );
  if (solRes.rows.length === 0) return null;
  const solicitud = solRes.rows[0];

  if (solicitud.estado === 'aprobado' && solicitud.solicitud_campos) {
    solicitud.campos = solicitud.solicitud_campos;
  } else {
    solicitud.campos = solicitud.plantilla_campos;
  }

  const apRes = await db.query(
    `SELECT a.area, a.estado, a.fecha, a.observacion, u.nombre AS tecnico_nombre,
            u.cedula AS tecnico_cedula, u.cargo AS tecnico_cargo, u.correo AS tecnico_correo
     FROM aprobaciones a
     LEFT JOIN usuarios u ON a.tecnico_id = u.id
     WHERE a.solicitud_id = $1`,
    [solicitudId]
  );

  const directorSignerRes = await db.query(
    `SELECT nombre, cedula, cargo FROM usuarios 
     WHERE area = 'director' AND rol = 'tecnico' 
     ORDER BY id ASC LIMIT 1`
  );

  return {
    solicitud: solRes.rows[0],
    aprobaciones: apRes.rows,
    directorSigner: directorSignerRes.rows[0] || null
  };
}

module.exports = {
  obtenerTipoSolicitud,
  calcularAreasValidadoras,
  crearSolicitud,
  buscarBandeja,
  obtenerEstadisticas,
  obtenerSolicitudDetalle,
  obtenerAprobaciones,
  obtenerObservaciones,
  obtenerAprobacionArea,
  actualizarSolicitud,
  aprobarSeccion,
  registrarObservacionSimple,
  registrarObservacionYReabrir,
  asignarTecnico,
  desasignarTecnico,
  reabrirProcesoRevision,
  obtenerDatosPDF,
  limpiarDatosConCampos
};
