// Estado Global de la Aplicación en el Cliente
let currentUser = null;
let tiposSolicitud = [];
let todasLasSolicitudes = [];
let filtroEstadoActual = 'todos';
let activeSolicitudId = null;
let autoRefreshInterval = null;

// Paginación y búsqueda de solicitudes
let paginaActual = 1;
let limitePagina = 10;
let totalPaginas = 1;
let totalItems = 0;
let searchDebounceTimeout = null;

// Diccionario de Nombres Oficiales de Áreas
const NOMBRES_AREAS = {
  seguridad: 'Gestión Interna de Seguridad Informática y Calidad de Software - (GISICS)',
  gibdd: 'Gestión Interna de Base de Datos - (GIBD)',
  giitrc: 'Gestión Interna de Infraestructura - (GIITRC)',
  osi: 'Oficial de Seguridad de la Información - (OSI)',
  director: 'Director DTIC MSP',
  solicitante: 'Solicitante',
  admin: 'Administrador'
};

function obtenerNombreArea(areaKey) {
  return NOMBRES_AREAS[areaKey] || areaKey;
}

function escaparHTML(str) {
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

// Diccionario de Nombres Oficiales de Áreas (Sin Siglas ni Acrónimos al final)
const NOMBRES_AREAS_SIN_SIGLAS = {
  seguridad: 'Gestión Interna de Seguridad Informática y Calidad de Software',
  gibdd: 'Gestión Interna de Base de Datos',
  giitrc: 'Gestión Interna de Infraestructura',
  osi: 'Oficial de Seguridad de la Información',
  director: 'Director DTIC MSP',
  solicitante: 'Solicitante',
  admin: 'Administrador'
};

function obtenerNombreAreaSinSiglas(areaKey) {
  return NOMBRES_AREAS_SIN_SIGLAS[areaKey] || areaKey;
}



// Elementos del DOM
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

const userDisplayName = document.getElementById('user-display-name');
const userDisplayRole = document.getElementById('user-display-role');
const logoutBtn = document.getElementById('logout-btn');

const btnNuevaSolicitudContainer = document.getElementById('btn-nueva-solicitud-container');
const btnNuevaSolicitud = document.getElementById('btn-nueva-solicitud');
const solicitudesList = document.getElementById('solicitudes-list');

const modalSolicitud = document.getElementById('modal-solicitud');
const solicitudForm = document.getElementById('solicitud-form');
const selectTipoSolicitud = document.getElementById('select-tipo-solicitud');
const camposDinamicosContainer = document.getElementById('campos-dinamicos-container');
const solicitudIdInput = document.getElementById('solicitud-id');
const btnGuardarBorrador = document.getElementById('btn-guardar-borrador');

const modalDetalle = document.getElementById('modal-detalle');
const detCodigo = document.getElementById('det-codigo');
const detTipo = document.getElementById('det-tipo');
const detSolicitante = document.getElementById('det-solicitante');
const detFecha = document.getElementById('det-fecha');
const detEstado = document.getElementById('det-estado');
const detCamposValores = document.getElementById('det-campos-valores');
const detAprobacionesLista = document.getElementById('det-aprobaciones-lista');
const detObservacionesLista = document.getElementById('det-observaciones-lista');
const panelAccionesTecnicas = document.getElementById('panel-acciones-tecnicas');
const panelAsignacionContainer = document.getElementById('panel-asignacion-container');
const btnAprobarTecnico = document.getElementById('btn-aprobar-tecnico');
const btnAprobarConObservacion = document.getElementById('btn-aprobar-con-observacion');
const btnObservarTecnico = document.getElementById('btn-observar-tecnico');
const observacionTexto = document.getElementById('observacion-texto');
const detAccionesAdicionales = document.getElementById('det-acciones-adicionales');
const detFlujoSeccion = document.getElementById('detalle-flujo-seccion');


// Vistas y Menús de Administración
const adminSidebarMenu = document.getElementById('admin-sidebar-menu');
const solicitudesView = document.getElementById('solicitudes-view');
const adminUsuariosView = document.getElementById('admin-usuarios-view');
const adminFormulariosView = document.getElementById('admin-formularios-view');
const adminCorreosView = document.getElementById('admin-correos-view');
const adminUsuariosSegmentedContainer = document.getElementById('admin-usuarios-segmented-container');
const adminFormulariosList = document.getElementById('admin-formularios-list');
const correoPruebaForm = document.getElementById('correo-prueba-form');
const correoResultadoContainer = document.getElementById('correo-resultado-container');

// Modales y formularios de Administración
const modalUsuario = document.getElementById('modal-usuario');
const usuarioForm = document.getElementById('usuario-form');
const usuarioIdInput = document.getElementById('usuario-id');
const usrNombre = document.getElementById('usr-nombre');
const usrCedula = document.getElementById('usr-cedula');
const usrCargo = document.getElementById('usr-cargo');
const usrUsername = document.getElementById('usr-username');
const usrPassword = document.getElementById('usr-password');
const usrPasswordHelp = document.getElementById('usr-password-help');
const usrRol = document.getElementById('usr-rol');
const usrAreaGroup = document.getElementById('usr-area-group');
const usrArea = document.getElementById('usr-area');
const usrDireccionProyectoGroup = document.getElementById('usr-direccion-proyecto-group');
const usrDireccionProyecto = document.getElementById('usr-direccion-proyecto');
const usrFirmaGroup = document.getElementById('usr-firma-group');
const usrFirmaDocumentos = document.getElementById('usr-firma-documentos');

const modalPlantilla = document.getElementById('modal-plantilla');
const plantillaForm = document.getElementById('plantilla-form');
const plantillaIdInput = document.getElementById('plantilla-id');
const pltCodigo = document.getElementById('plt-codigo');
const pltNombre = document.getElementById('plt-nombre');
const pltDescripcion = document.getElementById('plt-descripcion');
const chkValSeguridad = document.getElementById('chk-val-seguridad');
const chkValGibdd = document.getElementById('chk-val-gibdd');
const chkValGiitrc = document.getElementById('chk-val-giitrc');
const chkValOsi = document.getElementById('chk-val-osi');
const chkValDirector = document.getElementById('chk-val-director');
const constructorCamposContainer = document.getElementById('constructor-campos-container');
const btnPreviewPlantilla = document.getElementById('btn-preview-plantilla');

// Campos de Notificación por Correo de la Plantilla
const pltMailDestinatario = document.getElementById('plt-mail-destinatario');
const pltMailCc = document.getElementById('plt-mail-cc');
const pltMailAsunto = document.getElementById('plt-mail-asunto');
const pltMailCuerpo = document.getElementById('plt-mail-cuerpo');
const pltMailProgreso = document.getElementById('plt-mail-progreso');

// Al iniciar, verificar si hay un usuario guardado en localStorage
document.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('svt_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    mostrarAppPrincipal();
  } else {
    mostrarLogin();
  }
});


// 1. INICIAR SESIÓN
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.classList.add('hidden');

  const username = usernameInput.value;
  const password = passwordInput.value;

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

    // Guardar usuario y cargar aplicación
    currentUser = data;
    localStorage.setItem('svt_user', JSON.stringify(currentUser));
    mostrarAppPrincipal();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.classList.remove('hidden');
  }
});

// 2. CERRAR SESIÓN
logoutBtn.addEventListener('click', () => {
  detenerAutoRefresh();
  currentUser = null;
  localStorage.removeItem('svt_user');
  mostrarLogin();
});

function mostrarLogin() {
  loginContainer.classList.remove('hidden');
  appContainer.classList.add('hidden');
  usernameInput.value = '';
  passwordInput.value = '';
}

async function mostrarAppPrincipal() {
  loginContainer.classList.add('hidden');
  appContainer.classList.remove('hidden');

  // Mostrar datos de perfil en el encabezado
  userDisplayName.textContent = currentUser.nombre;
  userDisplayRole.textContent = currentUser.rol === 'tecnico' ? `TÉCNICO: ${currentUser.area.toUpperCase()}` : currentUser.rol;
  
  // Ajustar color del badge de rol
  userDisplayRole.className = 'badge';
  userDisplayRole.classList.add(`badge-${currentUser.rol}`);

  const bandejasMenu = document.getElementById('bandejas-menu');

  // Mostrar/Ocultar menús según rol
  if (currentUser.rol === 'admin') {
    adminSidebarMenu.classList.remove('hidden');
    bandejasMenu.classList.add('hidden');
    btnNuevaSolicitudContainer.classList.add('hidden');
    document.getElementById('tab-borrador').classList.add('hidden');
  } else {
    adminSidebarMenu.classList.add('hidden');
    bandejasMenu.classList.remove('hidden');
    if (currentUser.rol !== 'solicitante') {
      btnNuevaSolicitudContainer.classList.add('hidden');
      document.getElementById('tab-borrador').classList.add('hidden');
    } else {
      btnNuevaSolicitudContainer.classList.remove('hidden');
      document.getElementById('tab-borrador').classList.remove('hidden');
    }
  }

  // Cargar datos y configurar vistas según rol
  if (currentUser.rol === 'admin') {
    // Redirigir al administrador a la sección de gestión de usuarios
    navegarAdmin('usuarios', document.getElementById('tab-admin-usuarios'));
    await cargarTiposSolicitud();
  } else {
    // Asegurar que la vista de solicitudes empiece visible y las de admin ocultas
    solicitudesView.classList.remove('hidden');
    adminUsuariosView.classList.add('hidden');
    adminFormulariosView.classList.add('hidden');
    
    // Resaltar pestaña por defecto
    const links = document.querySelectorAll('.sidebar-nav a');
    links.forEach(l => l.classList.remove('active'));
    document.getElementById('tab-bandeja-todos').classList.add('active');

    // Cargar datos
    await cargarTiposSolicitud();
    await cargarBandeja();
  }

  // Configurar auto-refresco periódico
  iniciarAutoRefresh();
}

