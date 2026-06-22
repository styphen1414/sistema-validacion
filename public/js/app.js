import { state } from './state.js';
import { toast, escaparHTML, generarCodigoSeguimiento } from './utils.js';
import { getAuthHeaders, descargarPDF } from './api.js';
import { iniciarAutoRefresh, detenerAutoRefresh, registrarActividadUsuario } from './polling.js';
import { mostrarLogin, mostrarAppPrincipal, cerrarSesion, loginFormHandler } from './auth.js';
import { renderizarCamposDinamicos, enviarFormulario } from './forms.js';
import {
  abrirModal,
  cerrarModal,
  verDetalle,
  abrirEdicion,
  realizarAprobacion,
  realizarAprobacionConObservacion,
  realizarObservacion,
  realizarObservacionSimple,
  realizarReapertura,
  asignarSolicitud,
  desasignarSolicitud
} from './modals.js';
import {
  navegarAdmin,
  enviarCorreoPruebaHandler,
  abrirModalUsuario,
  abrirModalPlantilla,
  desactivarUsuario,
  activarUsuario,
  agregarFilaCampoVisual,
  eliminarFilaCampoVisual,
  agregarFilaColumnaVisual,
  agregarFilaVisual,
  actualizarFilaCampoRequerido,
  actualizarFilaColumnaFirmante,
  cambiarSelectorRol,
  usuarioFormSubmitHandler,
  plantillaFormSubmitHandler,
  previsualizarPDFPlantilla,
  filtrarUsuariosAdmin,
  copiarPlantilla,
  eliminarPlantilla,
  agregarCampoPorTipo,
  abrirPreviewLocal
} from './admin.js';

// --- BANDEJAS: CARGAR Y RENDERIZAR TABLA DE SOLICITUDES ---

export function mostrarSkeletonBandeja() {
  const solicitudesList = document.getElementById('solicitudes-list');
  if (!solicitudesList) return;
  solicitudesList.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.className = 'skeleton-row';
    tr.innerHTML = `
      <td><div class="skeleton skeleton-code"></div></td>
      <td><div class="skeleton skeleton-type"></div></td>
      <td><div class="skeleton skeleton-name"></div></td>
      <td><div class="skeleton skeleton-date"></div></td>
      <td><div class="skeleton skeleton-badge-group"></div></td>
      <td><div class="skeleton skeleton-badge"></div></td>
      <td><div class="skeleton skeleton-btn"></div></td>
    `;
    solicitudesList.appendChild(tr);
  }
}

export async function actualizarEstadisticasBandeja() {
  try {
    const response = await fetch('/api/solicitudes/stats', {
      headers: getAuthHeaders()
    });
    if (!response.ok) return;
    const stats = await response.json();

    const cntTodos = document.getElementById('count-todos');
    const cntEnRevision = document.getElementById('count-en_revision');
    const cntObservado = document.getElementById('count-observado');
    const cntAprobado = document.getElementById('count-aprobado');
    const cntBorrador = document.getElementById('count-borrador');

    if (cntTodos) cntTodos.textContent = stats.todos || 0;
    if (cntEnRevision) cntEnRevision.textContent = stats.en_revision || 0;
    if (cntObservado) cntObservado.textContent = stats.observado || 0;
    if (cntAprobado) cntAprobado.textContent = stats.aprobado || 0;
    if (cntBorrador) cntBorrador.textContent = stats.borrador || 0;

  } catch (error) {
    console.error('Error al actualizar estadísticas:', error);
  }
}

export async function cargarBandeja(isSilent = false) {
  const solicitudesList = document.getElementById('solicitudes-list');
  if (!solicitudesList) return;

  try {
    if (!isSilent) {
      mostrarSkeletonBandeja();
    }
    actualizarEstadisticasBandeja().catch(err => console.error(err));
    const searchInput = document.getElementById('buscador-solicitudes');
    const searchVal = searchInput ? searchInput.value.trim() : '';

    const url = `/api/solicitudes?page=${state.paginaActual}&limit=${state.limitePagina}&estado=${state.filtroEstadoActual}&search=${encodeURIComponent(searchVal)}`;

    const response = await fetch(url, {
      headers: getAuthHeaders()
    });
    const data = await response.json();

    state.todasLasSolicitudes = data.solicitudes;
    state.totalItems = data.total;
    state.totalPaginas = data.pages;

    renderizarSolicitudes();
    renderizarPaginacion();
  } catch (error) {
    console.error('Error al cargar bandeja:', error);
  }
}

