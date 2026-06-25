import { state } from './state.js';
import { toast, escaparHTML, formatearValorFirmante, obtenerNombreArea, generarCodigoSeguimiento } from './utils.js';
import { getAuthHeaders, descargarPDF } from './api.js';
import { renderizarCamposDinamicos } from './forms.js';

export function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function cerrarModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
  if (id === 'modal-detalle') {
    state.activeSolicitudId = null;
  }
  if (id === 'modal-solicitud') {
    if (state.activeSolicitudId) {
      verDetalle(state.activeSolicitudId);
    }
  }
  
  // Restore scroll only if no modals are open
  const openModals = document.querySelectorAll('.modal:not(.hidden)');
  if (openModals.length === 0) {
    document.body.style.overflow = '';
  }
}

export async function verDetalle(id, isRefresh = false) {
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

  try {
    const response = await fetch(`/api/solicitudes/${id}`, {
      headers: getAuthHeaders()
    });

    if (isRefresh && modalDetalle && modalDetalle.classList.contains('hidden')) return;

    const sol = await response.json();
    if (!response.ok) {
      if (!isRefresh) toast(sol.error || 'Error al obtener la solicitud.');
      return;
    }

    // Sincronizar con el estado local para asegurar que acciones posteriores (como edición) tengan datos y campos frescos
    if (state.todasLasSolicitudes) {
      const idx = state.todasLasSolicitudes.findIndex(s => s.id === sol.id);
      if (idx !== -1) {
        state.todasLasSolicitudes[idx] = sol;
      } else {
        state.todasLasSolicitudes.push(sol);
      }
    }

    state.activeSolicitudId = id;

    if (detCodigo) detCodigo.textContent = generarCodigoSeguimiento(sol);
    if (detTipo) detTipo.textContent = sol.tipo_nombre;
    if (detSolicitante) detSolicitante.textContent = sol.solicitante_nombre;
    if (detFecha) detFecha.textContent = new Date(sol.fecha_creacion).toLocaleString('es-ES');

    if (detEstado) {
      detEstado.textContent = sol.estado.replace('_', ' ');
      detEstado.className = `badge badge-${sol.estado}`;
    }

    if (detCamposValores) {
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
                } else if (colType === 'time' && val) {
                  const parts = String(val).split(':');
                  if (parts.length >= 2) {
                    td.textContent = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
                  } else {
                    td.textContent = val;
                  }
                } else if (colType === 'date_range') {
                  let formattedVal = 'N/A';
                  if (val) {
                    try {
                      const parsed = typeof val === 'object' ? val : JSON.parse(val);
                      if (parsed.desde && parsed.hasta) {
                        formattedVal = `Desde: ${parsed.desde} | Hasta: ${parsed.hasta}`;
                      } else if (parsed.desde) {
                        formattedVal = `Desde: ${parsed.desde}`;
                      } else if (parsed.hasta) {
                        formattedVal = `Hasta: ${parsed.hasta}`;
                      }
                    } catch (e) {
                      formattedVal = val;
                    }
                  }
                  td.textContent = formattedVal;
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
        } else if (campo.type === 'date_range') {
          const valItem = document.createElement('div');
          valItem.className = 'field-val-item';

          const rawVal = sol.datos[campo.name];
          let valor = 'N/A';
          if (rawVal) {
            try {
              const parsed = typeof rawVal === 'object' ? rawVal : JSON.parse(rawVal);
              if (parsed.desde && parsed.hasta) {
                valor = `Desde: ${parsed.desde} | Hasta: ${parsed.hasta}`;
              } else if (parsed.desde) {
                valor = `Desde: ${parsed.desde}`;
              } else if (parsed.hasta) {
                valor = `Hasta: ${parsed.hasta}`;
              }
            } catch (e) {
              valor = rawVal;
            }
          }
          valItem.innerHTML = `
            <strong>${escaparHTML(campo.label)}:</strong>
            <span>${escaparHTML(valor)}</span>
          `;
          detCamposValores.appendChild(valItem);
        } else {
          const valItem = document.createElement('div');
          valItem.className = 'field-val-item';

          const rawVal = sol.datos[campo.name];
          let valor = rawVal !== undefined && rawVal !== null && rawVal !== '' ? rawVal : 'N/A';
          if (campo.type === 'firmante' || campo.type === 'firmante_seccion') {
            valor = formatearValorFirmante(rawVal);
          } else if (campo.type === 'time' && valor !== 'N/A') {
            const parts = String(valor).split(':');
            if (parts.length >= 2) {
              valor = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
            }
          }
          valItem.innerHTML = `
            <strong>${escaparHTML(campo.label)}:</strong>
            <span>${escaparHTML(valor)}</span>
          `;
          detCamposValores.appendChild(valItem);
        }
      });
    }

    if (detAprobacionesLista) {
      detAprobacionesLista.innerHTML = '';
      sol.aprobaciones.forEach(ap => {
        if (ap.area === 'director') return;
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
    }

    if (detObservacionesLista) {
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
    }

    const modalBodyGrid = document.querySelector('.modal-body-grid');
    if (detFlujoSeccion) {
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
    }

    if (panelAccionesTecnicas) {
      panelAccionesTecnicas.classList.add('hidden');
      if (panelAsignacionContainer) panelAsignacionContainer.innerHTML = '';

      const actionsButtonsRow = panelAccionesTecnicas.querySelector('.action-buttons-row');
      const obsInputArea = panelAccionesTecnicas.querySelector('.observacion-input-area');

      if (state.currentUser.rol === 'tecnico' && state.currentUser.area !== 'director' && (sol.estado === 'en_revision' || sol.estado === 'observado')) {
        const aprobacionArea = sol.aprobaciones.find(ap => ap.area === state.currentUser.area);
        if (aprobacionArea && aprobacionArea.estado === 'pendiente') {
          panelAccionesTecnicas.classList.remove('hidden');
          if (!isRefresh && observacionTexto) {
            observacionTexto.value = '';
          }

          // Eliminar el mensaje de espera previo si existe
          const msgEsperaPrevio = panelAccionesTecnicas.querySelector('.espera-msg');
          if (msgEsperaPrevio) msgEsperaPrevio.remove();

          if (sol.estado === 'observado') {
            if (actionsButtonsRow) actionsButtonsRow.style.display = 'none';
            if (obsInputArea) obsInputArea.style.display = 'none';

            if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(state.currentUser.area)) {
              if (!aprobacionArea.tecnico_id) {
                if (panelAsignacionContainer) {
                  panelAsignacionContainer.innerHTML = `
                    <div class="alert alert-warning" style="margin-bottom: 0.8rem; font-size: 0.8rem; padding: 0.5rem 0.8rem;">
                      ⚠️ Solicitud sin asignar.
                    </div>
                  `;
                }
              } else if (aprobacionArea.tecnico_id === state.currentUser.id) {
                if (panelAsignacionContainer) {
                  panelAsignacionContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: #F4F8F3; border: 1px solid var(--success-color); padding: 0.5rem 0.8rem; border-radius: var(--radius-md); margin-bottom: 0.8rem;">
                      <span style="font-size: 0.8rem; color: var(--success-hover); font-weight: bold;">
                        ✅ Asignado a ti (Responsable de la revisión)
                      </span>
                      <button type="button" class="btn btn-outline btn-sm" id="btn-release-assign" style="margin: 0; padding: 0.2rem 0.5rem; font-size: 0.75rem; border-color: var(--danger-color); color: var(--danger-color);">
                        🔓 Liberar Asignación
                      </button>
                    </div>
                  `;
                  document.getElementById('btn-release-assign').onclick = () => desasignarSolicitud(sol.id);
                }
              } else {
                if (panelAsignacionContainer) {
                  panelAsignacionContainer.innerHTML = `
                    <div class="alert alert-danger" style="margin-bottom: 0; font-size: 0.8rem; padding: 0.5rem 0.8rem;">
                      🚫 Asignado a otro técnico: <strong>${escaparHTML(aprobacionArea.tecnico_nombre || 'Analista')}</strong>.
                    </div>
                  `;
                }
              }
            }

            const esperaMsg = document.createElement('div');
            esperaMsg.className = 'espera-msg alert alert-info';
            esperaMsg.style.marginTop = '0.5rem';
            esperaMsg.style.textAlign = 'center';
            esperaMsg.innerHTML = '⌛ <strong>A la espera de la corrección de observaciones por parte del solicitante.</strong>';
            panelAccionesTecnicas.appendChild(esperaMsg);

          } else {
            // Estado 'en_revision' - Mostrar flujo normal
            if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(state.currentUser.area)) {
              if (!aprobacionArea.tecnico_id) {
                if (panelAsignacionContainer) {
                  panelAsignacionContainer.innerHTML = `
                    <div class="alert alert-warning" style="margin-bottom: 0.8rem; font-size: 0.8rem; padding: 0.5rem 0.8rem;">
                      ⚠️ Solicitud sin asignar. Debes asignarte la solicitud para poder validarla u observarla.
                    </div>
                    <button type="button" class="btn btn-primary btn-block" id="btn-self-assign">
                      🙋‍♂️ Asignarme Solicitud (Tomar Responsabilidad)
                    </button>
                  `;
                  document.getElementById('btn-self-assign').onclick = () => asignarSolicitud(sol.id);
                }
                if (actionsButtonsRow) actionsButtonsRow.style.display = 'none';
                if (obsInputArea) obsInputArea.style.display = 'none';
              } else if (aprobacionArea.tecnico_id === state.currentUser.id) {
                if (panelAsignacionContainer) {
                  panelAsignacionContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: #F4F8F3; border: 1px solid var(--success-color); padding: 0.5rem 0.8rem; border-radius: var(--radius-md); margin-bottom: 0.8rem;">
                      <span style="font-size: 0.8rem; color: var(--success-hover); font-weight: bold;">
                        ✅ Asignado a ti (Responsable de la revisión)
                      </span>
                      <button type="button" class="btn btn-outline btn-sm" id="btn-release-assign" style="margin: 0; padding: 0.2rem 0.5rem; font-size: 0.75rem; border-color: var(--danger-color); color: var(--danger-color);">
                        🔓 Liberar Asignación
                      </button>
                    </div>
                  `;
                  document.getElementById('btn-release-assign').onclick = () => desasignarSolicitud(sol.id);
                }
                if (actionsButtonsRow) actionsButtonsRow.style.display = 'flex';
                if (obsInputArea) obsInputArea.style.display = 'block';
  
                if (btnAprobarTecnico) btnAprobarTecnico.onclick = () => realizarAprobacion(sol.id);
                if (btnAprobarConObservacion) btnAprobarConObservacion.onclick = () => realizarAprobacionConObservacion(sol.id);
                if (btnObservarTecnico) btnObservarTecnico.onclick = () => realizarObservacion(sol.id);
              } else {
                if (panelAsignacionContainer) {
                  panelAsignacionContainer.innerHTML = `
                    <div class="alert alert-danger" style="margin-bottom: 0; font-size: 0.8rem; padding: 0.5rem 0.8rem;">
                      🚫 Asignado a otro técnico: <strong>${escaparHTML(aprobacionArea.tecnico_nombre || 'Analista')}</strong>.
                    </div>
                  `;
                }
                if (actionsButtonsRow) actionsButtonsRow.style.display = 'none';
                if (obsInputArea) obsInputArea.style.display = 'none';
              }
            } else {
              if (actionsButtonsRow) actionsButtonsRow.style.display = 'flex';
              if (obsInputArea) obsInputArea.style.display = 'block';
  
              if (btnAprobarTecnico) btnAprobarTecnico.onclick = () => realizarAprobacion(sol.id);
              if (btnAprobarConObservacion) btnAprobarConObservacion.onclick = () => realizarAprobacionConObservacion(sol.id);
              if (btnObservarTecnico) btnObservarTecnico.onclick = () => realizarObservacion(sol.id);
            }
          }
        }
      }
    }

    if (detAccionesAdicionales) {
      detAccionesAdicionales.innerHTML = '';

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

      if (state.currentUser.rol === 'solicitante' && (sol.estado === 'borrador' || sol.estado === 'observado')) {
        const alertDiv = document.createElement('div');
        if (sol.estado === 'borrador') {
          alertDiv.className = 'alert alert-info';
          alertDiv.textContent = '✏️ Esta solicitud se encuentra en borrador. Puedes editar la información antes de enviarla a revisión.';
        } else if (sol.estado === 'observado') {
          alertDiv.className = 'alert alert-danger';
          alertDiv.textContent = '⚠️ Esta solicitud ha sido observada por un área técnica. Por favor corrige la información.';
        }
        detAccionesAdicionales.appendChild(alertDiv);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-primary btn-block';
        editBtn.innerHTML = sol.estado === 'borrador' ? '✏️ Editar y Completar Formulario' : '✏️ Editar y Corregir Formulario';
        editBtn.onclick = () => abrirEdicion(sol.id, sol.tipo_solicitud_id);
        detAccionesAdicionales.appendChild(editBtn);
      }

      const aprobacionArea = state.currentUser.rol === 'tecnico' ? sol.aprobaciones.find(ap => ap.area === state.currentUser.area) : null;
      let esTecnicoConResponsabilidad = false;
      if (state.currentUser.rol === 'tecnico' && state.currentUser.area !== 'director' && aprobacionArea) {
        if (['seguridad', 'gibdd', 'giitrc', 'osi'].includes(state.currentUser.area)) {
          esTecnicoConResponsabilidad = aprobacionArea.tecnico_id === state.currentUser.id;
        } else {
          esTecnicoConResponsabilidad = true;
        }
      }

      if ((esTecnicoConResponsabilidad || state.currentUser.rol === 'admin') && (sol.estado === 'en_revision' || sol.estado === 'observado')) {
        const editTechBtn = document.createElement('button');
        editTechBtn.className = 'btn btn-outline btn-block';
        editTechBtn.innerHTML = '✏️ Editar Datos de Solicitud';
        editTechBtn.onclick = () => abrirEdicion(sol.id, sol.tipo_solicitud_id);
        detAccionesAdicionales.appendChild(editTechBtn);
      }

      if (sol.estado !== 'borrador') {
        let puedeReabrir = false;
        if (state.currentUser.rol === 'admin') puedeReabrir = true;
        if (state.currentUser.rol === 'solicitante' && sol.solicitante_id === state.currentUser.id) puedeReabrir = true;
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
    }

    if (!isRefresh && modalDetalle) {
      abrirModal('modal-detalle');
    }
  } catch (error) {
    if (!isRefresh) toast('Error al cargar detalle de solicitud: ' + error.message);
  }
}