// 3. OBTENER TIPOS DE FORMULARIOS DISPONIBLES
async function cargarTiposSolicitud() {
  try {
    const response = await fetch('/api/tipos-solicitud', {
      headers: { 'x-user-id': currentUser.id }
    });
    tiposSolicitud = await response.json();

    // Rellenar select del modal
    selectTipoSolicitud.innerHTML = '<option value="">-- Seleccione un tipo --</option>';
    tiposSolicitud.forEach(tipo => {
      const option = document.createElement('option');
      option.value = tipo.id;
      option.textContent = `[${tipo.codigo}] ${tipo.nombre}`;
      selectTipoSolicitud.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar tipos de solicitud:', error);
  }
}

// RENDERIZADO DINÁMICO DE CAMPOS DEL FORMULARIO
selectTipoSolicitud.addEventListener('change', () => {
  const tipoId = parseInt(selectTipoSolicitud.value, 10);
  renderizarCamposDinamicos(tipoId);
});

function renderizarCamposDinamicos(tipoId, valoresExistentes = null) {
  camposDinamicosContainer.innerHTML = '';
  if (!tipoId) {
    camposDinamicosContainer.innerHTML = '<p class="form-help-text">Selecciona un tipo de solicitud para ver los campos requeridos.</p>';
    return;
  }

  const tipo = tiposSolicitud.find(t => t.id === tipoId);
  if (!tipo) return;

  tipo.campos.forEach(campo => {
    if (campo.type === 'title') {
      const titleEl = document.createElement('h3');
      titleEl.className = 'form-section-title';
      titleEl.textContent = campo.label;
      camposDinamicosContainer.appendChild(titleEl);
      return;
    }
    if (campo.type === 'subtitle') {
      const subtitleEl = document.createElement('h4');
      subtitleEl.className = 'form-section-subtitle';
      subtitleEl.textContent = campo.label;
      camposDinamicosContainer.appendChild(subtitleEl);
      return;
    }
    if (campo.type === 'paragraph') {
      const paragraphEl = document.createElement('p');
      paragraphEl.className = 'form-section-paragraph';
      paragraphEl.textContent = campo.label;
      camposDinamicosContainer.appendChild(paragraphEl);
      return;
    }
    if (campo.type === 'info_no_pdf') {
      const paragraphEl = document.createElement('p');
      paragraphEl.className = 'form-section-paragraph info-no-pdf-paragraph';
      paragraphEl.innerHTML = `<strong>ℹ️ Informativo:</strong> ${campo.label}`;
      camposDinamicosContainer.appendChild(paragraphEl);
      return;
    }

    if (campo.type === 'checkbox') {
      const checkboxContainer = document.createElement('div');
      checkboxContainer.className = 'form-group checkbox-container';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = campo.name;
      input.id = `campo-${campo.name}`;
      input.className = 'standalone-checkbox-input';
      
      const val = (valoresExistentes && valoresExistentes[campo.name] !== undefined && valoresExistentes[campo.name] !== null) ? valoresExistentes[campo.name] : '';
      input.checked = (val === 'X' || val === true || val === 'true');
      if (campo.required) input.required = true;

      const label = document.createElement('label');
      label.setAttribute('for', `campo-${campo.name}`);
      label.textContent = campo.label;
      if (campo.required) label.textContent += ' *';

      checkboxContainer.appendChild(input);
      checkboxContainer.appendChild(label);
      camposDinamicosContainer.appendChild(checkboxContainer);
      return;
    }

    if (campo.type === 'grid' || campo.type === 'fixed_grid' || campo.type === 'fixed_grid_dynamic_cols' || campo.type === 'fixed_grid_fixed_cols') {
      const gridContainer = document.createElement('div');
      gridContainer.className = 'grid-container form-group';
      gridContainer.dataset.name = campo.name;

      const label = document.createElement('label');
      label.textContent = campo.label;
      if (campo.required) label.textContent += ' *';
      gridContainer.appendChild(label);

      const table = document.createElement('table');
      table.className = 'form-grid-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      
      // Si es grid de filas fijas, agregar columna inicial para las etiquetas fijas
      const isFixedGridType = (campo.type === 'fixed_grid' || campo.type === 'fixed_grid_dynamic_cols' || campo.type === 'fixed_grid_fixed_cols');
      if (isFixedGridType && Array.isArray(campo.rows) && campo.rows.length > 0) {
        const thLabel = document.createElement('th');
        thLabel.textContent = campo.row_label || 'Descripción / Fila';
        headerRow.appendChild(thLabel);
      }

      let columns = [...(campo.columns || [])];
      if (campo.type === 'fixed_grid_dynamic_cols') {
        const existingData = valoresExistentes ? valoresExistentes[campo.name] : null;
        if (Array.isArray(existingData) && existingData.length > 0) {
          const allKeys = new Set();
          existingData.forEach(row => {
            Object.keys(row).forEach(k => allKeys.add(k));
          });
          const rowLabelKey = campo.row_label || 'Descripción / Fila';
          const predefinedColNames = columns.map(col => typeof col === 'object' ? col.name : col);
          allKeys.forEach(key => {
            if (key !== rowLabelKey && key !== 'Descripción / Fila' && !predefinedColNames.includes(key)) {
              columns.push({ name: key, type: 'text', required: false });
            }
          });
        }
      }

      columns.forEach(col => {
        const colName = typeof col === 'object' ? col.name : col;
        const colType = typeof col === 'object' ? col.type : 'text';
        const isColRequired = (typeof col === 'object' ? (col.required || false) : false) || (campo.required || false);
        const th = document.createElement('th');
        th.textContent = colName + (isColRequired ? ' *' : '');
        if (colType === 'checkbox') {
          th.className = 'checkbox-header';
        }
        headerRow.appendChild(th);
      });

      // Solo el grid dinámico legacy tiene columna de acción para borrar filas
      if (campo.type === 'grid') {
        const thAction = document.createElement('th');
        thAction.textContent = 'Acción';
        thAction.className = 'action-header';
        headerRow.appendChild(thAction);
      }
      
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      table.appendChild(tbody);
      gridContainer.appendChild(table);

      const addRowFn = (rowData = null, rowName = null) => {
        const tr = document.createElement('tr');
        tr.className = 'grid-row';
        
        // Si es grid de filas fijas, insertar la celda de descripción de fila predefinida
        if (isFixedGridType && Array.isArray(campo.rows) && campo.rows.length > 0) {
          const tdLabel = document.createElement('td');
          tdLabel.className = 'fixed-row-label';
          
          const labelInput = document.createElement('input');
          labelInput.type = 'hidden';
          labelInput.className = 'grid-cell-label-input';
          labelInput.value = rowName || (rowData ? (campo.row_label && rowData[campo.row_label] !== undefined ? rowData[campo.row_label] : rowData['Descripción / Fila']) : '');
          
          tdLabel.textContent = labelInput.value;
          tdLabel.appendChild(labelInput);
          tr.appendChild(tdLabel);
        }

        columns.forEach(col => {
          const colName = typeof col === 'object' ? col.name : col;
          const colType = typeof col === 'object' ? col.type : 'text';
          const isColRequired = (typeof col === 'object' ? (col.required || false) : false) || (campo.required || false);
          
          const td = document.createElement('td');
          td.style.padding = '0.3rem';
          td.style.border = '1px solid var(--border-color)';
          td.style.textAlign = colType === 'checkbox' ? 'center' : 'left';
          
          const isColFirmanteComposite = ((colType === 'firmante' || colType === 'firmante_seccion') && typeof col === 'object' && (col.recoger_cedula || col.recoger_cargo));
          if (colType === 'checkbox') {
            const input = document.createElement('input');
            input.className = 'grid-cell-input';
            input.dataset.column = colName;
            input.type = 'checkbox';
            const val = rowData ? rowData[colName] : '';
            input.checked = (val === 'X' || val === true || val === 'true');
            td.appendChild(input);
          } else if (isColFirmanteComposite) {
            const compDiv = document.createElement('div');
            compDiv.className = 'grid-cell-firmante-composite';

            const cellHiddenInput = document.createElement('input');
            cellHiddenInput.type = 'hidden';
            cellHiddenInput.className = 'grid-cell-input';
            cellHiddenInput.dataset.column = colName;
            compDiv.appendChild(cellHiddenInput);

            const val = rowData ? (rowData[colName] || '') : '';
            let parsed = { nombre: '', cedula: '', cargo: '' };
            if (val) {
              try {
                parsed = JSON.parse(val);
              } catch (e) {
                parsed.nombre = val;
              }
            }

            const updateCell = () => {
              const data = {
                nombre: nomInp.value.trim(),
                cedula: cedInp ? cedInp.value.trim() : '',
                cargo: carInp ? carInp.value.trim() : ''
              };
              cellHiddenInput.value = (data.nombre || data.cedula || data.cargo) ? JSON.stringify(data) : '';
            };

            const nomInp = document.createElement('input');
            nomInp.type = 'text';
            nomInp.placeholder = 'Nombre';
            nomInp.value = parsed.nombre;
            if (isColRequired) nomInp.required = true;
            nomInp.oninput = updateCell;
            compDiv.appendChild(nomInp);

            let cedInp = null;
            if (col.recoger_cedula) {
              cedInp = document.createElement('input');
              cedInp.type = 'text';
              cedInp.placeholder = 'Cédula';
              cedInp.value = parsed.cedula;
              cedInp.maxLength = 10;
              cedInp.onkeypress = (e) => {
                if (e.key < '0' || e.key > '9') {
                  e.preventDefault();
                }
              };
              cedInp.oninput = (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
                updateCell();
              };
              compDiv.appendChild(cedInp);
            }

            let carInp = null;
            if (col.recoger_cargo) {
              carInp = document.createElement('input');
              carInp.type = 'text';
              carInp.placeholder = 'Cargo';
              carInp.value = parsed.cargo;
              carInp.oninput = updateCell;
              compDiv.appendChild(carInp);
            }

            updateCell();
            td.appendChild(compDiv);
          } else if (colType === 'select') {
            const selectEl = document.createElement('select');
            selectEl.className = 'grid-cell-input';
            selectEl.dataset.column = colName;
            
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '-- Seleccione --';
            selectEl.appendChild(defaultOpt);
            
            const opts = Array.isArray(col.options) ? col.options : (col.options ? col.options.split(',').map(o => o.trim()) : []);
            opts.forEach(optVal => {
              const opt = document.createElement('option');
              opt.value = optVal;
              opt.textContent = optVal;
              selectEl.appendChild(opt);
            });
            
            selectEl.value = rowData ? (rowData[colName] || '') : '';
            if (isColRequired) selectEl.required = true;
            td.appendChild(selectEl);
          } else {
            const input = document.createElement('input');
            input.className = 'grid-cell-input';
            input.dataset.column = colName;
            if (colType === 'number') {
              input.type = 'number';
              input.placeholder = '0';
              input.min = '0';
            } else if (colType === 'date') {
              input.type = 'date';
            } else if (colType === 'email') {
              input.type = 'email';
              input.placeholder = 'correo@ejemplo.com';
            } else if (colType === 'identificacion') {
              input.type = 'text';
              input.dataset.type = 'identificacion';
              input.maxLength = 10;
              input.placeholder = '10 dígitos';
              input.onkeypress = (e) => {
                if (e.key < '0' || e.key > '9') {
                  e.preventDefault();
                }
              };
              input.oninput = (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
              };
            } else {
              input.type = 'text';
              input.placeholder = `Ingresa ${colName.toLowerCase()}`;
              if (colType === 'text') {
                input.maxLength = 100;
              } else if (colType === 'textarea') {
                input.maxLength = 500;
              }
            }
            input.value = rowData ? (rowData[colName] || '') : '';
            if (isColRequired) input.required = true;
            td.appendChild(input);
          }
          tr.appendChild(td);
        });

        // Solo el grid dinámico tiene columna de acción para borrar fila
        if (campo.type === 'grid') {
          const tdAction = document.createElement('td');
          tdAction.className = 'action-cell';
          
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'btn btn-outline btn-sm';
          delBtn.innerHTML = '🗑️';
          delBtn.onclick = () => {
            tr.remove();
          };
          
          tdAction.appendChild(delBtn);
          tr.appendChild(tdAction);
        }
        tbody.appendChild(tr);
      };

      if (isFixedGridType) {
        const existingData = valoresExistentes ? valoresExistentes[campo.name] : null;
        const rows = campo.rows || [];
        if (rows.length > 0) {
          rows.forEach(rName => {
            const rowData = Array.isArray(existingData)
              ? existingData.find(d => d['Descripción / Fila'] === rName || (campo.row_label && d[campo.row_label] === rName))
              : null;
            addRowFn(rowData, rName);
          });
        } else {
          if (Array.isArray(existingData) && existingData.length > 0) {
            existingData.forEach(rowData => addRowFn(rowData));
          } else {
            addRowFn(); // Renderizar exactamente 1 fila predeterminada
          }
        }

        // Para fixed_grid_dynamic_cols, permitir al solicitante agregar columnas
        if (campo.type === 'fixed_grid_dynamic_cols') {
          const addColBtn = document.createElement('button');
          addColBtn.type = 'button';
          addColBtn.className = 'btn btn-outline btn-sm';
          addColBtn.style.marginTop = '0.5rem';
          addColBtn.innerHTML = '➕ Agregar Columna';
          addColBtn.onclick = () => {
            const colName = prompt('Ingrese el nombre de la nueva columna:');
            if (!colName) return;
            const cleanedName = colName.trim();
            if (cleanedName === '') return;

            // Verificar si ya existe esa columna
            const existingHeaders = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.replace(' *', '').trim());
            const rowLabelKey = campo.row_label || 'Descripción / Fila';
            if (cleanedName === rowLabelKey || cleanedName === 'Descripción / Fila' || existingHeaders.includes(cleanedName)) {
              alert('La columna ya existe.');
              return;
            }

            // 1. Agregar th al thead
            const th = document.createElement('th');
            th.textContent = cleanedName;
            thead.firstElementChild.appendChild(th);

            // 2. Agregar td con input a cada fila del tbody
            const trs = tbody.querySelectorAll('.grid-row');
            trs.forEach(tr => {
              const td = document.createElement('td');
              td.style.padding = '0.3rem';
              td.style.border = '1px solid var(--border-color)';

              const input = document.createElement('input');
              input.className = 'grid-cell-input';
              input.dataset.column = cleanedName;
              input.type = 'text';
              input.placeholder = `Ingresa ${cleanedName.toLowerCase()}`;
              input.maxLength = 100;
              td.appendChild(input);
              tr.appendChild(td);
            });
          };
          gridContainer.appendChild(addColBtn);
        }
      } else {
        const existingData = valoresExistentes ? valoresExistentes[campo.name] : null;
        if (Array.isArray(existingData) && existingData.length > 0) {
          existingData.forEach(rowData => addRowFn(rowData));
        } else {
          addRowFn();
        }

        const addRowBtn = document.createElement('button');
        addRowBtn.type = 'button';
        addRowBtn.className = 'btn btn-outline btn-sm';
        addRowBtn.innerHTML = '➕ Agregar Fila';
        addRowBtn.onclick = () => addRowFn();
        gridContainer.appendChild(addRowBtn);
      }

      camposDinamicosContainer.appendChild(gridContainer);
      return;
    }

    if (campo.type === 'text_list' || campo.type === 'firmante_list') {
      const listContainer = document.createElement('div');
      listContainer.className = 'text-list-container form-group';
      listContainer.dataset.name = campo.name;

      const label = document.createElement('label');
      label.textContent = campo.label;
      if (campo.required) label.textContent += ' *';
      listContainer.appendChild(label);

      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'text-list-items';
      listContainer.appendChild(itemsDiv);

      const addInputFn = (val = '') => {
        const row = document.createElement('div');
        row.className = 'text-list-input-row';

        const isFirmanteComposite = (campo.type === 'firmante_list' && (campo.recoger_cedula || campo.recoger_cargo));
        let mainValInput;

        if (isFirmanteComposite) {
          const compDiv = document.createElement('div');
          compDiv.className = 'text-list-composite-item';

          mainValInput = document.createElement('input');
          mainValInput.type = 'hidden';
          mainValInput.className = 'text-list-input';
          compDiv.appendChild(mainValInput);

          let parsed = { nombre: '', cedula: '', cargo: '' };
          if (val) {
            try {
              parsed = JSON.parse(val);
            } catch (e) {
              parsed.nombre = val;
            }
          }

          const updateVal = () => {
            const data = {
              nombre: nomInp.value.trim(),
              cedula: cedInp ? cedInp.value.trim() : '',
              cargo: carInp ? carInp.value.trim() : ''
            };
            mainValInput.value = (data.nombre || data.cedula || data.cargo) ? JSON.stringify(data) : '';
          };

          const nomInp = document.createElement('input');
          nomInp.type = 'text';
          nomInp.placeholder = 'Nombre Completo';
          nomInp.value = parsed.nombre;
          if (campo.required) nomInp.required = true;
          nomInp.oninput = updateVal;
          compDiv.appendChild(nomInp);

          let cedInp = null;
          if (campo.recoger_cedula) {
            cedInp = document.createElement('input');
            cedInp.type = 'text';
            cedInp.placeholder = 'Cédula';
            cedInp.value = parsed.cedula;
            cedInp.maxLength = 10;
            cedInp.onkeypress = (e) => {
              if (e.key < '0' || e.key > '9') {
                e.preventDefault();
              }
            };
            cedInp.oninput = (e) => {
              e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
              updateVal();
            };
            compDiv.appendChild(cedInp);
          }

          let carInp = null;
          if (campo.recoger_cargo) {
            carInp = document.createElement('input');
            carInp.type = 'text';
            carInp.placeholder = 'Cargo';
            carInp.value = parsed.cargo;
            carInp.oninput = updateVal;
            compDiv.appendChild(carInp);
          }

          updateVal();
          row.appendChild(compDiv);
        } else {
          mainValInput = document.createElement('input');
          mainValInput.type = 'text';
          mainValInput.className = 'text-list-input';
          mainValInput.placeholder = `Ingresa ${campo.label.toLowerCase()}`;
          mainValInput.value = val;
          if (campo.type === 'text_list') {
            mainValInput.maxLength = 100;
          }
          if (campo.required) mainValInput.required = true;
          row.appendChild(mainValInput);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-outline btn-sm';
        delBtn.innerHTML = '🗑️';
        delBtn.onclick = () => {
          if (campo.required && itemsDiv.children.length === 1) {
            alert('Este campo es obligatorio, debe tener al menos una entrada.');
            return;
          }
          row.remove();
        };

        row.appendChild(delBtn);
        itemsDiv.appendChild(row);
      };

      const existingData = valoresExistentes ? valoresExistentes[campo.name] : null;
      if (Array.isArray(existingData) && existingData.length > 0) {
        existingData.forEach(val => addInputFn(val));
      } else {
        addInputFn();
      }

      const addInputBtn = document.createElement('button');
      addInputBtn.type = 'button';
      addInputBtn.className = 'btn btn-outline btn-sm';
      addInputBtn.innerHTML = '➕ Agregar otro';
      addInputBtn.onclick = () => addInputFn();
      listContainer.appendChild(addInputBtn);

      camposDinamicosContainer.appendChild(listContainer);
      return;
    }

    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';

    const label = document.createElement('label');
    label.textContent = campo.label;
    if (campo.required) label.textContent += ' *';
    formGroup.appendChild(label);

    let inputElement;
    const valor = (valoresExistentes && valoresExistentes[campo.name] !== undefined && valoresExistentes[campo.name] !== null) ? valoresExistentes[campo.name] : '';

    if ((campo.type === 'firmante' || campo.type === 'firmante_seccion') && (campo.recoger_cedula || campo.recoger_cargo)) {
      const container = document.createElement('div');
      container.className = 'firmante-composite-container';

      const mainInput = document.createElement('input');
      mainInput.type = 'hidden';
      mainInput.name = campo.name;
      mainInput.id = `campo-${campo.name}`;
      if (campo.required) mainInput.required = true;
      container.appendChild(mainInput);

      let parsed = { nombre: '', cedula: '', cargo: '' };
      if (valor) {
        try {
          parsed = JSON.parse(valor);
        } catch (e) {
          parsed.nombre = valor;
        }
      }

      const updateValue = () => {
        const data = {
          nombre: nombreInput.value.trim(),
          cedula: cedulaInput ? cedulaInput.value.trim() : '',
          cargo: cargoInput ? cargoInput.value.trim() : ''
        };
        mainInput.value = (data.nombre || data.cedula || data.cargo) ? JSON.stringify(data) : '';
      };

      const nombreGroup = document.createElement('div');
      const nombreLabel = document.createElement('label');
      nombreLabel.textContent = 'Nombres y Apellidos';
      const nombreInput = document.createElement('input');
      nombreInput.type = 'text';
      nombreInput.placeholder = 'Nombre Completo';
      nombreInput.value = parsed.nombre;
      if (campo.required) nombreInput.required = true;
      nombreInput.oninput = updateValue;
      nombreGroup.appendChild(nombreLabel);
      nombreGroup.appendChild(nombreInput);
      container.appendChild(nombreGroup);

      let cedulaInput = null;
      if (campo.recoger_cedula) {
        const cedulaGroup = document.createElement('div');
        const cedulaLabel = document.createElement('label');
        cedulaLabel.textContent = 'Cédula de Identidad';
        cedulaInput = document.createElement('input');
        cedulaInput.type = 'text';
        cedulaInput.placeholder = 'Cédula';
        cedulaInput.value = parsed.cedula;
        cedulaInput.maxLength = 10;
        cedulaInput.onkeypress = (e) => {
          if (e.key < '0' || e.key > '9') {
            e.preventDefault();
          }
        };
        cedulaInput.oninput = (e) => {
          e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
          updateValue();
        };
        cedulaGroup.appendChild(cedulaLabel);
        cedulaGroup.appendChild(cedulaInput);
        container.appendChild(cedulaGroup);
      }

      let cargoInput = null;
      if (campo.recoger_cargo) {
        const cargoGroup = document.createElement('div');
        const cargoLabel = document.createElement('label');
        cargoLabel.textContent = 'Cargo / Puesto';
        cargoInput = document.createElement('input');
        cargoInput.type = 'text';
        cargoInput.placeholder = 'Cargo';
        cargoInput.value = parsed.cargo;
        cargoInput.oninput = updateValue;
        cargoGroup.appendChild(cargoLabel);
        cargoGroup.appendChild(cargoInput);
        container.appendChild(cargoGroup);
      }

      updateValue();
      formGroup.appendChild(container);
    } else {
      if (campo.type === 'select') {
        inputElement = document.createElement('select');
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Seleccione --';
        inputElement.appendChild(defaultOpt);

        const opts = Array.isArray(campo.options) ? campo.options : (campo.options ? campo.options.split(',').map(o => o.trim()) : []);
        opts.forEach(optVal => {
          const opt = document.createElement('option');
          opt.value = optVal;
          opt.textContent = optVal;
          inputElement.appendChild(opt);
        });
      } else if (campo.type === 'textarea') {
        inputElement = document.createElement('textarea');
        inputElement.placeholder = `Ingresa ${campo.label.toLowerCase()}`;
        inputElement.maxLength = 500;
      } else if (campo.type === 'number') {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.placeholder = `Ingresa ${campo.label.toLowerCase()}`;
      } else {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.placeholder = `Ingresa ${campo.label.toLowerCase()}`;
        if (campo.type === 'text') {
          inputElement.maxLength = 100;
        }
      }

      inputElement.name = campo.name;
      inputElement.id = `campo-${campo.name}`;
      inputElement.value = valor;
      if (campo.required) inputElement.required = true;
      formGroup.appendChild(inputElement);
    }
    camposDinamicosContainer.appendChild(formGroup);
  });
}

// 4. BANDEJAS: CARGAR Y RENDERIZAR TABLA DE SOLICITUDES
// 4. BANDEJAS: CARGAR Y RENDERIZAR TABLA DE SOLICITUDES
async function cargarBandeja() {
  try {
    const searchInput = document.getElementById('buscador-solicitudes');
    const searchVal = searchInput ? searchInput.value.trim() : '';

    const url = `/api/solicitudes?page=${paginaActual}&limit=${limitePagina}&estado=${filtroEstadoActual}&search=${encodeURIComponent(searchVal)}`;

    const response = await fetch(url, {
      headers: { 'x-user-id': currentUser.id }
    });
    const data = await response.json();

    todasLasSolicitudes = data.solicitudes;
    totalItems = data.total;
    totalPaginas = data.pages;

    renderizarSolicitudes();
    renderizarPaginacion();
  } catch (error) {
    console.error('Error al cargar bandeja:', error);
  }
}

function renderizarSolicitudes() {
  solicitudesList.innerHTML = '';

  if (todasLasSolicitudes.length === 0) {
    solicitudesList.innerHTML = `
      <tr>
        <td colspan="7" class="text-center">No se encontraron solicitudes en esta bandeja.</td>
      </tr>
    `;
    return;
  }

  todasLasSolicitudes.forEach(sol => {
    const tr = document.createElement('tr');
    
    // Formato de fecha de actualización
    const fecha = new Date(sol.fecha_actualizacion).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Código compuesto de solicitud (Código_Cédula_Mes_Año)
    const fechaCreacion = new Date(sol.fecha_creacion);
    const mes = String(fechaCreacion.getMonth() + 1).padStart(2, '0');
    const anio = fechaCreacion.getFullYear();
    const codigoClean = (sol.tipo_codigo || 'FORM').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const cedulaClean = (sol.solicitante_cedula || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const codigoSeguimiento = `${codigoClean}_${cedulaClean}_${mes}_${anio}`;

    // Mapear visto bueno del área con colores indicativos de estado (verde = aprobado, rojo = observado, gris = pendiente)
    let areaStatusBadge = '';
    if (sol.areas_validadoras) {
      areaStatusBadge = sol.areas_validadoras.map(area => {
        let bg = '#F1F5F9';
        let color = '#475569';
        let border = '1px solid var(--border-color)';

        // Buscar el estado específico de esta área en aprobaciones
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
          // en_revision u observado
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

function renderizarPaginacion() {
  const paginacionInfo = document.getElementById('paginacion-info');
  const paginacionControles = document.getElementById('paginacion-controles');

  if (!paginacionInfo || !paginacionControles) return;

  if (totalItems === 0) {
    paginacionInfo.textContent = 'Mostrando solicitudes 0-0 de 0';
    paginacionControles.innerHTML = '';
    return;
  }

  const inicio = (paginaActual - 1) * limitePagina + 1;
  const fin = Math.min(paginaActual * limitePagina, totalItems);
  paginacionInfo.textContent = `Mostrando solicitudes ${inicio}-${fin} de ${totalItems}`;

  let html = '';
  // Botón Anterior
  html += `<button type="button" class="btn btn-outline btn-sm" ${paginaActual === 1 ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual - 1})">◀ Anterior</button>`;

  // Páginas numeradas
  const maxVisibles = 5;
  let pagInicio = Math.max(1, paginaActual - 2);
  let pagFin = Math.min(totalPaginas, pagInicio + maxVisibles - 1);
  if (pagFin - pagInicio < maxVisibles - 1) {
    pagInicio = Math.max(1, pagFin - maxVisibles + 1);
  }

  for (let i = pagInicio; i <= pagFin; i++) {
    html += `<button type="button" class="btn ${i === paginaActual ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="cambiarPagina(${i})">${i}</button>`;
  }

  // Botón Siguiente
  html += `<button type="button" class="btn btn-outline btn-sm" ${paginaActual === totalPaginas ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual + 1})">Siguiente ▶</button>`;

  paginacionControles.innerHTML = html;
}

function cambiarPagina(nuevaPagina) {
  if (nuevaPagina < 1 || nuevaPagina > totalPaginas) return;
  paginaActual = nuevaPagina;
  cargarBandeja();
}

function debouncedBuscar() {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    paginaActual = 1;
    cargarBandeja();
  }, 300);
}

function filtrarBandeja(estado, elem) {
  filtroEstadoActual = estado;
  
  // Ocultar vistas de administración y mostrar solicitudes
  solicitudesView.classList.remove('hidden');
  adminUsuariosView.classList.add('hidden');
  adminFormulariosView.classList.add('hidden');

  // Cambiar clases activas en la navegación lateral
  const links = document.querySelectorAll('.sidebar-nav a');
  links.forEach(l => l.classList.remove('active'));
  elem.classList.add('active');

  // Actualizar textos informativos de la bandeja
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

  document.getElementById('bandeja-titulo').textContent = titulos[estado];
  document.getElementById('bandeja-descripcion').textContent = descripciones[estado];

  paginaActual = 1;
  cargarBandeja();
}

// 5. MODAL CREACIÓN: ABRIR Y CERRAR
btnNuevaSolicitud.addEventListener('click', () => {
  solicitudIdInput.value = '';
  selectTipoSolicitud.value = '';
  selectTipoSolicitud.disabled = false;
  camposDinamicosContainer.innerHTML = '<p class="form-help-text">Selecciona un tipo de solicitud para ver los campos requeridos.</p>';
  document.getElementById('modal-solicitud-titulo').textContent = 'Registrar Solicitud Técnica';
  
  modalSolicitud.classList.remove('hidden');
});

function cerrarModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (id === 'modal-detalle') {
    activeSolicitudId = null;
  }
}

// 6. ENVIAR FORMULARIO (BORRADOR O EN REVISIÓN)
btnGuardarBorrador.addEventListener('click', () => enviarFormulario(false));
solicitudForm.addEventListener('submit', (e) => {
  e.preventDefault();
  enviarFormulario(true);
});

async function enviarFormulario(enviar) {
  const solicitudId = solicitudIdInput.value;
  const tipoSolicitudId = selectTipoSolicitud.value;

  if (!tipoSolicitudId) {
    alert('Por favor selecciona el tipo de solicitud.');
    return;
  }

  // Recolectar datos dinámicos planos
  const datos = {};
  const inputs = camposDinamicosContainer.querySelectorAll('input:not(.grid-cell-input):not(.text-list-input), textarea:not(.grid-cell-input):not(.text-list-input), select:not(.grid-cell-input)');
  inputs.forEach(input => {
    if (input.name) {
      if (input.type === 'checkbox') {
        datos[input.name] = input.checked ? 'X' : '';
      } else {
        datos[input.name] = input.value;
      }
    }
  });

  // Recolectar datos de listas de textos (text_list)
  const textLists = camposDinamicosContainer.querySelectorAll('.text-list-container');
  textLists.forEach(tl => {
    const listName = tl.dataset.name;
    const listInputs = tl.querySelectorAll('.text-list-input');
    const listData = [];
    listInputs.forEach(input => {
      const val = input.value.trim();
      if (val !== '') {
        listData.push(val);
      }
    });
    datos[listName] = listData;
  });

    // Recolectar datos de tablas dinámicas (grid)
    const grids = camposDinamicosContainer.querySelectorAll('.grid-container');
    grids.forEach(grid => {
      const gridName = grid.dataset.name;
      const rows = grid.querySelectorAll('.grid-row');
      const gridData = [];

      // Buscar definición del campo en tiposSolicitud para obtener row_label personalizado
      const tipo = tiposSolicitud.find(t => t.id === parseInt(tipoSolicitudId, 10));
      const campoDef = tipo ? tipo.campos.find(c => c.name === gridName) : null;
      const customRowLabel = campoDef ? campoDef.row_label : null;

      rows.forEach(row => {
        const rowData = {};
        let hasAnyValue = false;
        
        const labelInput = row.querySelector('.grid-cell-label-input');
        if (labelInput) {
          rowData['Descripción / Fila'] = labelInput.value;
          if (customRowLabel && customRowLabel !== 'Descripción / Fila') {
            rowData[customRowLabel] = labelInput.value;
          }
        }

        const cellInputs = row.querySelectorAll('.grid-cell-input');
        cellInputs.forEach(input => {
          const col = input.dataset.column;
          let val = '';
          if (input.type === 'checkbox') {
            val = input.checked ? 'X' : '';
          } else {
            val = input.value.trim();
          }

          rowData[col] = val;
          if (val !== '') hasAnyValue = true;
        });
        // Para grid dinámico, solo guardar si tiene valores. Para grid fijo, siempre guardamos la fila.
        if (labelInput || hasAnyValue) {
          gridData.push(rowData);
        }
      });

      datos[gridName] = gridData;
    });

    // Validación centralizada al enviar la solicitud
    const tipo = tiposSolicitud.find(t => t.id === parseInt(tipoSolicitudId, 10));
    if (enviar && tipo) {
      let errorMsg = null;
      
      for (const campo of tipo.campos) {
        if (['title', 'subtitle', 'paragraph'].includes(campo.type)) continue;
        
        const valor = datos[campo.name];
        
        // 1. Validar campos obligatorios planos
        if (campo.required) {
          if (campo.type === 'firmante' || campo.type === 'firmante_seccion') {
            let parsed = { nombre: '', cedula: '', cargo: '' };
            try {
              parsed = JSON.parse(valor || '{}');
            } catch(e) {}
            if (!parsed.nombre || parsed.nombre.trim() === '') {
              errorMsg = `El nombre de "${campo.label}" es obligatorio.`;
              break;
            }
            if (campo.recoger_cedula && (!parsed.cedula || parsed.cedula.trim() === '')) {
              errorMsg = `La cédula de "${campo.label}" es obligatoria.`;
              break;
            }
            if (campo.recoger_cargo && (!parsed.cargo || parsed.cargo.trim() === '')) {
              errorMsg = `El cargo de "${campo.label}" es obligatorio.`;
              break;
            }
          } else if (campo.type === 'text_list' || campo.type === 'firmante_list') {
            if (!Array.isArray(valor) || valor.length === 0) {
              errorMsg = `El campo "${campo.label}" es obligatorio y requiere al menos una entrada.`;
              break;
            }
          } else if (campo.type === 'grid' || campo.type === 'fixed_grid') {
            if (!Array.isArray(valor) || valor.length === 0) {
              errorMsg = `La tabla "${campo.label}" es obligatoria y requiere al menos una fila.`;
              break;
            }
          } else if (campo.type === 'checkbox') {
            if (valor !== 'X') {
              errorMsg = `Debe marcar la casilla de selección "${campo.label}".`;
              break;
            }
          } else {
            if (valor === undefined || valor === null || String(valor).trim() === '') {
              errorMsg = `El campo "${campo.label}" es obligatorio.`;
              break;
            }
          }
        }
        
        // 2. Validar límites de longitud (100 para text, 500 para textarea)
        if (campo.type === 'text' && valor) {
          if (String(valor).length > 100) {
            errorMsg = `El campo "${campo.label}" no debe superar los 100 caracteres.`;
            break;
          }
        }
        if (campo.type === 'textarea' && valor) {
          if (String(valor).length > 500) {
            errorMsg = `El campo "${campo.label}" no debe superar los 500 caracteres (máximo un párrafo).`;
            break;
          }
        }
        if (campo.type === 'text_list' && Array.isArray(valor)) {
          for (const item of valor) {
            if (String(item).length > 100) {
              errorMsg = `Una de las entradas en "${campo.label}" no debe superar los 100 caracteres.`;
              break;
            }
          }
          if (errorMsg) break;
        }
        
        // 3. Validar Cédulas/Identificaciones de 10 dígitos (solo números)
        const idRegex = /^\d{10}$/;
        if ((campo.type === 'firmante' || campo.type === 'firmante_seccion') && campo.recoger_cedula && valor) {
          let parsed = { nombre: '', cedula: '', cargo: '' };
          try {
            parsed = JSON.parse(valor || '{}');
          } catch(e) {}
          if (parsed.cedula && parsed.cedula.trim() !== '') {
            if (!idRegex.test(parsed.cedula.trim())) {
              errorMsg = `La cédula de "${campo.label}" debe contener exactamente 10 dígitos numéricos.`;
              break;
            }
          }
        }
        
        if (campo.type === 'firmante_list' && campo.recoger_cedula && Array.isArray(valor)) {
          for (const item of valor) {
            let parsed = { nombre: '', cedula: '', cargo: '' };
            try {
              parsed = JSON.parse(item || '{}');
            } catch(e) {}
            if (parsed.cedula && parsed.cedula.trim() !== '') {
              if (!idRegex.test(parsed.cedula.trim())) {
                errorMsg = `La cédula de uno de los firmantes en "${campo.label}" debe contener exactamente 10 dígitos numéricos.`;
                break;
              }
            }
          }
          if (errorMsg) break;
        }
        
        // 4. Validar filas de la tabla dinámica (grid / fixed_grid)
        if ((campo.type === 'grid' || campo.type === 'fixed_grid') && Array.isArray(valor)) {
          for (const row of valor) {
            const columns = campo.columns || [];
            for (const col of columns) {
              const colName = typeof col === 'object' ? col.name : col;
              const colType = typeof col === 'object' ? col.type : 'text';
              const isColRequired = (typeof col === 'object' ? (col.required || false) : false) || campo.required;
              const cellVal = row[colName];
              
              if (isColRequired) {
                if (colType === 'firmante' || colType === 'firmante_seccion') {
                  let parsed = { nombre: '', cedula: '', cargo: '' };
                  try {
                    parsed = JSON.parse(cellVal || '{}');
                  } catch(e) {}
                  if (!parsed.nombre || parsed.nombre.trim() === '') {
                    errorMsg = `El nombre de la columna "${colName}" en la tabla "${campo.label}" es obligatorio.`;
                    break;
                  }
                  if (col.recoger_cedula && (!parsed.cedula || parsed.cedula.trim() === '')) {
                    errorMsg = `La cédula de la columna "${colName}" en la tabla "${campo.label}" es obligatoria.`;
                    break;
                  }
                } else {
                  if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') {
                    errorMsg = `El campo de la columna "${colName}" en la tabla "${campo.label}" es obligatorio.`;
                    break;
                  }
                }
              }
              
              if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
                if (colType === 'text' && String(cellVal).length > 100) {
                  errorMsg = `El valor en la columna "${colName}" de la tabla "${campo.label}" no debe superar los 100 caracteres.`;
                  break;
                }
                if (colType === 'textarea' && String(cellVal).length > 500) {
                  errorMsg = `El valor en la columna "${colName}" de la tabla "${campo.label}" no debe superar los 500 caracteres.`;
                  break;
                }
                if (colType === 'identificacion' && !idRegex.test(String(cellVal).trim())) {
                  errorMsg = `La identificación en la columna "${colName}" de la tabla "${campo.label}" debe contener exactamente 10 dígitos numéricos.`;
                  break;
                }
                if (colType === 'email') {
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(String(cellVal).trim())) {
                    errorMsg = `El valor "${cellVal}" en la columna "${colName}" de la tabla "${campo.label}" no es un correo electrónico válido.`;
                    break;
                  }
                }
                if ((colType === 'firmante' || colType === 'firmante_seccion') && col.recoger_cedula) {
                  let parsed = { nombre: '', cedula: '', cargo: '' };
                  try {
                    parsed = JSON.parse(cellVal || '{}');
                  } catch(e) {}
                  if (parsed.cedula && parsed.cedula.trim() !== '') {
                    if (!idRegex.test(parsed.cedula.trim())) {
                      errorMsg = `La cédula en la columna "${colName}" de la tabla "${campo.label}" debe tener exactamente 10 dígitos numéricos.`;
                      break;
                    }
                  }
                }
              }
            }
            if (errorMsg) break;
          }
          if (errorMsg) break;
        }
      }
      
      if (errorMsg) {
        alert(errorMsg);
        return;
      }
    }

  const payload = {
    tipo_solicitud_id: parseInt(tipoSolicitudId, 10),
    datos,
    enviar
  };

  try {
    let response;
    if (solicitudId) {
      // Edición / Corrección
      response = await fetch(`/api/solicitudes/${solicitudId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(payload)
      });
    } else {
      // Creación nueva
      response = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al guardar la solicitud.');
    }

    cerrarModal('modal-solicitud');
    await cargarBandeja();
  } catch (error) {
    alert(error.message);
  }
}

function formatearValorFirmante(val) {
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

// 7. VER DETALLE DE UNA SOLICITUD (VISTA TÉCNICA E HISTORIAL)
async function verDetalle(id, isRefresh = false) {
  try {
    const response = await fetch(`/api/solicitudes/${id}`, {
      headers: { 'x-user-id': currentUser.id }
    });

    if (isRefresh && modalDetalle.classList.contains('hidden')) return;

    const sol = await response.json();
    if (!response.ok) {
      if (!isRefresh) alert(sol.error || 'Error al obtener la solicitud.');
      return;
    }

    activeSolicitudId = id;

    // Rellenar cabeceras en el modal
    detCodigo.textContent = `${sol.tipo_codigo}-${sol.id}`;
    detTipo.textContent = sol.tipo_nombre;
    detSolicitante.textContent = sol.solicitante_nombre;
    detFecha.textContent = new Date(sol.fecha_creacion).toLocaleString('es-ES');
    
    detEstado.textContent = sol.estado.replace('_', ' ');
    detEstado.className = `badge badge-${sol.estado}`;

    // Renderizar datos del formulario a la izquierda
    detCamposValores.innerHTML = '';
    sol.campos.forEach(campo => {
      if (campo.type === 'title') {
        const titleEl = document.createElement('h3');
        titleEl.className = 'detail-section-title';
        titleEl.textContent = campo.label;
        detCamposValores.appendChild(titleEl);
      } else if (campo.type === 'subtitle') {
        const subtitleEl = document.createElement('h4');
        subtitleEl.className = 'detail-section-subtitle';
        subtitleEl.textContent = campo.label;
        detCamposValores.appendChild(subtitleEl);
      } else if (campo.type === 'paragraph') {
        const paragraphEl = document.createElement('p');
        paragraphEl.className = 'detail-section-paragraph';
        paragraphEl.textContent = campo.label;
        detCamposValores.appendChild(paragraphEl);
      } else if (campo.type === 'info_no_pdf') {
        const paragraphEl = document.createElement('p');
        paragraphEl.className = 'detail-section-paragraph info-no-pdf-detail';
        paragraphEl.innerHTML = `<strong>ℹ️ Informativo:</strong> ${campo.label}`;
        detCamposValores.appendChild(paragraphEl);
      } else if (campo.type === 'grid' || campo.type === 'fixed_grid' || campo.type === 'fixed_grid_dynamic_cols' || campo.type === 'fixed_grid_fixed_cols') {
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'detail-grid-wrapper';
        
        const label = document.createElement('strong');
        label.textContent = campo.label + ':';
        gridWrapper.appendChild(label);

        const gridData = sol.datos[campo.name];
        let columns = [...(campo.columns || [])];
        
        if (campo.type === 'fixed_grid_dynamic_cols' && Array.isArray(gridData) && gridData.length > 0) {
          const allKeys = new Set();
          gridData.forEach(row => {
            Object.keys(row).forEach(k => allKeys.add(k));
          });
          const rowLabelKey = campo.row_label || 'Descripción / Fila';
          const predefinedColNames = columns.map(col => typeof col === 'object' ? col.name : col);
          allKeys.forEach(key => {
            if (key !== rowLabelKey && key !== 'Descripción / Fila' && !predefinedColNames.includes(key)) {
              columns.push({ name: key, type: 'text' });
            }
          });
        }

        const isFixedGridType = (campo.type === 'fixed_grid' || campo.type === 'fixed_grid_dynamic_cols' || campo.type === 'fixed_grid_fixed_cols');
        if (isFixedGridType && Array.isArray(campo.rows) && campo.rows.length > 0) {
          const rowLabelName = campo.row_label || 'Descripción / Fila';
          columns = [{ name: rowLabelName, type: 'text' }, ...columns];
        }

        if (Array.isArray(gridData) && gridData.length > 0) {
          const table = document.createElement('table');
          table.className = 'detail-grid-table';

          const thead = document.createElement('thead');
          const headerRow = document.createElement('tr');
          columns.forEach(col => {
            const colName = typeof col === 'object' ? col.name : col;
            const colType = typeof col === 'object' ? col.type : 'text';
            const th = document.createElement('th');
            th.textContent = colName;
            if (colType === 'checkbox') {
              th.className = 'checkbox-header';
            }
            headerRow.appendChild(th);
          });
          thead.appendChild(headerRow);
          table.appendChild(thead);

          const tbody = document.createElement('tbody');
          gridData.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
              const colName = typeof col === 'object' ? col.name : col;
              const colType = typeof col === 'object' ? col.type : 'text';
              const td = document.createElement('td');
              
              let val = row[colName];
              if (val === undefined) {
                if (colName === campo.row_label) {
                  val = row['Descripción / Fila'];
                } else if (colName === 'Descripción / Fila') {
                  val = campo.row_label ? row[campo.row_label] : undefined;
                }
              }
              val = val || '';

              if (colType === 'firmante' || colType === 'firmante_seccion') {
                td.textContent = formatearValorFirmante(val);
              } else {
                td.textContent = val;
              }
              if (colType === 'checkbox') {
                td.className = 'checkbox-cell';
              }
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          gridWrapper.appendChild(table);
        } else {
          const noData = document.createElement('span');
          noData.className = 'detail-no-data';
          noData.textContent = 'Sin registros ingresados';
          gridWrapper.appendChild(noData);
        }
        
        detCamposValores.appendChild(gridWrapper);
      } else if (campo.type === 'text_list' || campo.type === 'firmante_list') {
        const valItem = document.createElement('div');
        valItem.className = 'field-val-item';
        
        const listData = sol.datos[campo.name];
        let valor = 'N/A';
        if (Array.isArray(listData) && listData.length > 0) {
          if (campo.type === 'firmante_list') {
            valor = listData.map(v => formatearValorFirmante(v)).join(', ');
          } else {
            valor = listData.join(', ');
          }
        }
        valItem.innerHTML = `
          <strong>${escaparHTML(campo.label)}:</strong>
          <span>${escaparHTML(valor)}</span>
        `;
        detCamposValores.appendChild(valItem);
      } else if (campo.type === 'checkbox') {
        const valItem = document.createElement('div');
        valItem.className = 'field-val-item detail-checkbox-val-item';

        const rawVal = sol.datos[campo.name];
        const isChecked = (rawVal === 'X' || rawVal === true || rawVal === 'true');
        const displayVal = isChecked ? '<strong>[X]</strong>' : '<strong>[ ]</strong>';

        valItem.innerHTML = `
          <strong>${escaparHTML(campo.label)}:</strong>
          <span>${displayVal}</span>
        `;
        detCamposValores.appendChild(valItem);
      } else {
        const valItem = document.createElement('div');
        valItem.className = 'field-val-item';
        
        const rawVal = sol.datos[campo.name];
        let valor = rawVal !== undefined && rawVal !== null && rawVal !== '' ? rawVal : 'N/A';
        if (campo.type === 'firmante' || campo.type === 'firmante_seccion') {
          valor = formatearValorFirmante(rawVal);
        }
        valItem.innerHTML = `
          <strong>${escaparHTML(campo.label)}:</strong>
          <span>${escaparHTML(valor)}</span>
        `;
        detCamposValores.appendChild(valItem);
      }
    });

    // Renderizar aprobaciones por área
    detAprobacionesLista.innerHTML = '';
    sol.aprobaciones.forEach(ap => {
      if (ap.area === 'director') return; // No mostrar las áreas espectadoras en el listado de validaciones por área de la interfaz
      const card = document.createElement('div');
      card.className = `aprobacion-card ${ap.estado === 'aprobado' ? 'aprobado' : ''}`;
      
      const fecha = ap.fecha ? new Date(ap.fecha).toLocaleDateString('es-ES') : '';
      const revisor = ap.tecnico_nombre ? `por ${escaparHTML(ap.tecnico_nombre)}` : '';
      const obsHtml = ap.observacion ? `<div class="aprobacion-obs"><strong>Obs:</strong> "${escaparHTML(ap.observacion)}"</div>` : '';
      
      const estadoTexto = ap.estado === 'pendiente' && ap.tecnico_nombre 
        ? 'ASIGNADO' 
        : (ap.estado === 'pendiente' ? 'PENDIENTE' : (ap.observacion ? 'APROBADO CON OBS.' : 'APROBADO'));

      const revisorInfo = (revisor || fecha) ? `<span class="revisor-info">${revisor} ${fecha}</span>` : '';

      card.innerHTML = `
        <div class="aprobacion-card-header">
          <span class="area-name">🛡️ ${escaparHTML(obtenerNombreArea(ap.area))}</span>
          <div class="status-details">
            <strong>${escaparHTML(estadoTexto)}</strong>
            ${revisorInfo}
          </div>
        </div>
        ${obsHtml}
      `;
      detAprobacionesLista.appendChild(card);
    });

    // Renderizar historial de observaciones
    detObservacionesLista.innerHTML = '';
    if (sol.observaciones.length === 0) {
      detObservacionesLista.innerHTML = '<p class="form-help-text">No se registran observaciones.</p>';
    } else {
      sol.observaciones.forEach(obs => {
        const item = document.createElement('div');
        item.className = 'obs-item';
        
        const fecha = new Date(obs.fecha).toLocaleString('es-ES');
        item.innerHTML = `
          <div class="obs-meta">
            <strong>${escaparHTML(obs.autor_nombre)} (${escaparHTML(obtenerNombreArea(obs.area))})</strong> - ${fecha}
          </div>
          <div class="obs-text">${escaparHTML(obs.texto)}</div>
        `;
        detObservacionesLista.appendChild(item);
      });
    }

    // Ocultar sección de validaciones e historial si está en borrador
    const modalBodyGrid = document.querySelector('.modal-body-grid');
    if (sol.estado === 'borrador') {
      detFlujoSeccion.classList.add('hidden');
      if (modalBodyGrid) {
        modalBodyGrid.classList.add('modal-body-grid-borrador');
      }
    } else {
      detFlujoSeccion.classList.remove('hidden');
      if (modalBodyGrid) {
        modalBodyGrid.classList.remove('modal-body-grid-borrador');
      }
    }

    // CONTROL DEL PANEL DE ACCIÓN PARA TÉCNICOS
    panelAccionesTecnicas.classList.add('hidden');
    panelAsignacionContainer.innerHTML = '';
    
    const actionsButtonsRow = panelAccionesTecnicas.querySelector('.action-buttons-row');
    const obsInputArea = panelAccionesTecnicas.querySelector('.observacion-input-area');

    if (currentUser.rol === 'tecnico' && currentUser.area !== 'director' && (sol.estado === 'en_revision' || sol.estado === 'observado')) {
      // Verificar si esta solicitud requiere que el área de este técnico la apruebe
      const aprobacionArea = sol.aprobaciones.find(ap => ap.area === currentUser.area);
      if (aprobacionArea && aprobacionArea.estado === 'pendiente') {
        panelAccionesTecnicas.classList.remove('hidden');
        if (!isRefresh) {
          observacionTexto.value = '';
        }
        
        // Control de asignación exclusiva (Solo aplica a seguridad, gibdd, giitrc)
        if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(currentUser.area)) {
          if (!aprobacionArea.tecnico_id) {
            // Sin asignar
            panelAsignacionContainer.innerHTML = `
              <div class="alert alert-warning" style="margin-bottom: 0.8rem; font-size: 0.8rem; padding: 0.5rem 0.8rem;">
                ⚠️ Solicitud sin asignar. Debes asignarte la solicitud para poder validarla u observarla.
              </div>
              <button type="button" class="btn btn-primary btn-block" onclick="asignarSolicitud(${sol.id})">
                🙋‍♂️ Asignarme Solicitud (Tomar Responsabilidad)
              </button>
            `;
            if (actionsButtonsRow) actionsButtonsRow.style.display = 'none';
            if (obsInputArea) obsInputArea.style.display = 'none';
          } else if (aprobacionArea.tecnico_id === currentUser.id) {
            // Asignado al técnico actual
            panelAsignacionContainer.innerHTML = `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: #F4F8F3; border: 1px solid var(--success-color); padding: 0.5rem 0.8rem; border-radius: var(--radius-md); margin-bottom: 0.8rem;">
                <span style="font-size: 0.8rem; color: var(--success-hover); font-weight: bold;">
                  ✅ Asignado a ti (Responsable de la revisión)
                </span>
                <button type="button" class="btn btn-outline btn-sm" onclick="desasignarSolicitud(${sol.id})" style="margin: 0; padding: 0.2rem 0.5rem; font-size: 0.75rem; border-color: var(--danger-color); color: var(--danger-color);">
                  🔓 Liberar Asignación
                </button>
              </div>
            `;
            if (actionsButtonsRow) actionsButtonsRow.style.display = 'flex';
            if (obsInputArea) obsInputArea.style.display = 'block';

            // Asignar eventos de clic específicos para esta solicitud
            btnAprobarTecnico.onclick = () => realizarAprobacion(sol.id);
            btnAprobarConObservacion.onclick = () => realizarAprobacionConObservacion(sol.id);
            btnObservarTecnico.onclick = () => realizarObservacion(sol.id);
          } else {
            // Asignado a otro técnico del mismo área
            panelAsignacionContainer.innerHTML = `
              <div class="alert alert-danger" style="margin-bottom: 0; font-size: 0.8rem; padding: 0.5rem 0.8rem;">
                🚫 Asignado a otro técnico: <strong>${escaparHTML(aprobacionArea.tecnico_nombre || 'Analista')}</strong>.
              </div>
            `;
            if (actionsButtonsRow) actionsButtonsRow.style.display = 'none';
            if (obsInputArea) obsInputArea.style.display = 'none';
          }
        } else {
          // Para OSI u otras áreas técnicas que no tengan asignación exclusiva
          if (actionsButtonsRow) actionsButtonsRow.style.display = 'flex';
          if (obsInputArea) obsInputArea.style.display = 'block';

          // Asignar eventos de clic específicos para esta solicitud
          btnAprobarTecnico.onclick = () => realizarAprobacion(sol.id);
          btnAprobarConObservacion.onclick = () => realizarAprobacionConObservacion(sol.id);
          btnObservarTecnico.onclick = () => realizarObservacion(sol.id);
        }
      }
    }

    // CONTROL DEL PANEL DE EDICIÓN Y ACCIONES ADICIONALES
    detAccionesAdicionales.innerHTML = '';
    
    // 1. Descarga de PDF para solicitudes aprobadas
    if (sol.estado === 'aprobado') {
      const alertDiv = document.createElement('div');
      alertDiv.className = 'alert alert-success';
      alertDiv.textContent = '🎉 ¡Solicitud completamente aprobada! Puedes descargar el documento institucional final.';
      detAccionesAdicionales.appendChild(alertDiv);

      const pdfBtn = document.createElement('button');
      pdfBtn.className = 'btn btn-success btn-block';
      pdfBtn.innerHTML = '📥 Descargar Documento Final (PDF)';
      pdfBtn.onclick = () => descargarPDF(sol.id);
      detAccionesAdicionales.appendChild(pdfBtn);
    }

    // 2. Editar para el solicitante si está borrador, observado o en revisión
    if (currentUser.rol === 'solicitante' && (sol.estado === 'borrador' || sol.estado === 'observado' || sol.estado === 'en_revision')) {
      const alertDiv = document.createElement('div');
      if (sol.estado === 'borrador') {
        alertDiv.className = 'alert alert-info';
        alertDiv.textContent = '✏️ Esta solicitud se encuentra en borrador. Puedes editar la información antes de enviarla a revisión.';
      } else if (sol.estado === 'observado') {
        alertDiv.className = 'alert alert-danger';
        alertDiv.textContent = '⚠️ Esta solicitud ha sido observada por un área técnica. Por favor corrige la información.';
      } else {
        alertDiv.className = 'alert alert-warning';
        alertDiv.textContent = '🔄 El proceso de revisión está abierto. Puedes editar la información si lo requieres (esto reiniciará las aprobaciones).';
      }
      detAccionesAdicionales.appendChild(alertDiv);

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-primary btn-block';
      editBtn.innerHTML = sol.estado === 'borrador' ? '✏️ Editar y Completar Formulario' : '✏️ Editar y Corregir Formulario';
      editBtn.onclick = () => abrirEdicion(sol.id, sol.tipo_solicitud_id);
      detAccionesAdicionales.appendChild(editBtn);
    }

    // 3. Editar para técnicos o administradores si está en revisión u observado
    const aprobacionArea = currentUser.rol === 'tecnico' ? sol.aprobaciones.find(ap => ap.area === currentUser.area) : null;
    let esTecnicoConResponsabilidad = false;
    if (currentUser.rol === 'tecnico' && currentUser.area !== 'director' && aprobacionArea) {
      if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(currentUser.area)) {
        esTecnicoConResponsabilidad = aprobacionArea.tecnico_id === currentUser.id;
      } else {
        esTecnicoConResponsabilidad = true;
      }
    }

    if ((esTecnicoConResponsabilidad || currentUser.rol === 'admin') && (sol.estado === 'en_revision' || sol.estado === 'observado')) {
      const editTechBtn = document.createElement('button');
      editTechBtn.className = 'btn btn-outline btn-block';
      editTechBtn.innerHTML = '✏️ Editar Datos de Solicitud';
      editTechBtn.onclick = () => abrirEdicion(sol.id, sol.tipo_solicitud_id);
      detAccionesAdicionales.appendChild(editTechBtn);
    }

    // 4. Botón de Reapertura (para el solicitante, técnicos con responsabilidad o admin) si no es borrador
    if (sol.estado !== 'borrador') {
      let puedeReabrir = false;
      if (currentUser.rol === 'admin') puedeReabrir = true;
      if (currentUser.rol === 'solicitante' && sol.solicitante_id === currentUser.id) puedeReabrir = true;
      if (esTecnicoConResponsabilidad) puedeReabrir = true;

      if (puedeReabrir) {
        const reabrirBtn = document.createElement('button');
        reabrirBtn.className = 'btn btn-danger btn-block';
        reabrirBtn.style.marginTop = '0.5rem';
        reabrirBtn.innerHTML = '🔄 Reabrir Proceso de Revisión (Reiniciar Vtos. Buenos)';
        reabrirBtn.onclick = () => realizarReapertura(sol.id);
        detAccionesAdicionales.appendChild(reabrirBtn);
      }
    }

    if (!isRefresh) {
      modalDetalle.classList.remove('hidden');
    }
  } catch (error) {
    if (!isRefresh) alert('Error al cargar detalle de solicitud: ' + error.message);
  }
}

// ABRIR EDICIÓN DE SOLICITUD
function abrirEdicion(solicitudId, tipoId) {
  // Buscar datos locales de la solicitud
  const sol = todasLasSolicitudes.find(s => s.id === solicitudId);
  if (!sol) return;

  cerrarModal('modal-detalle');
  
  solicitudIdInput.value = sol.id;
  selectTipoSolicitud.value = tipoId;
  selectTipoSolicitud.disabled = true; // No se puede cambiar el tipo en edición

  // Renderizar campos cargando los datos ya escritos anteriormente
  renderizarCamposDinamicos(tipoId, sol.datos);
  document.getElementById('modal-solicitud-titulo').textContent = `Editar Solicitud ${sol.tipo_codigo}-${sol.id}`;

  if (currentUser.rol === 'solicitante') {
    btnGuardarBorrador.classList.remove('hidden');
    document.getElementById('btn-enviar-revision').textContent = 'Enviar a Revisión';
  } else {
    btnGuardarBorrador.classList.add('hidden');
    document.getElementById('btn-enviar-revision').textContent = 'Guardar Cambios';
  }

  modalSolicitud.classList.remove('hidden');
}

async function realizarAprobacion(solicitudId) {
  if (!confirm('¿Está seguro de que va a aprobar la sección sin ninguna observación?')) return;
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/aprobar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      },
      body: JSON.stringify({})
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al procesar la aprobación.');
    }

    cerrarModal('modal-detalle');
    await cargarBandeja();
  } catch (error) {
    alert(error.message);
  }
}

async function realizarAprobacionConObservacion(solicitudId) {
  const observacion = observacionTexto.value;
  if (!observacion || observacion.trim() === '') {
    alert('Por favor escribe la observación en el cuadro de texto antes de aprobar.');
    return;
  }
  if (!confirm('¿Está seguro de que desea aprobar esta sección técnica con la observación ingresada?')) return;
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/aprobar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      },
      body: JSON.stringify({ observacion })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al procesar la aprobación.');
    }

    cerrarModal('modal-detalle');
    await cargarBandeja();
  } catch (error) {
    alert(error.message);
  }
}

// 8.1. REGISTRAR OBSERVACIÓN PARALELA SIMPLE (SIN REINICIAR EL FLUJO)
async function realizarObservacionSimple(solicitudId) {
  const texto = observacionTexto.value;
  if (!texto || texto.trim() === '') {
    alert('Por favor escribe en detalle el motivo de la observación.');
    return;
  }

  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/observar-simple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      },
      body: JSON.stringify({ texto })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al guardar la observación.');
    }

    observacionTexto.value = '';
    await verDetalle(solicitudId);
    await cargarBandeja();
  } catch (error) {
    alert(error.message);
  }
}

// 9. ACCIÓN DE REGISTRAR OBSERVACIÓN (REAPERTURA INTEGRAL A ESTADO OBSERVADO) POR PARTE DEL TÉCNICO
async function realizarObservacion(solicitudId) {
  const texto = observacionTexto.value;
  if (!texto || texto.trim() === '') {
    alert('Por favor describe en detalle el motivo de la observación.');
    return;
  }

  if (!confirm('¿Está seguro de que desea reportar esta solicitud como observada para que el solicitante corrija la información?')) return;

  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/observar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      },
      body: JSON.stringify({ texto })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al guardar la observación.');
    }

    cerrarModal('modal-detalle');
    await cargarBandeja();
  } catch (error) {
    alert(error.message);
  }
}

// 9.1. ACCIÓN DE REAPERTURA GENERAL DE LA REVISIÓN (REINICIAR TODO A EN_REVISION)
async function realizarReapertura(solicitudId) {
  const texto = prompt('Escribe el motivo detallado de la reapertura de la solicitud (se reiniciarán todas las aprobaciones):');
  if (texto === null) return; // Cancelado
  if (texto.trim() === '') {
    alert('El motivo de la reapertura es obligatorio.');
    return;
  }

  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/reabrir`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      },
      body: JSON.stringify({ texto })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al reabrir el proceso de revisión.');
    }

    cerrarModal('modal-detalle');
    await cargarBandeja();
  } catch (error) {
    alert(error.message);
  }
}

// 10. DESCARGAR PDF CON CABECERA DE AUTENTICACIÓN
async function descargarPDF(solicitudId) {
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/pdf`, {
      headers: { 'x-user-id': currentUser.id }
    });
    if (!response.ok) {
      const textoError = await response.text();
      throw new Error(textoError || 'Error al descargar el PDF.');
    }

    // Convertir respuesta a blob y descargar
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);

    // Intentar extraer el nombre del archivo de la cabecera Content-Disposition
    const disposition = response.headers.get('Content-Disposition');
    let filename = `SVT_Solicitud_${solicitudId}.pdf`;
    if (disposition && disposition.indexOf('attachment') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) { 
        filename = matches[1].replace(/['"]/g, '');
      }
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
}

// ==========================================
// SECCIÓN DE ADMINISTRACIÓN (LÓGICA DEL FRONTEND)
// ==========================================

// Navegar entre paneles de Administración
function navegarAdmin(vista, elem) {
  // Ocultar todas las vistas principales
  solicitudesView.classList.add('hidden');
  adminUsuariosView.classList.add('hidden');
  adminFormulariosView.classList.add('hidden');
  adminCorreosView.classList.add('hidden');

  // Quitar clase active de toda la barra lateral
  const links = document.querySelectorAll('.sidebar-nav a');
  links.forEach(l => l.classList.remove('active'));

  // Resaltar el link activo
  if (elem) elem.classList.add('active');

  // Mostrar la vista seleccionada
  if (vista === 'usuarios') {
    adminUsuariosView.classList.remove('hidden');
    cargarUsuariosAdmin();
  } else if (vista === 'formularios') {
    adminFormulariosView.classList.remove('hidden');
    cargarFormulariosAdmin();
  } else if (vista === 'correos') {
    adminCorreosView.classList.remove('hidden');
    limpiarFormularioCorreoPrueba();
  }
}

function limpiarFormularioCorreoPrueba() {
  correoPruebaForm.reset();
  correoResultadoContainer.classList.add('hidden');
  correoResultadoContainer.className = 'hidden';
  correoResultadoContainer.innerHTML = '';
}

// Escuchar el submit del formulario de correo de prueba
if (correoPruebaForm) {
  correoPruebaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const destinatario = document.getElementById('mail-destinatario').value.trim();
    const cc = document.getElementById('mail-cc').value.trim();
    const asunto = document.getElementById('mail-asunto').value.trim();
    const cuerpo = document.getElementById('mail-cuerpo').value.trim();

    const btnEnviar = document.getElementById('btn-enviar-correo');
    const originalText = btnEnviar.textContent;
    btnEnviar.disabled = true;
    btnEnviar.textContent = '⏳ Enviando correo de prueba...';

    correoResultadoContainer.classList.add('hidden');
    correoResultadoContainer.innerHTML = '';

    try {
      const response = await fetch('/api/admin/enviar-correo-prueba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({ destinatario, cc, asunto, cuerpo })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar el correo.');
      }

      correoResultadoContainer.className = 'card';
      correoResultadoContainer.style.backgroundColor = '#D4EDDA';
      correoResultadoContainer.style.color = '#155724';
      correoResultadoContainer.style.borderColor = '#C3E6CB';
      correoResultadoContainer.style.borderStyle = 'solid';
      correoResultadoContainer.style.borderWidth = '1px';
      
      let htmlContent = `<strong>✅ ¡Envío Exitoso!</strong><br>${data.message}`;
      
      if (data.previewUrl) {
        htmlContent += `<br><br>👉 <a href="${data.previewUrl}" target="_blank" style="color: #155724; font-weight: bold; text-decoration: underline;">Haz clic aquí para abrir la previsualización del correo electrónico en Ethereal</a>`;
      }
      
      correoResultadoContainer.innerHTML = htmlContent;
      correoResultadoContainer.classList.remove('hidden');
    } catch (error) {
      correoResultadoContainer.className = 'card';
      correoResultadoContainer.style.backgroundColor = '#F8D7DA';
      correoResultadoContainer.style.color = '#721C24';
      correoResultadoContainer.style.borderColor = '#F5C6CB';
      correoResultadoContainer.style.borderStyle = 'solid';
      correoResultadoContainer.style.borderWidth = '1px';
      correoResultadoContainer.innerHTML = `<strong>❌ Error al enviar:</strong><br>${error.message}`;
      correoResultadoContainer.classList.remove('hidden');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = originalText;
    }
  });
}

// Cargar Listado de Usuarios Segmentados por Rol y Área
async function cargarUsuariosAdmin() {
  try {
    const response = await fetch('/api/admin/usuarios', {
      headers: { 'x-user-id': currentUser.id }
    });
    if (!response.ok) throw new Error('Error al cargar la lista de usuarios.');
    const usuarios = await response.json();
    
    adminUsuariosSegmentedContainer.innerHTML = '';
    
    if (usuarios.length === 0) {
      adminUsuariosSegmentedContainer.innerHTML = '<div class="alert alert-danger text-center">No hay usuarios registrados en el sistema.</div>';
      return;
    }

    const segmentos = [
      {
        nombre: 'Administradores',
        filtro: usr => usr.rol === 'admin',
        icon: '⚙️'
      },
      {
        nombre: 'Director DTIC MSP',
        filtro: usr => usr.rol === 'tecnico' && usr.area === 'director',
        icon: '👔'
      },
      {
        nombre: 'Solicitantes (Usuarios del Sistema)',
        filtro: usr => usr.rol === 'solicitante',
        icon: '👤'
      },
      {
        nombre: 'Gestión Interna de Seguridad Informática y Calidad de Software - (GISICS)',
        filtro: usr => usr.rol === 'tecnico' && usr.area === 'seguridad',
        icon: '🔒'
      },
      {
        nombre: 'Gestión Interna de Base de Datos - (GIBD)',
        filtro: usr => usr.rol === 'tecnico' && usr.area === 'gibdd',
        icon: '💾'
      },
      {
        nombre: 'Gestión Interna de Infraestructura - (GIITRC)',
        filtro: usr => usr.rol === 'tecnico' && usr.area === 'giitrc',
        icon: '🌐'
      },
      {
        nombre: 'Oficial de Seguridad de la Información - (OSI)',
        filtro: usr => usr.rol === 'tecnico' && usr.area === 'osi',
        icon: '👁️'
      }
    ];

    segmentos.forEach(seg => {
      const filtered = usuarios.filter(seg.filtro);
      
      const segmentDiv = document.createElement('div');
      segmentDiv.className = 'admin-segment-card collapsed'; // Iniciar colapsado para no scrollear demasiado
      segmentDiv.style.marginBottom = '1.5rem';
      
      const header = document.createElement('div');
      header.className = 'admin-segment-header';
      header.innerHTML = `
        <h3>
          <span>${seg.icon}</span> 
          <strong>${seg.nombre}</strong> 
          <span class="badge badge-solicitante" style="margin-left:auto; font-size:0.7rem; text-transform:none; font-weight:normal;">${filtered.length} usuario(s)</span>
          <span class="admin-segment-toggle-icon">▼</span>
        </h3>
      `;
      header.addEventListener('click', () => {
        segmentDiv.classList.toggle('collapsed');
      });
      segmentDiv.appendChild(header);

      const tableContainer = document.createElement('div');
      tableContainer.className = 'table-container';

      if (filtered.length === 0) {
        tableContainer.innerHTML = `<div style="padding:1rem; text-align:center; color:var(--text-secondary); font-size:0.8rem;">No hay usuarios asignados a este segmento.</div>`;
      } else {
        const table = document.createElement('table');
        table.innerHTML = `
          <thead>
            <tr>
              <th>Nombre Completo</th>
              <th>Cédula / Cargo</th>
              <th>Correo (Login)</th>
              <th>Rol</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        filtered.forEach(usr => {
          const tr = document.createElement('tr');
          let detailsHtml = `<strong>C.I.:</strong> ${escaparHTML(usr.cedula || 'N/A')}<br><small style="color:var(--text-secondary)">${escaparHTML(usr.cargo || 'N/A')}</small>`;
          if (usr.rol === 'solicitante' && usr.direccion_proyecto) {
            detailsHtml += `<br><small style="color:var(--accent-color); font-weight: 500;">Dir/Proyecto: ${escaparHTML(usr.direccion_proyecto)}</small>`;
          }
          const cedulaCargo = detailsHtml;
          
          let nombreHtml = escaparHTML(usr.nombre);
 
          tr.innerHTML = `
            <td class="font-bold">${nombreHtml}</td>
            <td>${cedulaCargo}</td>
            <td><code>${escaparHTML(usr.username)}</code></td>
            <td><span class="badge badge-${usr.rol}">${usr.rol}</span></td>
            <td>
              <button class="btn btn-outline btn-sm" onclick="abrirModalUsuario(${JSON.stringify(usr).replace(/"/g, '&quot;')})">✏️ Editar</button>
              <button class="btn btn-danger btn-sm" onclick="eliminarUsuario(${usr.id})">🗑️ Borrar</button>
            </td>
          `;
          tbody.appendChild(tr);
        });
        tableContainer.appendChild(table);
      }
      
      segmentDiv.appendChild(tableContainer);
      adminUsuariosSegmentedContainer.appendChild(segmentDiv);
    });
  } catch (error) {
    alert(error.message);
  }
}

