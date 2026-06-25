// Diccionarios de Nombres de Áreas
export const NOMBRES_AREAS = {
  seguridad: 'Gestión Interna de Seguridad Informática y Calidad de Software - (GISICS)',
  gibdd: 'Gestión Interna de Base de Datos - (GIBD)',
  giitrc: 'Gestión Interna de Infraestructura - (GIITRC)',
  osi: 'Oficial de Seguridad de la Información - (OSI)',
  director: 'Director DTIC MSP',
  solicitante: 'Solicitante',
  admin: 'Administrador'
};

export const NOMBRES_AREAS_SIN_SIGLAS = {
  seguridad: 'Gestión Interna de Seguridad Informática y Calidad de Software',
  gibdd: 'Gestión Interna de Base de Datos',
  giitrc: 'Gestión Interna de Infraestructura',
  osi: 'Oficial de Seguridad de la Información',
  director: 'Director DTIC MSP',
  solicitante: 'Solicitante',
  admin: 'Administrador'
};

export function obtenerNombreArea(areaKey) {
  return NOMBRES_AREAS[areaKey] || areaKey;
}

export function obtenerNombreAreaSinSiglas(areaKey) {
  return NOMBRES_AREAS_SIN_SIGLAS[areaKey] || areaKey;
}

// Escapar caracteres HTML para mitigar vulnerabilidades XSS en el frontend
export function escaparHTML(str) {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Notificaciones flotantes tipo Toast
export function toast(mensaje, tipo = 'info', duracion = 4000) {
  if (tipo === 'info' && typeof mensaje === 'string') {
    const m = mensaje.toLowerCase();
    if (m.includes('error') || m.includes('no se pudo') || m.includes('inválid') || m.includes('invalid') || m.includes('incorrect') || m.includes('no tienes') || m.includes('denegado')) {
      tipo = 'error';
    } else if (m.includes('éxito') || m.includes('exito') || m.includes('correctamente') || m.includes('guardad') || m.includes('enviad') || m.includes('aprobad')) {
      tipo = 'success';
    }
  }

  let cont = document.getElementById('toast-container');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toast-container';
    document.body.appendChild(cont);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + tipo;
  el.setAttribute('role', 'status');
  el.textContent = mensaje;
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, duracion);
}

// Formatear firmantes guardados como JSON
export function formatearValorFirmante(val) {
  if (!val) return 'N/A';
  try {
    const parsed = JSON.parse(val);
    const parts = [];
    if (parsed.nombre) parts.push(parsed.nombre);
    if (parsed.cedula) parts.push(`C.I. ${parsed.cedula}`);
    if (parsed.cargo) parts.push(parsed.cargo);
    return parts.length > 0 ? parts.join(' - ') : 'N/A';
  } catch (e) {
    return val;
  }
}

/**
 * Evalúa si un campo tiene información de acuerdo a su tipo en el cliente.
 */
function evaluadorDeCondicion(campo, valor) {
  if (valor === undefined || valor === null) return false;

  if (campo.type === 'checkbox') {
    return valor === true || valor === 'true' || valor === 'X' || valor === 'Sí' || valor === 'on';
  }

  if (['grid', 'fixed_grid', 'fixed_grid_dynamic_cols', 'fixed_grid_fixed_cols'].includes(campo.type)) {
    if (!Array.isArray(valor)) return false;
    const rowLabelKey = campo.row_label || 'Descripción / Fila';
    for (const row of valor) {
      if (typeof row === 'object' && row !== null) {
        for (const [key, val] of Object.entries(row)) {
          if (key !== rowLabelKey && key !== 'Descripción / Fila') {
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  if (Array.isArray(valor)) {
    return valor.some(v => v !== undefined && v !== null && String(v).trim() !== '');
  }

  return String(valor).trim() !== '';
}

export function generarCodigoSeguimiento(sol) {
  if (!sol) return '';
  const fechaCreacion = new Date(sol.fecha_creacion);
  const mes = String(fechaCreacion.getMonth() + 1).padStart(2, '0');
  const anio = fechaCreacion.getFullYear();
  const codigoClean = (sol.tipo_codigo || 'FORM').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const cedulaClean = (sol.solicitante_cedula || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');

  let campos = [];
  if (sol.campos) {
    if (Array.isArray(sol.campos)) {
      campos = sol.campos;
    } else if (typeof sol.campos === 'string') {
      try {
        campos = JSON.parse(sol.campos);
      } catch (e) {}
    }
  }

  let datos = sol.datos || {};
  if (typeof datos === 'string') {
    try {
      datos = JSON.parse(datos);
    } catch (e) {
      datos = {};
    }
  }

  const acronymMap = {
    gibdd: 'GBDD',
    giitrc: 'GIITRC',
    osi: 'OSI',
    director: 'DIR'
  };

  const acronyms = [];
  if (Array.isArray(campos)) {
    campos.forEach(campo => {
      if (campo.condicion_area && campo.condicion_area.trim() !== '') {
        const valor = datos[campo.name];
        if (evaluadorDeCondicion(campo, valor)) {
          const areaLower = campo.condicion_area.trim().toLowerCase();
          if (acronymMap[areaLower] && !acronyms.includes(acronymMap[areaLower])) {
            acronyms.push(acronymMap[areaLower]);
          }
        }
      }
    });
  }

  acronyms.sort();

  if (acronyms.length > 0) {
    const acronymsStr = acronyms.join('_');
    return `${codigoClean}_${acronymsStr}_${cedulaClean}_${mes}_${anio}`;
  }

  return `${codigoClean}_${cedulaClean}_${mes}_${anio}`;
}

