const db = require('./db');

/**
 * Ejecuta de forma asíncrona las migraciones iniciales de la base de datos y la inserción de semillas.
 */
async function ejecutarMigraciones() {
  console.log('SVT: Iniciando migraciones y actualización de semillas de base de datos...');
  try {
    await db.query(`
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
    `);
    console.log('SVT: Migración de base de datos exitosa.');
  } catch (error) {
    console.error('SVT: Error crítico al ejecutar migraciones de base de datos:', error);
    throw error;
  }
}

module.exports = {
  ejecutarMigraciones
};