// Abrir Modal para Crear/Editar Usuario
function abrirModalUsuario(user = null) {
  formUsuarioReset();
  
  if (user) {
    document.getElementById('modal-usuario-titulo').textContent = 'Editar Usuario';
    usuarioIdInput.value = user.id;
    usrNombre.value = user.nombre;
    usrCedula.value = user.cedula || '';
    usrCargo.value = user.cargo || '';
    usrUsername.value = user.username;
    usrRol.value = user.rol;
    usrPassword.required = false;
    usrPasswordHelp.textContent = 'Deja en blanco para no modificar la contraseña.';
    usrDireccionProyecto.value = user.direccion_proyecto || '';
    
    if (user.rol === 'tecnico') {
      usrArea.value = user.area || '';
    }
    cambiarSelectorRol();
    if (user.rol === 'tecnico' && user.area === 'osi') {
      usrFirmaDocumentos.checked = !!user.firma_documentos;
    }
  } else {
    document.getElementById('modal-usuario-titulo').textContent = 'Registrar Usuario';
    usuarioIdInput.value = '';
    usrPassword.required = true;
    usrPasswordHelp.textContent = 'Contraseña requerida para nuevos usuarios.';
    cambiarSelectorRol();
  }
  
  modalUsuario.classList.remove('hidden');
}