export function abrirEdicion(solicitudId, tipoId) {
  const sol = state.todasLasSolicitudes.find(s => s.id === solicitudId);
  if (!sol) return;

  const btnGuardarBorrador = document.getElementById('btn-guardar-borrador');
  const btnEnviarRevision = document.getElementById('btn-enviar-revision');
  const modalDetalle = document.getElementById('modal-detalle');
  const modalSolicitud = document.getElementById('modal-solicitud');
  const selectTipoSolicitud = document.getElementById('select-tipo-solicitud');
  const solicitudIdInput = document.getElementById('solicitud-id');

  if (modalDetalle) modalDetalle.classList.add('hidden');

  if (solicitudIdInput) solicitudIdInput.value = sol.id;

  if (selectTipoSolicitud) {
    selectTipoSolicitud.value = tipoId;
    selectTipoSolicitud.disabled = true;
  }

  renderizarCamposDinamicos({ campos: sol.campos }, sol.datos);
  
  const title = document.getElementById('modal-solicitud-titulo');
  if (title) title.textContent = `Editar Solicitud ${generarCodigoSeguimiento(sol)}`;

  if (state.currentUser.rol === 'solicitante') {
    if (btnGuardarBorrador) btnGuardarBorrador.classList.remove('hidden');
    if (btnEnviarRevision) btnEnviarRevision.textContent = 'Enviar a Revisión';
  } else {
    if (btnGuardarBorrador) btnGuardarBorrador.classList.add('hidden');
    if (btnEnviarRevision) btnEnviarRevision.textContent = 'Guardar Cambios';
  }

  abrirModal('modal-solicitud');
}

