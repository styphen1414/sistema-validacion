const express = require('express');
const router = express.Router();
const usuarioService = require('../services/usuarioService');
const mailer = require('../mailer');
const pdfGenerator = require('../pdfGenerator');
const { autenticar, esAdmin } = require('../middlewares/auth');
const nodemailer = require('nodemailer');
const { inicializarAprobaciones } = require('../dbHelper');
const { hashPassword } = require('../security');

// 1. LISTAR USUARIOS
router.get('/usuarios', autenticar, esAdmin, async (req, res) => {
  try {
    const usuarios = await usuarioService.listarUsuarios();
    res.json(usuarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
});

// 2. CREAR USUARIO
router.post('/usuarios', autenticar, esAdmin, async (req, res) => {
  const { username, password, nombre, rol, area, cedula, cargo, direccion_proyecto, firma_documentos, activo } = req.body;
  if (!username || !password || !nombre || !rol || !cedula || !cargo) {
    return res.status(400).json({ error: 'Datos incompletos para crear el usuario.' });
  }
  try {
    const isOsi = rol === 'tecnico' && area === 'osi';
    const isFirma = isOsi ? (firma_documentos === true || firma_documentos === 'true') : false;
    const userActivo = activo !== false && activo !== 'false';

    const newUser = await usuarioService.crearUsuario({
      password: hashPassword(password),
      nombre,
      rol,
      area,
      cedula,
      cargo,
      correo: username,
      direccion_proyecto,
      firma_documentos: isFirma,
      activo: userActivo
    });

    if (isFirma) {
      // Exclusividad: apagar firma en otros OSI
      await usuarioService.desactivarFirmasOtrosOsi(newUser.id);
    }

    res.json(newUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear el usuario. El correo electrónico podría estar duplicado.' });
  }
});

// 3. EDITAR USUARIO
router.put('/usuarios/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, nombre, rol, area, cedula, cargo, direccion_proyecto, firma_documentos, activo } = req.body;
  if (!username || !nombre || !rol || !cedula || !cargo) {
    return res.status(400).json({ error: 'Datos incompletos para actualizar el usuario.' });
  }
  try {
    const isOsi = rol === 'tecnico' && area === 'osi';
    const isFirma = isOsi ? (firma_documentos === true || firma_documentos === 'true') : false;
    const userActivo = activo !== false && activo !== 'false';

    const userData = {
      nombre,
      rol,
      area,
      cedula,
      cargo,
      correo: username,
      direccion_proyecto,
      firma_documentos: isFirma,
      activo: userActivo
    };

    if (password && password.trim() !== '') {
      userData.password = hashPassword(password);
    }

    const updatedUser = await usuarioService.actualizarUsuario(id, userData);
    if (!updatedUser) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    if (isFirma) {
      // Exclusividad: apagar firma en otros OSI
      await usuarioService.desactivarFirmasOtrosOsi(id);
    }

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

// 4. ELIMINAR (DESACTIVAR) USUARIO Y LIMPIAR SOLICITUDES NO APROBADAS
router.delete('/usuarios/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const deactivatedId = await usuarioService.desactivarUsuario(id);
    if (!deactivatedId) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ message: 'Usuario desactivado con éxito y sus solicitudes no aprobadas fueron depuradas.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al desactivar el usuario.' });
  }
});

// 4.b ACTIVAR USUARIO
router.post('/usuarios/:id/activar', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const activatedUser = await usuarioService.activarUsuario(id);
    if (!activatedUser) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json({ message: 'Usuario activado con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al activar el usuario.' });
  }
});

// 5. EDITAR PLANTILLA DE FORMULARIO (TIPO DE SOLICITUD)
router.put('/tipos-solicitud/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  const { codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso } = req.body;
  if (!codigo || !nombre || !descripcion || !campos || !areas_validadoras) {
    return res.status(400).json({ error: 'Datos incompletos de la plantilla.' });
  }

  try {
    const camposJSON = typeof campos === 'string' ? campos : JSON.stringify(campos);
    const areasJSON = typeof areas_validadoras === 'string' ? areas_validadoras : JSON.stringify(areas_validadoras);
    const codigoClean = codigo.trim().toUpperCase();

    const updatedTemplate = await usuarioService.actualizarTipoSolicitud(id, {
      codigo: codigoClean,
      nombre,
      descripcion,
      campos: camposJSON,
      areas_validadoras: areasJSON,
      mail_destinatario: mail_destinatario || null,
      mail_cc: mail_cc || null,
      mail_asunto: mail_asunto || null,
      mail_cuerpo: mail_cuerpo || null,
      mail_progreso: mail_progreso !== false
    }, inicializarAprobaciones);

    if (!updatedTemplate) {
      return res.status(404).json({ error: 'Plantilla de formulario no encontrada.' });
    }

    res.json(updatedTemplate);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la plantilla del formulario: ' + error.message });
  }
});