// Limpiar formulario de usuario
function formUsuarioReset() {
  usuarioForm.reset();
  usuarioIdInput.value = '';
  usrArea.value = '';
  usrCedula.value = '';
  usrCargo.value = '';
  usrDireccionProyecto.value = '';
  usrFirmaDocumentos.checked = false;
  usrFirmaGroup.classList.add('hidden');
}

// Cambiar visibilidad de campos de área técnica según rol
function cambiarSelectorRol() {
  const rol = usrRol.value;
  const area = usrArea.value;

  if (rol === 'tecnico') {
    usrAreaGroup.classList.remove('hidden');
    usrArea.required = true;
  } else {
    usrAreaGroup.classList.add('hidden');
    usrArea.required = false;
    usrArea.value = '';
  }

  if (rol === 'solicitante') {
    usrDireccionProyectoGroup.classList.remove('hidden');
    usrDireccionProyecto.required = true;
  } else {
    usrDireccionProyectoGroup.classList.add('hidden');
    usrDireccionProyecto.required = false;
    usrDireccionProyecto.value = '';
  }

  usrFirmaGroup.classList.add('hidden');
  usrFirmaDocumentos.checked = false;
}

// Procesar Guardar/Editar Usuario
usuarioForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = usuarioIdInput.value;
  const nombre = usrNombre.value;
  const cedula = usrCedula.value;
  const cargo = usrCargo.value;
  const username = usrUsername.value;
  const password = usrPassword.value;
  const rol = usrRol.value;
  const area = usrArea.value;
  const direccion_proyecto = usrDireccionProyecto.value;
  
  const payload = { 
    nombre, 
    cedula, 
    cargo, 
    username, 
    rol, 
    area: rol === 'tecnico' ? area : null,
    direccion_proyecto: rol === 'solicitante' ? direccion_proyecto : null,
    firma_documentos: (rol === 'tecnico' && area === 'osi') ? usrFirmaDocumentos.checked : false
  };
  if (password && password.trim() !== '') {
    payload.password = password;
  }
  
  try {
    let response;
    if (id) {
      response = await fetch(`/api/admin/usuarios/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(payload)
      });
    }
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar usuario.');
    
    cerrarModal('modal-usuario');
    await cargarUsuariosAdmin();
  } catch (error) {
    alert(error.message);
  }
});

// Eliminar Usuario
async function eliminarUsuario(id) {
  if (id === currentUser.id) {
    alert('No puedes eliminar tu propio usuario activo.');
    return;
  }
  if (!confirm('¿Estás seguro de que deseas eliminar este usuario de forma permanente?')) return;
  
  try {
    const response = await fetch(`/api/admin/usuarios/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': currentUser.id }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al eliminar usuario.');
    
    await cargarUsuariosAdmin();
  } catch (error) {
    alert(error.message);
  }
}

