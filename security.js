/**
 * Módulo de seguridad del SVT.
 *
 * Implementa hashing de contraseñas (scrypt), tokens de sesión firmados
 * (JWT HS256), cabeceras de seguridad HTTP y un limitador de intentos de
 * login. Todo se construye sobre el módulo `crypto` nativo de Node.js para
 * evitar dependencias externas.
 */
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// 1. HASHING DE CONTRASEÑAS (scrypt)
// ---------------------------------------------------------------------------
const SCRYPT_PREFIX = 'scrypt$';

/** Genera un hash seguro de la contraseña en formato `scrypt$<salt>$<hash>`. */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

/** Indica si una contraseña almacenada ya está hasheada. */
function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

/** Verifica una contraseña en claro contra un hash almacenado (timing-safe). */
function verifyPassword(plain, stored) {
  if (!isHashed(stored)) return false;
  const parts = stored.split('$'); // ['scrypt', salt, hash]
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const derived = crypto.scryptSync(String(plain), salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

// ---------------------------------------------------------------------------
// 2. TOKENS DE SESIÓN (JWT HS256)
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'svt-cambia-este-secreto-en-produccion';
const JWT_TTL_SECONDS = parseInt(process.env.JWT_TTL_SECONDS, 10) || 60 * 60 * 8; // 8 horas

if (!process.env.JWT_SECRET) {
  console.warn('SVT: ADVERTENCIA - JWT_SECRET no está definido en .env. Usando un valor por defecto NO seguro. Defínelo antes de producción.');
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

/** Firma un token JWT (HS256) con el payload indicado. */
function signToken(payload, ttlSeconds = JWT_TTL_SECONDS) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = base64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  return `${data}.${signature}`;
}

/** Verifica un token JWT. Devuelve el payload si es válido, o null si no lo es. */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = base64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest());
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(parts[1]));
  } catch (e) {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// 3. CABECERAS DE SEGURIDAD (equivalente ligero a helmet)
// ---------------------------------------------------------------------------
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.removeHeader('X-Powered-By');
  next();
}

// ---------------------------------------------------------------------------
// 4. LIMITADOR DE INTENTOS DE LOGIN (rate-limit en memoria)
// ---------------------------------------------------------------------------
function crearRateLimiter({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }
  return function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'desconocido';
    const ahora = Date.now();
    const registro = hits.get(ip);

    if (!registro || ahora > registro.resetAt) {
      hits.set(ip, { count: 1, resetAt: ahora + windowMs });
      return next();
    }

    registro.count += 1;
    if (registro.count > max) {
      const segundos = Math.ceil((registro.resetAt - ahora) / 1000);
      res.setHeader('Retry-After', String(segundos));
      return res.status(429).json({
        error: `Demasiados intentos. Intenta nuevamente en ${Math.ceil(segundos / 60)} minuto(s).`
      });
    }
    next();
  };
}

module.exports = {
  hashPassword,
  isHashed,
  verifyPassword,
  signToken,
  verifyToken,
  securityHeaders,
  crearRateLimiter,
};