// 6. CREAR PLANTILLA DE FORMULARIO (TIPO DE SOLICITUD)
router.post('/tipos-solicitud', autenticar, esAdmin, async (req, res) => {
  const { codigo, nombre, descripcion, campos, areas_validadoras, mail_destinatario, mail_cc, mail_asunto, mail_cuerpo, mail_progreso } = req.body;
  if (!codigo || !nombre || !descripcion || !campos || !areas_validadoras) {
    return res.status(400).json({ error: 'Datos incompletos de la plantilla.' });
  }
  try {
    const camposJSON = typeof campos === 'string' ? campos : JSON.stringify(campos);
    const areasJSON = typeof areas_validadoras === 'string' ? areas_validadoras : JSON.stringify(areas_validadoras);
    const codigoClean = codigo.trim().toUpperCase();

    const newTemplate = await usuarioService.crearTipoSolicitud({
      codigo: codigoClean,
      nombre,
      descripcion,
      campos: camposJSON,
      areas_validadoras: areasJSON,
      mail_destinatario: mail_destinatario || null,
      mail_cc: mail_cc || null,
      mail_asunto: mail_asunto || null,
      mail_cuerpo: mail_cuerpo || null,
      mail_progreso: mail_progreso !== false
    });

    res.json(newTemplate);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear la plantilla del formulario: ' + error.message });
  }
});

// 6.b PREVISUALIZAR PLANTILLA DE FORMULARIO EN PDF (MOCK)
router.post('/tipos-solicitud/preview-pdf', autenticar, esAdmin, async (req, res) => {
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
      } else if (campo.type === 'date_range') {
        mockDatos[campo.name] = JSON.stringify({
          desde: new Date().toISOString().split('T')[0],
          hasta: new Date(Date.now() + 86400000).toISOString().split('T')[0]
        });
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
      } else if (campo.type === 'grid' || campo.type === 'fixed_grid' || campo.type === 'fixed_grid_dynamic_cols' || campo.type === 'fixed_grid_fixed_cols') {
        const row = {};
        const isFixedGrid = (campo.type === 'fixed_grid' || campo.type === 'fixed_grid_dynamic_cols' || campo.type === 'fixed_grid_fixed_cols') && Array.isArray(campo.rows) && campo.rows.length > 0;
        let cols = campo.columns || [];
        if (isFixedGrid) {
          const rowLabelName = campo.row_label || 'Descripción / Fila';
          cols = [{ name: rowLabelName, type: 'text' }, ...cols];
        }

        if (campo.type === 'fixed_grid_dynamic_cols') {
          cols = [...cols, { name: 'Columna Dinámica de Ejemplo', type: 'text' }];
        }

        cols.forEach(col => {
          const colName = typeof col === 'object' ? col.name : col;
          const colType = typeof col === 'object' ? col.type : 'text';

          if (colType === 'checkbox') {
            row[colName] = 'X';
          } else if (colType === 'date') {
            row[colName] = new Date().toLocaleDateString('es-ES');
          } else if (colType === 'date_range') {
            row[colName] = JSON.stringify({
              desde: new Date().toISOString().split('T')[0],
              hasta: new Date(Date.now() + 86400000).toISOString().split('T')[0]
            });
          } else if (colType === 'identificacion') {
            row[colName] = '1799999999';
          } else if (colType === 'time') {
            row[colName] = '10:30';
          } else if (colType === 'email') {
            row[colName] = 'correo@ejemplo.com';
          } else if (colType === 'ip') {
            row[colName] = '192.168.1.10';
          } else if (colType === 'mac') {
            row[colName] = 'AA:BB:CC:DD:EE:FF';
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

        if (isFixedGrid) {
          const rowLabelName = campo.row_label || 'Descripción / Fila';
          mockDatos[campo.name] = campo.rows.map(rName => {
            return { ...row, [rowLabelName]: rName };
          });
        } else {
          mockDatos[campo.name] = [row];
        }
      } else {
        mockDatos[campo.name] = 'Texto de ejemplo del solicitante';
      }
    });

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

    const mockAprobaciones = [];
    parsedAreas.forEach(area => {
      if (area === 'director') return;
      
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

    const pdfBuffer = await pdfGenerator.generarPDF(mockSolicitud, mockAprobaciones, mockDirectorSigner);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="PREVIEW_${codigo.toUpperCase()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error al generar la previsualización del PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar la previsualización del PDF: ' + error.message });
    }
  }
});

// 7. ELIMINAR PLANTILLA DE FORMULARIO (TIPO DE SOLICITUD)
router.delete('/tipos-solicitud/:id', autenticar, esAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await usuarioService.eliminarTipoSolicitud(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Plantilla de formulario no encontrada.' });
    }
    res.json({ message: 'Plantilla de formulario eliminada con éxito.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar la plantilla de formulario.' });
  }
});

// 8. ENVIAR CORREO DE PRUEBA DESDE EL ADMINISTRADOR
router.post('/enviar-correo-prueba', autenticar, esAdmin, async (req, res) => {
  const { destinatario, cc, asunto, cuerpo } = req.body;

  if (!destinatario || !asunto || !cuerpo) {
    return res.status(400).json({ error: 'Destinatario, asunto y cuerpo del mensaje son requeridos.' });
  }

  try {
    const mailTransporter = await mailer.obtenerTransporter();
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

module.exports = router;