export async function realizarAprobacion(solicitudId) {
  if (!confirm('¿Está seguro de que va a aprobar la sección sin ninguna observación?')) return;
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/aprobar`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({})
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al procesar la aprobación.');
    }

    await verDetalle(solicitudId, true);
    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
  } catch (error) {
    toast(error.message);
  }
}

export async function realizarAprobacionConObservacion(solicitudId) {
  const observacionTexto = document.getElementById('observacion-texto');
  const observacion = observacionTexto ? observacionTexto.value : '';
  if (!observacion || observacion.trim() === '') {
    toast('Por favor escribe la observación en el cuadro de texto antes de aprobar.');
    return;
  }
  if (!confirm('¿Está seguro de que desea aprobar esta sección técnica con la observación ingresada?')) return;
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/aprobar`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ observacion })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al procesar la aprobación.');
    }

    await verDetalle(solicitudId, true);
    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
  } catch (error) {
    toast(error.message);
  }
}

export async function realizarObservacion(solicitudId) {
  const observacionTexto = document.getElementById('observacion-texto');
  const texto = observacionTexto ? observacionTexto.value : '';
  if (!texto || texto.trim() === '') {
    toast('Por favor describe en detalle el motivo de la observación.');
    return;
  }

  if (!confirm('¿Está seguro de que desea reportar esta solicitud como observada para que el solicitante corrija la información?')) return;

  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/observar`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ texto })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al guardar la observación.');
    }

    await verDetalle(solicitudId, true);
    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
  } catch (error) {
    toast(error.message);
  }
}

export async function realizarReapertura(solicitudId) {
  const texto = prompt('Escribe el motivo detallado de la reapertura de la solicitud (se reiniciarán todas las aprobaciones):');
  if (texto === null) return;
  if (texto.trim() === '') {
    toast('El motivo de la reapertura es obligatorio.');
    return;
  }

  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/reabrir`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ texto })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al reabrir el proceso de revisión.');
    }

    await verDetalle(solicitudId, true);
    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
  } catch (error) {
    toast(error.message);
  }
}

export async function realizarObservacionSimple(solicitudId) {
  const observacionTexto = document.getElementById('observacion-texto');
  const texto = observacionTexto ? observacionTexto.value : '';
  if (!texto || texto.trim() === '') {
    toast('Por favor escribe en detalle el motivo de la observación.');
    return;
  }

  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/observar-simple`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ texto })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al guardar la observación.');
    }

    if (observacionTexto) observacionTexto.value = '';
    await verDetalle(solicitudId, true);
    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
  } catch (error) {
    toast(error.message);
  }
}

export async function asignarSolicitud(solicitudId) {
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/asignar`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al asignar la solicitud.');
    }

    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
    await verDetalle(solicitudId, true);
  } catch (error) {
    toast(error.message);
  }
}

export async function desasignarSolicitud(solicitudId) {
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/desasignar`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error al liberar la solicitud.');
    }

    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
    await verDetalle(solicitudId, true);
  } catch (error) {
    toast(error.message);
  }
}