// Cargar Listado de Plantillas de Formularios
async function cargarFormulariosAdmin() {
  try {
    const response = await fetch('/api/tipos-solicitud', {
      headers: { 'x-user-id': currentUser.id }
    });
    const formularios = await response.json();
    
    adminFormulariosList.innerHTML = '';
    formularios.forEach(form => {
      const areasStr = form.areas_validadoras.map(a => `<span class="badge badge-area-${a}" style="margin-right:5px; margin-bottom:5px; display:inline-block; padding:0.3rem 0.6rem; text-transform:none;">${obtenerNombreAreaSinSiglas(a)}</span>`).join('');
      const camposNombres = form.campos.map(c => c.label).join(', ');
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="font-bold"><span style="color:var(--accent-color);">[${escaparHTML(form.codigo)}]</span> ${escaparHTML(form.nombre)}</td>
        <td style="max-width:300px; font-size:0.8rem; color:var(--text-secondary);">${escaparHTML(form.descripcion)}</td>
        <td>${areasStr}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="abrirModalPlantilla(${JSON.stringify(form).replace(/"/g, '&quot;')})">✏️ Editar Plantilla</button>
          <button class="btn btn-outline btn-sm" onclick="copiarPlantilla(${JSON.stringify(form).replace(/"/g, '&quot;')})">📋 Copiar</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarPlantilla(${form.id})">🗑️ Borrar</button>
        </td>
      `;
      adminFormulariosList.appendChild(tr);
    });
  } catch (error) {
    alert('Error al cargar formularios: ' + error.message);
  }
}

// Eliminar Plantilla de Formulario
async function eliminarPlantilla(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta plantilla de formulario de forma permanente? Se eliminarán también todas las solicitudes asociadas a ella.')) return;
  
  try {
    const response = await fetch(`/api/admin/tipos-solicitud/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': currentUser.id }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al eliminar la plantilla de formulario.');
    
    await cargarFormulariosAdmin();
    await cargarTiposSolicitud(); // Actualizar memoria y selector de tipo de solicitud
  } catch (error) {
    alert(error.message);
  }
}