export function renderizarSolicitudes() {
  const solicitudesList = document.getElementById('solicitudes-list');
  if (!solicitudesList) return;

  solicitudesList.innerHTML = '';

  if (state.todasLasSolicitudes.length === 0) {
    solicitudesList.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No se encontraron solicitudes en esta bandeja.</td>
      </tr>
    `;
    return;
  }

  state.todasLasSolicitudes.forEach(sol => {
    const tr = document.createElement('tr');

    const fecha = new Date(sol.fecha_actualizacion).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const codigoSeguimiento = generarCodigoSeguimiento(sol);

    let areaStatusBadge = '';
    if (sol.areas_validadoras) {
      areaStatusBadge = sol.areas_validadoras.map(area => {
        let bg = '#F1F5F9';
        let color = '#475569';
        let border = '1px solid var(--border-color)';

        const aprob = sol.estados_aprobaciones ? sol.estados_aprobaciones.find(a => a.area === area) : null;
        const estadoAprob = aprob ? aprob.estado : 'pendiente';

        if (sol.estado === 'aprobado') {
          bg = '#D4EDDA';
          color = '#155724';
          border = '1px solid #C3E6CB';
        } else if (sol.estado === 'borrador') {
          bg = '#F1F5F9';
          color = '#475569';
          border = '1px solid var(--border-color)';
        } else {
          if (estadoAprob === 'aprobado') {
            bg = '#D4EDDA';
            color = '#155724';
            border = '1px solid #C3E6CB';
          } else if (sol.estado === 'observado' && sol.ultima_observacion_area === area) {
            bg = '#F8D7DA';
            color = '#721C24';
            border = '1px solid #F5C6CB';
          } else {
            bg = '#F1F5F9';
            color = '#475569';
            border = '1px solid var(--border-color)';
          }
        }

        const areaLabels = {
          seguridad: 'GISICS',
          gibdd: 'GIBDD',
          giitrc: 'GIITRC',
          osi: 'OSI',
          director: 'DIRECTOR'
        };
        const badgeText = areaLabels[area] || area.toUpperCase();

        return `<span class="badge" style="background-color: ${bg}; color: ${color}; border: ${border}; font-size:0.65rem; margin-right:4px; padding: 2px 6px; font-weight: bold; border-radius: 4px;">${badgeText}</span>`;
      }).join('');
    }

    tr.innerHTML = `
      <td class="font-bold" style="font-size: 0.85rem; word-break: break-all;">${escaparHTML(codigoSeguimiento)}</td>
      <td>${escaparHTML(sol.tipo_nombre)}</td>
      <td>${escaparHTML(sol.solicitante_nombre)}</td>
      <td>${fecha}</td>
      <td>${areaStatusBadge}</td>
      <td><span class="badge badge-${sol.estado}">${sol.estado.replace('_', ' ')}</span></td>
      <td>
        <div style="display: flex; gap: 6px; align-items: center;">
          <button class="btn btn-outline btn-sm" onclick="verDetalle(${sol.id})">🔍 Ver</button>
          ${sol.estado === 'aprobado' ? `<button class="btn btn-primary btn-sm" style="font-weight: bold;" onclick="descargarPDF(${sol.id})">📥 PDF</button>` : ''}
        </div>
      </td>
    `;
    solicitudesList.appendChild(tr);
  });
}

export function renderizarPaginacion() {
  const paginacionInfo = document.getElementById('paginacion-info');
  const paginacionControles = document.getElementById('paginacion-controles');

  if (!paginacionInfo || !paginacionControles) return;

  if (state.totalItems === 0) {
    paginacionInfo.textContent = 'Mostrando solicitudes 0-0 de 0';
    paginacionControles.innerHTML = '';
    return;
  }

  const inicio = (state.paginaActual - 1) * state.limitePagina + 1;
  const fin = Math.min(state.paginaActual * state.limitePagina, state.totalItems);
  paginacionInfo.textContent = `Mostrando solicitudes ${inicio}-${fin} de ${state.totalItems}`;

  let html = '';
  html += `<button type="button" class="btn btn-outline btn-sm" ${state.paginaActual === 1 ? 'disabled' : ''} onclick="cambiarPagina(${state.paginaActual - 1})">◀ Anterior</button>`;

  const maxVisibles = 5;
  let pagInicio = Math.max(1, state.paginaActual - 2);
  let pagFin = Math.min(state.totalPaginas, pagInicio + maxVisibles - 1);
  if (pagFin - pagInicio < maxVisibles - 1) {
    pagInicio = Math.max(1, pagFin - maxVisibles + 1);
  }

  for (let i = pagInicio; i <= pagFin; i++) {
    html += `<button type="button" class="btn ${i === state.paginaActual ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="cambiarPagina(${i})">${i}</button>`;
  }

  html += `<button type="button" class="btn btn-outline btn-sm" ${state.paginaActual === state.totalPaginas ? 'disabled' : ''} onclick="cambiarPagina(${state.paginaActual + 1})">Siguiente ▶</button>`;

  paginacionControles.innerHTML = html;
}

