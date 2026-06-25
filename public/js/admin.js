import { state } from './state.js';
import { toast, escaparHTML, obtenerNombreArea, obtenerNombreAreaSinSiglas } from './utils.js';
import { getAuthHeaders } from './api.js';
import { cerrarModal } from './modals.js';

export function navegarAdmin(vista, elem) {
  const solicitudesView = document.getElementById('solicitudes-view');
  const adminUsuariosView = document.getElementById('admin-usuarios-view');
  const adminFormulariosView = document.getElementById('admin-formularios-view');
  const adminCorreosView = document.getElementById('admin-correos-view');

  if (solicitudesView) solicitudesView.classList.add('hidden');
  if (adminUsuariosView) adminUsuariosView.classList.add('hidden');
  if (adminFormulariosView) adminFormulariosView.classList.add('hidden');
  if (adminCorreosView) adminCorreosView.classList.add('hidden');

  const links = document.querySelectorAll('.sidebar-nav a');
  links.forEach(l => l.classList.remove('active'));

  if (elem) elem.classList.add('active');

  if (vista === 'usuarios') {
    if (adminUsuariosView) adminUsuariosView.classList.remove('hidden');
    cargarUsuariosAdmin();
  } else if (vista === 'formularios') {
    if (adminFormulariosView) adminFormulariosView.classList.remove('hidden');
    cargarFormulariosAdmin();
  } else if (vista === 'correos') {
    if (adminCorreosView) adminCorreosView.classList.remove('hidden');
    limpiarFormularioCorreoPrueba();
  }
}

export function limpiarFormularioCorreoPrueba() {
  const correoPruebaForm = document.getElementById('correo-prueba-form');
  const correoResultadoContainer = document.getElementById('correo-resultado-container');
  if (correoPruebaForm) correoPruebaForm.reset();
  if (correoResultadoContainer) {
    correoResultadoContainer.classList.add('hidden');
    correoResultadoContainer.className = 'hidden';
    correoResultadoContainer.innerHTML = '';
  }
}

export async function enviarCorreoPruebaHandler(e) {
  e.preventDefault();
  const correoResultadoContainer = document.getElementById('correo-resultado-container');
  if (!correoResultadoContainer) return;

  const destinatario = document.getElementById('mail-destinatario').value.trim();
  const cc = document.getElementById('mail-cc').value.trim();
  const asunto = document.getElementById('mail-asunto').value.trim();
  const cuerpo = document.getElementById('mail-cuerpo').value.trim();

  const btnEnviar = document.getElementById('btn-enviar-correo');
  const originalText = btnEnviar ? btnEnviar.textContent : '';
  if (btnEnviar) {
    btnEnviar.disabled = true;
    btnEnviar.textContent = '⏳ Enviando correo de prueba...';
  }

  correoResultadoContainer.classList.add('hidden');
  correoResultadoContainer.innerHTML = '';

  try {
    const response = await fetch('/api/admin/enviar-correo-prueba', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
    if (btnEnviar) {
      btnEnviar.disabled = false;
      btnEnviar.textContent = originalText;
    }
  }
}

export async function cargarUsuariosAdmin() {
  try {
    const response = await fetch('/api/admin/usuarios', {
      headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Error al cargar la lista de usuarios.');
    state.todosLosUsuariosAdmin = await response.json();
    filtrarUsuariosAdmin();
  } catch (error) {
    toast(error.message);
  }
}

export function filtrarUsuariosAdmin() {
  const searchInput = document.getElementById('buscador-usuarios');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  let usuariosFiltrados = state.todosLosUsuariosAdmin;

  if (query) {
    usuariosFiltrados = state.todosLosUsuariosAdmin.filter(usr => {
      const nombre = (usr.nombre || '').toLowerCase();
      const correo = (usr.correo || '').toLowerCase();
      const cedula = (usr.cedula || '').toLowerCase();
      const cargo = (usr.cargo || '').toLowerCase();
      return nombre.includes(query) || correo.includes(query) || cedula.includes(query) || cargo.includes(query);
    });
  }

  renderUsuariosAdmin(usuariosFiltrados);
}

export function renderUsuariosAdmin(usuarios) {
  const adminUsuariosSegmentedContainer = document.getElementById('admin-usuarios-segmented-container');
  if (!adminUsuariosSegmentedContainer) return;

  adminUsuariosSegmentedContainer.innerHTML = '';

  if (usuarios.length === 0) {
    adminUsuariosSegmentedContainer.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary); font-size: 0.95rem; font-weight: 500; background-color: var(--bg-input-secondary); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">No se encontraron usuarios que coincidan con la búsqueda.</div>';
    return;
  }

  const searchInput = document.getElementById('buscador-usuarios');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const segmentos = [
    { nombre: 'Administradores', filtro: usr => usr.rol === 'admin', icon: '⚙️' },
    { nombre: 'Director DTIC MSP', filtro: usr => usr.rol === 'tecnico' && usr.area === 'director', icon: '👔' },
    { nombre: 'Solicitantes (Usuarios del Sistema)', filtro: usr => usr.rol === 'solicitante', icon: '👤' },
    { nombre: 'Gestión Interna de Seguridad Informática y Calidad de Software - (GISICS)', filtro: usr => usr.rol === 'tecnico' && usr.area === 'seguridad', icon: '🔒' },
    { nombre: 'Gestión Interna de Base de Datos - (GIBD)', filtro: usr => usr.rol === 'tecnico' && usr.area === 'gibdd', icon: '💾' },
    { nombre: 'Gestión Interna de Infraestructura - (GIITRC)', filtro: usr => usr.rol === 'tecnico' && usr.area === 'giitrc', icon: '🌐' },
    { nombre: 'Oficial de Seguridad de la Información - (OSI)', filtro: usr => usr.rol === 'tecnico' && usr.area === 'osi', icon: '👁️' }
  ];

  segmentos.forEach(seg => {
    const filtered = usuarios.filter(seg.filtro);

    // Omitir segmentos vacíos si hay un criterio de búsqueda activo
    if (query && filtered.length === 0) return;

    const segmentDiv = document.createElement('div');
    segmentDiv.className = query ? 'admin-segment-card' : 'admin-segment-card collapsed';
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

        let nombreHtml = escaparHTML(usr.nombre);
        if (usr.activo === false) {
          nombreHtml += ` <span class="badge badge-danger" style="margin-left: 5px; font-size: 0.65rem;">INACTIVO</span>`;
        }

        const actionButton = usr.activo !== false
          ? `<button class="btn btn-danger btn-sm" onclick="desactivarUsuario(${usr.id})">🚫 Desactivar</button>`
          : `<button class="btn btn-success btn-sm" onclick="activarUsuario(${usr.id})">✅ Activar</button>`;

        // Stringify user securely
        const userStr = JSON.stringify(usr).replace(/"/g, '&quot;');

        tr.innerHTML = `
          <td class="font-bold">${nombreHtml}</td>
          <td>${detailsHtml}</td>
          <td><code>${escaparHTML(usr.username)}</code></td>
          <td><span class="badge badge-${usr.rol}">${usr.rol}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="abrirModalUsuario(${userStr})">✏️ Editar</button>
            ${actionButton}
          </td>
        `;
        tbody.appendChild(tr);
      });
      tableContainer.appendChild(table);
    }

    segmentDiv.appendChild(tableContainer);
    adminUsuariosSegmentedContainer.appendChild(segmentDiv);
  });
}

