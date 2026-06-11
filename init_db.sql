-- Script de creación de tablas para el Sistema de Validación Técnica (SVT)

-- Eliminar tablas si existen (para reinicio de pruebas)
DROP TABLE IF EXISTS observaciones CASCADE;
DROP TABLE IF EXISTS aprobaciones CASCADE;
DROP TABLE IF EXISTS solicitudes CASCADE;
DROP TABLE IF EXISTS tipos_solicitud CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- 1. Tabla de Usuarios
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL, -- Correo institucional (Usuario para login)
    password VARCHAR(255) NOT NULL, -- Contraseña simple (texto plano para facilidad del usuario)
    nombre VARCHAR(100) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('solicitante', 'tecnico', 'admin')),
    area VARCHAR(20) NULL CHECK (area IN ('seguridad', 'gibdd', 'giitrc', 'osi', 'director')),
    cedula VARCHAR(20) NOT NULL,
    cargo VARCHAR(100) NOT NULL,
    direccion_proyecto VARCHAR(150) NULL,
    correo VARCHAR(100) UNIQUE NOT NULL
);

-- 2. Tabla de Tipos de Solicitud (Formularios Dinámicos)
CREATE TABLE tipos_solicitud (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL, -- Código identificador del formulario (ej. ACC-RED)
    nombre VARCHAR(200) UNIQUE NOT NULL,
    descripcion TEXT NOT NULL,
    campos JSONB NOT NULL, -- Lista de campos dinámicos
    areas_validadoras JSONB NOT NULL, -- Áreas técnicas que deben validar
    mail_destinatario VARCHAR(255) NULL,
    mail_cc VARCHAR(255) NULL,
    mail_asunto VARCHAR(255) NULL,
    mail_cuerpo TEXT NULL,
    mail_progreso BOOLEAN DEFAULT TRUE
);

-- 3. Tabla de Solicitudes
CREATE TABLE solicitudes (
    id SERIAL PRIMARY KEY,
    solicitante_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_solicitud_id INT REFERENCES tipos_solicitud(id) ON DELETE CASCADE,
    datos JSONB NOT NULL, -- Los valores ingresados por el solicitante
    estado VARCHAR(20) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'en_revision', 'aprobado', 'observado')),
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Aprobaciones por Área
CREATE TABLE aprobaciones (
    id SERIAL PRIMARY KEY,
    solicitud_id INT REFERENCES solicitudes(id) ON DELETE CASCADE,
    area VARCHAR(20) NOT NULL CHECK (area IN ('seguridad', 'gibdd', 'giitrc', 'osi', 'director')),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado')),
    tecnico_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    fecha TIMESTAMP NULL,
    observacion TEXT NULL,
    UNIQUE (solicitud_id, area)
);

-- 5. Tabla de Observaciones (Historial)
CREATE TABLE observaciones (
    id SERIAL PRIMARY KEY,
    solicitud_id INT REFERENCES solicitudes(id) ON DELETE CASCADE,
    area VARCHAR(20) NOT NULL CHECK (area IN ('seguridad', 'gibdd', 'giitrc', 'solicitante', 'admin', 'osi', 'director')),
    autor_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    texto TEXT NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- INSERCIÓN DE DATOS INICIALES (SEMILLAS)

-- Usuarios
INSERT INTO usuarios (username, password, nombre, rol, area, cedula, cargo, correo) VALUES
('solicitante1@msp.gob.ec', 'solicitante123', 'Juan Pérez (Solicitante)', 'solicitante', NULL, '1712345678', 'Analista de Servicios', 'solicitante1@msp.gob.ec'),
('seguridad1@msp.gob.ec', 'seguridad123', 'Carlos Segura (Seguridad)', 'tecnico', 'seguridad', '1723456789', 'Especialista de Seguridad', 'seguridad1@msp.gob.ec'),
('gibdd1@msp.gob.ec', 'gibdd123', 'Ana Datos (Base de Datos)', 'tecnico', 'gibdd', '1734567890', 'Administrador de Base de Datos', 'gibdd1@msp.gob.ec'),
('giitrc1@msp.gob.ec', 'giitrc123', 'Luis Redes (Infraestructura)', 'tecnico', 'giitrc', '1745678901', 'Especialista en Telecomunicaciones', 'giitrc1@msp.gob.ec'),
('osi1@msp.gob.ec', 'osi123', 'Oficial de Seguridad OSI', 'tecnico', 'osi', '1765432109', 'Oficial de Seguridad de la Información', 'osi1@msp.gob.ec'),
('director1@msp.gob.ec', 'director123', 'Director DTIC MSP', 'tecnico', 'director', '1798765432', 'Director de Tecnologías de la Información y Comunicación', 'director1@msp.gob.ec'),
('admin1@msp.gob.ec', 'admin123', 'Admin General (Administrador)', 'admin', NULL, '1756789012', 'Director de Tecnologías', 'admin1@msp.gob.ec');

-- Tipos de Solicitud (Formularios Dinámicos)
INSERT INTO tipos_solicitud (codigo, nombre, descripcion, campos, areas_validadoras) VALUES
(
  'ACC-RED',
  'Acceso a Red Interna', 
  'Solicitud para habilitar puertos e IPs de acceso en la red institucional.',
  '[
    {"name": "motivo", "label": "Motivo de la solicitud", "type": "textarea", "required": true},
    {"name": "ip_origen", "label": "Dirección IP de Origen", "type": "text", "required": true},
    {"name": "ip_destino", "label": "Dirección IP de Destino", "type": "text", "required": true},
    {"name": "puertos", "label": "Puertos requeridos (ej. 80, 443, 8080)", "type": "text", "required": true}
  ]'::jsonb,
  '["seguridad", "giitrc"]'::jsonb
),
(
  'USR-BD',
  'Creación de Usuarios y Bases de Datos', 
  'Solicitud para crear un usuario en una base de datos institucional.',
  '[
    {"name": "motivo", "label": "Motivo del usuario", "type": "textarea", "required": true},
    {"name": "nombre_bd", "label": "Nombre de la Base de Datos", "type": "text", "required": true},
    {"name": "usuario_nuevo", "label": "Nombre del Usuario Sugerido", "type": "text", "required": true},
    {"name": "rol_bd", "label": "Rol/Permisos en la BD (ej. lectura, escritura)", "type": "text", "required": true}
  ]'::jsonb,
  '["seguridad", "gibdd"]'::jsonb
),
(
  'SERV-APP',
  'Servidor de Aplicaciones', 
  'Solicitud para provisión de un servidor virtual para desplegar una aplicación.',
  '[
    {"name": "motivo", "label": "Propósito del Servidor", "type": "textarea", "required": true},
    {"name": "sistema_operativo", "label": "Sistema Operativo sugerido", "type": "text", "required": true},
    {"name": "recursos_cpu", "label": "Cantidad de CPUs virtuales", "type": "text", "required": true},
    {"name": "recursos_ram", "label": "Memoria RAM (ej. 8GB)", "type": "text", "required": true}
  ]'::jsonb,
  '["giitrc", "seguridad"]'::jsonb
);
