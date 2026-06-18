import { state } from './state.js';
import { iniciarAutoRefresh, detenerAutoRefresh } from './polling.js';
import { toast } from './utils.js';

export function mostrarLogin() {
  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('app-container');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginError = document.getElementById('login-error');

  if (loginContainer) loginContainer.classList.remove('hidden');
  if (appContainer) appContainer.classList.add('hidden');
  document.body.classList.add('login-body');
  if (usernameInput) usernameInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (loginError) loginError.classList.add('hidden');
}

export async function mostrarAppPrincipal() {
  const loginContainer = document.getElementById('login-container');
  const appContainer = document.getElementById('app-container');
  const userDisplayName = document.getElementById('user-display-name');
  const userDisplayRole = document.getElementById('user-display-role');
  const adminSidebarMenu = document.getElementById('admin-sidebar-menu');
  const btnNuevaSolicitudContainer = document.getElementById('btn-nueva-solicitud-container');
  const tabBorrador = document.getElementById('tab-borrador');
  const bandejasMenu = document.getElementById('bandejas-menu');

  if (loginContainer) loginContainer.classList.add('hidden');
  if (appContainer) appContainer.classList.remove('hidden');
  document.body.classList.remove('login-body');

  if (userDisplayName) userDisplayName.textContent = state.currentUser.nombre;
  if (userDisplayRole) {
    userDisplayRole.textContent = state.currentUser.rol === 'tecnico' ? `TÉCNICO: ${state.currentUser.area.toUpperCase()}` : state.currentUser.rol.toUpperCase();
    userDisplayRole.className = 'badge';
    userDisplayRole.classList.add(`badge-${state.currentUser.rol}`);
  }

  if (state.currentUser.rol === 'admin') {
    if (adminSidebarMenu) adminSidebarMenu.classList.remove('hidden');
    if (bandejasMenu) bandejasMenu.classList.add('hidden');
    if (btnNuevaSolicitudContainer) btnNuevaSolicitudContainer.classList.add('hidden');
    if (tabBorrador) tabBorrador.classList.add('hidden');
  } else {
    if (adminSidebarMenu) adminSidebarMenu.classList.add('hidden');
    if (bandejasMenu) bandejasMenu.classList.remove('hidden');
    if (state.currentUser.rol !== 'solicitante') {
      if (btnNuevaSolicitudContainer) btnNuevaSolicitudContainer.classList.add('hidden');
      if (tabBorrador) tabBorrador.classList.add('hidden');
    } else {
      if (btnNuevaSolicitudContainer) btnNuevaSolicitudContainer.classList.remove('hidden');
      if (tabBorrador) tabBorrador.classList.remove('hidden');
    }
  }

  // Cargar datos y configurar vistas según rol
  if (state.currentUser.rol === 'admin') {
    const { navegarAdmin } = await import('./admin.js');
    const tabAdminUsuarios = document.getElementById('tab-admin-usuarios');
    if (tabAdminUsuarios) navegarAdmin('usuarios', tabAdminUsuarios);
    const { cargarTiposSolicitud } = await import('./app.js');
    await cargarTiposSolicitud();
  } else {
    const solicitudesView = document.getElementById('solicitudes-view');
    const adminUsuariosView = document.getElementById('admin-usuarios-view');
    const adminFormulariosView = document.getElementById('admin-formularios-view');

    if (solicitudesView) solicitudesView.classList.remove('hidden');
    if (adminUsuariosView) adminUsuariosView.classList.add('hidden');
    if (adminFormulariosView) adminFormulariosView.classList.add('hidden');

    const links = document.querySelectorAll('.sidebar-nav a');
    links.forEach(l => l.classList.remove('active'));
    const tabBandejaTodos = document.getElementById('tab-bandeja-todos');
    if (tabBandejaTodos) tabBandejaTodos.classList.add('active');

    const { cargarTiposSolicitud, cargarBandeja } = await import('./app.js');
    await cargarTiposSolicitud();
    await cargarBandeja();
  }

  iniciarAutoRefresh();
}

export function cerrarSesion() {
  detenerAutoRefresh();
  state.currentUser = null;
  state.authToken = null;
  localStorage.removeItem('svt_user');
  localStorage.removeItem('svt_token');
  mostrarLogin();
}

export async function loginFormHandler(e) {
  e.preventDefault();
  const loginError = document.getElementById('login-error');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  if (loginError) loginError.classList.add('hidden');

  const username = usernameInput ? usernameInput.value : '';
  const password = passwordInput ? passwordInput.value : '';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al iniciar sesión.');
    }

    state.authToken = data.token;
    state.currentUser = data;
    delete state.currentUser.token;
    localStorage.setItem('svt_user', JSON.stringify(state.currentUser));
    localStorage.setItem('svt_token', state.authToken);
    await mostrarAppPrincipal();
  } catch (error) {
    if (loginError) {
      loginError.textContent = error.message;
      loginError.classList.remove('hidden');
    } else {
      toast(error.message);
    }
  }
}
