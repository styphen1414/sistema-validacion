const express = require('express');
const router = express.Router();
const solicitudService = require('../services/solicitudService');
const mailer = require('../mailer');
const pdfGenerator = require('../pdfGenerator');
const { autenticar } = require('../middlewares/auth');
const { inicializarAprobaciones, generarCodigoSeguimiento } = require('../dbHelper');


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

  try {
    const tipo = await solicitudService.obtenerTipoSolicitud(tipo_solicitud_id);
    if (!tipo) {
      return res.status(400).json({ error: 'El tipo de solicitud no existe.' });
    }

    const validationError = validarDatos(tipo.campos, datos);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const areasValidadoras = solicitudService.calcularAreasValidadoras(tipo.campos, datos, tipo.areas_validadoras);

    const solicitud = await solicitudService.crearSolicitud(
      solicitanteId,
      tipo_solicitud_id,
      datos,
      estado,
      areasValidadoras,
      inicializarAprobaciones
    );

    if (estado === 'en_revision') {
      mailer.enviarCorreoNuevaSolicitud(solicitud.id).catch(err => {
        console.error('Error al enviar correo automático al crear solicitud:', err);
      });
    }

    res.json(solicitud);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear la solicitud.' });
  }
});

// 4. OBTENER LISTA DE SOLICITUDES (BANDEJA)
router.get('/', autenticar, async (req, res) => {
  const { id, rol, area } = req.usuario;
  const { page, limit, estado, search } = req.query;

  try {
    const data = await solicitudService.buscarBandeja({
      id,
      rol,
      area,
      page,
      limit,
      estado,
      search
    });
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las solicitudes de la bandeja.' });
  }
});