export function abrirModalUsuario(user = null) {
  formUsuarioReset();
  const title = document.getElementById('modal-usuario-titulo');
  const usuarioIdInput = document.getElementById('usuario-id');
  const usrNombre = document.getElementById('usr-nombre');
  const usrCedula = document.getElementById('usr-cedula');
  const usrCargo = document.getElementById('usr-cargo');
  const usrUsername = document.getElementById('usr-username');
  const usrRol = document.getElementById('usr-rol');
  const usrPassword = document.getElementById('usr-password');
  const usrPasswordHelp = document.getElementById('usr-password-help');
  const usrDireccionProyecto = document.getElementById('usr-direccion-proyecto');
  const checkboxActivo = document.getElementById('usr-activo');
  const usrArea = document.getElementById('usr-area');
  const usrFirmaDocumentos = document.getElementById('usr-firma-documentos');
  const modalUsuario = document.getElementById('modal-usuario');

  if (user) {
    if (title) title.textContent = 'Editar Usuario';
    if (usuarioIdInput) usuarioIdInput.value = user.id;
    if (usrNombre) usrNombre.value = user.nombre;
    if (usrCedula) usrCedula.value = user.cedula || '';
    if (usrCargo) usrCargo.value = user.cargo || '';
    if (usrUsername) usrUsername.value = user.username;
    if (usrRol) usrRol.value = user.rol;
    if (usrPassword) {
      usrPassword.required = false;
      usrPassword.value = '';
    }
    if (usrPasswordHelp) usrPasswordHelp.textContent = 'Deja en blanco para no modificar la contraseña.';
    if (usrDireccionProyecto) usrDireccionProyecto.value = user.direccion_proyecto || '';

    if (checkboxActivo) {
      checkboxActivo.checked = user.activo !== false;
    }

    if (user.rol === 'tecnico' && usrArea) {
      usrArea.value = user.area || '';
    }
    cambiarSelectorRol();
    if (user.rol === 'tecnico' && user.area === 'osi' && usrFirmaDocumentos) {
      usrFirmaDocumentos.checked = !!user.firma_documentos;
    }
  } else {
    if (title) title.textContent = 'Registrar Usuario';
    if (usuarioIdInput) usuarioIdInput.value = '';
    if (usrPassword) {
      usrPassword.required = true;
      usrPassword.value = '';
    }
    if (usrPasswordHelp) usrPasswordHelp.textContent = 'Contraseña requerida para nuevos usuarios.';
    
    if (checkboxActivo) {
      checkboxActivo.checked = true;
    }
    
    cambiarSelectorRol();
  }

  if (modalUsuario) modalUsuario.classList.remove('hidden');
}

export function formUsuarioReset() {
  const usuarioForm = document.getElementById('usuario-form');
  const usuarioIdInput = document.getElementById('usuario-id');
  const usrArea = document.getElementById('usr-area');
  const usrCedula = document.getElementById('usr-cedula');
  const usrCargo = document.getElementById('usr-cargo');
  const usrDireccionProyecto = document.getElementById('usr-direccion-proyecto');
  const usrFirmaDocumentos = document.getElementById('usr-firma-documentos');
  const usrFirmaGroup = document.getElementById('usr-firma-group');
  const checkboxActivo = document.getElementById('usr-activo');

  if (usuarioForm) usuarioForm.reset();
  if (usuarioIdInput) usuarioIdInput.value = '';
  if (usrArea) usrArea.value = '';
  if (usrCedula) usrCedula.value = '';
  if (usrCargo) usrCargo.value = '';
  if (usrDireccionProyecto) usrDireccionProyecto.value = '';
  if (usrFirmaDocumentos) usrFirmaDocumentos.checked = false;
  if (usrFirmaGroup) usrFirmaGroup.classList.add('hidden');

  if (checkboxActivo) {
    checkboxActivo.checked = true;
  }
}

export function cambiarSelectorRol() {
  const usrRol = document.getElementById('usr-rol');
  const usrArea = document.getElementById('usr-area');
  const usrAreaGroup = document.getElementById('usr-area-group');
  const usrDireccionProyecto = document.getElementById('usr-direccion-proyecto');
  const usrDireccionProyectoGroup = document.getElementById('usr-direccion-proyecto-group');
  const usrFirmaGroup = document.getElementById('usr-firma-group');
  const usrFirmaDocumentos = document.getElementById('usr-firma-documentos');

  if (!usrRol) return;
  const rol = usrRol.value;
  const area = usrArea ? usrArea.value : '';

  if (rol === 'tecnico') {
    if (usrAreaGroup) usrAreaGroup.classList.remove('hidden');
    if (usrArea) usrArea.required = true;
  } else {
    if (usrAreaGroup) usrAreaGroup.classList.add('hidden');
    if (usrArea) {
      usrArea.required = false;
      usrArea.value = '';
    }
  }

  if (rol === 'solicitante') {
    if (usrDireccionProyectoGroup) usrDireccionProyectoGroup.classList.remove('hidden');
    if (usrDireccionProyecto) usrDireccionProyecto.required = true;
  } else {
    if (usrDireccionProyectoGroup) usrDireccionProyectoGroup.classList.add('hidden');
    if (usrDireccionProyecto) {
      usrDireccionProyecto.required = false;
      usrDireccionProyecto.value = '';
    }
  }

  // Firmas sólo para OSI
  if (rol === 'tecnico' && area === 'osi') {
    if (usrFirmaGroup) usrFirmaGroup.classList.remove('hidden');
  } else {
    if (usrFirmaGroup) usrFirmaGroup.classList.add('hidden');
    if (usrFirmaDocumentos) usrFirmaDocumentos.checked = false;
  }
}

