const express = require('express');
const path = require('path');
const db = require('./db');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

async function obtenerTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    console.log('Configurando transporter de correo SMTP real...');
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: port === '465', // true para puerto 465, false para otros como 587
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false // Permite conexiones si el certificado de correo del MSP es autofirmado
      }
    });
  } else {
    console.log('Variables de entorno SMTP no completas en .env. Generando cuenta de prueba Ethereal...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // TLS
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`Cuenta Ethereal generada con éxito. Usuario: ${testAccount.user}`);
    } catch (error) {
      console.error('Error al generar cuenta de prueba Ethereal:', error);
      throw error;
    }
  }
  return transporter;
}

async function enviarCorreoNuevaSolicitud(solicitudId) {
  try {
    // 1. Obtener la solicitud con los datos del solicitante y la plantilla del formulario
    const query = `
      SELECT s.id, s.datos, s.fecha_creacion,
             u.nombre AS solicitante_nombre, u.correo AS solicitante_correo,
             ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo,
             ts.mail_destinatario, ts.mail_cc, ts.mail_asunto, ts.mail_cuerpo
      FROM solicitudes s
      JOIN usuarios u ON s.solicitante_id = u.id
      JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
      WHERE s.id = $1
    `;
    const res = await db.query(query, [solicitudId]);
    if (res.rows.length === 0) return;

    const row = res.rows[0];

    // Si la plantilla no tiene parametrizado destinatario, asunto o cuerpo, no enviamos nada
    if (!row.mail_destinatario || !row.mail_asunto || !row.mail_cuerpo) {
      console.log(`La solicitud ${row.tipo_codigo}-${row.id} no tiene configuración de correo para envío automático.`);
      return;
    }

    // 2. Personalizar el Asunto y el Cuerpo del Correo
    const fechaStr = new Date(row.fecha_creacion).toLocaleDateString('es-ES');
    const url = process.env.APP_URL || 'http://127.0.0.1:3000/'; // URL base local del sistema

    const asuntoPersonalizado = row.mail_asunto
      .replace(/{codigo}/g, `${row.tipo_codigo}-${row.id}`)
      .replace(/{solicitante}/g, row.solicitante_nombre)
      .replace(/{tipo_solicitud}/g, row.tipo_nombre)
      .replace(/{fecha}/g, fechaStr)
      .replace(/{link}/g, url);

    const cuerpoPersonalizado = row.mail_cuerpo
      .replace(/{codigo}/g, `${row.tipo_codigo}-${row.id}`)
      .replace(/{solicitante}/g, row.solicitante_nombre)
      .replace(/{tipo_solicitud}/g, row.tipo_nombre)
      .replace(/{fecha}/g, fechaStr)
      .replace(/{link}/g, url);

    // 3. Enviar el correo usando nodemailer
    const mailTransporter = await obtenerTransporter();
    const fromAddress = process.env.SMTP_FROM || `"SVT MSP - Notificaciones" <${mailTransporter.options.auth.user}>`;

    const mailOptions = {
      from: fromAddress,
      to: row.mail_destinatario,
      subject: asuntoPersonalizado,
      text: cuerpoPersonalizado,
      html: `<div style="font-family: Arial, sans-serif; color: #0F172A; line-height: 1.6; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px; background-color: #FFFFFF; max-width: 600px; margin: auto;">
               <h3 style="color: #1E3A8A; border-bottom: 2px solid #0EA5E9; padding-bottom: 10px; margin-top: 0;">Notificación de Nueva Solicitud Técnica</h3>
               <p>${cuerpoPersonalizado.replace(/\n/g, '<br>')}</p>
               <br>
               <hr style="border: 0; border-top: 1px solid #E2E8F0;">
               <p style="font-size: 0.8rem; color: #64748B; font-style: italic; margin-bottom: 0;">Este es un correo automático generado por el Sistema de Validación Técnica (SVT).</p>
             </div>`
    };

    const ccEmails = [];
    if (row.mail_cc && row.mail_cc.trim() !== '') {
      ccEmails.push(...row.mail_cc.split(',').map(email => email.trim()));
    }
    // Agregar al solicitante en copia si tiene correo
    if (row.solicitante_correo && row.solicitante_correo.trim() !== '') {
      ccEmails.push(row.solicitante_correo.trim());
    }

    if (ccEmails.length > 0) {
      mailOptions.cc = ccEmails;
    }

    console.log(`[Automático] Enviando correo de nueva solicitud ${row.tipo_codigo}-${row.id} a ${row.mail_destinatario}...`);
    const info = await mailTransporter.sendMail(mailOptions);
    console.log('[Automático] Mensaje enviado con ID: %s', info.messageId);
  } catch (error) {
    console.error('Error al enviar correo automático de nueva solicitud:', error);
  }
}

async function enviarCorreoProgresoSolicitud(solicitudId, tipoEvento, area, detallesExtra) {
  try {
    // 1. Obtener la solicitud con los datos del solicitante y la plantilla del formulario
    const query = `
      SELECT s.id, s.datos, s.fecha_creacion, s.fecha_actualizacion, s.estado,
             u.nombre AS solicitante_nombre, u.correo AS solicitante_correo,
             ts.nombre AS tipo_nombre, ts.codigo AS tipo_codigo,
             ts.mail_progreso
      FROM solicitudes s
      JOIN usuarios u ON s.solicitante_id = u.id
      JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
      WHERE s.id = $1
    `;
    const res = await db.query(query, [solicitudId]);
    if (res.rows.length === 0) return;

    const row = res.rows[0];

    // Si la notificación de progreso está explícitamente desactivada (mail_progreso === false), no enviamos nada
    if (row.mail_progreso === false) {
      console.log(`La solicitud ${row.tipo_codigo}-${row.id} tiene desactivadas las notificaciones de progreso.`);
      return;
    }

    if (!row.solicitante_correo || row.solicitante_correo.trim() === '') {
      console.log(`El solicitante de la solicitud ${row.tipo_codigo}-${row.id} no tiene un correo electrónico válido registrado.`);
      return;
    }

    const areaNombre = NOMBRES_AREAS[area] || area;
    const fechaStr = new Date(row.fecha_actualizacion).toLocaleDateString('es-ES') + ' ' + new Date(row.fecha_actualizacion).toLocaleTimeString('es-ES');
    const url = process.env.APP_URL || 'http://127.0.0.1:3000/'; // URL base local del sistema

    let asunto = '';
    let tituloHTML = '';
    let mensajeHTML = '';

    if (tipoEvento === 'aprobado_seccion') {
      asunto = `[SVT] Progreso de Solicitud ${row.tipo_codigo}-${row.id}: ${areaNombre} ha Aprobado`;
      tituloHTML = 'Validación de Sección Aprobada';
      mensajeHTML = `Hola <strong>${row.solicitante_nombre}</strong>,<br><br>
                     Te informamos que el área de <strong>${areaNombre}</strong> ha aprobado satisfactoriamente la sección correspondiente a su cargo en tu solicitud.<br><br>
                     <strong>Detalles de la validación:</strong><br>
                     <ul>
                       <li><strong>Código de solicitud:</strong> ${row.tipo_codigo}-${row.id}</li>
                       <li><strong>Área:</strong> ${areaNombre}</li>
                       <li><strong>Fecha/Hora:</strong> ${fechaStr}</li>
                       <li><strong>Comentarios del técnico:</strong> ${detallesExtra ? detallesExtra : 'Sin comentarios adicionales.'}</li>
                     </ul>
                     El proceso de revisión continuará con las demás áreas validadoras requeridas.`;
    } else if (tipoEvento === 'observado') {
      asunto = `[SVT] Acción Requerida: Solicitud ${row.tipo_codigo}-${row.id} con observaciones por ${areaNombre}`;
      tituloHTML = 'Solicitud con Observaciones';
      mensajeHTML = `Hola <strong>${row.solicitante_nombre}</strong>,<br><br>
                     Tu solicitud ha recibido observaciones de corrección por parte del área de <strong>${areaNombre}</strong>.<br><br>
                     <strong>Detalles de las observaciones:</strong><br>
                     <ul>
                       <li><strong>Código de solicitud:</strong> ${row.tipo_codigo}-${row.id}</li>
                       <li><strong>Área que observa:</strong> ${areaNombre}</li>
                       <li><strong>Fecha/Hora:</strong> ${fechaStr}</li>
                       <li><strong>Observación técnica:</strong> <span style="color: #c16a54; font-weight: 500;">${detallesExtra}</span></li>
                     </ul>
                     Por favor, ingresa al sistema para realizar las correcciones indicadas y volver a enviar a revisión.`;
    } else if (tipoEvento === 'reapertura') {
      asunto = `[SVT] Reanudación del Proceso: Solicitud ${row.tipo_codigo}-${row.id} ha sido reabierta`;
      tituloHTML = 'Reapertura de Proceso de Revisión';
      mensajeHTML = `Hola <strong>${row.solicitante_nombre}</strong>,<br><br>
                     Se ha reabierto el proceso de revisión para tu solicitud de servicios técnicos.<br><br>
                     <strong>Detalles de la reapertura:</strong><br>
                     <ul>
                       <li><strong>Código de solicitud:</strong> ${row.tipo_codigo}-${row.id}</li>
                       <li><strong>Reabierto por:</strong> ${areaNombre}</li>
                       <li><strong>Fecha/Hora:</strong> ${fechaStr}</li>
                       <li><strong>Motivo de reapertura:</strong> ${detallesExtra}</li>
                     </ul>
                     Todas las aprobaciones de las áreas técnicas han sido restablecidas para una nueva revisión integral.`;
    } else if (tipoEvento === 'aprobado_total') {
      asunto = `[SVT] ¡Felicidades! Solicitud ${row.tipo_codigo}-${row.id} completamente Aprobada`;
      tituloHTML = 'Solicitud Completamente Aprobada';
      mensajeHTML = `Hola <strong>${row.solicitante_nombre}</strong>,<br><br>
                     ¡Excelente noticia! Tu solicitud ha culminado el proceso de revisión y ha sido <strong>completamente aprobada</strong> por todas las áreas requeridas.<br><br>
                     <strong>Resumen del trámite:</strong><br>
                     <ul>
                       <li><strong>Código de solicitud:</strong> ${row.tipo_codigo}-${row.id}</li>
                       <li><strong>Tipo de solicitud:</strong> ${row.tipo_nombre}</li>
                       <li><strong>Fecha final de aprobación:</strong> ${fechaStr}</li>
                     </ul>
                     Ya puedes ingresar a la plataforma para descargar tu documento institucional PDF firmado y validado.`;
    }

    // Enviar el correo usando nodemailer
    const mailTransporter = await obtenerTransporter();
    const fromAddress = process.env.SMTP_FROM || `"SVT MSP - Notificaciones" <${mailTransporter.options.auth.user}>`;

    const mailOptions = {
      from: fromAddress,
      to: row.solicitante_correo.trim(),
      subject: asunto,
      text: mensajeHTML.replace(/<[^>]*>/g, ''), // texto plano eliminando tags html
      html: `<div style="font-family: Arial, sans-serif; color: #0F172A; line-height: 1.6; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px; background-color: #FFFFFF; max-width: 600px; margin: auto;">
               <h3 style="color: #1E3A8A; border-bottom: 2px solid #0EA5E9; padding-bottom: 10px; margin-top: 0;">SVT MSP - ${tituloHTML}</h3>
               <p>${mensajeHTML}</p>
               <br>
               <div style="text-align: center; margin: 20px 0;">
                 <a href="${url}" style="background-color: #1E3A8A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Acceder al Sistema (SVT)</a>
               </div>
               <hr style="border: 0; border-top: 1px solid #E2E8F0;">
               <p style="font-size: 0.8rem; color: #64748B; font-style: italic; margin-bottom: 0;">Este es un correo automático generado por el Sistema de Validación Técnica (SVT). Por favor no responda a este mensaje.</p>
             </div>`
    };

    console.log(`[Progreso] Enviando correo de progreso (${tipoEvento}) para solicitud ${row.tipo_codigo}-${row.id} a ${row.solicitante_correo}...`);
    const info = await mailTransporter.sendMail(mailOptions);
    console.log('[Progreso] Mensaje de progreso enviado con ID: %s', info.messageId);
  } catch (error) {
    console.error('Error al enviar correo automático de progreso de solicitud:', error);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Diccionario de Nombres Oficiales de Áreas
const NOMBRES_AREAS = {
  seguridad: 'Gestión Interna de Seguridad Informática y Calidad de Software - (GISICS)',
  gibdd: 'Gestión Interna de Base de Datos - (GIBD)',
  giitrc: 'Gestión Interna de Infraestructura - (GIITRC)',
  osi: 'Oficial de Seguridad de la Información - (OSI)',
  director: 'Director DTIC MSP'
};


// Middleware para procesar JSON y servir archivos estáticos del frontend
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MIDDLEWARE DE AUTENTICACIÓN SIMPLIFICADO (Usando cabeceras personalizadas para no complicar el código)
// El frontend enviará el ID de usuario en la cabecera 'x-user-id' después de iniciar sesión.
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
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error de autenticación en el servidor.' });
  }
}

