const express = require('express');
const router = express.Router();
const db = require('../db');
const mailer = require('../mailer');
const pdfGenerator = require('../pdfGenerator');
const { autenticar } = require('../middlewares/auth');
const { inicializarAprobaciones } = require('../dbHelper');

function validarDatos(campos, datos) {
  if (!campos || !Array.isArray(campos) || !datos) return null;

  const idRegex = /^\d{10}$/;
  const ipRegex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;
  const safeTextRegex = /^[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;\-_!?/@]*$/;

  for (const campo of campos) {
    if (['title', 'subtitle', 'paragraph'].includes(campo.type)) continue;

    const valor = datos[campo.name];

    // Validar IP si está presente
    if (campo.type === 'ip' && valor !== undefined && valor !== null && String(valor).trim() !== '') {
      const valorTrim = String(valor).trim();
      if (valorTrim.length > 15 || !ipRegex.test(valorTrim)) {
        return `El campo "${campo.label}" debe ser una dirección IP válida (ej. 192.168.1.10) y tener máximo 15 caracteres.`;
      }
    }

    // Validar MAC si está presente
    if (campo.type === 'mac' && valor !== undefined && valor !== null && String(valor).trim() !== '') {
      const valorTrim = String(valor).trim();
      if (valorTrim.length > 17 || !macRegex.test(valorTrim)) {
        return `El campo "${campo.label}" debe ser una dirección MAC válida (ej. AA:BB:CC:DD:EE:FF) y tener máximo 17 caracteres.`;
      }
    }

    // Validar longitud y seguridad de texto simple
    if (campo.type === 'text' && valor !== undefined && valor !== null && String(valor).trim() !== '') {
      const valorTrim = String(valor).trim();
      if (valorTrim.length > 100) {
        return `El campo "${campo.label}" no debe superar los 100 caracteres.`;
      }
      if (!safeTextRegex.test(valorTrim)) {
        return `El campo "${campo.label}" contiene caracteres no permitidos.`;
      }
    }

    // Validar longitud y seguridad de textarea
    if (campo.type === 'textarea' && valor !== undefined && valor !== null && String(valor).trim() !== '') {
      const valorTrim = String(valor).trim();
      if (valorTrim.length > 500) {
        return `El campo "${campo.label}" no debe superar los 500 caracteres.`;
      }
      if (!safeTextRegex.test(valorTrim)) {
        return `El campo "${campo.label}" contiene caracteres no permitidos.`;
      }
    }

    // Validar celdas de las tablas dinámicas (grid, fixed_grid, etc.)
    if (['grid', 'fixed_grid', 'fixed_grid_dynamic_cols', 'fixed_grid_fixed_cols'].includes(campo.type) && Array.isArray(valor)) {
      for (const row of valor) {
        let columns = [...(campo.columns || [])];
        
        // Agregar dinámicamente si es fixed_grid_dynamic_cols
        if (campo.type === 'fixed_grid_dynamic_cols') {
          const predefinedColNames = columns.map(col => typeof col === 'object' ? col.name : col);
          const rowLabelKey = campo.row_label || 'Descripción / Fila';
          Object.keys(row).forEach(key => {
            if (key !== rowLabelKey && key !== 'Descripción / Fila' && !predefinedColNames.includes(key)) {
              columns.push({ name: key, type: 'text', required: false });
            }
          });
        }

        for (const col of columns) {
          const colName = typeof col === 'object' ? col.name : col;
          const colType = typeof col === 'object' ? col.type : 'text';
          const cellVal = row[colName];

          if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
            const cellValTrim = String(cellVal).trim();
            
            if (colType === 'ip') {
              if (cellValTrim.length > 15 || !ipRegex.test(cellValTrim)) {
                return `El valor "${cellVal}" en la columna "${colName}" de la tabla "${campo.label}" debe ser una dirección IP válida y tener máximo 15 caracteres.`;
              }
            }
            if (colType === 'mac') {
              if (cellValTrim.length > 17 || !macRegex.test(cellValTrim)) {
                return `El valor "${cellVal}" en la columna "${colName}" de la tabla "${campo.label}" debe ser una dirección MAC válida y tener máximo 17 caracteres.`;
              }
            }
            if (colType === 'text') {
              if (cellValTrim.length > 100) {
                return `El valor en la columna "${colName}" de la tabla "${campo.label}" no debe superar los 100 caracteres.`;
              }
              if (!safeTextRegex.test(cellValTrim)) {
                return `El valor en la columna "${colName}" de la tabla "${campo.label}" contiene caracteres no permitidos.`;
              }
            }
            if (colType === 'textarea') {
              if (cellValTrim.length > 500) {
                return `El valor en la columna "${colName}" de la tabla "${campo.label}" no debe superar los 500 caracteres.`;
              }
              if (!safeTextRegex.test(cellValTrim)) {
                return `El valor en la columna "${colName}" de la tabla "${campo.label}" contiene caracteres no permitidos.`;
              }
            }
            if (colType === 'identificacion') {
              if (!idRegex.test(cellValTrim)) {
                return `La identificación en la columna "${colName}" de la tabla "${campo.label}" debe contener exactamente 10 dígitos numéricos.`;
              }
            }
          }
        }
      }
    }
  }
  return null;
}


