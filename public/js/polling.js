import { state } from './state.js';
import { verDetalle } from './modals.js';
import { cargarBandeja } from './app.js';

// AUTO-ACTUALIZACIÓN PERIÓDICA INTELIGENTE (POLLING DE 15 SEGUNDOS)
export const AUTO_REFRESH_INTERVAL = 15000;
export const MAX_INACTIVITY_TIME = 5 * 60 * 60 * 1000; // 5 horas (18000000ms)
export const MAX_SESSION_INACTIVITY_TIME = 5 * 60 * 60 * 1000; // 5 horas (18000000ms)

export function registrarActividadUsuario() {
  state.ultimoContactoUsuario = Date.now();
}

export function iniciarAutoRefresh() {
  detenerAutoRefresh(); // Evitar duplicaciones
  
  async function tick() {
    if (!state.currentUser) {
      detenerAutoRefresh();
      return;
    }

    // No realizar peticiones si la pestaña no está visible
    if (document.visibilityState !== 'visible') {
      detenerAutoRefresh();
      return;
    }

    // Detener auto-refresh si el usuario está inactivo
    const tiempoInactivo = Date.now() - state.ultimoContactoUsuario;
    if (tiempoInactivo > MAX_INACTIVITY_TIME) {
      console.log('Auto-refresh pausado por inactividad del usuario.');
      
      const reanudarAlInteractuar = () => {
        window.removeEventListener('mousemove', reanudarAlInteractuar);
        window.removeEventListener('keypress', reanudarAlInteractuar);
        window.removeEventListener('click', reanudarAlInteractuar);
        state.ultimoContactoUsuario = Date.now();
        iniciarAutoRefresh();
        
        const solicitudesView = document.getElementById('solicitudes-view');
        const modalDetalle = document.getElementById('modal-detalle');
        // Refrescar al instante al retomar actividad
        if (solicitudesView && !solicitudesView.classList.contains('hidden')) {
          cargarBandeja(true).catch(err => console.error(err));
        }
        if (modalDetalle && !modalDetalle.classList.contains('hidden') && state.activeSolicitudId !== null) {
          verDetalle(state.activeSolicitudId, true).catch(err => console.error(err));
        }
      };

      window.addEventListener('mousemove', reanudarAlInteractuar);
      window.addEventListener('keypress', reanudarAlInteractuar);
      window.addEventListener('click', reanudarAlInteractuar);
      return;
    }

    try {
      const solicitudesView = document.getElementById('solicitudes-view');
      const modalDetalle = document.getElementById('modal-detalle');
      // Refrescar bandeja en segundo plano de forma silenciosa (isSilent = true)
      if (solicitudesView && !solicitudesView.classList.contains('hidden')) {
        await cargarBandeja(true);
      }
      // Refrescar detalle en segundo plano si está abierto
      if (modalDetalle && !modalDetalle.classList.contains('hidden') && state.activeSolicitudId !== null) {
        await verDetalle(state.activeSolicitudId, true);
      }
    } catch (e) {
      console.error('Error durante el auto-refresh:', e);
    } finally {
      // Programar siguiente ciclo
      if (state.currentUser && document.visibilityState === 'visible') {
        state.autoRefreshTimeout = setTimeout(tick, AUTO_REFRESH_INTERVAL);
      }
    }
  }

  state.autoRefreshTimeout = setTimeout(tick, AUTO_REFRESH_INTERVAL);
}

export function detenerAutoRefresh() {
  if (state.autoRefreshTimeout) {
    clearTimeout(state.autoRefreshTimeout);
    state.autoRefreshTimeout = null;
  }
}

let chequeoInactividadInterval = null;

export function iniciarChequeoInactividad() {
  detenerChequeoInactividad();
  state.ultimoContactoUsuario = Date.now();

  chequeoInactividadInterval = setInterval(async () => {
    if (!state.currentUser) {
      detenerChequeoInactividad();
      return;
    }

    const tiempoInactivo = Date.now() - state.ultimoContactoUsuario;
    if (tiempoInactivo >= MAX_SESSION_INACTIVITY_TIME) {
      detenerChequeoInactividad();
      const { toast } = await import('./utils.js');
      toast('Tu sesión ha expirado por inactividad (5 horas).');
      const { cerrarSesion } = await import('./auth.js');
      cerrarSesion();
    }
  }, 10000); // Comprobar cada 10 segundos
}

export function detenerChequeoInactividad() {
  if (chequeoInactividadInterval) {
    clearInterval(chequeoInactividadInterval);
    chequeoInactividadInterval = null;
  }
}