async function inicializarAprobaciones(solicitudId, areas, client = db) {
  try {
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
           DO UPDATE SET estado = 'pendiente', tecnico_id = NULL, fecha = NULL`,
          [solicitudId, area]
        );
      }
    }
  } catch (error) {
    console.error('Error al inicializar/resetear aprobaciones:', error);
    throw error;
  }
}

// 1. ENDPOINT DE LOGIN
app.post('/api/login', async (req, res) => {
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
app.get('/api/tipos-solicitud', autenticar, async (req, res) => {
  try {
    const result = await db.query('SELECT id, codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso FROM tipos_solicitud ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los tipos de solicitud.' });
  }
});

// 3. CREAR NUEVA SOLICITUD
app.post('/api/solicitudes', autenticar, async (req, res) => {
  const { tipo_solicitud_id, datos, enviar } = req.body; // 'enviar' es true si pasa de borrador a en_revision
  const solicitanteId = req.usuario.id;

  if (!tipo_solicitud_id || !datos) {
    return res.status(400).json({ error: 'Datos incompletos.' });
  }

  const estado = enviar ? 'en_revision' : 'borrador';
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Obtener información del tipo de solicitud para conocer las áreas que validarán
    const tipoRes = await client.query('SELECT areas_validadoras FROM tipos_solicitud WHERE id = $1', [tipo_solicitud_id]);
    if (tipoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El tipo de solicitud no existe.' });
    }
    const areas = tipoRes.rows[0].areas_validadoras;

    // Crear la solicitud
    const insertRes = await client.query(
      'INSERT INTO solicitudes (solicitante_id, tipo_solicitud_id, datos, estado) VALUES ($1, $2, $3, $4) RETURNING *',
      [solicitanteId, tipo_solicitud_id, datos, estado]
    );
    const solicitud = insertRes.rows[0];

    // Si se envía para revisión, inicializar las aprobaciones de cada área
    if (estado === 'en_revision') {
      await inicializarAprobaciones(solicitud.id, areas, client);
    }

    await client.query('COMMIT');

    // Enviar correo automático asíncronamente (fuera de la transacción)
    if (estado === 'en_revision') {
      enviarCorreoNuevaSolicitud(solicitud.id).catch(err => {
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
app.get('/api/solicitudes', autenticar, async (req, res) => {
  const { id, rol, area } = req.usuario;
  try {
    let query = `
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
      FROM solicitudes s
      JOIN usuarios u ON s.solicitante_id = u.id
      JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
    `;
    const params = [];

    // Lógica de bandeja por roles
    if (rol === 'solicitante') {
      // El solicitante solo ve sus propias solicitudes
      query += ' WHERE s.solicitante_id = $1';
      params.push(id);
    } else if (rol === 'tecnico') {
      // El técnico ve las solicitudes que requieren validación de su área Y que no estén en borrador.
      if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
        // Para áreas con flujo de asignación exclusiva (seguridad, gibdd, giitrc, osi) y ya hay un técnico asignado, sólo se le muestra a ese técnico.
        query += `
          LEFT JOIN aprobaciones ap ON ap.solicitud_id = s.id AND ap.area = $1
          WHERE s.estado != 'borrador' 
            AND ts.areas_validadoras @> jsonb_build_array($1::text)
            AND (ap.tecnico_id IS NULL OR ap.tecnico_id = $2)
        `;
        params.push(area);
        params.push(id);
      } else {
        // Para áreas sin flujo de asignación exclusiva (ej: director), ver todas las solicitudes de su área
        query += `
          WHERE s.estado != 'borrador' 
            AND ts.areas_validadoras @> jsonb_build_array($1::text)
        `;
        params.push(area);
      }
    }
    // Si es administrador, ve todo. No agregamos filtros.

    query += ' ORDER BY s.fecha_actualizacion DESC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las solicitudes de la bandeja.' });
  }
});

// 5. OBTENER DETALLE DE UNA SOLICITUD ESPECÍFICA (incluye aprobaciones y observaciones)
app.get('/api/solicitudes/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    // Obtener solicitud
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

    // Obtener aprobaciones
    const apRes = await db.query(
      `SELECT a.area, a.estado, a.fecha, a.observacion, a.tecnico_id, u.nombre AS tecnico_nombre
       FROM aprobaciones a
       LEFT JOIN usuarios u ON a.tecnico_id = u.id
       WHERE a.solicitud_id = $1`,
      [id]
    );

    // Obtener observaciones
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

// 6. EDITAR/CORREGIR SOLICITUD (POR EL SOLICITANTE O TÉCNICOS AUTORIZADOS)
app.put('/api/solicitudes/:id', autenticar, async (req, res) => {
  const { id } = req.params;
  const { datos, enviar } = req.body;
  const { id: userId, rol, area } = req.usuario;

  if (!datos) {
    return res.status(400).json({ error: 'Datos incompletos.' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Validar propiedad de la solicitud y permisos
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
    let autorizado = false;

    if (rol === 'admin') {
      autorizado = true;
    } else if (rol === 'solicitante' && solicitud.solicitante_id === userId) {
      // El solicitante puede editar en borrador, observado o en revisión
      if (solicitud.estado === 'borrador' || solicitud.estado === 'observado' || solicitud.estado === 'en_revision') {
        autorizado = true;
      }
    } else if (rol === 'tecnico' && area && area !== 'director' && solicitud.areas_validadoras.includes(area)) {
      // Un técnico del área validadora puede editar mientras esté en revisión u observado.
      if (solicitud.estado === 'en_revision' || solicitud.estado === 'observado') {
        if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
          // Si es un área con flujo de asignación exclusiva, debe tener la responsabilidad tomada (tecnico_id = userId).
          const asignadoRes = await client.query(
            "SELECT tecnico_id FROM aprobaciones WHERE solicitud_id = $1 AND area = $2",
            [id, area]
          );
          if (asignadoRes.rows.length > 0 && asignadoRes.rows[0].tecnico_id === userId) {
            autorizado = true;
          }
        } else {
          // Para otras áreas sin flujo de asignación exclusiva, se autoriza directamente.
          autorizado = true;
        }
      }
    }

    if (!autorizado) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permiso para modificar esta solicitud.' });
    }

    // El estado cambia a revisión si el solicitante reenvía la solicitud
    const nuevoEstado = (rol === 'solicitante' && enviar) ? 'en_revision' : solicitud.estado;

    // Actualizar solicitud
    await client.query(
      'UPDATE solicitudes SET datos = $1, estado = $2, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $3',
      [datos, nuevoEstado, id]
    );

    let dispararCorreo = false;
    // LÓGICA DE REAPERTURA: Inicializamos aprobaciones únicamente si es el primer envío (desde borrador) o si no existen.
    // Si ya existían aprobaciones (caso de reenvío tras ser observado), las mantenemos intactas para no perder el avance de otras áreas.
    if (rol === 'solicitante' && nuevoEstado === 'en_revision') {
      const apCheck = await client.query('SELECT COUNT(*) FROM aprobaciones WHERE solicitud_id = $1', [id]);
      const tieneAprobaciones = parseInt(apCheck.rows[0].count, 10) > 0;
      if (!tieneAprobaciones || solicitud.estado === 'borrador') {
        await inicializarAprobaciones(id, solicitud.areas_validadoras, client);
        dispararCorreo = true;
      }
    }

    await client.query('COMMIT');

    // Enviar correo automático asíncronamente en la primera transición a revisión
    if (dispararCorreo) {
      enviarCorreoNuevaSolicitud(id).catch(err => {
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

// 7. APROBAR SECCIÓN DE UNA SOLICITUD (POR TÉCNICOS)
app.post('/api/solicitudes/:id/aprobar', autenticar, async (req, res) => {
  const { id } = req.params;
  const { observacion } = req.body;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || area === 'director') {
    return res.status(403).json({ error: 'Solo los analistas de áreas técnicas pueden aprobar (excepto Director DTIC).' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar si la solicitud existe y está en revisión u observado
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

    // Actualizar la aprobación específica del área del técnico
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

    // Registrar en el historial de observaciones si se ingresó un texto
    if (observacion && observacion.trim() !== '') {
      await client.query(
        `INSERT INTO observaciones (solicitud_id, area, autor_id, texto) 
         VALUES ($1, $2, $3, $4)`,
        [id, area, tecnicoId, `[Aprobado con Observación] ${observacion}`]
      );
    }

    // VERIFICACIÓN: ¿Ya aprobaron todas las áreas requeridas?
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

    // Disparar correos automáticos asíncronamente (fuera de la transacción)
    if (esAprobacionTotal) {
      enviarCorreoProgresoSolicitud(id, 'aprobado_total', area, observacion).catch(err => {
        console.error('Error al enviar correo de aprobación total:', err);
      });
    } else {
      enviarCorreoProgresoSolicitud(id, 'aprobado_seccion', area, observacion).catch(err => {
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

// 8. REGISTRAR OBSERVACIÓN PARALELA SIMPLE (SIN REINICIAR EL FLUJO)
app.post('/api/solicitudes/:id/observar-simple', autenticar, async (req, res) => {
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
    // Verificar si la solicitud existe y no está en borrador
    const solRes = await db.query('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (solRes.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    if (solRes.rows[0].estado === 'borrador') {
      return res.status(400).json({ error: 'La solicitud está en borrador.' });
    }

    // Guardar la observación en el historial
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

// 8.1. REGISTRAR OBSERVACIÓN / REAPERTURA (OBSERVADO - PARA REVISIÓN DEL SOLICITANTE)
app.post('/api/solicitudes/:id/observar', autenticar, async (req, res) => {
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

    // Verificar si la solicitud existe y está en revisión o ya observado
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

    // 1. Guardar la observación en el historial
    await client.query(
      'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
      [id, area, tecnicoId, texto]
    );

    // 2. REAPERTURA INTEGRAL AL ESTADO OBSERVADO:
    await client.query(
      "UPDATE solicitudes SET estado = 'observado', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');

    // Disparar correo de observaciones/observado asíncronamente (fuera de la transacción)
    enviarCorreoProgresoSolicitud(id, 'observado', area, texto).catch(err => {
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
app.post('/api/solicitudes/:id/asignar', autenticar, async (req, res) => {
  const { id } = req.params;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || !['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
    return res.status(403).json({ error: 'Solo los analistas de las áreas de Seguridad, Base de Datos, Infraestructura y OSI pueden asignarse solicitudes.' });
  }

  try {
    // Verificar si la solicitud existe y está en revisión u observado
    const solRes = await db.query('SELECT estado FROM solicitudes WHERE id = $1', [id]);
    if (solRes.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }
    const estadoActual = solRes.rows[0].estado;
    if (estadoActual !== 'en_revision' && estadoActual !== 'observado') {
      return res.status(400).json({ error: 'La solicitud debe estar en revisión o con observaciones para asignarse.' });
    }

    // Verificar si ya existe asignación o aprobación
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

    // Asignar al técnico actual
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

// 8.1.c. LIBERAR/DESASIGNAR SOLICITUD PARA VOLVERLA AL POOL GENERAL DEL ÁREA
app.post('/api/solicitudes/:id/desasignar', autenticar, async (req, res) => {
  const { id } = req.params;
  const { id: tecnicoId, rol, area } = req.usuario;

  if (rol !== 'tecnico' || !area || !['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
    return res.status(403).json({ error: 'Solo los analistas de las áreas de Seguridad, Base de Datos, Infraestructura y OSI pueden desasignarse solicitudes.' });
  }

  try {
    // Verificar si está asignada al técnico actual
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

    // Desasignar
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

// 8.2. REABRIR PROCESO DE REVISIÓN PARA TODOS (REAPERTURA INTEGRAL A EN_REVISION)
app.post('/api/solicitudes/:id/reabrir', autenticar, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;
  const { id: userId, rol, area } = req.usuario;

  if (!texto || texto.trim() === '') {
    return res.status(400).json({ error: 'El motivo de la reapertura es requerido.' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Obtener solicitud e información del tipo de solicitud
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

    // Validar autorización: debe ser solicitante de la solicitud, o analista de un área validadora (excepto OSI), o admin
    let autorizado = false;
    if (rol === 'admin') {
      autorizado = true;
    } else if (rol === 'solicitante' && solicitud.solicitante_id === userId) {
      autorizado = true;
    } else if (rol === 'tecnico' && area && area !== 'director' && solicitud.areas_validadoras.includes(area)) {
      if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(area)) {
        // El técnico del área validadora puede reabrir siempre y cuando se haya asignado la responsabilidad
        const asignadoRes = await client.query(
          "SELECT tecnico_id FROM aprobaciones WHERE solicitud_id = $1 AND area = $2",
          [id, area]
        );
        if (asignadoRes.rows.length > 0 && asignadoRes.rows[0].tecnico_id === userId) {
          autorizado = true;
        }
      } else {
        // Otras áreas sin flujo de asignación exclusiva
        autorizado = true;
      }
    }

    if (!autorizado) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No tienes permiso para reabrir esta solicitud.' });
    }

    // 1. Cambiar estado a 'en_revision'
    await client.query(
      "UPDATE solicitudes SET estado = 'en_revision', fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );

    // 2. Resetear todas las aprobaciones (osi como 'aprobado', las demás 'pendiente')
    await inicializarAprobaciones(id, solicitud.areas_validadoras, client);

    // 3. Registrar observación explicando la reapertura
    const autorArea = rol === 'tecnico' ? area : (rol === 'admin' ? 'admin' : 'solicitante');
    await client.query(
      'INSERT INTO observaciones (solicitud_id, area, autor_id, texto) VALUES ($1, $2, $3, $4)',
      [id, autorArea, userId, `REAPERTURA DEL PROCESO: ${texto}`]
    );

    await client.query('COMMIT');

    // Disparar correo de reapertura asíncronamente (fuera de la transacción)
    enviarCorreoProgresoSolicitud(id, 'reapertura', autorArea, texto).catch(err => {
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

// 9. GENERACIÓN DE PDF INSTITUCIONAL (DESCARGA POR EL SOLICITANTE)
app.get('/api/solicitudes/:id/pdf', autenticar, async (req, res) => {
  const { id } = req.params;
  try {
    // Obtener solicitud
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

    // Solo se puede generar el PDF si está Aprobado (salvo administradores que pueden auditar)
    if (solicitud.estado !== 'aprobado' && req.usuario.rol !== 'admin') {
      return res.status(400).send('El documento institucional solo puede generarse para solicitudes completamente aprobadas.');
    }

    // Obtener aprobaciones
    const apRes = await db.query(
      `SELECT a.area, a.estado, a.fecha, a.observacion, u.nombre AS tecnico_nombre,
              u.cedula AS tecnico_cedula, u.cargo AS tecnico_cargo, u.correo AS tecnico_correo
       FROM aprobaciones a
       LEFT JOIN usuarios u ON a.tecnico_id = u.id
       WHERE a.solicitud_id = $1`,
      [id]
    );

    // Obtener el Director de TI
    const directorSignerRes = await db.query(
      `SELECT nombre, cedula, cargo FROM usuarios 
       WHERE area = 'director' AND rol = 'tecnico' 
       ORDER BY id ASC LIMIT 1`
    );
    const directorSigner = directorSignerRes.rows[0] || null;

    // Configurar respuesta HTTP para descarga de PDF
    const fecha = new Date(solicitud.fecha_creacion);
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const anio = fecha.getFullYear();
    const codigoClean = (solicitud.tipo_codigo || 'FORM').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cedulaClean = (solicitud.solicitante_cedula || 'NOCEDULA').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${codigoClean}_${cedulaClean}_${mes}_${anio}.pdf`;

    // Crear documento PDF con PDFKit en memoria
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    });

    generarReportePDFInternal(doc, solicitud, apRes.rows, directorSigner);
    doc.end();
  } catch (error) {
    console.error('Error al generar el documento PDF:', error);
    if (!res.headersSent) {
      res.status(500).send('Error al generar el documento PDF.');
    }
  }
});