// 3. CREAR NUEVA SOLICITUD
router.post('/', autenticar, async (req, res) => {
  const { tipo_solicitud_id, datos, enviar } = req.body;
  const solicitanteId = req.usuario.id;

  if (!tipo_solicitud_id || !datos) {
    return res.status(400).json({ error: 'Datos incompletos.' });
  }

  const estado = enviar ? 'en_revision' : 'borrador';
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const tipoRes = await client.query('SELECT areas_validadoras, campos FROM tipos_solicitud WHERE id = $1', [tipo_solicitud_id]);
    if (tipoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El tipo de solicitud no existe.' });
    }
    const { areas_validadoras: areas, campos } = tipoRes.rows[0];

    // Validación estricta en el servidor para evitar inyecciones maliciosas e IP/MAC inválidos
    const validationError = validarDatos(campos, datos);
    if (validationError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: validationError });
    }

    const insertRes = await client.query(
      'INSERT INTO solicitudes (solicitante_id, tipo_solicitud_id, datos, estado) VALUES ($1, $2, $3, $4) RETURNING *',
      [solicitanteId, tipo_solicitud_id, datos, estado]
    );
    const solicitud = insertRes.rows[0];

    if (estado === 'en_revision') {
      await inicializarAprobaciones(solicitud.id, areas, client);
    }

    await client.query('COMMIT');

    if (estado === 'en_revision') {
      mailer.enviarCorreoNuevaSolicitud(solicitud.id).catch(err => {
        console.error('Error al enviar correo automático al crear solicitud:', err);
      });
    }

    res.json(solicitud);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al crear la solicitud.' });
  } finally {
    client.release();
  }
});