export async function usuarioFormSubmitHandler(e) {
  e.preventDefault();

  const usuarioIdInput = document.getElementById('usuario-id');
  const usrNombre = document.getElementById('usr-nombre');
  const usrCedula = document.getElementById('usr-cedula');
  const usrCargo = document.getElementById('usr-cargo');
  const usrUsername = document.getElementById('usr-username');
  const usrPassword = document.getElementById('usr-password');
  const usrRol = document.getElementById('usr-rol');
  const usrArea = document.getElementById('usr-area');
  const usrDireccionProyecto = document.getElementById('usr-direccion-proyecto');
  const usrFirmaDocumentos = document.getElementById('usr-firma-documentos');
  const checkboxActivo = document.getElementById('usr-activo');

  const id = usuarioIdInput ? usuarioIdInput.value : '';
  const nombre = usrNombre ? usrNombre.value : '';
  const cedula = usrCedula ? usrCedula.value : '';
  const cargo = usrCargo ? usrCargo.value : '';
  const username = usrUsername ? usrUsername.value.trim() : '';
  const password = usrPassword ? usrPassword.value : '';
  const rol = usrRol ? usrRol.value : '';
  const area = usrArea ? usrArea.value : '';
  const direccion_proyecto = usrDireccionProyecto ? usrDireccionProyecto.value : '';
  const activo = checkboxActivo ? checkboxActivo.checked : true;

  const payload = {
    nombre,
    cedula,
    cargo,
    username,
    rol,
    area: rol === 'tecnico' ? area : null,
    direccion_proyecto: rol === 'solicitante' ? direccion_proyecto : null,
    firma_documentos: (rol === 'tecnico' && area === 'osi') ? (usrFirmaDocumentos ? usrFirmaDocumentos.checked : false) : false,
    activo
  };
  if (password && password.trim() !== '') {
    payload.password = password;
  }

  try {
    let response;
    if (id) {
      response = await fetch(`/api/admin/usuarios/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar usuario.');

    cerrarModal('modal-usuario');
    await cargarUsuariosAdmin();
  } catch (error) {
    toast(error.message);
  }
}

export async function desactivarUsuario(id) {
  if (id === state.currentUser.id) {
    toast('No puedes desactivar tu propio usuario activo.');
    return;
  }
  if (!confirm('¿Estás seguro de que deseas desactivar este usuario? Ya no podrá ingresar al sistema, sus borradores y solicitudes pendientes serán eliminadas, pero se conservarán sus solicitudes aprobadas.')) return;

  try {
    const response = await fetch(`/api/admin/usuarios/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al desactivar usuario.');

    await cargarUsuariosAdmin();
  } catch (error) {
    toast(error.message);
  }
}

export async function activarUsuario(id) {
  try {
    const response = await fetch(`/api/admin/usuarios/${id}/activar`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al activar usuario.');

    await cargarUsuariosAdmin();
  } catch (error) {
    toast(error.message);
  }
}

export async function cargarFormulariosAdmin() {
  const adminFormulariosList = document.getElementById('admin-formularios-list');
  if (!adminFormulariosList) return;

  try {
    const response = await fetch('/api/tipos-solicitud', {
      headers: getAuthHeaders()
    });
    const formularios = await response.json();

    adminFormulariosList.innerHTML = '';
    formularios.forEach(form => {
      const areasStr = form.areas_validadoras.map(a => `<span class="badge badge-area-${a}" style="margin-right:5px; margin-bottom:5px; display:inline-block; padding:0.3rem 0.6rem; text-transform:none;">${obtenerNombreAreaSinSiglas(a)}</span>`).join('');
      
      const formStr = JSON.stringify(form).replace(/"/g, '&quot;');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="font-bold"><span style="color:var(--accent-color);">[${escaparHTML(form.codigo)}]</span> ${escaparHTML(form.nombre)}</td>
        <td style="max-width:300px; font-size:0.8rem; color:var(--text-secondary);">${escaparHTML(form.descripcion)}</td>
        <td>${areasStr}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="abrirModalPlantilla(${formStr})">✏️ Editar Plantilla</button>
          <button class="btn btn-outline btn-sm" onclick="copiarPlantilla(${formStr})">📋 Copiar</button>
          <button class="btn btn-danger btn-sm" onclick="eliminarPlantilla(${form.id})">🗑️ Borrar</button>
        </td>
      `;
      adminFormulariosList.appendChild(tr);
    });
  } catch (error) {
    toast('Error al cargar formularios: ' + error.message);
  }
}

export async function eliminarPlantilla(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta plantilla de formulario de forma permanente? Se eliminarán también todas las solicitudes asociadas a ella.')) return;

  try {
    const response = await fetch(`/api/admin/tipos-solicitud/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al eliminar la plantilla de formulario.');

    await cargarFormulariosAdmin();
    const { cargarTiposSolicitud } = await import('./app.js');
    await cargarTiposSolicitud();
  } catch (error) {
    toast(error.message);
  }
}

export function agregarFilaColumnaVisual(target, colObj = null) {
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
    <input type="text" class="col-name" placeholder="Nombre Columna" value="${colName.replace(/"/g, '&quot;')}">
    <select class="col-type" onchange="actualizarFilaColumnaFirmante(this)">
      <optgroup label="Datos Básicos">
        <option value="text" ${colType === 'text' ? 'selected' : ''}>Texto</option>
        <option value="number" ${colType === 'number' ? 'selected' : ''}>Número</option>
        <option value="checkbox" ${colType === 'checkbox' ? 'selected' : ''}>Checkbox / Casilla (X)</option>
        <option value="select" ${colType === 'select' ? 'selected' : ''}>Selector</option>
      </optgroup>
      <optgroup label="Formatos Específicos">
        <option value="date" ${colType === 'date' ? 'selected' : ''}>Fecha</option>
        <option value="date_range" ${colType === 'date_range' ? 'selected' : ''}>Rango de Fechas (Desde - Hasta)</option>
        <option value="email" ${colType === 'email' ? 'selected' : ''}>Correo Electrónico</option>
        <option value="identificacion" ${colType === 'identificacion' ? 'selected' : ''}>Número Identificación (10 dígitos)</option>
        <option value="ip" ${colType === 'ip' ? 'selected' : ''}>Dirección IP (IPv4)</option>
        <option value="mac" ${colType === 'mac' ? 'selected' : ''}>Dirección MAC</option>
        <option value="time" ${colType === 'time' ? 'selected' : ''}>Hora (HH:MM)</option>
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

export function agregarFilaVisual(target, rowVal = '') {
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
    <input type="text" class="row-name" placeholder="Nombre / Etiqueta de la Fila" value="${rowVal.replace(/"/g, '&quot;')}">
    <button type="button" class="btn btn-outline btn-sm btn-trash-sm" onclick="this.parentElement.remove()">
      🗑️
    </button>
  `;
  list.appendChild(rRow);
}

export function actualizarFilaColumnaFirmante(select) {
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
export function actualizarFilaCampoRequerido(select) {
  const row = select.closest('.campo-visual-row');
  if (!row) return;

  // Actualizar clase del borde de acento según la categoría del campo
  const categories = [
    'text', 'textarea', 'number', 'checkbox', 'select', 'text_list', 'ip', 'mac', 'time', 'date_range',
    'grid', 'fixed_grid', 'fixed_grid_dynamic_cols', 'fixed_grid_fixed_cols',
    'firmante', 'firmante_seccion', 'firmante_list',
    'title', 'subtitle', 'paragraph', 'info_no_pdf'
  ];
  categories.forEach(cat => row.classList.remove(`type-${cat}`));
  row.classList.add(`type-${select.value}`);

  const reqLabel = row.querySelector('.campo-required-label');
  const reqCheckbox = row.querySelector('.campo-required');
  const colsBuilder = row.querySelector('.grid-columns-builder');
  const rowsBuilder = row.querySelector('.grid-rows-builder');
  const firmanteBuilder = row.querySelector('.firmante-options-builder');
  const selectOptsBuilder = row.querySelector('.select-options-builder');
  const fixedGridRowLabelBuilder = row.querySelector('.fixed-grid-row-label-builder');
  const conditionContainer = row.querySelector('.campo-condition-container');
  const conditionAreaSelect = row.querySelector('.campo-condicion-area');

  const limpiarCols = () => { if (colsBuilder) colsBuilder.querySelector('.grid-columns-list').innerHTML = ''; };
  const limpiarRows = () => { if (rowsBuilder) rowsBuilder.querySelector('.grid-rows-list').innerHTML = ''; };
  const limpiarRowLabel = () => { if (fixedGridRowLabelBuilder) { const inp = fixedGridRowLabelBuilder.querySelector('.campo-row-label'); if (inp) inp.value = ''; } };
  const limpiarFirmante = () => { if (firmanteBuilder) { firmanteBuilder.querySelectorAll('input[type="checkbox"]').forEach(chk => chk.checked = false); } };
  const limpiarSelectOpts = () => { if (selectOptsBuilder) { const inp = selectOptsBuilder.querySelector('.campo-options'); if (inp) inp.value = ''; } };

  if (['title', 'subtitle', 'paragraph', 'info_no_pdf'].includes(select.value)) {
    if (conditionContainer) conditionContainer.style.display = 'none';
    if (conditionAreaSelect) conditionAreaSelect.value = '';
  } else {
    if (conditionContainer) conditionContainer.style.display = 'inline-flex';
  }

  if (['title', 'subtitle', 'paragraph', 'info_no_pdf'].includes(select.value)) {
    if (reqLabel) reqLabel.style.display = 'none';
    if (reqCheckbox) reqCheckbox.checked = false;

    if (colsBuilder) colsBuilder.style.display = 'none';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarCols();
    limpiarRows();
    limpiarRowLabel();
    limpiarFirmante();
    limpiarSelectOpts();
  } else if (select.value === 'grid' || select.value === 'fixed_grid') {
    if (reqLabel) reqLabel.style.display = 'none';
    if (reqCheckbox) reqCheckbox.checked = false;

    if (colsBuilder) colsBuilder.style.display = 'flex';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarRows();
    limpiarRowLabel();
    limpiarFirmante();
    limpiarSelectOpts();

    if (colsBuilder) {
      const list = colsBuilder.querySelector('.grid-columns-list');
      if (list && list.children.length === 0) {
        agregarFilaColumnaVisual(list);
      }
    }
  } else if (select.value === 'fixed_grid_dynamic_cols' || select.value === 'fixed_grid_fixed_cols') {
    if (reqLabel) reqLabel.style.display = 'none';
    if (reqCheckbox) reqCheckbox.checked = false;

    if (colsBuilder) colsBuilder.style.display = 'flex';
    if (rowsBuilder) rowsBuilder.style.display = 'flex';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'flex';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';

    limpiarFirmante();
    limpiarSelectOpts();

    if (colsBuilder) {
      const colList = colsBuilder.querySelector('.grid-columns-list');
      if (colList && colList.children.length === 0) {
        agregarFilaColumnaVisual(colList);
      }
    }
    if (rowsBuilder) {
      const rowList = rowsBuilder.querySelector('.grid-rows-list');
      if (rowList && rowList.children.length === 0) {
        agregarFilaVisual(rowList);
      }
    }
  } else if (select.value === 'firmante' || select.value === 'firmante_seccion' || select.value === 'firmante_list') {
    if (reqLabel) reqLabel.style.display = 'flex';

    if (colsBuilder) colsBuilder.style.display = 'none';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'flex';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'none';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarCols();
    limpiarRows();
    limpiarRowLabel();
    limpiarSelectOpts();
  } else if (select.value === 'select') {
    if (reqLabel) reqLabel.style.display = 'flex';

    if (colsBuilder) colsBuilder.style.display = 'none';
    if (rowsBuilder) rowsBuilder.style.display = 'none';
    if (firmanteBuilder) firmanteBuilder.style.display = 'none';
    if (selectOptsBuilder) selectOptsBuilder.style.display = 'flex';
    if (fixedGridRowLabelBuilder) fixedGridRowLabelBuilder.style.display = 'none';

    limpiarCols();
    limpiarRows();
    limpiarRowLabel();
    limpiarFirmante();
  } else {
    if (reqLabel) reqLabel.style.display = 'flex';

    if (colsBuilder) colsBuilder.style.display = 'none';
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

export function agregarFilaCampoVisual(campoObj = null, referenceRow = null) {
  const constructorCamposContainer = document.getElementById('constructor-campos-container');
  if (!constructorCamposContainer) return;

  const row = document.createElement('div');
  const typeVal = campoObj ? campoObj.type : 'text';
  row.className = `campo-visual-row type-${typeVal}`;
  row.setAttribute('draggable', 'true');
  if (campoObj && campoObj.name) {
    row.dataset.name = campoObj.name;
  }

  const labelVal = campoObj ? campoObj.label : '';
  const reqChecked = campoObj ? campoObj.required : true;
  const recogerCedulaChecked = campoObj ? (campoObj.recoger_cedula || false) : false;
  const recogerCargoChecked = campoObj ? (campoObj.recoger_cargo || false) : false;

  row.innerHTML = `
    <!-- Control de Arrastre (Drag Handle) -->
    <div class="drag-handle" title="Arrastrar para reordenar">⋮⋮</div>

    <div class="campo-visual-content">
      <div class="campo-visual-label-row">
        <span>Etiqueta:</span>
        <input type="text" class="campo-label" placeholder="Ej: Nombre Servidor, Justificación, etc." value="${labelVal.replace(/"/g, '&quot;')}">
      </div>
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
          <optgroup label="Formatos Específicos">
            <option value="ip" ${typeVal === 'ip' ? 'selected' : ''}>Dirección IP (IPv4)</option>
            <option value="mac" ${typeVal === 'mac' ? 'selected' : ''}>Dirección MAC</option>
            <option value="time" ${typeVal === 'time' ? 'selected' : ''}>Hora (HH:MM)</option>
            <option value="date_range" ${typeVal === 'date_range' ? 'selected' : ''}>Rango de Fechas (Desde - Hasta)</option>
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
        <div class="campo-condition-container" style="display: inline-flex; align-items: center; gap: 5px;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Activar área si se llena:</span>
          <select class="campo-condicion-area" style="font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color); background-color: var(--bg-input-secondary); color: var(--text-main);">
            <option value="">Ninguna</option>
            <option value="gibdd" ${campoObj && campoObj.condicion_area === 'gibdd' ? 'selected' : ''}>GIBDD (Base de Datos)</option>
            <option value="giitrc" ${campoObj && campoObj.condicion_area === 'giitrc' ? 'selected' : ''}>GIITRC (Infraestructura)</option>
            <option value="osi" ${campoObj && campoObj.condicion_area === 'osi' ? 'selected' : ''}>OSI (Seguridad de la Información)</option>
            <option value="director" ${campoObj && campoObj.condicion_area === 'director' ? 'selected' : ''}>Director DTIC</option>
          </select>
        </div>
      </div>
      <div class="firmante-options-builder" style="display:none;">
        <label class="firmante-option-label">
          <input type="checkbox" class="campo-recoger-cedula" ${recogerCedulaChecked ? 'checked' : ''}> Recoger Cédula
        </label>
        <label class="firmante-option-label">
          <input type="checkbox" class="campo-recoger-cargo" ${recogerCargoChecked ? 'checked' : ''}> Recoger Cargo
        </label>
      </div>
      <div class="select-options-builder" style="display:none;">
        <span>Opciones:</span>
        <input type="text" class="campo-options" placeholder="Ej: Sí, No, Tal vez" value="${campoObj && Array.isArray(campoObj.options) ? campoObj.options.join(', ') : (campoObj && campoObj.options ? campoObj.options : '')}">
      </div>
      <div class="fixed-grid-row-label-builder" style="display:none;">
        <span>Etiqueta Fila:</span>
        <input type="text" class="campo-row-label" placeholder="Ej: Descripción / Fila" value="${campoObj && campoObj.row_label ? campoObj.row_label.replace(/"/g, '&quot;') : ''}">
      </div>
      <div class="grid-columns-builder" style="display:none;">
        <label class="builder-section-label">Columnas de la Tabla:</label>
        <div class="grid-columns-list builder-list-container"></div>
        <button type="button" class="btn btn-outline btn-sm btn-agregar-columna btn-builder-add">
          ➕ Agregar Columna
        </button>
      </div>
      <div class="grid-rows-builder" style="display:none;">
        <label class="builder-section-label">Filas de la Tabla:</label>
        <div class="grid-rows-list builder-list-container"></div>
        <button type="button" class="btn btn-outline btn-sm btn-agregar-fila btn-builder-add">
          ➕ Agregar Fila Predefinida
        </button>
      </div>
    </div>
    <div class="campo-visual-actions">
      <button type="button" class="btn btn-outline btn-sm btn-copy-field" title="Copiar Campo">📋</button>
      <button type="button" class="btn btn-outline btn-sm btn-add-below-field" title="Insertar Campo Abajo">➕</button>
      <button type="button" class="btn btn-outline btn-sm btn-trash-field" title="Eliminar Campo">🗑️</button>
    </div>
  `;

  // Bind dynamic adders
  row.querySelector('.btn-agregar-columna').onclick = (e) => agregarFilaColumnaVisual(e.target);
  row.querySelector('.btn-agregar-fila').onclick = (e) => agregarFilaVisual(e.target);
  row.querySelector('.btn-copy-field').onclick = (e) => copiarFilaCampoVisual(e.target);
  row.querySelector('.btn-add-below-field').onclick = (e) => insertarFilaCampoVisualAbajo(e.target);
  row.querySelector('.btn-trash-field').onclick = (e) => eliminarFilaCampoVisual(e.target);

  // Native HTML5 Drag and Drop event listeners for card reordering
  row.addEventListener('dragstart', (e) => {
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox support
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    const allRows = constructorCamposContainer.querySelectorAll('.campo-visual-row');
    allRows.forEach(r => r.classList.remove('drag-over'));
  });

  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingRow = constructorCamposContainer.querySelector('.campo-visual-row.dragging');
    if (!draggingRow || draggingRow === row) return;
    row.classList.add('drag-over');
  });

  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over');
  });

  row.addEventListener('drop', (e) => {
    e.preventDefault();
    row.classList.remove('drag-over');
    const draggingRow = constructorCamposContainer.querySelector('.campo-visual-row.dragging');
    if (!draggingRow || draggingRow === row) return;

    const allRows = Array.from(constructorCamposContainer.querySelectorAll('.campo-visual-row'));
    const draggingIndex = allRows.indexOf(draggingRow);
    const dropIndex = allRows.indexOf(row);

    if (draggingIndex < dropIndex) {
      constructorCamposContainer.insertBefore(draggingRow, row.nextElementSibling);
    } else {
      constructorCamposContainer.insertBefore(draggingRow, row);
    }
  });

  if (referenceRow) {
    referenceRow.parentNode.insertBefore(row, referenceRow.nextSibling);
  } else {
    constructorCamposContainer.appendChild(row);
  }

  if (campoObj && (campoObj.type === 'grid' || campoObj.type === 'fixed_grid' || campoObj.type === 'fixed_grid_dynamic_cols' || campoObj.type === 'fixed_grid_fixed_cols') && Array.isArray(campoObj.columns)) {
    const list = row.querySelector('.grid-columns-list');
    campoObj.columns.forEach(col => {
      const colObj = typeof col === 'object' ? col : { name: col, type: 'text' };
      agregarFilaColumnaVisual(list, colObj);
    });
  }

  if (campoObj && (campoObj.type === 'fixed_grid_dynamic_cols' || campoObj.type === 'fixed_grid_fixed_cols') && Array.isArray(campoObj.rows)) {
    const list = row.querySelector('.grid-rows-list');
    campoObj.rows.forEach(r => {
      agregarFilaVisual(list, r);
    });
  }

  const selectEl = row.querySelector('.campo-type');
  actualizarFilaCampoRequerido(selectEl);
  actualizarContadorCampos();
}

export function eliminarFilaCampoVisual(button) {
  const row = button.closest('.campo-visual-row');
  if (row) {
    row.remove();
    actualizarContadorCampos();
  }
}

export function moverCampoVisualArriba(button) {
  const row = button.closest('.campo-visual-row');
  if (!row) return;
  const prev = row.previousElementSibling;
  if (prev && prev.classList.contains('campo-visual-row')) {
    row.parentNode.insertBefore(row, prev);
  }
}

export function moverCampoVisualAbajo(button) {
  const row = button.closest('.campo-visual-row');
  if (!row) return;
  const next = row.nextElementSibling;
  if (next && next.classList.contains('campo-visual-row')) {
    row.parentNode.insertBefore(next, row);
  }
}

export function abrirModalPlantilla(formObj = null) {
  const constructorCamposContainer = document.getElementById('constructor-campos-container');
  const plantillaIdInput = document.getElementById('plantilla-id');
  const pltCodigo = document.getElementById('plt-codigo');
  const pltNombre = document.getElementById('plt-nombre');
  const pltDescripcion = document.getElementById('plt-descripcion');
  const chkValSeguridad = document.getElementById('chk-val-seguridad');
  const chkValGibdd = document.getElementById('chk-val-gibdd');
  const chkValGiitrc = document.getElementById('chk-val-giitrc');
  const chkValOsi = document.getElementById('chk-val-osi');
  const chkValDirector = document.getElementById('chk-val-director');
  const pltMailDestinatario = document.getElementById('plt-mail-destinatario');
  const pltMailCc = document.getElementById('plt-mail-cc');
  const pltMailAsunto = document.getElementById('plt-mail-asunto');
  const pltMailCuerpo = document.getElementById('plt-mail-cuerpo');
  const pltMailProgreso = document.getElementById('plt-mail-progreso');
  const modalPlantilla = document.getElementById('modal-plantilla');

  if (constructorCamposContainer) constructorCamposContainer.innerHTML = '';

  if (formObj) {
    const title = document.getElementById('modal-plantilla-titulo');
    if (title) title.textContent = 'Editar Plantilla de Formulario';
    if (plantillaIdInput) plantillaIdInput.value = formObj.id;
    if (pltCodigo) pltCodigo.value = formObj.codigo || '';
    if (pltNombre) pltNombre.value = formObj.nombre;
    if (pltDescripcion) pltDescripcion.value = formObj.descripcion;

    if (chkValSeguridad) chkValSeguridad.checked = formObj.areas_validadoras.includes('seguridad');
    if (chkValGibdd) chkValGibdd.checked = formObj.areas_validadoras.includes('gibdd');
    if (chkValGiitrc) chkValGiitrc.checked = formObj.areas_validadoras.includes('giitrc');
    if (chkValOsi) chkValOsi.checked = formObj.areas_validadoras.includes('osi');
    if (chkValDirector) chkValDirector.checked = formObj.areas_validadoras.includes('director');

    if (pltMailDestinatario) pltMailDestinatario.value = formObj.mail_destinatario || '';
    if (pltMailCc) pltMailCc.value = formObj.mail_cc || '';
    if (pltMailAsunto) pltMailAsunto.value = formObj.mail_asunto || '';
    if (pltMailCuerpo) pltMailCuerpo.value = formObj.mail_cuerpo || '';
    if (pltMailProgreso) pltMailProgreso.checked = formObj.mail_progreso !== false;

    formObj.campos.forEach(c => agregarFilaCampoVisual(c));
  } else {
    const title = document.getElementById('modal-plantilla-titulo');
    if (title) title.textContent = 'Registrar Plantilla de Formulario';
    if (plantillaIdInput) plantillaIdInput.value = '';
    if (pltCodigo) pltCodigo.value = '';
    if (pltNombre) pltNombre.value = '';
    if (pltDescripcion) pltDescripcion.value = '';

    if (chkValSeguridad) chkValSeguridad.checked = false;
    if (chkValGibdd) chkValGibdd.checked = false;
    if (chkValGiitrc) chkValGiitrc.checked = false;
    if (chkValOsi) chkValOsi.checked = false;
    if (chkValDirector) chkValDirector.checked = false;

    if (pltMailDestinatario) pltMailDestinatario.value = '';
    if (pltMailCc) pltMailCc.value = '';
    if (pltMailAsunto) pltMailAsunto.value = '';
    if (pltMailCuerpo) pltMailCuerpo.value = '';
    if (pltMailProgreso) pltMailProgreso.checked = true;

    agregarFilaCampoVisual();
  }

  actualizarContadorCampos();

  if (modalPlantilla) modalPlantilla.classList.remove('hidden');
}

export function copiarPlantilla(formObj) {
  const constructorCamposContainer = document.getElementById('constructor-campos-container');
  const plantillaIdInput = document.getElementById('plantilla-id');
  const pltCodigo = document.getElementById('plt-codigo');
  const pltNombre = document.getElementById('plt-nombre');
  const pltDescripcion = document.getElementById('plt-descripcion');
  const chkValSeguridad = document.getElementById('chk-val-seguridad');
  const chkValGibdd = document.getElementById('chk-val-gibdd');
  const chkValGiitrc = document.getElementById('chk-val-giitrc');
  const chkValOsi = document.getElementById('chk-val-osi');
  const chkValDirector = document.getElementById('chk-val-director');
  const pltMailDestinatario = document.getElementById('plt-mail-destinatario');
  const pltMailCc = document.getElementById('plt-mail-cc');
  const pltMailAsunto = document.getElementById('plt-mail-asunto');
  const pltMailCuerpo = document.getElementById('plt-mail-cuerpo');
  const pltMailProgreso = document.getElementById('plt-mail-progreso');
  const modalPlantilla = document.getElementById('modal-plantilla');

  if (constructorCamposContainer) constructorCamposContainer.innerHTML = '';

  const title = document.getElementById('modal-plantilla-titulo');
  if (title) title.textContent = 'Copiar Plantilla de Formulario';
  if (plantillaIdInput) plantillaIdInput.value = '';
  if (pltCodigo) pltCodigo.value = formObj.codigo ? `${formObj.codigo}_COPIA` : '';
  if (pltNombre) pltNombre.value = `${formObj.nombre} (Copia)`;
  if (pltDescripcion) pltDescripcion.value = formObj.descripcion || '';

  if (chkValSeguridad) chkValSeguridad.checked = formObj.areas_validadoras.includes('seguridad');
  if (chkValGibdd) chkValGibdd.checked = formObj.areas_validadoras.includes('gibdd');
  if (chkValGiitrc) chkValGiitrc.checked = formObj.areas_validadoras.includes('giitrc');
  if (chkValOsi) chkValOsi.checked = formObj.areas_validadoras.includes('osi');
  if (chkValDirector) chkValDirector.checked = formObj.areas_validadoras.includes('director');

  if (pltMailDestinatario) pltMailDestinatario.value = formObj.mail_destinatario || '';
  if (pltMailCc) pltMailCc.value = formObj.mail_cc || '';
  if (pltMailAsunto) pltMailAsunto.value = formObj.mail_asunto || '';
  if (pltMailCuerpo) pltMailCuerpo.value = formObj.mail_cuerpo || '';
  if (pltMailProgreso) pltMailProgreso.checked = formObj.mail_progreso !== false;

  formObj.campos.forEach(c => agregarFilaCampoVisual(c));

  actualizarContadorCampos();

  if (modalPlantilla) modalPlantilla.classList.remove('hidden');
}

export async function plantillaFormSubmitHandler(e) {
  e.preventDefault();

  const plantillaIdInput = document.getElementById('plantilla-id');
  const pltCodigo = document.getElementById('plt-codigo');
  const pltNombre = document.getElementById('plt-nombre');
  const pltDescripcion = document.getElementById('plt-descripcion');
  const chkValSeguridad = document.getElementById('chk-val-seguridad');
  const chkValGibdd = document.getElementById('chk-val-gibdd');
  const chkValGiitrc = document.getElementById('chk-val-giitrc');
  const chkValOsi = document.getElementById('chk-val-osi');
  const chkValDirector = document.getElementById('chk-val-director');
  const pltMailDestinatario = document.getElementById('plt-mail-destinatario');
  const pltMailCc = document.getElementById('plt-mail-cc');
  const pltMailAsunto = document.getElementById('plt-mail-asunto');
  const pltMailCuerpo = document.getElementById('plt-mail-cuerpo');
  const pltMailProgreso = document.getElementById('plt-mail-progreso');
  const constructorCamposContainer = document.getElementById('constructor-campos-container');

  const id = plantillaIdInput ? plantillaIdInput.value : '';
  const codigo = pltCodigo ? pltCodigo.value.trim().toUpperCase() : '';
  const nombre = pltNombre ? pltNombre.value : '';
  const description = pltDescripcion ? pltDescripcion.value : '';

  const areas = [];
  if (chkValSeguridad && chkValSeguridad.checked) areas.push('seguridad');
  if (chkValGibdd && chkValGibdd.checked) areas.push('gibdd');
  if (chkValGiitrc && chkValGiitrc.checked) areas.push('giitrc');
  if (chkValOsi && chkValOsi.checked) areas.push('osi');
  if (chkValDirector && chkValDirector.checked) areas.push('director');

  if (areas.length === 0) {
    toast('Debes seleccionar al menos una área validadora.');
    return;
  }

  let camposObj;
  try {
    camposObj = obtenerCamposDeConstructor(true);
  } catch (err) {
    toast(err.message);
    abrirModal('modal-campos-plantilla');
    if (err.elementToFocus) {
      setTimeout(() => {
        err.elementToFocus.focus();
        err.elementToFocus.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    return;
  }

  if (camposObj.length === 0) {
    toast('Debes agregar al menos un campo con título al formulario.');
    return;
  }

  const mail_destinatario = pltMailDestinatario ? pltMailDestinatario.value.trim() : '';
  const mail_cc = pltMailCc ? pltMailCc.value.trim() : '';
  const mail_asunto = pltMailAsunto ? pltMailAsunto.value.trim() : '';
  const mail_cuerpo = pltMailCuerpo ? pltMailCuerpo.value.trim() : '';
  const mail_progreso = pltMailProgreso ? pltMailProgreso.checked : true;

  const payload = {
    codigo,
    nombre,
    descripcion: description,
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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/admin/tipos-solicitud', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al guardar la plantilla.');

    cerrarModal('modal-plantilla');
    await cargarFormulariosAdmin();
    const { cargarTiposSolicitud } = await import('./app.js');
    await cargarTiposSolicitud();
  } catch (error) {
    toast(error.message);
  }
}

export async function previsualizarPDFPlantilla(e) {
  e.preventDefault();

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

  const codigo = pltCodigo ? pltCodigo.value.trim().toUpperCase() || 'PREVISUALIZACION' : 'PREVISUALIZACION';
  const nombre = pltNombre ? pltNombre.value.trim() || 'Formulario de Previsualización' : 'Formulario de Previsualización';
  const descripcion = pltDescripcion ? pltDescripcion.value.trim() || 'Descripción de previsualización' : 'Descripción de previsualización';

  const areas = [];
  if (chkValSeguridad && chkValSeguridad.checked) areas.push('seguridad');
  if (chkValGibdd && chkValGibdd.checked) areas.push('gibdd');
  if (chkValGiitrc && chkValGiitrc.checked) areas.push('giitrc');
  if (chkValOsi && chkValOsi.checked) areas.push('osi');
  if (chkValDirector && chkValDirector.checked) areas.push('director');

  const camposObj = [];
  if (constructorCamposContainer) {
    const filas = constructorCamposContainer.querySelectorAll('.campo-visual-row');
    filas.forEach(f => {
      const labelInput = f.querySelector('.campo-label');
      const typeSelect = f.querySelector('.campo-type');
      const requiredCheckbox = f.querySelector('.campo-required');

      const label = labelInput ? labelInput.value.trim() : '';
      const type = typeSelect ? typeSelect.value : 'text';
      const required = requiredCheckbox ? requiredCheckbox.checked : false;

      if (label !== '') {
        const name = f.dataset.name || label
          .toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_]+/g, '_')
          .replace(/^_+|_+$/g, '');

        const condicionAreaSelect = f.querySelector('.campo-condicion-area');
        const condicion_area = condicionAreaSelect ? condicionAreaSelect.value || null : null;

        const campoData = { name, label, type, required, condicion_area };

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
            const colName = colNameInput ? colNameInput.value.trim() : '';
            const colType = colTypeSelect ? colTypeSelect.value : 'text';
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

          if (type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
            const rows = [];
            const rowRows = f.querySelectorAll('.fila-visual-row');
            rowRows.forEach(rowRow => {
              const rowNameInput = rowRow.querySelector('.row-name');
              const rowName = rowNameInput ? rowNameInput.value.trim() : '';
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
  }

  if (camposObj.length === 0) {
    toast('Debes agregar al menos un campo al formulario antes de previsualizar.');
    return;
  }

  const originalText = btnPreviewPlantilla ? btnPreviewPlantilla.innerHTML : '';
  try {
    if (btnPreviewPlantilla) {
      btnPreviewPlantilla.disabled = true;
      btnPreviewPlantilla.innerHTML = '⏳ Generando...';
    }

    const response = await fetch('/api/admin/tipos-solicitud/preview-pdf', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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
    toast(error.message);
  } finally {
    if (btnPreviewPlantilla) {
      btnPreviewPlantilla.disabled = false;
      btnPreviewPlantilla.innerHTML = originalText;
    }
  }
}

export function actualizarContadorCampos() {
  const container = document.getElementById('constructor-campos-container');
  const badge = document.getElementById('campos-count-badge');
  if (container && badge) {
    const count = container.querySelectorAll('.campo-visual-row').length;
    badge.textContent = count;
  }
}

export function obtenerCamposDeConstructor(validar = false) {
  const constructorCamposContainer = document.getElementById('constructor-campos-container');
  const camposObj = [];
  if (!constructorCamposContainer) return camposObj;

  const filas = constructorCamposContainer.querySelectorAll('.campo-visual-row');
  let errorMsg = null;
  let elementToFocus = null;

  filas.forEach((f, idx) => {
    if (errorMsg) return;

    const labelInput = f.querySelector('.campo-label');
    const typeSelect = f.querySelector('.campo-type');
    const requiredCheckbox = f.querySelector('.campo-required');

    const label = labelInput ? labelInput.value.trim() : '';
    const type = typeSelect ? typeSelect.value : 'text';
    const required = requiredCheckbox ? requiredCheckbox.checked : false;

    if (validar && label === '' && !['title', 'subtitle', 'paragraph', 'info_no_pdf'].includes(type)) {
      errorMsg = `El campo #${idx + 1} no tiene una etiqueta o título definido.`;
      elementToFocus = labelInput;
      return;
    }

    if (validar && label === '' && ['title', 'subtitle', 'paragraph', 'info_no_pdf'].includes(type)) {
      errorMsg = `El campo de texto/título #${idx + 1} no puede estar vacío.`;
      elementToFocus = labelInput;
      return;
    }

    if (label !== '') {
      const name = f.dataset.name || label
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');

      const condicionAreaSelect = f.querySelector('.campo-condicion-area');
      const condicion_area = condicionAreaSelect ? condicionAreaSelect.value || null : null;

      const campoData = { name, label, type, required, condicion_area };

      if (type === 'firmante' || type === 'firmante_seccion' || type === 'firmante_list') {
        campoData.recoger_cedula = f.querySelector('.campo-recoger-cedula')?.checked || false;
        campoData.recoger_cargo = f.querySelector('.campo-recoger-cargo')?.checked || false;
      }

      if (type === 'select') {
        const optionsInput = f.querySelector('.campo-options');
        const opts = optionsInput ? optionsInput.value.split(',').map(o => o.trim()).filter(o => o !== '') : [];
        if (validar && opts.length === 0) {
          errorMsg = `El campo '${label}' (Selector) debe tener al menos una opción configurada (separadas por comas).`;
          elementToFocus = optionsInput;
          return;
        }
        campoData.options = opts;
      }

      if (type === 'grid' || type === 'fixed_grid' || type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
        const columns = [];
        const colRows = f.querySelectorAll('.columna-visual-row');
        colRows.forEach((colRow, cIdx) => {
          if (errorMsg) return;
          const colNameInput = colRow.querySelector('.col-name');
          const colTypeSelect = colRow.querySelector('.col-type');
          const colRequiredCheckbox = colRow.querySelector('.col-required');
          const colName = colNameInput ? colNameInput.value.trim() : '';
          const colType = colTypeSelect ? colTypeSelect.value : 'text';

          if (validar && colName === '') {
            errorMsg = `La columna #${cIdx + 1} en la tabla '${label}' no tiene un nombre definido.`;
            elementToFocus = colNameInput;
            return;
          }

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
              const colOpts = colOptionsInput ? colOptionsInput.value.split(',').map(o => o.trim()).filter(o => o !== '') : [];
              if (validar && colOpts.length === 0) {
                errorMsg = `La columna '${colName}' (Selector) en la tabla '${label}' debe tener al menos una opción configurada.`;
                elementToFocus = colOptionsInput;
                return;
              }
              colObj.options = colOpts;
            }
            columns.push(colObj);
          }
        });
        if (errorMsg) return;
        campoData.columns = columns;

        if (type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
          const rows = [];
          const rowRows = f.querySelectorAll('.fila-visual-row');
          rowRows.forEach((rowRow, rIdx) => {
            if (errorMsg) return;
            const rowNameInput = rowRow.querySelector('.row-name');
            const rowName = rowNameInput ? rowNameInput.value.trim() : '';

            if (validar && rowName === '') {
              errorMsg = `La fila #${rIdx + 1} en la tabla '${label}' no tiene un nombre definido.`;
              elementToFocus = rowNameInput;
              return;
            }

            if (rowName !== '') {
              rows.push(rowName);
            }
          });
          if (errorMsg) return;
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

  if (validar && errorMsg) {
    const err = new Error(errorMsg);
    err.elementToFocus = elementToFocus;
    throw err;
  }

  return camposObj;
}