function generarReportePDFInternal(doc, solicitud, aprobaciones, directorSigner) {
  const fs = require('fs');
  const path = require('path');

  // local variables and compatibility layer
  const apRes = { rows: aprobaciones };
  const fecha = new Date(solicitud.fecha_creacion);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const codigoClean = (solicitud.tipo_codigo || 'FORM').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cedulaClean = (solicitud.solicitante_cedula || 'NOCEDULA').trim().replace(/[^a-zA-Z0-9_-]/g, '');

      // DISEÑO DEL PDF Y CONFIGURACIONES
    const logoPath = path.join(__dirname, 'public', 'logo.png');
    // const fs = require('fs');

    // Funciones auxiliares locales para maquetación limpia
    const renderSectionHeader = (titleText) => {
      doc.x = 50;
      doc.moveDown(1);
      const startY = doc.y;
      
      // Dibujar barra vertical de acento (Azul Marino)
      doc.rect(50, startY, 4, 14).fill('#1E3A8A');
      
      // Dibujar texto del título
      doc.fillColor('#1E3A8A')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text(titleText.toUpperCase(), 60, startY + 1.5);
         
      doc.y = startY + 22; // Margen inferior consistente
    };

    const checkSpace = (heightNeeded) => {
      if (doc.y + heightNeeded > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        return true;
      }
      return false;
    };

    // Encabezado Ejecutivo
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { fit: [160, 50] });
    } else {
      // Fallback corporativo elegante en caso de ausencia física del logo
      doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(12).text('MINISTERIO DE SALUD PÚBLICA', 50, 40);
      doc.fillColor('#64748B').font('Helvetica').fontSize(8).text('DIRECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN', 50, 55);
    }

    // Títulos a la derecha del encabezado (Alineación y espaciado adaptables para evitar superposiciones)
    doc.fillColor('#1E3A8A')
       .font('Helvetica-Bold')
       .fontSize(11)
       .text('SISTEMA DE VALIDACIÓN TÉCNICA (SVT)', 230, 36, { align: 'right', width: 332 });

    doc.fillColor('#475569')
       .font('Helvetica')
       .fontSize(8)
       .text((solicitud.tipo_nombre || '').toUpperCase(), 230, doc.y + 2, { align: 'right', width: 332 });

    const codigoSeguimiento = `${codigoClean}_${cedulaClean}_${mes}_${anio}`;
    doc.fillColor('#0EA5E9')
       .font('Helvetica-Bold')
       .fontSize(9)
       .text(`Solicitud: ${codigoSeguimiento}`, 230, doc.y + 2, { align: 'right', width: 332 });

    const logoBottom = 40 + 50;
    const headerBottomY = Math.max(logoBottom, doc.y) + 8;

    // Línea divisoria de cabecera (Estilo doble ejecutivo)
    doc.lineWidth(1.5).strokeColor('#1E3A8A').moveTo(50, headerBottomY).lineTo(562, headerBottomY).stroke();
    doc.lineWidth(0.5).strokeColor('#0EA5E9').moveTo(50, headerBottomY + 3).lineTo(562, headerBottomY + 3).stroke();

    doc.y = headerBottomY + 15;

    // 1. INFORMACIÓN GENERAL DE LA SOLICITUD
    renderSectionHeader('1. INFORMACIÓN GENERAL DE LA SOLICITUD');

    const fechaCreacionStr = new Date(solicitud.fecha_creacion).toLocaleString('es-ES');
    const cardY = doc.y;

    // Calcular alturas de columna de forma dinámica para evitar superposiciones
    doc.fontSize(8.5);
    const heightNumSol = doc.heightOfString(codigoSeguimiento, { width: 230 });
    const heightSol = doc.heightOfString(`${solicitud.solicitante_nombre} (C.I. ${solicitud.solicitante_cedula || 'N/A'})`, { width: 230 });
    const heightCargo = doc.heightOfString(solicitud.solicitante_cargo || 'N/A', { width: 230 });
    const totalLeftHeight = 8 + 10 + heightNumSol + 6 + 10 + heightSol + 6 + 10 + heightCargo + 8;

    const heightProyecto = doc.heightOfString(solicitud.solicitante_direccion_proyecto || 'N/A', { width: 230 });
    const heightCorreo = doc.heightOfString(solicitud.solicitante_correo || 'N/A', { width: 230 });
    const heightFecha = doc.heightOfString(fechaCreacionStr, { width: 230 });
    const totalRightHeight = 8 + 10 + heightProyecto + 6 + 10 + heightCorreo + 6 + 10 + heightFecha + 8;

    const cardHeight = Math.max(85, totalLeftHeight, totalRightHeight);

    // Dibujar tarjeta contenedora de datos generales
    doc.roundedRect(50, cardY, 512, cardHeight, 4).fill('#F8FAFC');
    doc.lineWidth(1).strokeColor('#E2E8F0').roundedRect(50, cardY, 512, cardHeight, 4).stroke();

    // Renderizar Columna Izquierda con flujo relativo
    doc.x = 65;
    let leftY = cardY + 8;

    doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Número de Solicitud:', 65, leftY);
    leftY = doc.y + 2;
    doc.fillColor('#334155').font('Helvetica').text(codigoSeguimiento, 65, leftY, { width: 230 });
    leftY = doc.y + 6;

    doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Solicitante:', 65, leftY);
    leftY = doc.y + 2;
    doc.fillColor('#334155').font('Helvetica').text(`${solicitud.solicitante_nombre} (C.I. ${solicitud.solicitante_cedula || 'N/A'})`, 65, leftY, { width: 230 });
    leftY = doc.y + 6;

    doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Cargo:', 65, leftY);
    leftY = doc.y + 2;
    doc.fillColor('#334155').font('Helvetica').text(solicitud.solicitante_cargo || 'N/A', 65, leftY, { width: 230 });

    // Renderizar Columna Derecha con flujo relativo
    doc.x = 310;
    let rightY = cardY + 8;

    doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Dirección / Proyecto al que pertenece:', 310, rightY);
    rightY = doc.y + 2;
    doc.fillColor('#334155').font('Helvetica').text(solicitud.solicitante_direccion_proyecto || 'N/A', 310, rightY, { width: 230 });
    rightY = doc.y + 6;

    doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Correo Electrónico:', 310, rightY);
    rightY = doc.y + 2;
    doc.fillColor('#334155').font('Helvetica').text(solicitud.solicitante_correo || 'N/A', 310, rightY, { width: 230 });
    rightY = doc.y + 6;

    doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Fecha de Registro:', 310, rightY);
    rightY = doc.y + 2;
    doc.fillColor('#334155').font('Helvetica').text(fechaCreacionStr, 310, rightY, { width: 230 });

    doc.y = cardY + cardHeight + 10;

    // 2. DETALLES TÉCNICOS INGRESADOS
    renderSectionHeader('2. DETALLES TÉCNICOS INGRESADOS');

    const campos = solicitud.campos;
    const datos = solicitud.datos;
    
    // Función auxiliar para formatear los valores de firmantes dinámicos compuestos en el cuerpo del PDF
    const formatearValorFirmanteBackend = (val) => {
      const v = String(val || '').trim();
      if (!v) return 'N/A';
      try {
        const parsed = JSON.parse(v);
        const parts = [];
        if (parsed.nombre) parts.push(parsed.nombre);
        if (parsed.cedula) parts.push(`C.I. ${parsed.cedula}`);
        if (parsed.cargo) parts.push(parsed.cargo);
        return parts.length > 0 ? parts.join(' - ') : 'N/A';
      } catch (e) {
        return v;
      }
    };

    doc.fontSize(9.5);
    campos.forEach(campo => {
      if (campo.type === 'firmante_seccion') return; // Se omite en los detalles técnicos del PDF
      doc.x = 50; // Asegurar alineación izquierda reseteando la posición x
      if (campo.type === 'title') {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').fontSize(10.5).text(campo.label.toUpperCase());
        // Dibujar una línea sutil bajo el título dinámico
        doc.lineWidth(1).strokeColor('#BAE6FD').moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).stroke();
        doc.font('Helvetica'); 
        doc.moveDown(0.6);
        doc.fontSize(9.5); 
      } else if (campo.type === 'subtitle') {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').fontSize(9.5).text(campo.label);
        doc.font('Helvetica');
        doc.moveDown(0.3);
        doc.fontSize(9.5);
      } else if (campo.type === 'paragraph') {
        doc.moveDown(0.3);
        doc.font('Helvetica-Oblique').fillColor('#475569').fontSize(8.5).text(campo.label);
        doc.font('Helvetica');
        doc.moveDown(0.4);
        doc.fontSize(9.5);
      } else if (campo.type === 'grid' || campo.type === 'fixed_grid') {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}:`);
        doc.moveDown(0.3);

        const gridData = datos[campo.name];
        let columns = campo.columns || [];
        if (campo.type === 'fixed_grid' && Array.isArray(campo.rows) && campo.rows.length > 0) {
          const rowLabelName = campo.row_label || 'Descripción / Fila';
          columns = [{ name: rowLabelName, type: 'text' }, ...columns];
        }

        if (Array.isArray(gridData) && gridData.length > 0) {
          // --- ALGORITMO DE ANCHOS DINÁMICOS DE COLUMNAS ---
          const totalTableWidth = 512;
          const colWidths = [];
          let remainingWidth = totalTableWidth;
          let flexibleColsCount = 0;

          columns.forEach((col, idx) => {
            const colType = typeof col === 'object' ? col.type : 'text';
            const colName = typeof col === 'object' ? col.name : col;
            
            if (colType === 'checkbox') {
              colWidths[idx] = 45;
              remainingWidth -= 45;
            } else if (colType === 'date') {
              colWidths[idx] = 70;
              remainingWidth -= 70;
            } else if (colType === 'identificacion') {
              colWidths[idx] = 75;
              remainingWidth -= 75;
            } else if (colType === 'firmante' || colType === 'firmante_seccion') {
              colWidths[idx] = 110;
              remainingWidth -= 110;
            } else if (colName === 'Descripción / Fila' || (campo.row_label && colName === campo.row_label)) {
              colWidths[idx] = 120;
              flexibleColsCount++;
            } else {
              colWidths[idx] = null;
              flexibleColsCount++;
            }
          });

          if (flexibleColsCount > 0) {
            const flexWidth = Math.max(50, remainingWidth / flexibleColsCount);
            columns.forEach((col, idx) => {
              if (colWidths[idx] === null) {
                colWidths[idx] = flexWidth;
              } else if (typeof col === 'object' && (col.name === 'Descripción / Fila' || (campo.row_label && col.name === campo.row_label))) {
                colWidths[idx] = flexWidth;
              }
            });
          }

          // Normalizar
          const sumWidths = colWidths.reduce((a, b) => a + b, 0);
          const scale = totalTableWidth / sumWidths;
          colWidths.forEach((w, idx) => {
            colWidths[idx] = w * scale;
          });

          const startY = doc.y;

          // Dibujar fondo de cabecera en azul marino ejecutivo
          doc.rect(50, startY, 512, 18).fill('#1E3A8A');
          
          // Línea horizontal superior de la cabecera
          doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, startY).lineTo(562, startY).stroke();

          // Dibujar textos de cabecera y bordes verticales de cabecera
          let headerX = 50;
          doc.lineWidth(0.5).strokeColor('#CBD5E1');
          columns.forEach((col, index) => {
            const colName = typeof col === 'object' ? col.name : col;
            const colType = typeof col === 'object' ? col.type : 'text';
            const colW = colWidths[index];

            // Borde vertical izquierdo de la celda
            doc.moveTo(headerX, startY).lineTo(headerX, startY + 18).stroke();

            // Texto en color blanco
            doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(8)
              .text(colName, headerX + 5, startY + 5, {
                width: colW - 10,
                height: 10,
                ellipsis: true,
                align: colType === 'checkbox' ? 'center' : 'left'
              });
            headerX += colW;
          });
          doc.moveTo(562, startY).lineTo(562, startY + 18).stroke();

          doc.y = startY + 18;

          // Dibujar filas
          gridData.forEach(rowVal => {
            // Calcular altura de la fila
            let maxCellHeight = 10;
            columns.forEach((col, idx) => {
              const colName = typeof col === 'object' ? col.name : col;
              const colType = typeof col === 'object' ? col.type : 'text';
              let val = rowVal[colName];
              if (val === undefined) {
                if (colName === campo.row_label) {
                  val = rowVal['Descripción / Fila'];
                } else if (colName === 'Descripción / Fila') {
                  val = campo.row_label ? rowVal[campo.row_label] : undefined;
                }
              }
              val = val || '';
              if (colType === 'firmante') {
                val = formatearValorFirmanteBackend(val);
              }
              const cellHeight = doc.heightOfString(String(val), {
                width: colWidths[idx] - 10,
                fontSize: 8
              });
              if (cellHeight > maxCellHeight) {
                maxCellHeight = cellHeight;
              }
            });

            const rowHeight = maxCellHeight + 10;
            const rowY = doc.y;

            // Salto de página si no cabe
            if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom) {
              // Dibujar línea inferior antes del salto de página
              doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, rowY).lineTo(562, rowY).stroke();
              doc.addPage();
              
              // Redibuja cabecera azul marino en nueva página
              const newStartY = doc.y;
              doc.rect(50, newStartY, 512, 18).fill('#1E3A8A');
              // Línea superior de cabecera
              doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, newStartY).lineTo(562, newStartY).stroke();
              
              let freshX = 50;
              columns.forEach((col, index) => {
                const colName = typeof col === 'object' ? col.name : col;
                const colType = typeof col === 'object' ? col.type : 'text';
                const colW = colWidths[index];
                doc.moveTo(freshX, newStartY).lineTo(freshX, newStartY + 18).stroke();
                doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(8)
                  .text(colName, freshX + 5, newStartY + 5, {
                    width: colW - 10,
                    height: 10,
                    ellipsis: true,
                    align: colType === 'checkbox' ? 'center' : 'left'
                  });
                freshX += colW;
              });
              doc.moveTo(562, newStartY).lineTo(562, newStartY + 18).stroke();
              doc.y = newStartY + 18;
            }

            const currentY = doc.y;
            // Línea horizontal superior
            doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, currentY).lineTo(562, currentY).stroke();

            // Dibujar celdas y bordes verticales de la fila
            let cellX = 50;
            columns.forEach((col, index) => {
              const colName = typeof col === 'object' ? col.name : col;
              const colType = typeof col === 'object' ? col.type : 'text';
              const colW = colWidths[index];
              let val = rowVal[colName];
              if (val === undefined) {
                if (colName === campo.row_label) {
                  val = rowVal['Descripción / Fila'];
                } else if (colName === 'Descripción / Fila') {
                  val = campo.row_label ? rowVal[campo.row_label] : undefined;
                }
              }
              val = val || '';
              if (colType === 'firmante' || colType === 'firmante_seccion') {
                val = formatearValorFirmanteBackend(val);
              }
              const isCheckbox = colType === 'checkbox';

              // Borde vertical izquierdo
              doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();

              doc.font(isCheckbox && val === 'X' ? 'Helvetica-Bold' : 'Helvetica')
                .fillColor(isCheckbox && val === 'X' ? '#10B981' : '#334155') // Verde si está chequeado
                .fontSize(8)
                .text(String(val), cellX + 5, currentY + 5, {
                  width: colW - 10,
                  align: isCheckbox ? 'center' : 'left'
                });

              cellX += colW;
            });
            doc.moveTo(562, currentY).lineTo(562, currentY + rowHeight).stroke();

            doc.y = currentY + rowHeight;
          });

          // Dibujar línea inferior final de la tabla
          doc.lineWidth(1).strokeColor('#CBD5E1').moveTo(50, doc.y).lineTo(562, doc.y).stroke();
          doc.moveDown(0.5);
          doc.font('Helvetica');
        } else {
          doc.font('Helvetica-Oblique').fillColor('#64748B').fontSize(9).text('Sin registros ingresados');
          doc.moveDown(0.5);
          doc.font('Helvetica');
        }
      } else if (campo.type === 'firmante') {
        const rawVal = datos[campo.name];
        const valor = formatearValorFirmanteBackend(rawVal);
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
          .font('Helvetica').fillColor('#334155').text(`${valor}`)
          .moveDown(0.5);
      } else if (campo.type === 'firmante_list') {
        const listData = datos[campo.name];
        const valor = (Array.isArray(listData) && listData.length > 0)
          ? listData.map(v => formatearValorFirmanteBackend(v)).join(', ')
          : 'N/A';
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
          .font('Helvetica').fillColor('#334155').text(`${valor}`)
          .moveDown(0.5);
      } else if (campo.type === 'text_list') {
        const listData = datos[campo.name];
        const valor = (Array.isArray(listData) && listData.length > 0) ? listData.join(', ') : 'N/A';
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
          .font('Helvetica').fillColor('#334155').text(`${valor}`)
          .moveDown(0.5);
      } else if (campo.type === 'checkbox') {
        const rawVal = datos[campo.name];
        const isChecked = (rawVal === 'X' || rawVal === true || rawVal === 'true');
        const displayVal = isChecked ? '[X]' : '[ ]';
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
          .font('Helvetica-Bold').fillColor(isChecked ? '#10B981' : '#64748B').text(`${displayVal}`)
          .moveDown(0.5);
      } else {
        const valor = datos[campo.name] !== undefined && datos[campo.name] !== null && datos[campo.name] !== '' ? datos[campo.name] : 'N/A';
        doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
          .font('Helvetica').fillColor('#334155').text(`${valor}`)
          .moveDown(0.5);
      }
    });

    doc.moveDown(1);
    
    let sectionNum = 3; 

     // Recopilar firmantes adicionales dinámicos
    const firmantesAdicionales = []; 
    
    // Función auxiliar para extraer y parsear firmante de forma segura
    const registrarFirmanteAdicional = (valorStr, rol = 'Firma de Responsabilidad') => {
      const val = String(valorStr || '').trim();
      if (!val) return;
      
      let nombre = val;
      let cedula = '';
      let cargo = '';
      
      try {
        const parsed = JSON.parse(val);
        nombre = parsed.nombre || '';
        cedula = parsed.cedula || '';
        cargo = parsed.cargo || '';
      } catch (e) {
        nombre = val;
      }
      
      if (!nombre) return;
      
      if (!firmantesAdicionales.some(f => f.nombre === nombre)) {
        firmantesAdicionales.push({ nombre, cedula, cargo, rol });
      }
    };

    campos.forEach(campo => {
      const valor = datos[campo.name];
      if (!valor) return;

      if (campo.type === 'firmante') {
        registrarFirmanteAdicional(valor, 'Firma de Responsabilidad');
      } else if (campo.type === 'firmante_seccion') {
        registrarFirmanteAdicional(valor, campo.label);
      } else if (campo.type === 'firmante_list') {
        if (Array.isArray(valor)) {
          valor.forEach(v => {
            registrarFirmanteAdicional(v, 'Firma de Responsabilidad');
          });
        }
      } else if (campo.type === 'grid' || campo.type === 'fixed_grid') {
        const columns = campo.columns || [];
        const firmanteCols = columns.filter(col => typeof col === 'object' && col.type === 'firmante').map(col => col.name);
        const firmanteSecCols = columns.filter(col => typeof col === 'object' && col.type === 'firmante_seccion').map(col => col.name);
        
        if (Array.isArray(valor)) {
          valor.forEach(row => {
            firmanteCols.forEach(colName => {
              registrarFirmanteAdicional(row[colName], 'Firma de Responsabilidad');
            });
            firmanteSecCols.forEach(colName => {
              registrarFirmanteAdicional(row[colName], colName);
            });
          });
        }
      }
    });

    // --- SECCIÓN 3: REVISIÓN Y APROBACIÓN TÉCNICA ---
    const tieneSeguridad = (solicitud.areas_validadoras || []).includes('seguridad');
    const tieneGibdd = (solicitud.areas_validadoras || []).includes('gibdd');
    const tieneGiitrc = (solicitud.areas_validadoras || []).includes('giitrc');

    if (tieneSeguridad || tieneGibdd || tieneGiitrc) {
      checkSpace(120);
      const numStrT = `${sectionNum}. REVISIÓN Y APROBACIÓN TÉCNICA`;
      sectionNum++;
      renderSectionHeader(numStrT);

      // Agrupar los datos de revisión técnica
      const areasTecnicas = [];
      if (tieneSeguridad) {
        const ap = apRes.rows.find(a => a.area === 'seguridad');
        areasTecnicas.push({
          sigla: 'GISICS',
          nombreLargo: 'Gestión Interna de Seguridad Informática y Calidad de Software',
          ap: ap
        });
      }
      if (tieneGibdd) {
        const ap = apRes.rows.find(a => a.area === 'gibdd');
        areasTecnicas.push({
          sigla: 'GIBDD',
          nombreLargo: 'Gestión Interna de Base de Datos',
          ap: ap
        });
      }
      if (tieneGiitrc) {
        const ap = apRes.rows.find(a => a.area === 'giitrc');
        areasTecnicas.push({
          sigla: 'GIITRC',
          nombreLargo: 'Gestión Interna de Infraestructura',
          ap: ap
        });
      }

      areasTecnicas.forEach(item => {
        const ap = item.ap;
        const tecNombre = ap ? (ap.tecnico_nombre || 'N/A') : 'N/A';
        const tecCargo = ap ? (ap.tecnico_cargo || 'N/A') : 'N/A';
        const tecFecha = ap && ap.fecha ? new Date(ap.fecha).toLocaleDateString('es-ES') : 'N/A';
        const tieneObs = ap && ap.observacion ? true : false;
        const obsTexto = ap && ap.observacion ? ap.observacion : 'Sin observaciones';
        const estadoTexto = tieneObs ? 'Aprobado con Observación' : 'Aprobado';

        const obsHeight = doc.heightOfString(obsTexto, { width: 235, fontSize: 8 });

        // Calcular altura de la columna izquierda de forma dinámica
        const revisorHeight = doc.heightOfString(`Revisor: ${tecNombre}`, { width: 230, fontSize: 8 });
        const cargoHeight = doc.heightOfString(`Cargo: ${tecCargo}`, { width: 230, fontSize: 8 });
        const leftColumnHeight = 25 + revisorHeight + 3 + cargoHeight + 3 + 10 + 10;
        
        const rightColumnHeight = 45 + obsHeight + 10;
        const boxHeight = Math.max(65, leftColumnHeight, rightColumnHeight);

        // Validar espacio en la página
        checkSpace(boxHeight + 15);
        const currentCardY = doc.y;

        // Dibujar tarjeta informativa
        doc.roundedRect(50, currentCardY, 512, boxHeight, 4).fill('#F8FAFC');
        doc.lineWidth(1).strokeColor('#E2E8F0').roundedRect(50, currentCardY, 512, boxHeight, 4).stroke();

        // Título del Área
        doc.fontSize(8.5).fillColor('#1E3A8A').font('Helvetica-Bold')
          .text(`${item.nombreLargo} - (${item.sigla})`, 65, currentCardY + 8);

        // Línea divisoria interna
        doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(65, currentCardY + 20).lineTo(547, currentCardY + 20).stroke();

        // Columna Izquierda (Revisor, Cargo y Fecha con flujo relativo para evitar superposiciones)
        doc.x = 65;
        doc.y = currentCardY + 25;
        doc.fontSize(8).fillColor('#0F172A');
        
        doc.font('Helvetica-Bold').text('Revisor: ', { width: 230, continued: true })
           .font('Helvetica').text(tecNombre);
           
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').text('Cargo: ', { width: 230, continued: true })
           .font('Helvetica').text(tecCargo);
           
        doc.moveDown(0.15);
        doc.font('Helvetica-Bold').text('Fecha: ', { width: 230, continued: true })
           .font('Helvetica').text(tecFecha);

        // Columna Derecha (Estado & Observación)
        doc.font('Helvetica-Bold').text('Estado:', 310, currentCardY + 25, { continued: true })
          .font('Helvetica-Bold').fillColor(tieneObs ? '#F59E0B' : '#10B981').text(` ${estadoTexto}`)
          .fillColor('#0F172A')
          .font('Helvetica-Bold').text('Observaciones:', 310, currentCardY + 35);
        
        doc.font('Helvetica').fillColor('#334155')
          .text(obsTexto, 310, currentCardY + 45, { width: 235, height: obsHeight });

        doc.y = currentCardY + boxHeight + 10; // Espaciado después del bloque
      });
    }

    // --- SECCIÓN: REVISIÓN Y APROBACIÓN DE NORMATIVA ---
    const tieneOsi = (solicitud.areas_validadoras || []).includes('osi');
    if (tieneOsi) {
      checkSpace(120);
      const numStrN = `${sectionNum}. REVISIÓN Y APROBACIÓN DE NORMATIVA`;
      sectionNum++;
      renderSectionHeader(numStrN);

      const ap = apRes.rows.find(a => a.area === 'osi');
      const tecNombre = ap ? (ap.tecnico_nombre || 'N/A') : 'N/A';
      const tecCargo = ap ? (ap.tecnico_cargo || 'N/A') : 'N/A';
      const tecFecha = ap && ap.fecha ? new Date(ap.fecha).toLocaleDateString('es-ES') : 'N/A';
      const tieneObs = ap && ap.observacion ? true : false;
      const obsTexto = ap && ap.observacion ? ap.observacion : 'Sin observaciones';
      const estadoTexto = tieneObs ? 'Aprobado con Observación' : 'Aprobado';

      const obsHeight = doc.heightOfString(obsTexto, { width: 235, fontSize: 8 });

      // Calcular altura de la columna izquierda de forma dinámica
      const revisorHeight = doc.heightOfString(`Revisor: ${tecNombre}`, { width: 230, fontSize: 8 });
      const cargoHeight = doc.heightOfString(`Cargo: ${tecCargo}`, { width: 230, fontSize: 8 });
      const leftColumnHeight = 25 + revisorHeight + 3 + cargoHeight + 3 + 10 + 10;
      
      const rightColumnHeight = 45 + obsHeight + 10;
      const boxHeight = Math.max(65, leftColumnHeight, rightColumnHeight);

      // Validar espacio en la página
      checkSpace(boxHeight + 15);
      const currentCardY = doc.y;

      // Dibujar tarjeta informativa
      doc.roundedRect(50, currentCardY, 512, boxHeight, 4).fill('#F8FAFC');
      doc.lineWidth(1).strokeColor('#E2E8F0').roundedRect(50, currentCardY, 512, boxHeight, 4).stroke();

      // Título del Área
      doc.fontSize(8.5).fillColor('#1E3A8A').font('Helvetica-Bold')
        .text('Oficina de Seguridad de la Información - (OSI)', 65, currentCardY + 8);

      // Línea divisoria interna
      doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(65, currentCardY + 20).lineTo(547, currentCardY + 20).stroke();

      // Columna Izquierda (Revisor, Cargo y Fecha con flujo relativo)
      doc.x = 65;
      doc.y = currentCardY + 25;
      doc.fontSize(8).fillColor('#0F172A');
      
      doc.font('Helvetica-Bold').text('Revisor: ', { width: 230, continued: true })
         .font('Helvetica').text(tecNombre);
         
      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').text('Cargo: ', { width: 230, continued: true })
         .font('Helvetica').text(tecCargo);
         
      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').text('Fecha: ', { width: 230, continued: true })
         .font('Helvetica').text(tecFecha);

      // Columna Derecha (Estado & Observación)
      doc.font('Helvetica-Bold').text('Estado:', 310, currentCardY + 25, { continued: true })
        .font('Helvetica-Bold').fillColor(tieneObs ? '#F59E0B' : '#10B981').text(` ${estadoTexto}`)
        .fillColor('#0F172A')
        .font('Helvetica-Bold').text('Observaciones:', 310, currentCardY + 35);
      
      doc.font('Helvetica').fillColor('#334155')
        .text(obsTexto, 310, currentCardY + 45, { width: 235, height: obsHeight });

      doc.y = currentCardY + boxHeight + 10; // Espaciado después del bloque
    }

    // --- SECCIÓN 4: SOLICITANTE Y ADICIONALES ---
    const firmasSolicitud = [
      {
        rol: 'Firma del Solicitante',
        nombre: solicitud.solicitante_nombre,
        cedula: solicitud.solicitante_cedula,
        cargo: solicitud.solicitante_cargo
      }
    ];

    firmantesAdicionales.forEach(f => {
      firmasSolicitud.push({
        rol: f.rol || 'Firma de Responsabilidad',
        nombre: f.nombre,
        cedula: f.cedula,
        cargo: f.cargo
      });
    });

    checkSpace(190);
    const numStr1 = `${sectionNum}. FIRMAS DE RESPONSABILIDAD`;
    sectionNum++;
    
    renderSectionHeader(numStr1);

    let currentYF = doc.y + 105;
    const colWidthS = 140;
    const colGapS = 30;
    const startXS = 65;

    for (let i = 0; i < firmasSolicitud.length; i += 3) {
      const chunk = firmasSolicitud.slice(i, i + 3);
      
      if (doc.y + 170 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        currentYF = doc.y + 105;
      } else {
        currentYF = doc.y + 105;
      }

      // Dibujar línea de firma
      doc.lineWidth(1).strokeColor('#CBD5E1');
      chunk.forEach((firma, index) => {
        const x = startXS + index * (colWidthS + colGapS);
        doc.moveTo(x, currentYF).lineTo(x + colWidthS, currentYF).stroke();
      });

      const textYF = currentYF + 5;
      chunk.forEach((firma, index) => {
        const x = startXS + index * (colWidthS + colGapS);
        doc.fontSize(8).fillColor('#1E3A8A').font('Helvetica-Bold')
          .text(firma.rol, x, textYF, { width: colWidthS, align: 'center' });
        doc.font('Helvetica').fillColor('#0F172A')
          .text(firma.nombre, x, textYF + 12, { width: colWidthS, align: 'center' });
        
        let det = '';
        if (firma.cedula) det += `C.I. ${firma.cedula}`;
        if (firma.cargo) det += (det ? ' - ' : '') + firma.cargo;
        
        doc.font('Helvetica-Oblique').fillColor('#475569')
          .text(det || 'Personal Autorizado', x, textYF + 24, { width: colWidthS, align: 'center' });
      });

      doc.y = currentYF + 65;
    }
    doc.moveDown(1);

    // OSI ahora es parte de la Sección: Revisión y Aprobación de Normativa, dibujada arriba.

    // --- SECCIÓN: APROBADO DTIC ---
    const tieneDirector = (solicitud.areas_validadoras || []).includes('director');
    if (tieneDirector) {
      checkSpace(170);
      const numStr5 = `${sectionNum}. APROBADO DTIC`;
      sectionNum++;
      
      renderSectionHeader(numStr5);

      const ap = apRes.rows.find(a => a.area === 'director');
      const tecNombre = directorSigner ? directorSigner.nombre : (ap ? (ap.tecnico_nombre || 'N/A') : 'N/A');
      const tecCedula = directorSigner ? directorSigner.cedula : (ap ? (ap.tecnico_cedula || 'N/A') : 'N/A');

      const boxY = doc.y;
      const boxHeight = 150;

      // Tarjeta contenedora de Aprobación
      doc.roundedRect(50, boxY, 512, boxHeight, 4).fill('#F8FAFC');
      doc.lineWidth(1).strokeColor('#CBD5E1').roundedRect(50, boxY, 512, boxHeight, 4).stroke();

      // Rol del Aprobador
      doc.fontSize(8.5).fillColor('#1E3A8A').font('Helvetica-BoldOblique')
        .text('Director de Tecnologías de la Información y Comunicación', 65, boxY + 8);

      // Línea divisoria interna
      doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(65, boxY + 20).lineTo(547, boxY + 20).stroke();

      // Columna Izquierda (Firma Digital con espacio amplio y sin redundancias)
      const colLeftX = 65;
      doc.fontSize(8).fillColor('#0F172A').font('Helvetica')
        .font('Helvetica-Bold').text('Firma Digital / Electrónica:', colLeftX, boxY + 28)
        .font('Helvetica').text(`Nombre: ${tecNombre} (C.I. ${tecCedula})`, colLeftX, boxY + 125);

      doc.y = boxY + boxHeight;
      doc.moveDown(1.5);
    }

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor('#64748B')
      .text('Este documento digital fue generado y aprobado en el SVT bajo políticas internas de seguridad.', { align: 'center' });

}


// MIDDLEWARE PARA VALIDAR QUE EL USUARIO ES ADMIN
function esAdmin(req, res, next) {
  if (req.usuario && req.usuario.rol === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado. Se requieren privilegios de administrador.' });
  }
}

// ENDPOINTS DE ADMINISTRACIÓN

// 1. LISTAR USUARIOS
app.get('/api/admin/usuarios', autenticar, esAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT id, username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos FROM usuarios ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
});

// 2. CREAR USUARIO
app.post('/api/admin/usuarios', autenticar, esAdmin, async (req, res) => {
  const { username, password, nombre, rol, area, cedula, cargo, direccion_proyecto, firma_documentos } = req.body;
  if (!username || !password || !nombre || !rol || !cedula || !cargo) {
    return res.status(400).json({ error: 'Datos incompletos para crear el usuario.' });
  }
  try {
    const isOsi = rol === 'tecnico' && area === 'osi';
    const isFirma = isOsi ? (firma_documentos === true || firma_documentos === 'true') : false;

    const result = await db.query(
      'INSERT INTO usuarios (username, password, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos',
      [username, password, nombre, rol, rol === 'tecnico' ? area : null, cedula, cargo, username, rol === 'solicitante' ? direccion_proyecto : null, isFirma]
    );

    const newUser = result.rows[0];
    if (isFirma) {
      // Exclusividad: apagar firma en otros OSI
      await db.query("UPDATE usuarios SET firma_documentos = FALSE WHERE area = 'osi' AND id != $1", [newUser.id]);
    }

    res.json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el usuario. El nombre de usuario/correo podría estar duplicado.' });
  }
});

// 3. EDITAR USUARIO
app.put('/api/admin/usuarios/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, nombre, rol, area, cedula, cargo, direccion_proyecto, firma_documentos } = req.body;
  if (!username || !nombre || !rol || !cedula || !cargo) {
    return res.status(400).json({ error: 'Datos incompletos para actualizar el usuario.' });
  }
  try {
    const isOsi = rol === 'tecnico' && area === 'osi';
    const isFirma = isOsi ? (firma_documentos === true || firma_documentos === 'true') : false;

    let query;
    let params;
    if (password && password.trim() !== '') {
      query = 'UPDATE usuarios SET username = $1, password = $2, nombre = $3, rol = $4, area = $5, cedula = $6, cargo = $7, correo = $8, direccion_proyecto = $9, firma_documentos = $10 WHERE id = $11 RETURNING id, username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos';
      params = [username, password, nombre, rol, rol === 'tecnico' ? area : null, cedula, cargo, username, rol === 'solicitante' ? direccion_proyecto : null, isFirma, id];
    } else {
      query = 'UPDATE usuarios SET username = $1, nombre = $2, rol = $3, area = $4, cedula = $5, cargo = $6, correo = $7, direccion_proyecto = $8, firma_documentos = $9 WHERE id = $10 RETURNING id, username, nombre, rol, area, cedula, cargo, correo, direccion_proyecto, firma_documentos';
      params = [username, nombre, rol, rol === 'tecnico' ? area : null, cedula, cargo, username, rol === 'solicitante' ? direccion_proyecto : null, isFirma, id];
    }
    const result = await db.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const updatedUser = result.rows[0];
    if (isFirma) {
      // Exclusividad: apagar firma en otros OSI
      await db.query("UPDATE usuarios SET firma_documentos = FALSE WHERE area = 'osi' AND id != $1", [id]);
    }

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

// 4. ELIMINAR USUARIO
app.delete('/api/admin/usuarios/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM usuarios WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ message: 'Usuario eliminado con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar el usuario.' });
  }
});

// 5. EDITAR PLANTILLA DE FORMULARIO (TIPO DE SOLICITUD)
app.put('/api/admin/tipos-solicitud/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  const { codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso } = req.body;
  if (!codigo || !nombre || !descripcion || !campos || !areas_validadoras) {
    return res.status(400).json({ error: 'Datos incompletos de la plantilla.' });
  }
  try {
    const camposJSON = typeof campos === 'string' ? campos : JSON.stringify(campos);
    const areasJSON = typeof areas_validadoras === 'string' ? areas_validadoras : JSON.stringify(areas_validadoras);
    const codigoClean = codigo.trim().toUpperCase();

    const result = await db.query(
      'UPDATE tipos_solicitud SET codigo = $1, nombre = $2, descripcion = $3, campos = $4::jsonb, areas_validadoras = $5::jsonb, mail_destinatario = $6, mail_cc = $7, mail_asunto = $8, mail_cuerpo = $9, mail_progreso = $10 WHERE id = $11 RETURNING *',
      [codigoClean, nombre, descripcion, camposJSON, areasJSON, mail_destinatario || null, mail_cc || null, mail_asunto || null, mail_cuerpo || null, mail_progreso !== false, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plantilla de formulario no encontrada.' });
    }

    // --- SINCRONIZAR Y REINICIAR APROBACIONES PARA SOLICITUDES ACTIVAS (EN REVISIÓN U OBSERVADAS) ---
    const activeSolsRes = await db.query(
      "SELECT id FROM solicitudes WHERE tipo_solicitud_id = $1 AND estado IN ('en_revision', 'observado')",
      [id]
    );

    const parsedAreas = Array.isArray(areas_validadoras) ? areas_validadoras : JSON.parse(areas_validadoras);

    for (const sol of activeSolsRes.rows) {
      // 1. Eliminar aprobaciones de áreas que ya no son validadoras en esta plantilla
      await db.query(
        "DELETE FROM aprobaciones WHERE solicitud_id = $1 AND NOT (area = ANY($2::text[]))",
        [sol.id, parsedAreas]
      );

      // 2. Reiniciar a pendiente todas las aprobaciones vigentes
      await inicializarAprobaciones(sol.id, parsedAreas);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la plantilla del formulario: ' + error.message });
  }
});

// 6. CREAR PLANTILLA DE FORMULARIO (TIPO DE SOLICITUD)
app.post('/api/admin/tipos-solicitud', autenticar, esAdmin, async (req, res) => {
  const { codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso } = req.body;
  if (!codigo || !nombre || !descripcion || !campos || !areas_validadoras) {
    return res.status(400).json({ error: 'Datos incompletos de la plantilla.' });
  }
  try {
    const camposJSON = typeof campos === 'string' ? campos : JSON.stringify(campos);
    const areasJSON = typeof areas_validadoras === 'string' ? areas_validadoras : JSON.stringify(areas_validadoras);
    const codigoClean = codigo.trim().toUpperCase();

    const result = await db.query(
      'INSERT INTO tipos_solicitud (codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10) RETURNING *',
      [codigoClean, nombre, descripcion, camposJSON, areasJSON, mail_destinatario || null, mail_cc || null, mail_asunto || null, mail_cuerpo || null, mail_progreso !== false]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear la plantilla del formulario: ' + error.message });
  }
});

// 6.b PREVISUALIZAR PLANTILLA DE FORMULARIO EN PDF (MOCK)
app.post('/api/admin/tipos-solicitud/preview-pdf', autenticar, esAdmin, async (req, res) => {
  const { codigo, nombre, descripcion, campos, areas_validadoras } = req.body;
  if (!codigo || !nombre || !campos || !areas_validadoras) {
    return res.status(400).json({ error: 'Datos del formulario incompletos para previsualización.' });
  }

  try {
    const parsedCampos = Array.isArray(campos) ? campos : JSON.parse(campos);
    const parsedAreas = Array.isArray(areas_validadoras) ? areas_validadoras : JSON.parse(areas_validadoras);

    // Construir datos mock según los tipos de campos
    const mockDatos = {};
    parsedCampos.forEach(campo => {
      if (campo.type === 'title' || campo.type === 'subtitle' || campo.type === 'paragraph' || campo.type === 'firmante_seccion') {
        return;
      }
      
      if (campo.type === 'checkbox') {
        mockDatos[campo.name] = 'X';
      } else if (campo.type === 'date') {
        mockDatos[campo.name] = new Date().toLocaleDateString('es-ES');
      } else if (campo.type === 'identificacion') {
        mockDatos[campo.name] = '1799999999';
      } else if (campo.type === 'firmante') {
        mockDatos[campo.name] = JSON.stringify({
          nombre: `Ing. Responsable de ${campo.label}`,
          cedula: '1799999999',
          cargo: `Jefe / Líder de ${campo.label}`
        });
      } else if (campo.type === 'firmante_list') {
        mockDatos[campo.name] = [
          JSON.stringify({
            nombre: 'Responsable Adicional 1',
            cedula: '1799999999',
            cargo: 'Cargo de Responsabilidad'
          })
        ];
      } else if (campo.type === 'text_list') {
        mockDatos[campo.name] = ['Opción de Ejemplo A', 'Opción de Ejemplo B'];
      } else if (campo.type === 'grid' || campo.type === 'fixed_grid') {
        // Generar una fila de ejemplo para grillas
        const row = {};
        const isLegacyFixed = campo.type === 'fixed_grid' && Array.isArray(campo.rows) && campo.rows.length > 0;
        let cols = campo.columns || [];
        if (isLegacyFixed) {
          const rowLabelName = campo.row_label || 'Descripción / Fila';
          cols = [{ name: rowLabelName, type: 'text' }, ...cols];
        }

        cols.forEach(col => {
          const colName = typeof col === 'object' ? col.name : col;
          const colType = typeof col === 'object' ? col.type : 'text';

          if (colType === 'checkbox') {
            row[colName] = 'X';
          } else if (colType === 'date') {
            row[colName] = new Date().toLocaleDateString('es-ES');
          } else if (colType === 'identificacion') {
            row[colName] = '1799999999';
          } else if (colType === 'firmante' || colType === 'firmante_seccion') {
            row[colName] = JSON.stringify({
              nombre: 'Funcionario en Grilla',
              cedula: '1799999999',
              cargo: 'Cargo en Grilla'
            });
          } else {
            row[colName] = 'Ejemplo de registro';
          }
        });

        if (isLegacyFixed) {
          // Si es un fixed_grid legacy, generar mock data para las filas fijas configuradas
          const rowLabelName = campo.row_label || 'Descripción / Fila';
          mockDatos[campo.name] = campo.rows.map(rName => {
            return { ...row, [rowLabelName]: rName };
          });
        } else {
          // Grid dinámico o fixed_grid nuevo sin filas fijas: generar exactamente 1 fila
          mockDatos[campo.name] = [row];
        }
      } else {
        // text, short_text, long_text, dropdown, etc.
        mockDatos[campo.name] = 'Texto de ejemplo del solicitante';
      }
    });

    // Crear la solicitud mock
    const mockSolicitud = {
      id: 0,
      tipo_codigo: codigo,
      tipo_nombre: nombre,
      fecha_creacion: new Date(),
      solicitante_nombre: 'ADMINISTRADOR (VISTA PREVIA)',
      solicitante_cedula: '9999999999',
      solicitante_cargo: 'ADMINISTRADOR DE SISTEMAS / PLANTILLAS',
      solicitante_correo: 'admin.preview@msp.gob.ec',
      solicitante_direccion_proyecto: 'DIRECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN Y COMUNICACIONES',
      campos: parsedCampos,
      areas_validadoras: parsedAreas,
      datos: mockDatos
    };

    // Crear aprobaciones mock
    const mockAprobaciones = [];
    parsedAreas.forEach(area => {
      if (area === 'director') return; // Se maneja por separado como directorSigner
      
      let sigla = area.toUpperCase();
      let nombreLargo = area;
      if (area === 'seguridad') {
        sigla = 'GISICS';
        nombreLargo = 'Gestión Interna de Seguridad de la Información y Calidad de Software';
      } else if (area === 'gibdd') {
        sigla = 'GIBDD';
        nombreLargo = 'Gestión Interna de Base de Datos';
      } else if (area === 'giitrc') {
        sigla = 'GIITRC';
        nombreLargo = 'Gestión Interna de Infraestructura';
      } else if (area === 'osi') {
        sigla = 'OSI';
        nombreLargo = 'Oficina de Seguridad de la Información';
      }

      mockAprobaciones.push({
        area,
        tecnico_nombre: `VALIDADOR DE ${sigla}`,
        tecnico_cargo: `Especialista en ${nombreLargo}`,
        fecha: new Date(),
        observacion: 'Aprobación automática de previsualización.'
      });
    });

    const mockDirectorSigner = parsedAreas.includes('director') ? {
      nombre: 'DIRECTOR DE TICS (VISTA PREVIA)',
      cedula: '1799999999',
      cargo: 'Director de Tecnologías de la Información y Comunicación'
    } : null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PREVIEW_${codigo.toUpperCase()}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    generarReportePDFInternal(doc, mockSolicitud, mockAprobaciones, mockDirectorSigner);
    doc.end();
  } catch (error) {
    console.error('Error al generar la previsualización del PDF:', error);
    res.status(500).json({ error: 'Error al generar la previsualización del PDF: ' + error.message });
  }
});


// 7. ELIMINAR PLANTILLA DE FORMULARIO (TIPO DE SOLICITUD)
app.delete('/api/admin/tipos-solicitud/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM tipos_solicitud WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Plantilla de formulario no encontrada.' });
    }
    res.json({ message: 'Plantilla de formulario eliminada con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar la plantilla de formulario.' });
  }
});

// 8. ENVIAR CORREO DE PRUEBA DESDE EL ADMINISTRADOR
app.post('/api/admin/enviar-correo-prueba', autenticar, esAdmin, async (req, res) => {
  const { destinatario, cc, asunto, cuerpo } = req.body;

  if (!destinatario || !asunto || !cuerpo) {
    return res.status(400).json({ error: 'Destinatario, asunto y cuerpo del mensaje son requeridos.' });
  }

  try {
    const mailTransporter = await obtenerTransporter();
    
    // Configurar remitente
    const fromAddress = process.env.SMTP_FROM || `"SVT MSP - Pruebas" <${mailTransporter.options.auth.user}>`;

    const mailOptions = {
      from: fromAddress,
      to: destinatario,
      subject: asunto,
      text: cuerpo,
      html: `<div style="font-family: Arial, sans-serif; color: #0F172A; line-height: 1.6; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px; background-color: #FFFFFF; max-width: 600px; margin: auto;">
               <h3 style="color: #1E3A8A; border-bottom: 2px solid #0EA5E9; padding-bottom: 10px; margin-top: 0;">Notificación SVT - Correo de Prueba</h3>
               <p>${cuerpo.replace(/\n/g, '<br>')}</p>
               <br>
               <hr style="border: 0; border-top: 1px solid #E2E8F0;">
               <p style="font-size: 0.8rem; color: #64748B; font-style: italic; margin-bottom: 0;">Este es un correo automático de prueba generado por el Sistema de Validación Técnica (SVT).</p>
             </div>`
    };

    if (cc && cc.trim() !== '') {
      mailOptions.cc = cc.split(',').map(email => email.trim());
    }

    console.log(`Enviando correo de prueba a ${destinatario}...`);
    const info = await mailTransporter.sendMail(mailOptions);
    console.log('Mensaje enviado: %s', info.messageId);

    const isTestMode = mailTransporter.options.host === 'smtp.ethereal.email';
    const previewUrl = isTestMode ? nodemailer.getTestMessageUrl(info) : null;

    res.json({
      message: isTestMode
        ? 'Correo de prueba enviado con éxito (Modo Simulación Ethereal).'
        : 'Correo de prueba enviado con éxito a través del servidor SMTP configurado.',
      previewUrl
    });
  } catch (error) {
    console.error('Error al enviar correo de prueba:', error);
    res.status(500).json({ error: 'Error al enviar el correo de prueba: ' + error.message });
  }
});

db.query(`
  -- Alterar usuarios para añadir nuevos campos
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cedula VARCHAR(20) DEFAULT '';
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(100) DEFAULT '';
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo VARCHAR(100) DEFAULT '';
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS direccion_proyecto VARCHAR(150) DEFAULT '';
  ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS firma_documentos BOOLEAN DEFAULT FALSE;

  -- Alterar aprobaciones para añadir observacion de aprobacion
  ALTER TABLE aprobaciones ADD COLUMN IF NOT EXISTS observacion TEXT NULL;

  -- Relajar restricciones CHECK de áreas para incluir 'osi' y 'director'
  ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_area_check;
  ALTER TABLE usuarios ADD CONSTRAINT usuarios_area_check CHECK (area IN ('seguridad', 'gibdd', 'giitrc', 'osi', 'director'));

  -- Alterar aprobaciones para añadir restricciones CHECK si es necesario
  ALTER TABLE aprobaciones DROP CONSTRAINT IF EXISTS aprobaciones_area_check;
  ALTER TABLE aprobaciones ADD CONSTRAINT aprobaciones_area_check CHECK (area IN ('seguridad', 'gibdd', 'giitrc', 'osi', 'director'));

  -- Actualizar registros de semilla antiguos si existen y aún no tienen asignado correo
  UPDATE usuarios SET cedula = '1756789012', cargo = 'Director de Tecnologías', correo = 'admin1@msp.gob.ec', username = 'admin1@msp.gob.ec' WHERE username = 'admin1';
  UPDATE usuarios SET cedula = '1712345678', cargo = 'Analista de Servicios', correo = 'solicitante1@msp.gob.ec', username = 'solicitante1@msp.gob.ec' WHERE username = 'solicitante1';
  UPDATE usuarios SET cedula = '1723456789', cargo = 'Especialista de Seguridad', correo = 'seguridad1@msp.gob.ec', username = 'seguridad1@msp.gob.ec' WHERE username = 'seguridad1';
  UPDATE usuarios SET cedula = '1734567890', cargo = 'Administrador de Base de Datos', correo = 'gibdd1@msp.gob.ec', username = 'gibdd1@msp.gob.ec' WHERE username = 'gibdd1' OR username = 'base1';
  UPDATE usuarios SET cedula = '1745678901', cargo = 'Especialista en Telecomunicaciones', correo = 'giitrc1@msp.gob.ec', username = 'giitrc1@msp.gob.ec' WHERE username = 'giitrc1' OR username = 'infra1';

  -- Sembrar usuario OSI si no existe
  INSERT INTO usuarios (username, password, nombre, rol, area, cedula, cargo, correo, firma_documentos)
  VALUES ('osi1@msp.gob.ec', 'osi123', 'Oficial de Seguridad OSI', 'tecnico', 'osi', '1765432109', 'Oficial de Seguridad de la Información', 'osi1@msp.gob.ec', TRUE)
  ON CONFLICT (username) DO NOTHING;

  -- Asegurar que el usuario semilla de la OSI tenga firma_documentos = TRUE
  UPDATE usuarios SET firma_documentos = TRUE WHERE username = 'osi1@msp.gob.ec' AND (firma_documentos IS NOT TRUE);

  -- Sembrar usuario Director si no existe
  INSERT INTO usuarios (username, password, nombre, rol, area, cedula, cargo, correo)
  VALUES ('director1@msp.gob.ec', 'director123', 'Director DTIC MSP', 'tecnico', 'director', '1798765432', 'Director de Tecnologías de la Información y Comunicación', 'director1@msp.gob.ec')
  ON CONFLICT (username) DO NOTHING;

  -- Ajustar longitud del username
  ALTER TABLE usuarios ALTER COLUMN username TYPE VARCHAR(100);

  -- Relajar el CHECK constraint de observaciones.area
  ALTER TABLE observaciones DROP CONSTRAINT IF EXISTS observaciones_area_check;
  ALTER TABLE observaciones ADD CONSTRAINT observaciones_area_check CHECK (area IN ('seguridad', 'gibdd', 'giitrc', 'solicitante', 'admin', 'osi', 'director'));

  -- Migración para tipos_solicitud.codigo
  ALTER TABLE tipos_solicitud ADD COLUMN IF NOT EXISTS codigo VARCHAR(20) DEFAULT '';
  UPDATE tipos_solicitud SET codigo = 'ACC-RED' WHERE id = 1 AND (codigo = '' OR codigo IS NULL);
  UPDATE tipos_solicitud SET codigo = 'USR-BD' WHERE id = 2 AND (codigo = '' OR codigo IS NULL);
  UPDATE tipos_solicitud SET codigo = 'SERV-APP' WHERE id = 3 AND (codigo = '' OR codigo IS NULL);
  UPDATE tipos_solicitud SET codigo = 'CONT-EXT' WHERE id = 5 AND (codigo = '' OR codigo IS NULL);
  UPDATE tipos_solicitud SET codigo = 'FORM-' || id WHERE codigo = '' OR codigo IS NULL;

  ALTER TABLE tipos_solicitud DROP CONSTRAINT IF EXISTS tipos_solicitud_codigo_key;
  ALTER TABLE tipos_solicitud ADD CONSTRAINT tipos_solicitud_codigo_key UNIQUE (codigo);
  ALTER TABLE tipos_solicitud ALTER COLUMN codigo SET NOT NULL;

  -- Alterar tipos_solicitud para añadir columnas de configuración de correo automático
  ALTER TABLE tipos_solicitud ADD COLUMN IF NOT EXISTS mail_destinatario VARCHAR(255) NULL;
  ALTER TABLE tipos_solicitud ADD COLUMN IF NOT EXISTS mail_cc VARCHAR(255) NULL;
  ALTER TABLE tipos_solicitud ADD COLUMN IF NOT EXISTS mail_asunto VARCHAR(255) NULL;
  ALTER TABLE tipos_solicitud ADD COLUMN IF NOT EXISTS mail_cuerpo TEXT NULL;
  ALTER TABLE tipos_solicitud ADD COLUMN IF NOT EXISTS mail_progreso BOOLEAN DEFAULT TRUE;

  -- Retroalimentar aprobaciones OSI a solicitudes previas si la plantilla lo requiere hoy
  INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
  SELECT 
    s.id, 
    'osi', 
    'aprobado', 
    (SELECT id FROM usuarios WHERE area = 'osi' AND rol = 'tecnico' LIMIT 1), 
    s.fecha_actualizacion
  FROM solicitudes s
  JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
  WHERE ts.areas_validadoras @> '["osi"]'::jsonb AND s.estado = 'aprobado'
  ON CONFLICT (solicitud_id, area) DO NOTHING;

  -- Retroalimentar aprobaciones Director a solicitudes previas si la plantilla lo requiere hoy
  INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
  SELECT 
    s.id, 
    'director', 
    'aprobado', 
    (SELECT id FROM usuarios WHERE area = 'director' AND rol = 'tecnico' LIMIT 1), 
    s.fecha_actualizacion
  FROM solicitudes s
  JOIN tipos_solicitud ts ON s.tipo_solicitud_id = ts.id
  WHERE ts.areas_validadoras @> '["director"]'::jsonb
  ON CONFLICT (solicitud_id, area) DO NOTHING;
`).then(() => {
  console.log('Migración de base de datos exitosa: columnas de usuario, códigos de formulario, semillas, restricciones OSI y constraints listos.');
}).catch(err => {
  console.error('Error al aplicar la migración de la base de datos:', err);
});

// Arrancar Servidor
app.listen(PORT, () => {
  console.log(`Servidor SVT corriendo en http://localhost:${PORT}`);
});