// 4. OBTENER LISTA DE SOLICITUDES (BANDEJA)
router.get('/', autenticar, async (req, res) => {
  const { id, rol, area } = req.usuario;
  const { page, limit, estado, search } = req.query;

  try {
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
      whereClauses.push(`ts.areas_validadoras @> jsonb_build_array(${areaParam}::text)`);

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
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    const limitParam = addParam(limitNum);
    const offsetParam = addParam(offset);

    const dataQuery = `
      SELECT s.id, s.tipo_solicitud_id, s.datos, s.estado, s.fecha_creacion, s.fecha_actualizacion,
             u.nombre AS solicitante_nombre, u.cedula AS solicitante_cedula, ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo, ts.areas_validadoras,
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

    res.json({
      solicitudes: dataResult.rows,
      total: totalItems,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(totalItems / limitNum)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las solicitudes de la bandeja.' });
  }
});

// 5. OBTENER DETALLE DE UNA SOLICITUD ESPECÍFICA
router.get('/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    const solRes = await db.query(
      `SELECT s.id, s.solicitante_id, s.tipo_solicitud_id, s.datos, s.estado, s.fecha_creacion, s.fecha_actualizacion,
              u.nombre AS solicitante_nombre, ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo, ts.campos
       FROM solicitudes s
       JOIN usuarios u ON s.solicitante_id = u.id
       JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
       WHERE s.id = $1`,
      [id]
    );

    if (solRes.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    const solicitud = solRes.rows[0];

    const apRes = await db.query(
      `SELECT a.area, a.estado, a.fecha, a.observacion, a.tecnico_id, u.nombre AS tecnico_nombre
       FROM aprobaciones a
       LEFT JOIN usuarios u ON a.tecnico_id = u.id
       WHERE a.solicitud_id = $1`,
      [id]
    );

    const obsRes = await db.query(
      `SELECT o.area, o.texto, o.fecha, u.nombre AS autor_nombre
       FROM observaciones o
       JOIN usuarios u ON o.autor_id = u.id
       WHERE o.solicitud_id = $1
       ORDER BY o.fecha DESC`,
      [id]
    );

    res.json({
      ...solicitud,
      aprobaciones: apRes.rows,
      observaciones: obsRes.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el detalle de la solicitud.' });
  }
});

// 6. EDITAR/CORREGIR SOLICITUD
router.put('/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { datos, enviar } = req.body;
  const { id: userId, rol, area } = req.usuario;

  if (!datos) {
    return res.status(400).json({ error: 'Datos incompletos.' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const solRes = await client.query(
      `SELECT s.estado, s.solicitante_id, ts.areas_validadoras, ts.campos 
       FROM solicitudes s
       JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
       WHERE s.id = $1`,
      [id]
    );
    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    const solicitud = solRes.rows[0];
    let autorizado = false;

    if (rol === 'admin') {
      autorizado = true;
    } else if (rol === 'solicitante' && solicitud.solicitante_id === userId) {
      if (solicitud.estado === 'borrador' || solicitud.estado === 'observado' || solicitud.estado === 'en_revision') {
        autorizado = true;
      }
    } else if (rol === 'tecnico' && area && area !== 'director' && solicitud.areas_validadoras.includes(area)) {
      if (solicitud.estado === 'en_revision' || solicitud.estado === 'observado') {
        if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
          const asignadoRes = await client.query(
            "SELECT tecnico_id FROM aprobaciones WHERE solicitud_id = $1 AND area = $2",
            [id, area]
          );
          if (asignadoRes.rows.length > 0 && asignadoRes.rows[0].tecnico_id === userId) {
            autorizado = true;
          }
        } else {
          autorizado = true;
        }
      }
    }

    if (!autorizado) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permiso para modificar esta solicitud.' });
    }

    // Validación estricta en el servidor para evitar inyecciones maliciosas e IP/MAC inválidos
    const validationError = validarDatos(solicitud.campos, datos);
    if (validationError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: validationError });
    }

    const nuevoEstado = (rol === 'solicitante' && enviar) ? 'en_revision' : solicitud.estado;

    await client.query(
      'UPDATE solicitudes SET datos = $1, estado = $2, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $3',
      [datos, nuevoEstado, id]
    );

    let dispararCorreo = false;
    if (rol === 'solicitante' && nuevoEstado === 'en_revision') {
      const apCheck = await client.query('SELECT COUNT(*) FROM aprobaciones WHERE solicitud_id = $1', [id]);
      const tieneAprobaciones = parseInt(apCheck.rows[0].count, 10) > 0;
      if (!tieneAprobaciones || solicitud.estado === 'borrador') {
        await inicializarAprobaciones(id, solicitud.areas_validadoras, client);
        dispararCorreo = true;
      }
    }

    await client.query('COMMIT');

    if (dispararCorreo) {
      mailer.enviarCorreoNuevaSolicitud(id).catch(err => {
        console.error('Error al enviar correo automático al enviar solicitud (PUT):', err);
      });
    }

    res.json({ message: 'Solicitud actualizada con éxito.', estado: nuevoEstado });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la solicitud.' });
  } finally {
    client.release();
  }
});

// 7. APROBAR SECCIÓN DE UNA SOLICITUD
router.post('/:id/aprobar', autenticar, async (req, res) => {
  const { id } = req.params;
  const { observacion } = req.body;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || area === 'director') {
    return res.status(403).json({ error: 'Solo los analistas de áreas técnicas pueden aprobar (excepto Director DTIC).' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const solRes = await client.query('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    const estadoActual = solRes.rows[0].estado;
    if (estadoActual !== 'en_revision' && estadoActual !== 'observado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La solicitud debe estar en revisión o con observaciones para aprobar.' });
    }

    const apRes = await client.query(
      `UPDATE aprobaciones 
       SET estado = 'aprobado', tecnico_id = $1, fecha = CURRENT_TIMESTAMP, observacion = $2 
       WHERE solicitud_id = $3 AND area = $4
       RETURNING *`,
      [tecnicoId, observacion || null, id, area]
    );

    if (apRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Esta solicitud no requiere la validación de tu área.' });
    }

    if (observacion && observacion.trim() !== '') {
      await client.query(
        `INSERT INTO observaciones (solicitud_id, area, autor_id, texto) 
         VALUES ($1, $2, $3, $4)`,
        [id, area, tecnicoId, `[Aprobado con Observación] ${observacion}`]
      );
    }

    const todasAprobadasRes = await client.query(
      "SELECT COUNT(*) FROM aprobaciones WHERE solicitud_id = $1 AND estado = 'pendiente'",
      [id]
    );
    const pendientes = parseInt(todasAprobadasRes.rows[0].count, 10);

    let nuevoEstadoGeneral = estadoActual;
    let esAprobacionTotal = false;

    if (pendientes === 0) {
      nuevoEstadoGeneral = 'aprobado';
      esAprobacionTotal = true;
      await client.query(
        "UPDATE solicitudes SET estado = 'aprobado', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1",
        [id]
      );
    }

    await client.query('COMMIT');

    if (esAprobacionTotal) {
      mailer.enviarCorreoProgresoSolicitud(id, 'aprobado_total', area, observacion).catch(err => {
        console.error('Error al enviar correo de aprobación total:', err);
      });
    } else {
      mailer.enviarCorreoProgresoSolicitud(id, 'aprobado_seccion', area, observacion).catch(err => {
        console.error('Error al enviar correo de aprobación de sección:', err);
      });
    }

    res.json({ message: 'Sección aprobada con éxito.', estadoGeneral: nuevoEstadoGeneral });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al procesar la aprobación.' });
  } finally {
    client.release();
  }
});

// 8. REGISTRAR OBSERVACIÓN PARALELA SIMPLE
router.post('/:id/observar-simple', autenticar, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || area === 'director') {
    return res.status(403).json({ error: 'Solo los analistas de áreas técnicas pueden realizar observaciones (excepto Director DTIC).' });
  }
  if (!texto || texto.trim() === '') {
    return res.status(400).json({ error: 'El detalle de la observación no puede estar vacío.' });
  }

  try {
    const solRes = await db.query('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (solRes.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (solRes.rows[0].estado === 'borrador') {
      return res.status(400).json({ error: 'La solicitud está en borrador.' });
    }

    await db.query(
      'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
      [id, area, tecnicoId, texto]
    );

    res.json({ message: 'Observación registrada con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar la observación.' });
  }
});

// 8.1. REGISTRAR OBSERVACIÓN / REAPERTURA
router.post('/:id/observar', autenticar, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || area === 'director') {
    return res.status(403).json({ error: 'Solo los analistas de áreas técnicas pueden realizar observaciones (excepto Director DTIC).' });
  }
  if (!texto || texto.trim() === '') {
    return res.status(400).json({ error: 'El detalle de la observación no puede estar vacío.' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const solRes = await client.query('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    const estadoActual = solRes.rows[0].estado;
    if (estadoActual !== 'en_revision' && estadoActual !== 'observado') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La solicitud debe estar en revisión o con observaciones.' });
    }

    await client.query(
      'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
      [id, area, tecnicoId, texto]
    );

    await client.query(
      "UPDATE solicitudes SET estado = 'observado', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');

    mailer.enviarCorreoProgresoSolicitud(id, 'observado', area, texto).catch(err => {
      console.error('Error al enviar correo de progreso observado:', err);
    });

    res.json({ message: 'Observación registrada y flujo marcado como observado.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al registrar la observación.' });
  } finally {
    client.release();
  }
});

// 8.1.b. ASIGNAR SOLICITUD A UN TÉCNICO ESPECÍFICO DE SU ÁREA
router.post('/:id/asignar', autenticar, async (req, res) => {
  const { id } = req.params;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || !['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
    return res.status(403).json({ error: 'Solo los analistas de las áreas de Seguridad, Base de Datos, Infraestructura y OSI pueden asignarse solicitudes.' });
  }

  try {
    const solRes = await db.query('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (solRes.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    const estadoActual = solRes.rows[0].estado;
    if (estadoActual !== 'en_revision' && estadoActual !== 'observado') {
      return res.status(400).json({ error: 'La solicitud debe estar en revisión o con observaciones para asignarse.' });
    }

    const apRes = await db.query(
      'SELECT tecnico_id, estado FROM aprobaciones WHERE solicitud_id = $1 AND area = $2',
      [id, area]
    );

    if (apRes.rows.length === 0) {
      return res.status(400).json({ error: 'Esta solicitud no requiere la validación de tu área.' });
    }

    const aprobacion = apRes.rows[0];
    if (aprobacion.tecnico_id && aprobacion.tecnico_id !== tecnicoId) {
      return res.status(400).json({ error: 'Esta solicitud ya ha sido asignada a otro técnico de tu área.' });
    }

    await db.query(
      'UPDATE aprobaciones SET tecnico_id = $1 WHERE solicitud_id = $2 AND area = $3',
      [tecnicoId, id, area]
    );

    res.json({ message: 'Solicitud asignada con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al asignar la solicitud.' });
  }
});

// 8.1.c. LIBERAR/DESASIGNAR SOLICITUD
router.post('/:id/desasignar', autenticar, async (req, res) => {
  const { id } = req.params;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || !['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
    return res.status(403).json({ error: 'Solo los analistas de las áreas de Seguridad, Base de Datos, Infraestructura y OSI pueden desasignarse solicitudes.' });
  }

  try {
    const apRes = await db.query(
      'SELECT tecnico_id, estado FROM aprobaciones WHERE solicitud_id = $1 AND area = $2',
      [id, area]
    );

    if (apRes.rows.length === 0) {
      return res.status(400).json({ error: 'Esta solicitud no requiere la validación de tu área.' });
    }

    const aprobacion = apRes.rows[0];
    if (aprobacion.tecnico_id !== tecnicoId) {
      return res.status(400).json({ error: 'No estás asignado a esta solicitud, no puedes liberarla.' });
    }

    if (aprobacion.estado === 'aprobado') {
      return res.status(400).json({ error: 'La sección ya ha sido aprobada, no se puede liberar la asignación.' });
    }

    await db.query(
      'UPDATE aprobaciones SET tecnico_id = NULL WHERE solicitud_id = $1 AND area = $2 AND tecnico_id = $3',
      [id, area, tecnicoId]
    );

    res.json({ message: 'Solicitud liberada con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al liberar la solicitud.' });
  }
});

// 8.2. REABRIR PROCESO DE REVISIÓN PARA TODOS
router.post('/:id/reabrir', autenticar, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;
  const { id: userId, rol, area } = req.usuario;

  if (!texto || texto.trim() === '') {
    return res.status(400).json({ error: 'El motivo de la reapertura es requerido.' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const solRes = await client.query(
      `SELECT s.estado, s.solicitante_id, ts.areas_validadoras 
       FROM solicitudes s
       JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
       WHERE s.id = $1`,
      [id]
    );

    if (solRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    const solicitud = solRes.rows[0];

    if (solicitud.estado === 'borrador') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No se puede reabrir una solicitud en borrador.' });
    }

    let autorizado = false;
    if (rol === 'admin') {
      autorizado = true;
    } else if (rol === 'solicitante' && solicitud.solicitante_id === userId) {
      autorizado = true;
    } else if (rol === 'tecnico' && area && area !== 'director' && solicitud.areas_validadoras.includes(area)) {
      if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
        const asignadoRes = await client.query(
          "SELECT tecnico_id FROM aprobaciones WHERE solicitud_id = $1 AND area = $2",
          [id, area]
        );
        if (asignadoRes.rows.length > 0 && asignadoRes.rows[0].tecnico_id === userId) {
          autorizado = true;
        }
      } else {
        autorizado = true;
      }
    }

    if (!autorizado) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permiso para reabrir esta solicitud.' });
    }

    await client.query(
      "UPDATE solicitudes SET estado = 'en_revision', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );

    await inicializarAprobaciones(id, solicitud.areas_validadoras, client);

    const autorArea = rol === 'tecnico' ? area : (rol === 'admin' ? 'admin' : 'solicitante');
    await client.query(
      'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
      [id, autorArea, userId, `REAPERTURA DEL PROCESO: ${texto}`]
    );

    await client.query('COMMIT');

    mailer.enviarCorreoProgresoSolicitud(id, 'reapertura', autorArea, texto).catch(err => {
      console.error('Error al enviar correo de progreso de reapertura:', err);
    });

    res.json({ message: 'El proceso de revisión se ha reabierto para todas las áreas.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al reabrir el proceso de revisión.' });
  } finally {
    client.release();
  }
});

// 9. GENERACIÓN DE PDF INSTITUCIONAL
router.get('/:id/pdf', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    const solRes = await db.query(
      `SELECT s.id, s.datos, s.estado, s.fecha_creacion, s.fecha_actualizacion,
              u.nombre AS solicitante_nombre, u.cedula AS solicitante_cedula,
              u.cargo AS solicitante_cargo, u.correo AS solicitante_correo,
              u.direccion_proyecto AS solicitante_direccion_proyecto,
              ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo, ts.campos,
              ts.areas_validadoras
       FROM solicitudes s
       JOIN usuarios u ON s.solicitante_id = u.id
       JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
       WHERE s.id = $1`,
      [id]
    );

    if (solRes.rows.length === 0) {
      return res.status(404).send('Solicitud no encontrada.');
    }
    const solicitud = solRes.rows[0];

    if (solicitud.estado !== 'aprobado' && req.usuario.rol !== 'admin') {
      return res.status(400).send('El documento institucional solo puede generarse para solicitudes completamente aprobadas.');
    }

    const apRes = await db.query(
      `SELECT a.area, a.estado, a.fecha, a.observacion, u.nombre AS tecnico_nombre,
              u.cedula AS tecnico_cedula, u.cargo AS tecnico_cargo, u.correo AS tecnico_correo
       FROM aprobaciones a
       LEFT JOIN usuarios u ON a.tecnico_id = u.id
       WHERE a.solicitud_id = $1`,
      [id]
    );

    const directorSignerRes = await db.query(
      `SELECT nombre, cedula, cargo FROM usuarios 
       WHERE area = 'director' AND rol = 'tecnico' 
       ORDER BY id ASC LIMIT 1`
    );
    const directorSigner = directorSignerRes.rows[0] || null;

    const fecha = new Date(solicitud.fecha_creacion);
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    const codigoClean = (solicitud.tipo_codigo || 'FORM').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cedulaClean = (solicitud.solicitante_cedula || 'NOCEDULA').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${codigoClean}_${cedulaClean}_${mes}_${anio}.pdf`;

    const pdfBuffer = await pdfGenerator.generarPDF(solicitud, apRes.rows, directorSigner);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error al generar el documento PDF:', error);
    if (!res.headersSent) {
      res.status(500).send('Error al generar el documento PDF.');
    }
  }
});

module.exports = router;