// Funciones del Constructor Visual de Campos
function agregarFilaColumnaVisual(target, colObj = null) {
  let list;
  if (target.classList && target.classList.contains('btn-agregar-columna')) {
    list = target.previousElementSibling;
  } else {
    list = target;
  }
  if (!list) return;

  const colRow = document.createElement('div');
  colRow.className = 'columna-visual-row';

  const colName = colObj ? colObj.name : '';
  const colType = colObj ? colObj.type : 'text';
  const colRequired = colObj ? (colObj.required || false) : false;
  const recogerCedChecked = colObj ? (colObj.recoger_cedula || false) : false;
  const recogerCarChecked = colObj ? (colObj.recoger_cargo || false) : false;

  colRow.innerHTML = `
    <input type="text" class="col-name" placeholder="Nombre Columna" required value="${colName.replace(/"/g, '&quot;')}">
    <select class="col-type" onchange="actualizarFilaColumnaFirmante(this)">
      <optgroup label="Datos Básicos">
        <option value="text" ${colType === 'text' ? 'selected' : ''}>Texto</option>
        <option value="number" ${colType === 'number' ? 'selected' : ''}>Número</option>
        <option value="checkbox" ${colType === 'checkbox' ? 'selected' : ''}>Checkbox / Casilla (X)</option>
        <option value="select" ${colType === 'select' ? 'selected' : ''}>Selector</option>
      </optgroup>
      <optgroup label="Formatos Específicos">
        <option value="date" ${colType === 'date' ? 'selected' : ''}>Fecha</option>
        <option value="email" ${colType === 'email' ? 'selected' : ''}>Correo Electrónico</option>
        <option value="identificacion" ${colType === 'identificacion' ? 'selected' : ''}>Número Identificación (10 dígitos)</option>
      </optgroup>
      <optgroup label="Firmas">
        <option value="firmante" ${colType === 'firmante' ? 'selected' : ''}>Firmante (Nombre)</option>
        <option value="firmante_seccion" ${colType === 'firmante_seccion' ? 'selected' : ''}>Firmante Adicional (Solo Firma)</option>
      </optgroup>
    </select>
    <label class="col-label-option">
      <input type="checkbox" class="col-required" ${colRequired ? 'checked' : ''}> Oblig.
    </label>
    <div class="col-firmante-options" style="display:${(colType === 'firmante' || colType === 'firmante_seccion') ? 'flex' : 'none'};">
      <label class="col-firmante-label-option">
        <input type="checkbox" class="col-recoger-cedula" ${recogerCedChecked ? 'checked' : ''}> C.I.
      </label>
      <label class="col-firmante-label-option">
        <input type="checkbox" class="col-recoger-cargo" ${recogerCarChecked ? 'checked' : ''}> Cargo
      </label>
    </div>
    <div class="col-select-options" style="display:${colType === 'select' ? 'flex' : 'none'};">
      <input type="text" class="col-options" placeholder="Opciones (ej. Sí,No)" value="${colObj && Array.isArray(colObj.options) ? colObj.options.join(',') : (colObj && colObj.options ? colObj.options : '')}">
    </div>
    <button type="button" class="btn btn-outline btn-sm btn-trash-sm" onclick="this.parentElement.remove()">
      🗑️
    </button>
  `;
  list.appendChild(colRow);
}

