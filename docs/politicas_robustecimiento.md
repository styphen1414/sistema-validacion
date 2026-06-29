# Guía de Políticas de Robustecimiento de Seguridad (SVT)

Este documento detalla las políticas y mejores prácticas recomendadas a futuro para fortalecer el Sistema de Validación Técnica (SVT). Su enfoque principal es la mitigación preventiva de vulnerabilidades de tipo **SQL Injection** y **Cross-Site Scripting (XSS)** en la pila tecnológica de Node.js, Express y PostgreSQL.

---

## 1. Defensa Preventiva contra SQL Injection

La inyección SQL ocurre cuando datos proporcionados por el usuario se concatenan directamente en una consulta, permitiendo que el motor de la base de datos interprete dichos datos como instrucciones.

### 1.1 Mantenimiento Estricto de Consultas Parametrizadas
* **Regla de Oro**: Ninguna consulta SQL enviada a la base de datos a través de `db.query` (o clientes afines) debe utilizar interpolación de variables de JavaScript (ej. usar ` `${variable}` ` o concatenaciones con `+`).
* **Implementación Correcta**: Utilizar exclusivamente marcadores de posición posicionales (`$1`, `$2`, etc.) e inyectar los valores en el segundo argumento de `query` en forma de arreglo.
  ```javascript
  // CORRECTO: Parametrizado
  const query = 'SELECT * FROM usuarios WHERE correo = $1';
  const result = await db.query(query, [emailInput]);
  ```

### 1.2 Principio de Menor Privilegio en Base de Datos
* **Definición**: El usuario de base de datos que utiliza la aplicación en producción no debe tener permisos administrativos generales.
* **Políticas a aplicar**:
  1. Configurar un rol específico en PostgreSQL para la aplicación (ej. `svt_app`).
  2. Otorgar permisos limitados exclusivamente a las tablas y vistas del sistema (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
  3. Denegar permisos para alterar estructuras de tablas (`ALTER TABLE`), borrar bases de datos (`DROP DATABASE`), o crear nuevos usuarios.
  4. Bloquear el acceso del usuario de la aplicación a tablas de sistema o administrativas de PostgreSQL.

---

## 2. Defensa Multicapa contra Cross-Site Scripting (XSS)

El XSS ocurre cuando un atacante logra inyectar scripts maliciosos en la aplicación que luego se ejecutan en el navegador de otros usuarios.

### 2.1 Content Security Policy (CSP) y Helmet en Express
La Política de Seguridad de Contenido (CSP) es una capa de seguridad en la cabecera HTTP que indica al navegador qué orígenes de scripts, hojas de estilo e imágenes son válidos y seguros para ejecutar.

* **Implementación con Helmet**:
  `helmet` es un conjunto de middlewares de Express que configura cabeceras HTTP seguras de forma automatizada.
  ```bash
  npm install helmet
  ```
  ```javascript
  // Configuración recomendada en server.js:
  const helmet = require('helmet');
  
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Limitar la ejecución de scripts inline
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    }
  }));
  ```

### 2.2 Sanitización de Entradas en el Servidor (Backend)
Dado que las solicitudes dinámicas son guardadas como objetos JSON en la base de datos (campo `datos` en la tabla `solicitudes`), es vital asegurarse de que ningún valor del JSON contenga scripts maliciosos antes de ser procesado o renderizado en otros clientes.

* **Librería Recomendada**: `sanitize-html` o `dompurify` (con JSDOM en entorno Node).
  ```bash
  npm install sanitize-html
  ```
  ```javascript
  const sanitizeHtml = require('sanitize-html');
  
  // Utilidad para limpiar objetos JSON recibidos
  function sanitizarValores(obj) {
    if (typeof obj === 'string') {
      return sanitizeHtml(obj, {
        allowedTags: [], // Bloquea todo tipo de etiquetas HTML
        allowedAttributes: {}
      });
    }
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizarValores(item));
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizarValores(value);
      }
      return sanitized;
    }
    return obj;
  }
  ```
* **Aplicación**: Utilizar esta función helper en las rutas antes de almacenar el objeto `datos` en la base de datos.

### 2.3 Buenas Prácticas en el Frontend
* **Asignaciones de Texto Seguro**: Mantener el estándar actual de utilizar `.textContent` o `.innerText` para representar datos suministrados por usuarios en elementos HTML dinámicos. Evitar el uso de `.innerHTML` o `document.write` con cadenas de texto directas.
* **Escapado Preventivo de Cadenas**: Mantener el uso de la función `escaparHTML` para convertir caracteres de control en entidades HTML seguras antes de realizar concatenaciones de cadenas HTML dinámicas en el cliente.

---

## 3. Seguridad de Sesión y Autenticación

### 3.1 Banderas de Seguridad en Cookies de Autenticación
Si se decide migrar el almacenamiento del token JWT de `localStorage` a Cookies en el futuro para mayor protección:
* **HttpOnly**: Evita que los scripts de JavaScript en el navegador accedan a la cookie (mitiga el robo de sesión ante ataques XSS exitosos).
* **Secure**: Asegura que la cookie solo sea enviada sobre conexiones HTTPS cifradas.
* **SameSite**: Configurado en `Strict` o `Lax` para evitar ataques de falsificación de petición en sitios cruzados (CSRF).

### 3.2 Rotación y Expiración Corta de Tokens (JWT)
* Configurar una expiración de token de sesión corta (ej. 1 a 2 horas máximo).
* Implementar tokens de refresco (*refresh tokens*) con almacenamiento seguro en base de datos para la renovación de sesiones sin necesidad de pedir las credenciales del usuario constantemente.

---

## 4. Auditoría de Dependencias y Ciclo de Desarrollo Seguro

El ecosistema de Node.js evoluciona constantemente y es fundamental verificar la seguridad de los paquetes de terceros.

* **Auditoría de Vulnerabilidades**: Ejecutar periódicamente en el entorno de desarrollo el comando:
  ```bash
  npm audit
  ```
  Este comando compara las dependencias de tu archivo `package.json` contra la base de datos de vulnerabilidades conocidas de NPM y ayuda a corregirlas con `npm audit fix`.
* **Analizadores Estáticos (Linters)**: Configurar *ESLint* con complementos como `eslint-plugin-security` para alertar al desarrollador en tiempo real sobre patrones de programación poco seguros (como expresiones regulares vulnerables o llamadas inseguras a eval).
