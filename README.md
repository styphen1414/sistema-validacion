# Sistema de Validación Técnica (SVT) 🛠️🔒

El **Sistema de Validación Técnica (SVT)** es una plataforma web minimalista e integral diseñada para gestionar y automatizar el flujo de aprobaciones de solicitudes tecnológicas dentro del Ministerio de Salud Pública (MSP). El sistema permite a los usuarios solicitantes enviar peticiones que requieren la revisión, retroalimentación y aprobación paralela de múltiples áreas técnicas (como Seguridad, Infraestructura o Bases de Datos) antes de su aprobación final por parte del Director.

---

## 🌟 Características Principales

*   **Formularios Dinámicos (Campos JSONB)**: Los tipos de solicitudes (como acceso a red interna, creación de usuarios de bases de datos y aprovisionamiento de servidores) definen sus propios campos mediante esquemas JSON. El frontend genera el formulario dinámicamente según la selección del usuario.
*   **Flujos de Aprobación Paralelos**: Las solicitudes son validadas en paralelo por las áreas técnicas designadas en su configuración (ej. Redes y Seguridad para habilitar un puerto).
*   **Control y Trazabilidad (Observaciones)**: Los técnicos de cada área pueden realizar observaciones. Si una solicitud recibe observaciones, puede ser devuelta para corrección y ser reabierta integralmente.
*   **Generación de Reportes PDF**: Generación dinámica de reportes formales en formato PDF utilizando `pdfkit`, documentando todas las aprobaciones, firmas técnicas e historial de observaciones del proceso.
*   **Notificaciones por Correo Electrónico**: Integración con `nodemailer` para alertar automáticamente a los usuarios sobre cambios de estado, aprobaciones de área o nuevas observaciones.
*   **Panel de Administración**: Gestión y visualización de solicitudes según el rol del usuario (`solicitante`, `tecnico`, `admin`).
*   **Base de Datos Relacional**: Almacenamiento persistente en PostgreSQL utilizando tipos de datos avanzados como JSONB.

---

## 🗄️ Estructura de la Base de Datos (PostgreSQL)

El sistema consta de las siguientes tablas principales (definidas en [`init_db.sql`](file:///c:/Users/david.paredes/Documents/Visual%20Studio/Sistema%20Validacion/Sistema%20v1/init_db.sql)):

1.  **`usuarios`**: Almacena las cuentas del personal con campos como nombre, rol, área asignada (`seguridad`, `gibdd`, `giitrc`, `osi`, `director`), cargo, cédula y correo.
2.  **`tipos_solicitud`**: Define las solicitudes que se pueden crear. Contiene los campos dinámicos en formato `JSONB` y las áreas técnicas encargadas de la validación (`areas_validadoras`).
3.  **`solicitudes`**: Contiene la información enviada por los usuarios, enlazada a su creador y tipo de solicitud, guardando los datos variables en un campo `JSONB`. Sus estados posibles son: `borrador`, `en_revision`, `aprobado`, `observado`.
4.  **`aprobaciones`**: Registra de forma unitaria la aprobación o pendiente por cada área de validación vinculada a una solicitud.
5.  **`observaciones`**: Bitácora histórica de comentarios y observaciones realizadas por los técnicos o administradores durante la fase de revisión.

---

## 📁 Estructura del Proyecto

```text
Sistema v1/
├── public/                 # Contenido estático frontend
│   ├── css/
│   │   ├── main.css        # Estilos visuales globales y tema oscuro/claro
│   │   ├── dynamic-forms.css # Diseño de formularios dinámicos
│   │   └── theme.css       # Definición de variables CSS y paleta de colores
│   ├── app.js              # Lógica del frontend (Interactividad, Dashboard)
│   ├── index.html          # Interfaz de usuario principal
│   └── logo.png            # Assets visuales
├── db.js                   # Configuración del pool de conexión a PostgreSQL
├── server.js               # Servidor Express, API REST, PDFkit y Nodemailer
├── init_db.sql             # Script SQL de inicialización de tablas y semillas de prueba
├── .gitignore              # Archivos y carpetas excluidos de Git (node_modules, .env, scratch)
├── package.json            # Configuración de dependencias y scripts de Node.js
└── README.md               # Documentación general del proyecto (Este archivo)
```

---

## 🛠️ Tecnologías Utilizadas

*   **Servidor Backend**: [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/)
*   **Base de Datos**: [PostgreSQL](https://www.postgresql.org/) (driver `pg`)
*   **Interfaz Frontend**: HTML5 + Vanilla Javascript + CSS3
*   **Generación de Documentos**: [PDFKit](https://pdfkit.org/)
*   **Envío de Correos**: [Nodemailer](https://nodemailer.com/)

---

## 🚀 Requisitos e Instalación

### 1. Clonar e Instalar Dependencias
Una vez tengas instalado Node.js en tu máquina, instala las dependencias necesarias:
```bash
npm install
```

### 2. Configurar la Base de Datos
1.  Crea una base de datos en PostgreSQL (ej. `sistema_validacion`).
2.  Ejecuta el script [`init_db.sql`](file:///c:/Users/david.paredes/Documents/Visual%20Studio/Sistema%20Validacion/Sistema%20v1/init_db.sql) para crear las tablas y las semillas de prueba (usuarios de prueba, tipos de solicitud por defecto).

### 3. Configurar el Archivo de Entorno `.env`
Crea un archivo `.env` en la raíz del proyecto (basándote en tus variables de conexión) o copia el archivo `.env.example`. Debe tener la siguiente estructura:
```env
PORT=3000
APP_URL=http://localhost:3000

DB_USER=tu_usuario_postgres
DB_PASSWORD=tu_contraseña_postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sistema_validacion

# Configuración de correo (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=tu_contraseña_de_aplicacion
SMTP_FROM="Sistema de Validación Técnica MSP" <tu_correo@gmail.com>
```

### 4. Ejecutar el Proyecto
Para iniciar el servidor en modo desarrollo (con recarga automática):
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

---

## 👥 Credenciales de Prueba por Defecto

En las semillas iniciales se proveen las siguientes cuentas para pruebas:

| Rol | Correo / Usuario | Contraseña | Área |
| :--- | :--- | :--- | :--- |
| **Solicitante** | `solicitante1@msp.gob.ec` | `solicitante123` | N/A |
| **Seguridad** | `seguridad1@msp.gob.ec` | `seguridad123` | Seguridad |
| **Bases de Datos** | `gibdd1@msp.gob.ec` | `gibdd123` | GIBDD |
| **Infraestructura** | `giitrc1@msp.gob.ec` | `giitrc123` | GIITRC |
| **Director** | `director1@msp.gob.ec` | `director123` | Director |
| **Administrador** | `admin1@msp.gob.ec` | `admin123` | N/A |