function agregarFilaVisual(target, rowVal = '') {
  let list;
  if (target.classList && target.classList.contains('btn-agregar-fila')) {
    list = target.previousElementSibling;
  } else {
    list = target;
  }
  if (!list) return;

  const rRow = document.createElement('div');
  rRow.className = 'fila-visual-row';

  rRow.innerHTML = `
    <input type="text" class="row-name" placeholder="Nombre / Etiqueta de la Fila" required value="${rowVal.replace(/"/g, '&quot;')}">
    <button type="button" class="btn btn-outline btn-sm btn-trash-sm" onclick="this.parentElement.remove()">
      🗑️
    </button>
  `;
  list.appendChild(rRow);
}

function actualizarFilaColumnaFirmante(select) {
  const row = select.parentElement;
  const opts = row.querySelector('.col-firmante-options');
  if (opts) {
    opts.style.display = (select.value === 'firmante' || select.value === 'firmante_seccion') ? 'flex' : 'none';
  }
  const selOpts = row.querySelector('.col-select-options');
  if (selOpts) {
    selOpts.style.display = select.value === 'select' ? 'flex' : 'none';
  }
}

function actualizarFilaCampoRequerido(select) {
  const row = select.closest('.campo-visual-row');
  if (!row) return;
  const reqLabel = row.querySelector('.campo-required-label');
  const reqCheckbox = row.querySelector('.campo-required');
  const colsBuilder = row.querySelector('.grid-columns-builder');
  const rowsBuilder = row.querySelector('.grid-rows-builder');
  const firmanteBuilder = row.querySelector('.firmante-options-builder');
  const selectOptsBuilder = row.querySelector('.select-options-builder');
  const fixedGridRowLabelBuilder = row.querySelector('.fixed-grid-row-label-builder');
  
  // Limpiar campos para evitar bloquear el submit por validaciones requeridas ocultas
  const limpiarCols = () => { if (colsBuilder) colsBuilder.querySelector('.grid-columns-list').innerHTML = ''; };
  const limpiarRows = () => { if (rowsBuilder) rowsBuilder.querySelector('.grid-rows-list').innerHTML = ''; };
  const limpiarRowLabel = () => { if (fixedGridRowLabelBuilder) { const inp = fixedGridRowLabelBuilder.querySelector('.campo-row-label'); if (inp) inp.value = ''; } };
  const limpiarFirmante = () => { if (firmanteBuilder) { firmanteBuilder.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false); } };
  const limpiarSelectOpts = () => { if (selectOptsBuilder) { const inp = selectOptsBuilder.querySelector('.campo-options'); if (inp) inp.value = ''; } };

  if (['title', 'subtitle', 'paragraph', 'info_no_pdf'].includes(select.value)) {
    reqLabel.style.display = 'none';
    reqCheckbox.checked = false;
    
    colsBuilder.style.display = 'none';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarCols();
    limpiarRows();
    limpiarRowLabel();
    limpiarFirmante();
    limpiarSelectOpts();
  } else if (select.value === 'grid') {
    reqLabel.style.display = 'none';
    reqCheckbox.checked = false;
    
    colsBuilder.style.display = 'flex';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarRows();
    limpiarRowLabel();
    limpiarFirmante();
    limpiarSelectOpts();

    // Si la lista de columnas está vacía, agregar una por defecto
    const list = colsBuilder.querySelector('.grid-columns-list');
    if (list.children.length === 0) {
      agregarFilaColumnaVisual(list);
    }
  } else if (select.value === 'fixed_grid' || select.value === 'fixed_grid_dynamic_cols' || select.value === 'fixed_grid_fixed_cols') {
    reqLabel.style.display = 'none';
    reqCheckbox.checked = false;
    
    colsBuilder.style.display = 'flex';
    if (rowsBuilder) rowsBuilder.style.display = 'flex';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'flex';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';

    limpiarFirmante();
    limpiarSelectOpts();

    // Si la lista de columnas está vacía, agregar una por defecto
    const colList = colsBuilder.querySelector('.grid-columns-list');
    if (colList.children.length === 0) {
      agregarFilaColumnaVisual(colList);
    }
    // Si la lista de filas está vacía, agregar una por defecto
    if (rowsBuilder) {
      const rowList = rowsBuilder.querySelector('.grid-rows-list');
      if (rowList.children.length === 0) {
        agregarFilaVisual(rowList);
      }
    }
  } else if (select.value === 'firmante' || select.value === 'firmante_seccion' || select.value === 'firmante_list') {
    reqLabel.style.display = 'flex';
    
    colsBuilder.style.display = 'none';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'flex';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarCols();
    limpiarRows();
    limpiarRowLabel();
    limpiarSelectOpts();
  } else if (select.value === 'select') {
    reqLabel.style.display = 'flex';
    
    colsBuilder.style.display = 'none';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'flex';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarCols();
    limpiarRows();
    limpiarRowLabel();
    limpiarFirmante();
  } else {
    reqLabel.style.display = 'flex';
    
    colsBuilder.style.display = 'none';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarCols();
    limpiarRows();
    limpiarRowLabel();
    limpiarFirmante();
    limpiarSelectOpts();
  }
}

function agregarFilaCampoVisual(campoObj = null) {
  const row = document.createElement('div');
  row.className = 'campo-visual-row';
  if (campoObj && campoObj.name) {
    row.dataset.name = campoObj.name;
  }

  const labelVal = campoObj ? campoObj.label : '';
  const typeVal = campoObj ? campoObj.type : 'text';
  const reqChecked = campoObj ? campoObj.required : true;
  const recogerCedulaChecked = campoObj ? (campoObj.recoger_cedula || false) : false;
  const recogerCargoChecked = campoObj ? (campoObj.recoger_cargo || false) : false;

  row.innerHTML = `
    <div class="campo-visual-content">
      <!-- Fila de Etiqueta del Campo -->
      <div class="campo-visual-label-row">
        <span>Etiqueta:</span>
        <input type="text" class="campo-label" placeholder="Ej: Nombre Servidor, Justificación, etc." required value="${labelVal.replace(/"/g, '&quot;')}">
      </div>
      <!-- Fila de Tipo de Campo -->
      <div class="campo-visual-type-row">
        <span>Tipo Campo:</span>
        <select class="campo-type" onchange="actualizarFilaCampoRequerido(this)">
          <optgroup label="Texto e Ingreso Simple">
            <option value="text" ${typeVal === 'text' ? 'selected' : ''}>Texto Corto</option>
            <option value="textarea" ${typeVal === 'textarea' ? 'selected' : ''}>Texto Largo</option>
            <option value="number" ${typeVal === 'number' ? 'selected' : ''}>Número (Solo números)</option>
            <option value="checkbox" ${typeVal === 'checkbox' ? 'selected' : ''}>Casilla de Selección (Marcar con X)</option>
            <option value="select" ${typeVal === 'select' ? 'selected' : ''}>Selector / Menú Desplegable (Dropdown)</option>
            <option value="text_list" ${typeVal === 'text_list' ? 'selected' : ''}>Entradas Múltiples (Lista de Valores)</option>
          </optgroup>
          <optgroup label="Tablas de Datos">
            <option value="grid" ${typeVal === 'grid' ? 'selected' : ''}>Tabla Dinámica (Grid/Filas Múltiples)</option>
            <option value="fixed_grid" ${typeVal === 'fixed_grid' ? 'selected' : ''}>Tabla de Filas Fijas (Grid Fijo)</option>
          </optgroup>
          <optgroup label="Tablas Avanzadas (Por Filas)">
            <option value="fixed_grid_dynamic_cols" ${typeVal === 'fixed_grid_dynamic_cols' ? 'selected' : ''}>Tabla por Filas (Columnas Dinámicas por Solicitante)</option>
            <option value="fixed_grid_fixed_cols" ${typeVal === 'fixed_grid_fixed_cols' ? 'selected' : ''}>Tabla por Filas (Columnas Fijas por Admin)</option>
          </optgroup>
          <optgroup label="Flujo de Firmantes">
            <option value="firmante" ${typeVal === 'firmante' ? 'selected' : ''}>Firmante Adicional (Nombre)</option>
            <option value="firmante_seccion" ${typeVal === 'firmante_seccion' ? 'selected' : ''}>Firmante Adicional (Solo Firma)</option>
            <option value="firmante_list" ${typeVal === 'firmante_list' ? 'selected' : ''}>Lista de Firmantes Adicionales</option>
          </optgroup>
          <optgroup label="Formato y Títulos">
            <option value="title" ${typeVal === 'title' ? 'selected' : ''}>Título (Sección)</option>
            <option value="subtitle" ${typeVal === 'subtitle' ? 'selected' : ''}>Subtítulo</option>
            <option value="paragraph" ${typeVal === 'paragraph' ? 'selected' : ''}>Texto Informativo</option>
            <option value="info_no_pdf" ${typeVal === 'info_no_pdf' ? 'selected' : ''}>Texto Informativo (Oculto en PDF)</option>
          </optgroup>
        </select>
        <label class="campo-required-label">
          <input type="checkbox" class="campo-required" ${reqChecked ? 'checked' : ''}> Obligatorio
        </label>
      </div>
      <!-- Configuración Adicional para Firmantes -->
      <div class="firmante-options-builder" style="display:none;">
        <label class="firmante-option-label">
          <input type="checkbox" class="campo-recoger-cedula" ${recogerCedulaChecked ? 'checked' : ''}> Recoger Cédula
        </label>
        <label class="firmante-option-label">
          <input type="checkbox" class="campo-recoger-cargo" ${recogerCargoChecked ? 'checked' : ''}> Recoger Cargo
        </label>
      </div>
      <!-- Configuración Adicional para Selectores (Dropdown) -->
      <div class="select-options-builder" style="display:none;">
        <span>Opciones:</span>
        <input type="text" class="campo-options" placeholder="Ej: Sí, No, Tal vez" value="${campoObj && Array.isArray(campoObj.options) ? campoObj.options.join(', ') : (campoObj && campoObj.options ? campoObj.options : '')}">
      </div>
      <!-- Configuración Adicional para Grid Fijo (Nombre de la primera columna) -->
      <div class="fixed-grid-row-label-builder" style="display:none;">
        <span>Etiqueta Fila:</span>
        <input type="text" class="campo-row-label" placeholder="Ej: Descripción / Fila" value="${campoObj && campoObj.row_label ? campoObj.row_label.replace(/"/g, '&quot;') : ''}">
      </div>
      <!-- Constructor Visual de Columnas para Grid -->
      <div class="grid-columns-builder" style="display:none;">
        <label class="builder-section-label">Columnas de la Tabla:</label>
        <div class="grid-columns-list builder-list-container"></div>
        <button type="button" class="btn btn-outline btn-sm btn-agregar-columna btn-builder-add" onclick="agregarFilaColumnaVisual(this)">
          ➕ Agregar Columna
        </button>
      </div>
      <!-- Constructor Visual de Filas para Grid Fijo -->
      <div class="grid-rows-builder" style="display:none;">
        <label class="builder-section-label">Filas de la Tabla:</label>
        <div class="grid-rows-list builder-list-container"></div>
        <button type="button" class="btn btn-outline btn-sm btn-agregar-fila btn-builder-add" onclick="agregarFilaVisual(this)">
          ➕ Agregar Fila Predefinida
        </button>
      </div>
    </div>
    <div class="campo-visual-actions">
      <button type="button" class="btn btn-outline btn-sm btn-mover-arriba" onclick="moverCampoVisualArriba(this)" title="Mover Arriba">▲</button>
      <button type="button" class="btn btn-outline btn-sm btn-mover-abajo" onclick="moverCampoVisualAbajo(this)" title="Mover Abajo">▼</button>
      <button type="button" class="btn btn-outline btn-sm btn-trash-field" onclick="eliminarFilaCampoVisual(this)" title="Eliminar Campo">🗑️</button>
    </div>
  `;
  constructorCamposContainer.appendChild(row);

  // Poblar columnas si ya es grid o fixed_grid al cargar
  if (campoObj && (campoObj.type === 'grid' || campoObj.type === 'fixed_grid' || campoObj.type === 'fixed_grid_dynamic_cols' || campoObj.type === 'fixed_grid_fixed_cols') && Array.isArray(campoObj.columns)) {
    const list = row.querySelector('.grid-columns-list');
    campoObj.columns.forEach(col => {
      const colObj = typeof col === 'object' ? col : { name: col, type: 'text' };
      agregarFilaColumnaVisual(list, colObj);
    });
  }

  // Poblar filas si ya es fixed_grid al cargar
  if (campoObj && (campoObj.type === 'fixed_grid' || campoObj.type === 'fixed_grid_dynamic_cols' || campoObj.type === 'fixed_grid_fixed_cols') && Array.isArray(campoObj.rows)) {
    const list = row.querySelector('.grid-rows-list');
    campoObj.rows.forEach(r => {
      agregarFilaVisual(list, r);
    });
  }
  
  // Ocultar/mostrar elementos correspondientes
  const selectEl = row.querySelector('.campo-type');
  actualizarFilaCampoRequerido(selectEl);
}

function eliminarFilaCampoVisual(button) {
  const row = button.closest('.campo-visual-row');
  if (row) {
    row.remove();
  }
}

function moverCampoVisualArriba(button) {
  const row = button.closest('.campo-visual-row');
  if (!row) return;
  const prev = row.previousElementSibling;
  if (prev && prev.classList.contains('campo-visual-row')) {
    row.parentNode.insertBefore(row, prev);
  }
}

function moverCampoVisualAbajo(button) {
  const row = button.closest('.campo-visual-row');
  if (!row) return;
  const next = row.nextElementSibling;
  if (next && next.classList.contains('campo-visual-row')) {
    row.parentNode.insertBefore(next, row);
  }
}

