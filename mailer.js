const nodemailer = require('nodemailer');
const db = require('./db');

let transporter = null;

// Diccionario de Nombres Oficiales de Áreas
const NOMBRES_AREAS = {
  seguridad: 'Gestión Interna de Seguridad Informática y Calidad de Software - (GISICS)',
  gibdd: 'Gestión Interna de Base de Datos - (GIBD)',
  giitrc: 'Gestión Interna de Infraestructura - (GIITRC)',
  osi: 'Oficial de Seguridad de la Información - (OSI)',
  director: 'Director DTIC MSP'
};

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
             ts.mail_progreso, ts.mail_cc
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

    // Obtener los correos electrónicos de los técnicos asignados a la solicitud
    const tQuery = `
      SELECT DISTINCT u.correo 
      FROM aprobaciones a
      JOIN usuarios u ON a.tecnico_id = u.id
      WHERE a.solicitud_id = $1 AND a.tecnico_id IS NOT NULL AND u.correo IS NOT NULL AND u.correo != ''
    `;
    const tRes = await db.query(tQuery, [solicitudId]);

    const ccEmails = [];
    const seenEmails = new Set();
    const mainRecipient = row.solicitante_correo.trim().toLowerCase();

    // 1. Agregar correos estáticos configurados en la plantilla
    if (row.mail_cc && row.mail_cc.trim() !== '') {
      row.mail_cc.split(',').forEach(email => {
        const cleaned = email.trim();
        const lower = cleaned.toLowerCase();
        if (cleaned && lower !== mainRecipient && !seenEmails.has(lower)) {
          seenEmails.add(lower);
          ccEmails.push(cleaned);
        }
      });
    }

    // 2. Agregar correos de los técnicos asignados
    tRes.rows.forEach(tRow => {
      const cleaned = tRow.correo.trim();
      const lower = cleaned.toLowerCase();
      if (cleaned && lower !== mainRecipient && !seenEmails.has(lower)) {
        seenEmails.add(lower);
        ccEmails.push(cleaned);
      }
    });

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

    if (ccEmails.length > 0) {
      mailOptions.cc = ccEmails;
    }

    console.log(`[Progreso] Enviando correo de progreso (${tipoEvento}) para solicitud ${row.tipo_codigo}-${row.id} a ${row.solicitante_correo}${ccEmails.length > 0 ? ' con CC a ' + ccEmails.join(', ') : ''}...`);
    const info = await mailTransporter.sendMail(mailOptions);
    console.log('[Progreso] Mensaje de progreso enviado con ID: %s', info.messageId);
  } catch (error) {
    console.error('Error al enviar correo automático de progreso de solicitud:', error);
  }
}

module.exports = {
  obtenerTransporter,
  enviarCorreoNuevaSolicitud,
  enviarCorreoProgresoSolicitud
};
