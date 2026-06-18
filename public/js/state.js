// Estado Global de la Aplicación en el Cliente
export const state = {
  currentUser: null,
  authToken: null,
  tiposSolicitud: [],
  todasLasSolicitudes: [],
  filtroEstadoActual: 'todos',
  activeSolicitudId: null,
  autoRefreshTimeout: null,
  todosLosUsuariosAdmin: [],

  // Paginación y búsqueda de solicitudes
  paginaActual: 1,
  limitePagina: 10,
  totalPaginas: 1,
  totalItems: 0,
  searchDebounceTimeout: null,

  // Control de inactividad
  ultimoContactoUsuario: Date.now()
};