// Abrir Modal para Crear/Editar Plantilla de Formulario
function abrirModalPlantilla(formObj = null) {
  constructorCamposContainer.innerHTML = '';
  
  if (formObj) {
    document.getElementById('modal-plantilla-titulo').textContent = 'Editar Plantilla de Formulario';
    plantillaIdInput.value = formObj.id;
    pltCodigo.value = formObj.codigo || '';
    pltNombre.value = formObj.nombre;
    pltDescripcion.value = formObj.descripcion;
    
    // Checkboxes
    chkValSeguridad.checked = formObj.areas_validadoras.includes('seguridad');
    chkValGibdd.checked = formObj.areas_validadoras.includes('gibdd');
    chkValGiitrc.checked = formObj.areas_validadoras.includes('giitrc');
    chkValOsi.checked = formObj.areas_validadoras.includes('osi');
    chkValDirector.checked = formObj.areas_validadoras.includes('director');
    
    // Configuración de correo
    pltMailDestinatario.value = formObj.mail_destinatario || '';
    pltMailCc.value = formObj.mail_cc || '';
    pltMailAsunto.value = formObj.mail_asunto || '';
    pltMailCuerpo.value = formObj.mail_cuerpo || '';
    pltMailProgreso.checked = formObj.mail_progreso !== false;

    // Renderizar campos dinámicos visuales
    formObj.campos.forEach(c => agregarFilaCampoVisual(c));
  } else {
    document.getElementById('modal-plantilla-titulo').textContent = 'Registrar Plantilla de Formulario';
    plantillaIdInput.value = '';
    pltCodigo.value = '';
    pltNombre.value = '';
    pltDescripcion.value = '';
    
    // Checkboxes
    chkValSeguridad.checked = false;
    chkValGibdd.checked = false;
    chkValGiitrc.checked = false;
    chkValOsi.checked = false;
    chkValDirector.checked = false;
    
    // Configuración de correo
    pltMailDestinatario.value = '';
    pltMailCc.value = '';
    pltMailAsunto.value = '';
    pltMailCuerpo.value = '';
    pltMailProgreso.checked = true;

    // Renderizar un campo vacío por defecto
    agregarFilaCampoVisual();
  }
  
  modalPlantilla.classList.remove('hidden');
}

function copiarPlantilla(formObj) {
  constructorCamposContainer.innerHTML = '';
  
  document.getElementById('modal-plantilla-titulo').textContent = 'Copiar Plantilla de Formulario';
  plantillaIdInput.value = '';
  pltCodigo.value = formObj.codigo ? `${formObj.codigo}_COPIA` : '';
  pltNombre.value = `${formObj.nombre} (Copia)`;
  pltDescripcion.value = formObj.descripcion || '';
  
  // Checkboxes
  chkValSeguridad.checked = formObj.areas_validadoras.includes('seguridad');
  chkValGibdd.checked = formObj.areas_validadoras.includes('gibdd');
  chkValGiitrc.checked = formObj.areas_validadoras.includes('giitrc');
  chkValOsi.checked = formObj.areas_validadoras.includes('osi');
  chkValDirector.checked = formObj.areas_validadoras.includes('director');
  
  // Configuración de correo
  pltMailDestinatario.value = formObj.mail_destinatario || '';
  pltMailCc.value = formObj.mail_cc || '';
  pltMailAsunto.value = formObj.mail_asunto || '';
  pltMailCuerpo.value = formObj.mail_cuerpo || '';
  pltMailProgreso.checked = formObj.mail_progreso !== false;

  // Renderizar campos dinámicos visuales
  formObj.campos.forEach(c => agregarFilaCampoVisual(c));
  
  modalPlantilla.classList.remove('hidden');
}

// Procesar Guardar Plantilla de Formulario
plantillaForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = plantillaIdInput.value;
  const codigo = pltCodigo.value.trim().toUpperCase();
  const nombre = pltNombre.value;
  const descripcion = pltDescripcion.value;
  
  // Áreas validadoras
  const areas = [];
  if (chkValSeguridad.checked) areas.push('seguridad');
  if (chkValGibdd.checked) areas.push('gibdd');
  if (chkValGiitrc.checked) areas.push('giitrc');
  if (chkValOsi.checked) areas.push('osi');
  if (chkValDirector.checked) areas.push('director');
  
  if (areas.length === 0) {
    alert('Debes seleccionar al menos una área validadora.');
    return;
  }
  
  // Recolectar campos dinámicos construidos visualmente
  const camposObj = [];
  const filas = constructorCamposContainer.querySelectorAll('.campo-visual-row');
  filas.forEach(f => {
    const labelInput = f.querySelector('.campo-label');
    const typeSelect = f.querySelector('.campo-type');
    const requiredCheckbox = f.querySelector('.campo-required');
    
    const label = labelInput.value.trim();
    const type = typeSelect.value;
    const required = requiredCheckbox.checked;
    
    if (label !== '') {
      // Conservar el name original si existe en la base de datos para no romper solicitudes existentes
      const name = f.dataset.name || label
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remover tildes
        .replace(/[^a-z0-9_]+/g, '_') // caracteres especiales a guión bajo
        .replace(/^_+|_+$/g, ''); // quitar guiones bajos al inicio/fin
      
      const campoData = { name, label, type, required };

      if (type === 'firmante' || type === 'firmante_seccion' || type === 'firmante_list') {
        campoData.recoger_cedula = f.querySelector('.campo-recoger-cedula')?.checked || false;
        campoData.recoger_cargo = f.querySelector('.campo-recoger-cargo')?.checked || false;
      }

      if (type === 'select') {
        const optionsInput = f.querySelector('.campo-options');
        campoData.options = optionsInput ? optionsInput.value.split(',').map(o => o.trim()).filter(o => o !== '') : [];
      }

      if (type === 'grid' || type === 'fixed_grid' || type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
        const columns = [];
        const colRows = f.querySelectorAll('.columna-visual-row');
        colRows.forEach(colRow => {
          const colNameInput = colRow.querySelector('.col-name');
          const colTypeSelect = colRow.querySelector('.col-type');
          const colRequiredCheckbox = colRow.querySelector('.col-required');
          const colName = colNameInput.value.trim();
          const colType = colTypeSelect.value;
          if (colName !== '') {
            const colObj = { 
              name: colName, 
              type: colType, 
              required: colRequiredCheckbox ? colRequiredCheckbox.checked : false 
            };
            if (colType === 'firmante' || colType === 'firmante_seccion') {
              colObj.recoger_cedula = colRow.querySelector('.col-recoger-cedula')?.checked || false;
              colObj.recoger_cargo = colRow.querySelector('.col-recoger-cargo')?.checked || false;
            }
            if (colType === 'select') {
              const colOptionsInput = colRow.querySelector('.col-options');
              colObj.options = colOptionsInput ? colOptionsInput.value.split(',').map(o => o.trim()).filter(o => o !== '') : [];
            }
            columns.push(colObj);
          }
        });
        campoData.columns = columns;

        if (type === 'fixed_grid' || type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
          const rows = [];
          const rowRows = f.querySelectorAll('.fila-visual-row');
          rowRows.forEach(rowRow => {
            const rowNameInput = rowRow.querySelector('.row-name');
            const rowName = rowNameInput.value.trim();
            if (rowName !== '') {
              rows.push(rowName);
            }
          });
          campoData.rows = rows;

          const rowLabelInput = f.querySelector('.campo-row-label');
          if (rowLabelInput) {
            campoData.row_label = rowLabelInput.value.trim() || 'Descripción / Fila';
          }
        }
      }

      camposObj.push(campoData);
    }
  });

  if (camposObj.length === 0) {
    alert('Debes agregar al menos un campo con título al formulario.');
    return;
  }
  
  const mail_destinatario = pltMailDestinatario.value.trim();
  const mail_cc = pltMailCc.value.trim();
  const mail_asunto = pltMailAsunto.value.trim();
  const mail_cuerpo = pltMailCuerpo.value.trim();
  const mail_progreso = pltMailProgreso.checked;

  const payload = { 
    codigo, 
    nombre, 
    descripcion, 
    areas_validadoras: areas, 
    campos: camposObj,
    mail_destinatario: mail_destinatario || null,
    mail_cc: mail_cc || null,
    mail_asunto: mail_asunto || null,
    mail_cuerpo: mail_cuerpo || null,
    mail_progreso
  };
  
  try {
    let response;
    if (id) {
      response = await fetch(`/api/admin/tipos-solicitud/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/admin/tipos-solicitud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify(payload)
      });
    }
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar la plantilla.');
    
    cerrarModal('modal-plantilla');
    await cargarFormulariosAdmin();
    await cargarTiposSolicitud(); // Actualizar memoria
  } catch (error) {
    alert(error.message);
  }
});

// Previsualizar PDF del Formulario en el Constructor
if (btnPreviewPlantilla) {
  btnPreviewPlantilla.addEventListener('click', async (e) => {
    e.preventDefault();

    const codigo = pltCodigo.value.trim().toUpperCase() || 'PREVISUALIZACION';
    const nombre = pltNombre.value.trim() || 'Formulario de Previsualización';
    const descripcion = pltDescripcion.value.trim() || 'Descripción de previsualización';

    // Áreas validadoras
    const areas = [];
    if (chkValSeguridad.checked) areas.push('seguridad');
    if (chkValGibdd.checked) areas.push('gibdd');
    if (chkValGiitrc.checked) areas.push('giitrc');
    if (chkValOsi.checked) areas.push('osi');
    if (chkValDirector.checked) areas.push('director');

    // Recolectar campos dinámicos construidos visualmente
    const camposObj = [];
    const filas = constructorCamposContainer.querySelectorAll('.campo-visual-row');
    filas.forEach(f => {
      const labelInput = f.querySelector('.campo-label');
      const typeSelect = f.querySelector('.campo-type');
      const requiredCheckbox = f.querySelector('.campo-required');
      
      const label = labelInput.value.trim();
      const type = typeSelect.value;
      const required = requiredCheckbox.checked;
      
      if (label !== '') {
        const name = f.dataset.name || label
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remover tildes
          .replace(/[^a-z0-9_]+/g, '_') // caracteres especiales a guión bajo
          .replace(/^_+|_+$/g, ''); // quitar guiones bajos al inicio/fin
        
        const campoData = { name, label, type, required };

        if (type === 'firmante' || type === 'firmante_seccion' || type === 'firmante_list') {
          campoData.recoger_cedula = f.querySelector('.campo-recoger-cedula')?.checked || false;
          campoData.recoger_cargo = f.querySelector('.campo-recoger-cargo')?.checked || false;
        }

        if (type === 'select') {
          const optionsInput = f.querySelector('.campo-options');
          campoData.options = optionsInput ? optionsInput.value.split(',').map(o => o.trim()).filter(o => o !== '') : [];
        }

        if (type === 'grid' || type === 'fixed_grid' || type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
          const columns = [];
          const colRows = f.querySelectorAll('.columna-visual-row');
          colRows.forEach(colRow => {
            const colNameInput = colRow.querySelector('.col-name');
            const colTypeSelect = colRow.querySelector('.col-type');
            const colRequiredCheckbox = colRow.querySelector('.col-required');
            const colName = colNameInput.value.trim();
            const colType = colTypeSelect.value;
            if (colName !== '') {
              const colObj = { 
                name: colName, 
                type: colType, 
                required: colRequiredCheckbox ? colRequiredCheckbox.checked : false 
              };
              if (colType === 'firmante' || colType === 'firmante_seccion') {
                colObj.recoger_cedula = colRow.querySelector('.col-recoger-cedula')?.checked || false;
                colObj.recoger_cargo = colRow.querySelector('.col-recoger-cargo')?.checked || false;
              }
              if (colType === 'select') {
                const colOptionsInput = colRow.querySelector('.col-options');
                colObj.options = colOptionsInput ? colOptionsInput.value.split(',').map(o => o.trim()).filter(o => o !== '') : [];
              }
              columns.push(colObj);
            }
          });
          campoData.columns = columns;

          if (type === 'fixed_grid' || type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
            const rows = [];
            const rowRows = f.querySelectorAll('.fila-visual-row');
            rowRows.forEach(rowRow => {
              const rowNameInput = rowRow.querySelector('.row-name');
              const rowName = rowNameInput.value.trim();
              if (rowName !== '') {
                rows.push(rowName);
              }
            });
            campoData.rows = rows;

            const rowLabelInput = f.querySelector('.campo-row-label');
            if (rowLabelInput) {
              campoData.row_label = rowLabelInput.value.trim() || 'Descripción / Fila';
            }
          }
        }

        camposObj.push(campoData);
      }
    });

    if (camposObj.length === 0) {
      alert('Debes agregar al menos un campo al formulario antes de previsualizar.');
      return;
    }

    const originalText = btnPreviewPlantilla.innerHTML;
    try {
      btnPreviewPlantilla.disabled = true;
      btnPreviewPlantilla.innerHTML = '⏳ Generando...';

      const response = await fetch('/api/admin/tipos-solicitud/preview-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id
        },
        body: JSON.stringify({
          codigo,
          nombre,
          descripcion,
          areas_validadoras: areas,
          campos: camposObj
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al generar la previsualización del PDF.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `PREVIEW_${codigo.toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      btnPreviewPlantilla.disabled = false;
      btnPreviewPlantilla.innerHTML = originalText;
    }
  });
}

// Registrar funciones globales para interactuar con HTML (onclick)
window.cerrarModal = cerrarModal;
window.navegarAdmin = navegarAdmin;
window.abrirModalUsuario = abrirModalUsuario;
window.eliminarUsuario = eliminarUsuario;
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
window.realizarObservacionSimple = realizarObservacionSimple;
window.realizarReapertura = realizarReapertura;
window.abrirEdicion = abrirEdicion;
window.descargarPDF = descargarPDF;
window.cambiarPagina = cambiarPagina;
window.debouncedBuscar = debouncedBuscar;

// AUTO-ACTUALIZACIÓN PERIÓDICA (POLLING)
function iniciarAutoRefresh() {
  detenerAutoRefresh(); // Evitar duplicaciones
  autoRefreshInterval = setInterval(async () => {
    if (!currentUser) {
      detenerAutoRefresh();
      return;
    }
    // Refrescar bandeja si la vista de solicitudes está visible
    if (!solicitudesView.classList.contains('hidden')) {
      await cargarBandeja();
    }
    // Refrescar detalle si el modal está abierto y hay un ID activo
    if (!modalDetalle.classList.contains('hidden') && activeSolicitudId !== null) {
      await verDetalle(activeSolicitudId, true);
    }
  }, 10000); // Cada 10 segundos
}

function detenerAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ASIGNAR SOLICITUD A TÉCNICO ACTUAL
async function asignarSolicitud(solicitudId) {
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/asignar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al asignar la solicitud.');
    }
    
    // Refrescar los datos locales de la bandeja
    await cargarBandeja();
    // Refrescar el detalle
    await verDetalle(solicitudId, true);
  } catch (error) {
    alert(error.message);
  }
}

// DESASIGNAR / LIBERAR SOLICITUD
async function desasignarSolicitud(solicitudId) {
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/desasignar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id
      }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al liberar la solicitud.');
    }
    
    // Refrescar los datos locales de la bandeja
    await cargarBandeja();
    // Refrescar el detalle
    await verDetalle(solicitudId, true);
  } catch (error) {
    alert(error.message);
  }
}

// Exponer a global
window.asignarSolicitud = asignarSolicitud;
window.desasignarSolicitud = desasignarSolicitud;