export function agregarCampoPorTipo(tipo) {
  agregarFilaCampoVisual({ type: tipo, required: true, label: '' });
}

export async function abrirPreviewLocal() {
  const campos = obtenerCamposDeConstructor();
  if (campos.length === 0) {
    toast('Debes agregar al menos un campo con etiqueta para poder previsualizar.');
    return;
  }

  const { renderizarCamposDinamicos } = await import('./forms.js');
  const previewContainer = document.getElementById('preview-local-campos-container');
  const modalPreview = document.getElementById('modal-preview-local');

  if (previewContainer && modalPreview) {
    const fakeTipo = {
      campos: campos
    };
    renderizarCamposDinamicos(fakeTipo, null, previewContainer);
    modalPreview.classList.remove('hidden');
  }
}

export function obtenerDatosDeFilaCampo(f) {
  const labelInput = f.querySelector('.campo-label');
  const typeSelect = f.querySelector('.campo-type');
  const requiredCheckbox = f.querySelector('.campo-required');

  const label = labelInput ? labelInput.value.trim() : '';
  const type = typeSelect ? typeSelect.value : 'text';
  const required = requiredCheckbox ? requiredCheckbox.checked : false;

  const condicionAreaSelect = f.querySelector('.campo-condicion-area');
  const condicion_area = condicionAreaSelect ? condicionAreaSelect.value || null : null;

  const campoData = { label, type, required, condicion_area };

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
      const colName = colNameInput ? colNameInput.value.trim() : '';
      const colType = colTypeSelect ? colTypeSelect.value : 'text';
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

    if (type === 'fixed_grid_dynamic_cols' || type === 'fixed_grid_fixed_cols') {
      const rows = [];
      const rowRows = f.querySelectorAll('.fila-visual-row');
      rowRows.forEach(rowRow => {
        const rowNameInput = rowRow.querySelector('.row-name');
        const rowName = rowNameInput ? rowNameInput.value.trim() : '';
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
  return campoData;
}

export function copiarFilaCampoVisual(button) {
  const row = button.closest('.campo-visual-row');
  if (!row) return;
  const data = obtenerDatosDeFilaCampo(row);
  agregarFilaCampoVisual(data, row);
}

export function insertarFilaCampoVisualAbajo(button) {
  const row = button.closest('.campo-visual-row');
  if (!row) return;
  agregarFilaCampoVisual(null, row);
}
