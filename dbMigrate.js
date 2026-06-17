const db = require('./db');

/**
 * Ejecuta de forma asíncrona las migraciones y optimizaciones de la base de datos.
 */
async function ejecutarMigraciones() {
  console.log('SVT: Iniciando migraciones de reestructuración y optimización de base de datos...');
  try {
    await db.query(`
      -- 1. Crear la tabla de áreas si no existe
      CREATE TABLE IF NOT EXISTS areas (
          id VARCHAR(20) PRIMARY KEY,
          nombre VARCHAR(100) NOT NULL
      );

      -- 2. Insertar áreas iniciales y roles
      INSERT INTO areas (id, nombre) VALUES
      ('seguridad', 'Gestión Interna de Seguridad Informática y Calidad de Software'),
      ('gibdd', 'Gestión Interna de Base de Datos'),
      ('giitrc', 'Gestión Interna de Infraestructura'),
      ('osi', 'Oficial de Seguridad de la Información'),
      ('director', 'Director DTIC MSP'),
      ('solicitante', 'Solicitante'),
      ('admin', 'Administrador')
      ON CONFLICT (id) DO NOTHING;

      -- 3. Asegurar que 'correo' sea único en usuarios
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_correo_key;
      ALTER TABLE usuarios ADD CONSTRAINT usuarios_correo_key UNIQUE (correo);

      -- 4. Modificar relaciones de áreas en usuarios
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_area_check;
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS fk_usuarios_area;
      ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_area FOREIGN KEY (area) REFERENCES areas(id) ON DELETE SET NULL;

      -- 5. Modificar relaciones de áreas en aprobaciones
      ALTER TABLE aprobaciones DROP CONSTRAINT IF EXISTS aprobaciones_area_check;
      ALTER TABLE aprobaciones DROP CONSTRAINT IF EXISTS fk_aprobaciones_area;
      ALTER TABLE aprobaciones ADD CONSTRAINT fk_aprobaciones_area FOREIGN KEY (area) REFERENCES areas(id) ON DELETE RESTRICT;

      -- 6. Modificar relaciones de áreas en observaciones
      ALTER TABLE observaciones DROP CONSTRAINT IF EXISTS observaciones_area_check;
      ALTER TABLE observaciones DROP CONSTRAINT IF EXISTS fk_observaciones_area;
      ALTER TABLE observaciones ADD CONSTRAINT fk_observaciones_area FOREIGN KEY (area) REFERENCES areas(id) ON DELETE CASCADE;

      -- 7. Modificar relación de solicitante_id para prevenir pérdida de datos (ON DELETE RESTRICT)
      ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_solicitante_id_fkey;
      ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS fk_solicitudes_solicitante;
      ALTER TABLE solicitudes ADD CONSTRAINT fk_solicitudes_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE RESTRICT;

      -- 8. Alterar aprobaciones para añadir observacion si es necesario
      ALTER TABLE aprobaciones ADD COLUMN IF NOT EXISTS observacion TEXT NULL;

      -- 9. Sincronizar registros antiguos y eliminar la columna username de forma segura
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='usuarios' AND column_name='username') THEN
          UPDATE usuarios SET correo = username WHERE correo IS NULL OR correo = '';
          ALTER TABLE usuarios DROP COLUMN username;
        END IF;
      END $$;

      -- 11. Actualizar registros de semilla antiguos si existen
      UPDATE usuarios SET cedula = '1756789012', cargo = 'Director de Tecnologías', correo = 'admin1@msp.gob.ec' WHERE correo = 'admin1@msp.gob.ec' OR correo = 'admin1';
      UPDATE usuarios SET cedula = '1712345678', cargo = 'Analista de Servicios', correo = 'solicitante1@msp.gob.ec' WHERE correo = 'solicitante1@msp.gob.ec' OR correo = 'solicitante1';
      UPDATE usuarios SET cedula = '1723456789', cargo = 'Especialista de Seguridad', correo = 'seguridad1@msp.gob.ec' WHERE correo = 'seguridad1@msp.gob.ec' OR correo = 'seguridad1';
      UPDATE usuarios SET cedula = '1734567890', cargo = 'Administrador de Base de Datos', correo = 'gibdd1@msp.gob.ec' WHERE correo = 'gibdd1@msp.gob.ec' OR correo = 'base1';
      UPDATE usuarios SET cedula = '1745678901', cargo = 'Especialista en Telecomunicaciones', correo = 'giitrc1@msp.gob.ec' WHERE correo = 'giitrc1@msp.gob.ec' OR correo = 'infra1';

      -- Sembrar usuario OSI si no existe
      INSERT INTO usuarios (password, nombre, rol, area, cedula, cargo, correo, firma_documentos)
      VALUES ('osi123', 'Oficial de Seguridad OSI', 'tecnico', 'osi', '1765432109', 'Oficial de Seguridad de la Información', 'osi1@msp.gob.ec', TRUE)
      ON CONFLICT (correo) DO NOTHING;

      -- Asegurar que el usuario semilla de la OSI tenga firma_documentos = TRUE
      UPDATE usuarios SET firma_documentos = TRUE WHERE correo = 'osi1@msp.gob.ec' AND (firma_documentos IS NOT TRUE);

      -- Sembrar usuario Director si no existe
      INSERT INTO usuarios (password, nombre, rol, area, cedula, cargo, correo)
      VALUES ('director123', 'Director DTIC MSP', 'tecnico', 'director', '1798765432', 'Director de Tecnologías de la Información y Comunicación', 'director1@msp.gob.ec')
      ON CONFLICT (correo) DO NOTHING;

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

      -- 12. Crear índices secundarios para optimizar el rendimiento
      CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante_id ON solicitudes(solicitante_id);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_tipo ON solicitudes(tipo_solicitud_id);
      CREATE INDEX IF NOT EXISTS idx_aprobaciones_solicitud_id ON aprobaciones(solicitud_id);
      CREATE INDEX IF NOT EXISTS idx_observaciones_solicitud_id ON observaciones(solicitud_id);

      -- 13. Añadir la columna activo a la tabla usuarios para borrado lógico
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    console.log('SVT: Migración y optimización de base de datos completada con éxito.');
  } catch (error) {
    console.error('SVT: Error crítico al ejecutar migraciones de base de datos:', error);
    throw error;
  }
}

module.exports = {
  ejecutarMigraciones
};