export function cambiarPagina(nuevaPagina) {
  if (nuevaPagina < 1 || nuevaPagina > state.totalPaginas) return;
  state.paginaActual = nuevaPagina;
  cargarBandeja();
}

export function debouncedBuscar() {
  clearTimeout(state.searchDebounceTimeout);
  state.searchDebounceTimeout = setTimeout(() => {
    state.paginaActual = 1;
    cargarBandeja();
  }, 300);
}

export function filtrarBandeja(estado, elem) {
  state.filtroEstadoActual = estado;

  const solicitudesView = document.getElementById('solicitudes-view');
  const adminUsuariosView = document.getElementById('admin-usuarios-view');
  const adminFormulariosView = document.getElementById('admin-formularios-view');
  const adminCorreosView = document.getElementById('admin-correos-view');

  if (solicitudesView) solicitudesView.classList.remove('hidden');
  if (adminUsuariosView) adminUsuariosView.classList.add('hidden');
  if (adminFormulariosView) adminFormulariosView.classList.add('hidden');
  if (adminCorreosView) adminCorreosView.classList.add('hidden');

  const links = document.querySelectorAll('.sidebar-nav a');
  links.forEach(l => l.classList.remove('active'));
  if (elem) elem.classList.add('active');

  const titulos = {
    todos: 'Todas las Solicitudes',
    borrador: 'Mis Borradores',
    en_revision: 'En Revisión Técnica',
    observado: 'Solicitudes con Observaciones',
    aprobado: 'Solicitudes Aprobadas'
  };
  const descripciones = {
    todos: 'Consulta el estado actual de los trámites en curso.',
    borrador: 'Solicitudes creadas que aún no han sido enviadas a revisión.',
    en_revision: 'Solicitudes pendientes de visto bueno por las áreas encargadas.',
    observado: 'Solicitudes que requieren que corrijas la información ingresada.',
    aprobado: 'Solicitudes validadas de forma exitosa, listas para su descarga.'
  };

  const bandTitulo = document.getElementById('bandeja-titulo');
  const bandDesc = document.getElementById('bandeja-descripcion');
  if (bandTitulo) bandTitulo.textContent = titulos[estado];
  if (bandDesc) bandDesc.textContent = descripciones[estado];

  state.paginaActual = 1;
  cargarBandeja();
}