// 4.b. OBTENER ESTADÍSTICAS DE SOLICITUDES (CONTEOS POR ESTADO)
router.get('/stats', autenticar, async (req, res) => {
  try {
    const counts = await solicitudService.obtenerEstadisticas(req.usuario);
    res.json(counts);
  } catch (error) {
    console.error('Error al obtener estadísticas de solicitudes:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// 5. OBTENER DETALLE DE UNA SOLICITUD ESPECÍFICA
router.get('/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    const solicitud = await solicitudService.obtenerSolicitudDetalle(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    const aprobaciones = await solicitudService.obtenerAprobaciones(id);
    const observaciones = await solicitudService.obtenerObservaciones(id);

    res.json({
      ...solicitud,
      aprobaciones,
      observaciones
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

  try {
    const solicitud = await solicitudService.obtenerSolicitudDetalle(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    let autorizado = false;

    if (rol === 'admin') {
      autorizado = true;
    } else if (rol === 'solicitante' && solicitud.solicitante_id === userId) {
      if (solicitud.estado === 'borrador' || solicitud.estado === 'observado') {
        autorizado = true;
      }
    } else if (rol === 'tecnico' && area && area !== 'director' && solicitud.areas_validadoras.includes(area)) {
      if (solicitud.estado === 'en_revision' || solicitud.estado === 'observado') {
        if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
          const aprobacion = await solicitudService.obtenerAprobacionArea(id, area);
          if (aprobacion && aprobacion.tecnico_id === userId) {
            autorizado = true;
          }
        } else {
          autorizado = true;
        }
      }
    }

    if (!autorizado) {
      return res.status(403).json({ error: 'No tienes permiso para modificar esta solicitud.' });
    }

    const validationError = validarDatos(solicitud.campos, datos);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const nuevoEstado = (rol === 'solicitante' && enviar) ? 'en_revision' : solicitud.estado;

    const areasValidadoras = solicitudService.calcularAreasValidadoras(solicitud.campos, datos, solicitud.plantilla_areas_validadoras);

    const { dispararCorreo } = await solicitudService.actualizarSolicitud(
      id,
      datos,
      nuevoEstado,
      inicializarAprobaciones,
      areasValidadoras
    );

    if (dispararCorreo) {
      mailer.enviarCorreoNuevaSolicitud(id).catch(err => {
        console.error('Error al enviar correo automático al enviar solicitud (PUT):', err);
      });
    }

    res.json({ message: 'Solicitud actualizada con éxito.', estado: nuevoEstado });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la solicitud.' });
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

  try {
    const solicitud = await solicitudService.obtenerSolicitudDetalle(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (solicitud.estado !== 'en_revision' && solicitud.estado !== 'observado') {
      return res.status(400).json({ error: 'La solicitud debe estar en revisión o con observaciones para aprobar.' });
    }

    const approvalResult = await solicitudService.aprobarSeccion(id, tecnicoId, area, observacion);
    if (!approvalResult) {
      return res.status(400).json({ error: 'Esta solicitud no requiere la validación de tu área.' });
    }

    const { esAprobacionTotal } = approvalResult;
    let nuevoEstadoGeneral = esAprobacionTotal ? 'aprobado' : solicitud.estado;

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
    console.error(error);
    res.status(500).json({ error: 'Error al procesar la aprobación.' });
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
    const solicitud = await solicitudService.obtenerSolicitudDetalle(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (solicitud.estado === 'borrador') {
      return res.status(400).json({ error: 'La solicitud está en borrador.' });
    }

    await solicitudService.registrarObservacionSimple(id, area, tecnicoId, texto);
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

  try {
    const solicitud = await solicitudService.obtenerSolicitudDetalle(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (solicitud.estado !== 'en_revision' && solicitud.estado !== 'observado') {
      return res.status(400).json({ error: 'La solicitud debe estar en revisión o con observaciones.' });
    }

    await solicitudService.registrarObservacionYReabrir(id, area, tecnicoId, texto);

    mailer.enviarCorreoProgresoSolicitud(id, 'observado', area, texto).catch(err => {
      console.error('Error al enviar correo de progreso observado:', err);
    });

    res.json({ message: 'Observación registrada y flujo marcado como observado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar la observación.' });
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
    const solicitud = await solicitudService.obtenerSolicitudDetalle(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (solicitud.estado !== 'en_revision' && solicitud.estado !== 'observado') {
      return res.status(400).json({ error: 'La solicitud debe estar en revisión o con observaciones para asignarse.' });
    }

    const aprobacion = await solicitudService.obtenerAprobacionArea(id, area);
    if (!aprobacion) {
      return res.status(400).json({ error: 'Esta solicitud no requiere la validación de tu área.' });
    }
    if (aprobacion.tecnico_id && aprobacion.tecnico_id !== tecnicoId) {
      return res.status(400).json({ error: 'Esta solicitud ya ha sido asignada a otro técnico de tu área.' });
    }

    await solicitudService.asignarTecnico(id, area, tecnicoId);
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
    const aprobacion = await solicitudService.obtenerAprobacionArea(id, area);
    if (!aprobacion) {
      return res.status(400).json({ error: 'Esta solicitud no requiere la validación de tu área.' });
    }
    if (aprobacion.tecnico_id !== tecnicoId) {
      return res.status(400).json({ error: 'No estás asignado a esta solicitud, no puedes liberarla.' });
    }
    if (aprobacion.estado === 'aprobado') {
      return res.status(400).json({ error: 'La sección ya ha sido aprobada, no se puede liberar la asignación.' });
    }

    await solicitudService.desasignarTecnico(id, area, tecnicoId);
    res.json({ message: 'Solicitud asignada liberada con éxito.' });
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

  try {
    const solicitud = await solicitudService.obtenerSolicitudDetalle(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (solicitud.estado === 'borrador') {
      return res.status(400).json({ error: 'No se puede reabrir una solicitud en borrador.' });
    }

    let autorizado = false;
    if (rol === 'admin') {
      autorizado = true;
    } else if (rol === 'solicitante' && solicitud.solicitante_id === userId) {
      autorizado = true;
    } else if (rol === 'tecnico' && area && area !== 'director' && solicitud.areas_validadoras.includes(area)) {
      if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
        const aprobacion = await solicitudService.obtenerAprobacionArea(id, area);
        if (aprobacion && aprobacion.tecnico_id === userId) {
          autorizado = true;
        }
      } else {
        autorizado = true;
      }
    }

    if (!autorizado) {
      return res.status(403).json({ error: 'No tienes permiso para reabrir esta solicitud.' });
    }

    const autorArea = rol === 'tecnico' ? area : (rol === 'admin' ? 'admin' : 'solicitante');

    await solicitudService.reabrirProcesoRevision(
      id,
      autorArea,
      userId,
      texto,
      solicitud.areas_validadoras,
      inicializarAprobaciones
    );

    mailer.enviarCorreoProgresoSolicitud(id, 'reapertura', autorArea, texto).catch(err => {
      console.error('Error al enviar correo de progreso de reapertura:', err);
    });

    res.json({ message: 'El proceso de revisión se ha reabierto para todas las áreas.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al reabrir el proceso de revisión.' });
  }
});

// 9. GENERACIÓN DE PDF INSTITUCIONAL
router.get('/:id/pdf', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    const pdfData = await solicitudService.obtenerDatosPDF(id);
    if (!pdfData) {
      return res.status(404).send('Solicitud no encontrada.');
    }

    const { solicitud, aprobaciones, directorSigner } = pdfData;

    if (solicitud.estado !== 'aprobado' && req.usuario.rol !== 'admin') {
      return res.status(400).send('El documento institucional solo puede generarse para solicitudes completamente aprobadas.');
    }

    const filename = `${generarCodigoSeguimiento(solicitud)}.pdf`;

    const pdfBuffer = await pdfGenerator.generarPDF(solicitud, aprobaciones, directorSigner);
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
