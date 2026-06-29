# Guía de Políticas de Robustecimiento de Seguridad (SVT)

Este documento detalla los controles de seguridad del Sistema de Validación Técnica (SVT), separándolos claramente entre los **controles aplicados** (el estado actual) y las **políticas sugeridas** (acciones recomendadas a futuro) para mitigar vulnerabilidades de tipo **SQL Injection** y **Cross-Site Scripting (XSS)** en la pila tecnológica de Node.js, Express y PostgreSQL.

---

## 1. Defensa contra SQL Injection

La inyección SQL ocurre cuando datos proporcionados por el usuario se concatenan directamente en una consulta, permitiendo que el motor de la base de datos interprete dichos datos como instrucciones.

### 1.1 Controles Actualmente Aplicados
* **Consultas Parametrizadas**:
  Todas las consultas e interacciones de base de datos dentro de los servicios backend (por ejemplo en `services/usuarioService.js` y `services/solicitudService.js`) emplean marcadores de posición (`$1`, `$2`, etc.) y pasan los valores como un arreglo de parámetros independiente.
  * *Ejemplo real*:
    `db.query('SELECT ... WHERE LOWER(correo) = LOWER($1)', [correo])`
  Esto asegura que el motor de base de datos trate los parámetros puramente como datos literales y no como código SQL ejecutable.

### 1.2 Controles que se Podrían Aplicar (A Futuro)
* **Principio de Menor Privilegio en Base de Datos**:
  1. Crear un rol específico en PostgreSQL para la aplicación (ej. `svt_app`).
  2. Otorgar permisos exclusivamente de DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) en las tablas necesarias, restringiendo DDL (`ALTER TABLE`, `DROP TABLE`).
* **Uso de Constructores de Consultas u ORM**:
  Adoptar un query builder como Knex.js o un ORM como Prisma/Sequelize para automatizar y encapsular la parametrización de consultas complejas sin requerir SQL crudo dinámico.

---

## 2. Defensa contra Cross-Site Scripting (XSS)

El XSS ocurre cuando un atacante inyecta scripts en la aplicación que luego se ejecutan en el navegador de otros usuarios.

### 2.1 Controles Actualmente Aplicados
* **Escapado de Entidades en Frontend**:
  El archivo `public/js/utils.js` cuenta con la función `escaparHTML` que sustituye caracteres reservados del HTML (`&`, `<`, `>`, `"`, `'`, `/`) por sus entidades seguras (`&amp;`, `&lt;`, etc.), desactivando cualquier código HTML/JS antes de concatenarlo en la vista.
* **Uso seguro del DOM**:
  La manipulación de elementos HTML dinámicos en el frontend prioriza el uso de `.textContent` o `.innerText` sobre `.innerHTML` para valores provistos por usuarios, forzando al navegador a interpretarlos como texto plano.
* **Filtros de Entrada interactivos**:
  La función `aplicarFiltroEntrada` en `public/js/forms.js` restringe los caracteres que el usuario puede escribir (por ejemplo en IPs, MACs, números) en tiempo real. Adicionalmente, el campo de usuario en la pantalla de login (`public/js/auth.js`) tiene un filtro activo que solo permite caracteres válidos de correo (`a-zA-Z0-9.@_\-+`), bloqueando letras con acentos, espacios y la `ñ`/`Ñ`.

### 2.2 Controles que se Podrían Aplicar (A Futuro)
* **Políticas de Seguridad de Contenido (CSP) con Helmet**:
  Configurar el paquete `helmet` en el servidor Express para inyectar cabeceras CSP. Esto previene que se ejecuten inline scripts maliciosos.
  ```javascript
  const helmet = require('helmet');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // Prohibir inline scripts no autorizados
        styleSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  }));
  ```
* **Sanitización de Entradas en el Servidor (Backend)**:
  Aplicar una librería como `sanitize-html` en el backend antes de guardar el objeto de datos en la base de datos.
  ```javascript
  const sanitizeHtml = require('sanitize-html');
  const sanitizedVal = sanitizeHtml(inputVal, { allowedTags: [], allowedAttributes: {} });
  ```
* **Banderas HTTP en Cookies de Sesión**:
  Si en el futuro se migra a cookies para almacenar tokens de sesión:
  - `HttpOnly`: Impide que JavaScript lea la cookie (mitiga robo de sesión por XSS).
  - `Secure`: Garantiza transmisión exclusiva por HTTPS.
  - `SameSite=Strict/Lax`: Previene ataques CSRF.

---

## 3. Controles Adicionales de Seguridad

### 3.1 Controles Actualmente Aplicados
* **Hasheo de Contraseñas**:
  La aplicación emplea algoritmos criptográficos para almacenar hashes de contraseñas de usuario en lugar de guardarlas en texto plano.
* **Sesión Segura y Control de Inactividad**:
  El frontend implementa un detector de inactividad que cierra automáticamente la sesión del usuario si no se detecta actividad en un período determinado.

### 3.2 Controles que se Podrían Aplicar (A Futuro)
* **Auditoría Automatizada (`npm audit`)**:
  Ejecutar periódicamente en el flujo de desarrollo para identificar y actualizar paquetes con vulnerabilidades conocidas.
* **Analizadores de Código Estático (Linters)**:
  Configurar ESLint con complementos de seguridad como `eslint-plugin-security` para alertar en tiempo de diseño sobre patrones poco seguros.