export async function cargarTiposSolicitud() {
  try {
    const response = await fetch('/api/tipos-solicitud', {
      headers: getAuthHeaders()
    });
    state.tiposSolicitud = await response.json();

    const selectTipoSolicitud = document.getElementById('select-tipo-solicitud');
    if (selectTipoSolicitud) {
      selectTipoSolicitud.innerHTML = '<option value="">-- Seleccione un tipo --</option>';
      state.tiposSolicitud.forEach(tipo => {
        const option = document.createElement('option');
        option.value = tipo.id;
        option.textContent = `[${tipo.codigo}] ${tipo.nombre}`;
        selectTipoSolicitud.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error al cargar tipos de solicitud:', error);
  }
}

// --- BOOTSTRAP INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('svt_user');
  const savedToken = localStorage.getItem('svt_token');
  if (savedUser && savedToken) {
    state.currentUser = JSON.parse(savedUser);
    state.authToken = savedToken;
    mostrarAppPrincipal();
  } else {
    localStorage.removeItem('svt_user');
    localStorage.removeItem('svt_token');
    mostrarLogin();
  }

  // --- EVENT LISTENERS BINDINGS ---

  const loginForm = document.getElementById('login-form');
  if (loginForm) loginForm.addEventListener('submit', loginFormHandler);

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', cerrarSesion);

  const btnNuevaSolicitud = document.getElementById('btn-nueva-solicitud');
  if (btnNuevaSolicitud) {
    btnNuevaSolicitud.addEventListener('click', () => {
      const solicitudIdInput = document.getElementById('solicitud-id');
      const selectTipoSolicitud = document.getElementById('select-tipo-solicitud');
      const camposDinamicosContainer = document.getElementById('campos-dinamicos-container');
      const btnGuardarBorrador = document.getElementById('btn-guardar-borrador');
      const modalSolicitud = document.getElementById('modal-solicitud');
      const title = document.getElementById('modal-solicitud-titulo');

      if (solicitudIdInput) solicitudIdInput.value = '';
      if (selectTipoSolicitud) {
        selectTipoSolicitud.value = '';
        selectTipoSolicitud.disabled = false;
      }
      if (camposDinamicosContainer) {
        camposDinamicosContainer.innerHTML = '<p class="form-help-text">Selecciona un tipo de solicitud para ver los campos requeridos.</p>';
      }
      if (title) title.textContent = 'Registrar Solicitud Técnica';
      if (btnGuardarBorrador) btnGuardarBorrador.classList.remove('hidden');

      const btnEnviarRevision = document.getElementById('btn-enviar-revision');
      if (btnEnviarRevision) btnEnviarRevision.textContent = 'Enviar a Revisión';

      if (modalSolicitud) modalSolicitud.classList.remove('hidden');
    });
  }

  const selectTipoSolicitud = document.getElementById('select-tipo-solicitud');
  if (selectTipoSolicitud) {
    selectTipoSolicitud.addEventListener('change', () => {
      const tipoId = parseInt(selectTipoSolicitud.value, 10);
      renderizarCamposDinamicos(tipoId);
    });
  }

  const btnGuardarBorrador = document.getElementById('btn-guardar-borrador');
  if (btnGuardarBorrador) {
    btnGuardarBorrador.addEventListener('click', () => enviarFormulario(false));
  }

  const solicitudForm = document.getElementById('solicitud-form');
  if (solicitudForm) {
    solicitudForm.addEventListener('submit', (e) => {
      e.preventDefault();
      enviarFormulario(true);
    });
  }

  const correoPruebaForm = document.getElementById('correo-prueba-form');
  if (correoPruebaForm) {
    correoPruebaForm.addEventListener('submit', enviarCorreoPruebaHandler);
  }

  const usuarioForm = document.getElementById('usuario-form');
  if (usuarioForm) {
    usuarioForm.addEventListener('submit', usuarioFormSubmitHandler);
  }

  const plantillaForm = document.getElementById('plantilla-form');
  if (plantillaForm) {
    plantillaForm.addEventListener('submit', plantillaFormSubmitHandler);
  }

  const btnPreviewPlantilla = document.getElementById('btn-preview-plantilla');
  if (btnPreviewPlantilla) {
    btnPreviewPlantilla.addEventListener('click', previsualizarPDFPlantilla);
  }

  // Actividad de usuario
  window.addEventListener('mousemove', registrarActividadUsuario);
  window.addEventListener('keypress', registrarActividadUsuario);
  window.addEventListener('click', registrarActividadUsuario);

  // Visibilidad de página
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (state.currentUser) {
        state.ultimoContactoUsuario = Date.now();
        iniciarAutoRefresh();
        
        const solicitudesView = document.getElementById('solicitudes-view');
        const modalDetalle = document.getElementById('modal-detalle');
        if (solicitudesView && !solicitudesView.classList.contains('hidden')) {
          cargarBandeja(true).catch(err => console.error(err));
        }
        if (modalDetalle && !modalDetalle.classList.contains('hidden') && state.activeSolicitudId !== null) {
          verDetalle(state.activeSolicitudId, true).catch(err => console.error(err));
        }
      }
    } else {
      detenerAutoRefresh();
    }
  });
});

// --- GLOBAL EXPOSURE (COMPATIBILITY WITH INLINE HTML ONCLICK ATTRIBUTES) ---

window.filtrarBandeja = filtrarBandeja;
window.verDetalle = verDetalle;
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.abrirEdicion = abrirEdicion;
window.realizarReapertura = realizarReapertura;
window.realizarObservacionSimple = realizarObservacionSimple;
window.asignarSolicitud = asignarSolicitud;
window.desasignarSolicitud = desasignarSolicitud;
window.navegarAdmin = navegarAdmin;
window.abrirModalUsuario = abrirModalUsuario;
window.desactivarUsuario = desactivarUsuario;
window.activarUsuario = activarUsuario;
window.abrirModalPlantilla = abrirModalPlantilla;
window.copiarPlantilla = copiarPlantilla;
window.eliminarPlantilla = eliminarPlantilla;
window.agregarFilaCampoVisual = agregarFilaCampoVisual;
window.eliminarFilaCampoVisual = eliminarFilaCampoVisual;
window.agregarFilaColumnaVisual = agregarFilaColumnaVisual;
window.agregarFilaVisual = agregarFilaVisual;
window.actualizarFilaCampoRequerido = actualizarFilaCampoRequerido;
window.actualizarFilaColumnaFirmante = actualizarFilaColumnaFirmante;
window.cambiarSelectorRol = cambiarSelectorRol;
window.descargarPDF = descargarPDF;
window.cambiarPagina = cambiarPagina;
window.debouncedBuscar = debouncedBuscar;
window.agregarCampoPorTipo = agregarCampoPorTipo;
window.abrirPreviewLocal = abrirPreviewLocal;
window.filtrarUsuariosAdmin = filtrarUsuariosAdmin;
