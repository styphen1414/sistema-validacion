import { state } from './state.js';
import { toast, escaparHTML } from './utils.js';
import { getAuthHeaders } from './api.js';

let isSubmitting = false;

export function renderizarCamposDinamicos(tipoId, valoresExistentes = null, customContainer = null) {
  const container = customContainer || document.getElementById('campos-dinamicos-container');
  if (!container) return;

  container.innerHTML = '';
  if (!tipoId) {
    container.innerHTML = '<p class="form-help-text">Selecciona un tipo de solicitud para ver los campos requeridos.</p>';
    return;
  }

  let tipo;
  if (typeof tipoId === 'object' && tipoId !== null) {
    tipo = tipoId;
  } else {
    tipo = state.tiposSolicitud.find(t => t.id === tipoId);
  }
  if (!tipo) return;

  tipo.campos.forEach(campo => {
    if (campo.type === 'title') {
      const titleEl = document.createElement('h3');
      titleEl.className = 'form-section-title';
      titleEl.textContent = campo.label;
      container.appendChild(titleEl);
      return;
    }
    if (campo.type === 'subtitle') {
      const subtitleEl = document.createElement('h4');
      subtitleEl.className = 'form-section-subtitle';
      subtitleEl.textContent = campo.label;
      container.appendChild(subtitleEl);
      return;
    }
    if (campo.type === 'paragraph') {
      const paragraphEl = document.createElement('p');
      paragraphEl.className = 'form-section-paragraph';
      paragraphEl.textContent = campo.label;
      container.appendChild(paragraphEl);
      return;
    }
    if (campo.type === 'info_no_pdf') {
      const paragraphEl = document.createElement('p');
      paragraphEl.className = 'form-section-paragraph info-no-pdf-paragraph';
      paragraphEl.innerHTML = `<strong>ℹ️ Informativo:</strong> ${campo.label}`;
      container.appendChild(paragraphEl);
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
      container.appendChild(checkboxContainer);
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
          } else if (colType === 'date_range') {
            const compDiv = document.createElement('div');
            compDiv.className = 'grid-cell-date-range-composite';

            const cellHiddenInput = document.createElement('input');
            cellHiddenInput.type = 'hidden';
            cellHiddenInput.className = 'grid-cell-input';
            cellHiddenInput.dataset.column = colName;
            if (isColRequired) cellHiddenInput.required = true;
            compDiv.appendChild(cellHiddenInput);

            const val = rowData ? (rowData[colName] || '') : '';
            let parsed = { desde: '', hasta: '' };
            if (val) {
              try {
                parsed = typeof val === 'object' ? val : JSON.parse(val);
              } catch (e) { }
            }

            const updateCell = () => {
              const data = {
                desde: desdeInp.value.trim(),
                hasta: hastaInp.value.trim()
              };
              cellHiddenInput.value = (data.desde || data.hasta) ? JSON.stringify(data) : '';
            };

            const desdeInp = document.createElement('input');
            desdeInp.type = 'date';
            desdeInp.value = parsed.desde || '';
            if (isColRequired) desdeInp.required = true;
            desdeInp.onchange = () => {
              if (desdeInp.value) {
                hastaInp.min = desdeInp.value;
              } else {
                hastaInp.removeAttribute('min');
              }
              updateCell();
            };
            compDiv.appendChild(desdeInp);

            const hastaInp = document.createElement('input');
            hastaInp.type = 'date';
            hastaInp.value = parsed.hasta || '';
            if (isColRequired) hastaInp.required = true;
            hastaInp.onchange = () => {
              if (hastaInp.value) {
                desdeInp.max = hastaInp.value;
              } else {
                desdeInp.removeAttribute('max');
              }
              updateCell();
            };
            compDiv.appendChild(hastaInp);

            if (desdeInp.value) {
              hastaInp.min = desdeInp.value;
            }
            if (hastaInp.value) {
              desdeInp.max = hastaInp.value;
            }

            updateCell();
            td.appendChild(compDiv);
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
            aplicarFiltroEntrada(nomInp, /[^a-zA-Z\s]/g, 100, updateCell);
            registrarValidacionTiempoReal(nomInp, 'firmante_nombre', isColRequired, 'Nombre', 100);
            compDiv.appendChild(nomInp);

            let cedInp = null;
            if (col.recoger_cedula) {
              cedInp = document.createElement('input');
              cedInp.type = 'text';
              cedInp.placeholder = 'Cédula';
              cedInp.value = parsed.cedula;
              cedInp.maxLength = 10;
              aplicarFiltroEntrada(cedInp, /[^0-9]/g, 10, updateCell);
              registrarValidacionTiempoReal(cedInp, 'identificacion', isColRequired, 'Cédula', 10);
              compDiv.appendChild(cedInp);
            }

            let carInp = null;
            if (col.recoger_cargo) {
              carInp = document.createElement('input');
              carInp.type = 'text';
              carInp.placeholder = 'Cargo';
              carInp.value = parsed.cargo;
              aplicarFiltroEntrada(carInp, /[^a-zA-Z\s]/g, 100, updateCell);
              registrarValidacionTiempoReal(carInp, 'firmante_cargo', isColRequired, 'Cargo', 100);
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
            registrarValidacionTiempoReal(selectEl, 'select', isColRequired, colName);
            td.appendChild(selectEl);
          } else {
            const input = document.createElement('input');
            input.className = 'grid-cell-input';
            input.dataset.column = colName;
            if (colType === 'number') {
              input.type = 'number';
              input.placeholder = '0';
              input.min = '0';
              aplicarFiltroEntrada(input, /[^0-9]/g);
            } else if (colType === 'date') {
              input.type = 'date';
            } else if (colType === 'email') {
              input.type = 'email';
              input.placeholder = 'correo@ejemplo.com';
              aplicarFiltroEntrada(input, /[^a-zA-Z0-9.@_\-+]/g, 100);
            } else if (colType === 'identificacion') {
              input.type = 'text';
              input.dataset.type = 'identificacion';
              input.maxLength = 10;
              input.placeholder = '10 dígitos';
              aplicarFiltroEntrada(input, /[^0-9]/g, 10);
            } else if (colType === 'ip') {
              input.type = 'text';
              input.dataset.type = 'ip';
              input.placeholder = '192.168.1.10';
              input.maxLength = 15;
              aplicarFiltroEntrada(input, /[^0-9.]/g, 15);
            } else if (colType === 'mac') {
              input.type = 'text';
              input.dataset.type = 'mac';
              input.placeholder = 'AA:BB:CC:DD:EE:FF';
              input.maxLength = 17;
              aplicarFiltroEntrada(input, /[^0-9a-fA-F:\-]/g, 17);
            } else if (colType === 'time') {
              input.type = 'time';
            } else {
              input.type = 'text';
              input.placeholder = `Ingresa ${colName.toLowerCase()}`;
              if (colType === 'text') {
                input.maxLength = 100;
              } else if (colType === 'textarea') {
                input.maxLength = 500;
              }
              aplicarFiltroEntrada(input, /[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;_!?/@-]/g, colType === 'textarea' ? 500 : 100);
            }
            input.value = rowData ? (rowData[colName] || '') : '';
            if (isColRequired) input.required = true;
            registrarValidacionTiempoReal(input, colType, isColRequired, colName, colType === 'text' ? 100 : (colType === 'textarea' ? 500 : null));
            td.appendChild(input);
          }
          tr.appendChild(td);
        });

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
            addRowFn();
          }
        }

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

            const existingHeaders = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.replace(' *', '').trim());
            const rowLabelKey = campo.row_label || 'Descripción / Fila';
            if (cleanedName === rowLabelKey || cleanedName === 'Descripción / Fila' || existingHeaders.includes(cleanedName)) {
              toast('La columna ya existe.');
              return;
            }

            const th = document.createElement('th');
            th.textContent = cleanedName;
            thead.firstElementChild.appendChild(th);

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
              aplicarFiltroEntrada(input, /[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;_!?/@-]/g, 100);
              registrarValidacionTiempoReal(input, 'text', false, cleanedName, 100);
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

      container.appendChild(gridContainer);
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
          aplicarFiltroEntrada(nomInp, /[^a-zA-Z\s]/g, 100, updateVal);
          registrarValidacionTiempoReal(nomInp, 'firmante_nombre', campo.required, 'Nombre Completo', 100);
          compDiv.appendChild(nomInp);

          let cedInp = null;
          if (campo.recoger_cedula) {
            cedInp = document.createElement('input');
            cedInp.type = 'text';
            cedInp.placeholder = 'Cédula';
            cedInp.value = parsed.cedula;
            cedInp.maxLength = 10;
            aplicarFiltroEntrada(cedInp, /[^0-9]/g, 10, updateVal);
            registrarValidacionTiempoReal(cedInp, 'identificacion', campo.required, 'Cédula', 10);
            compDiv.appendChild(cedInp);
          }

          let carInp = null;
          if (campo.recoger_cargo) {
            carInp = document.createElement('input');
            carInp.type = 'text';
            carInp.placeholder = 'Cargo';
            carInp.value = parsed.cargo;
            aplicarFiltroEntrada(carInp, /[^a-zA-Z\s]/g, 100, updateVal);
            registrarValidacionTiempoReal(carInp, 'firmante_cargo', campo.required, 'Cargo', 100);
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
          aplicarFiltroEntrada(mainValInput, /[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;_!?/@-]/g, campo.type === 'text_list' ? 100 : null);
          registrarValidacionTiempoReal(mainValInput, campo.type, campo.required, campo.label, campo.type === 'text_list' ? 100 : null);
          row.appendChild(mainValInput);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-outline btn-sm';
        delBtn.innerHTML = '🗑️';
        delBtn.onclick = () => {
          if (campo.required && itemsDiv.children.length === 1) {
            toast('Este campo es obligatorio, debe tener al menos una entrada.');
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

      container.appendChild(listContainer);
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

    if (campo.type === 'date_range') {
      const container = document.createElement('div');
      container.className = 'date-range-composite-container';

      const mainInput = document.createElement('input');
      mainInput.type = 'hidden';
      mainInput.name = campo.name;
      mainInput.id = `campo-${campo.name}`;
      if (campo.required) mainInput.required = true;
      container.appendChild(mainInput);

      let parsed = { desde: '', hasta: '' };
      if (valor) {
        try {
          parsed = typeof valor === 'object' ? valor : JSON.parse(valor);
        } catch (e) { }
      }

      const updateValue = () => {
        const data = {
          desde: desdeInput.value.trim(),
          hasta: hastaInput.value.trim()
        };
        mainInput.value = (data.desde || data.hasta) ? JSON.stringify(data) : '';
      };

      const desdeGroup = document.createElement('div');
      const desdeLabel = document.createElement('label');
      desdeLabel.textContent = 'Desde';
      const desdeInput = document.createElement('input');
      desdeInput.type = 'date';
      desdeInput.value = parsed.desde || '';
      if (campo.required) desdeInput.required = true;

      const hastaGroup = document.createElement('div');
      const hastaLabel = document.createElement('label');
      hastaLabel.textContent = 'Hasta';
      const hastaInput = document.createElement('input');
      hastaInput.type = 'date';
      hastaInput.value = parsed.hasta || '';
      if (campo.required) hastaInput.required = true;

      if (desdeInput.value) {
        hastaInput.min = desdeInput.value;
      }
      if (hastaInput.value) {
        desdeInput.max = hastaInput.value;
      }

      desdeInput.onchange = () => {
        if (desdeInput.value) {
          hastaInput.min = desdeInput.value;
        } else {
          hastaInput.removeAttribute('min');
        }
        updateValue();
      };

      hastaInput.onchange = () => {
        if (hastaInput.value) {
          desdeInput.max = hastaInput.value;
        } else {
          desdeInput.removeAttribute('max');
        }
        updateValue();
      };

      desdeGroup.appendChild(desdeLabel);
      desdeGroup.appendChild(desdeInput);
      container.appendChild(desdeGroup);

      hastaGroup.appendChild(hastaLabel);
      hastaGroup.appendChild(hastaInput);
      container.appendChild(hastaGroup);

      updateValue();
      formGroup.appendChild(container);
    } else if ((campo.type === 'firmante' || campo.type === 'firmante_seccion') && (campo.recoger_cedula || campo.recoger_cargo)) {
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
      aplicarFiltroEntrada(nombreInput, /[^a-zA-Z\s]/g, 100, updateValue);
      registrarValidacionTiempoReal(nombreInput, 'firmante_nombre', campo.required, 'Nombres y Apellidos', 100);
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
        aplicarFiltroEntrada(cedulaInput, /[^0-9]/g, 10, updateValue);
        registrarValidacionTiempoReal(cedulaInput, 'identificacion', campo.required, 'Cédula', 10);
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
        aplicarFiltroEntrada(cargoInput, /[^a-zA-Z\s]/g, 100, updateValue);
        registrarValidacionTiempoReal(cargoInput, 'firmante_cargo', campo.required, 'Cargo', 100);
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
        aplicarFiltroEntrada(inputElement, /[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;_!?/@-]/g, 500);
      } else if (campo.type === 'number') {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.placeholder = `Ingresa ${campo.label.toLowerCase()}`;
        aplicarFiltroEntrada(inputElement, /[^0-9]/g);
      } else if (campo.type === 'ip') {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.placeholder = 'Ej: 192.168.1.10';
        inputElement.dataset.type = 'ip';
        inputElement.maxLength = 15;
        aplicarFiltroEntrada(inputElement, /[^0-9.]/g, 15);
      } else if (campo.type === 'mac') {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.placeholder = 'Ej: AA:BB:CC:DD:EE:FF';
        inputElement.dataset.type = 'mac';
        inputElement.maxLength = 17;
        aplicarFiltroEntrada(inputElement, /[^0-9a-fA-F:\-]/g, 17);
      } else if (campo.type === 'time') {
        inputElement = document.createElement('input');
        inputElement.type = 'time';
      } else {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.placeholder = `Ingresa ${campo.label.toLowerCase()}`;
        if (campo.type === 'text') {
          inputElement.maxLength = 100;
        }
        aplicarFiltroEntrada(inputElement, /[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;_!?/@-]/g, campo.type === 'text' ? 100 : null);
      }

      inputElement.name = campo.name;
      inputElement.id = `campo-${campo.name}`;
      inputElement.value = valor;
      if (campo.required) inputElement.required = true;
      registrarValidacionTiempoReal(inputElement, campo.type, campo.required, campo.label, campo.type === 'text' ? 100 : (campo.type === 'textarea' ? 500 : null));
      formGroup.appendChild(inputElement);
    }
    container.appendChild(formGroup);
  });
}

function marcarCampoInvalido(campo, colName = null, itemIndex = null) {
  // 1. Campos dentro de Tablas Dinámicas / Grids
  if (colName && ['grid', 'fixed_grid', 'fixed_grid_dynamic_cols', 'fixed_grid_fixed_cols'].includes(campo.type)) {
    const gridContainer = document.querySelector(`.grid-container[data-name="${campo.name}"]`);
    if (gridContainer) {
      const rowElements = gridContainer.querySelectorAll('.grid-row');
      if (itemIndex !== null && rowElements[itemIndex]) {
        const tr = rowElements[itemIndex];
        const inputEl = tr.querySelector(`input[data-column="${colName}"], select[data-column="${colName}"]`);
        if (inputEl) {
          if (inputEl.type === 'hidden') {
            inputEl.parentElement.querySelectorAll('input').forEach(el => el.classList.add('is-invalid'));
          } else {
            inputEl.classList.add('is-invalid');
          }
        }
      }
    }
    return;
  }

  // 2. Listas Dinámicas (text_list o firmante_list)
  if (['text_list', 'firmante_list'].includes(campo.type)) {
    const containerEl = document.querySelector(`.text-list-container[data-name="${campo.name}"]`);
    if (containerEl) {
      if (itemIndex !== null) {
        if (campo.type === 'firmante_list') {
          const compositeItems = containerEl.querySelectorAll('.text-list-composite-item');
          if (compositeItems[itemIndex]) {
            compositeItems[itemIndex].querySelectorAll('input').forEach(el => el.classList.add('is-invalid'));
          }
        } else {
          const listInputs = containerEl.querySelectorAll('.text-list-input');
          if (listInputs[itemIndex]) {
            listInputs[itemIndex].classList.add('is-invalid');
          }
        }
      } else {
        containerEl.classList.add('is-invalid');
      }
    }
    return;
  }

  // 3. Campos Simples (Standard DOM Input / Select / Textarea / Checkbox / Composites)
  const inputEl = document.getElementById(`campo-${campo.name}`);
  if (inputEl) {
    if (inputEl.type === 'hidden') {
      const parent = inputEl.parentElement;
      if (parent) {
        parent.querySelectorAll('input').forEach(el => el.classList.add('is-invalid'));
      }
    } else {
      inputEl.classList.add('is-invalid');
    }
  }
}

export async function enviarFormulario(enviar) {
  const solicitudIdInput = document.getElementById('solicitud-id');
  const selectTipoSolicitud = document.getElementById('select-tipo-solicitud');
  const camposDinamicosContainer = document.getElementById('campos-dinamicos-container');

  const solicitudId = solicitudIdInput ? solicitudIdInput.value : '';
  const tipoSolicitudId = selectTipoSolicitud ? selectTipoSolicitud.value : '';

  if (!tipoSolicitudId) {
    toast('Por favor selecciona el tipo de solicitud.');
    return;
  }

  if (isSubmitting) return;
  isSubmitting = true;

  const btnGuardarBorrador = document.getElementById('btn-guardar-borrador');
  const btnEnviarRevision = document.getElementById('btn-enviar-revision');

  if (btnGuardarBorrador) btnGuardarBorrador.disabled = true;
  if (btnEnviarRevision) btnEnviarRevision.disabled = true;

  try {
    const datos = {};
  if (camposDinamicosContainer) {
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

    const grids = camposDinamicosContainer.querySelectorAll('.grid-container');
    grids.forEach(grid => {
      const gridName = grid.dataset.name;
      const rows = grid.querySelectorAll('.grid-row');
      const gridData = [];

      const tipo = state.tiposSolicitud.find(t => t.id === parseInt(tipoSolicitudId, 10));
      const campoDef = tipo ? tipo.campos.find(c => c.name === gridName) : null;
      const customRowLabel = campoDef ? campoDef.row_label : null;
      const isFixedGrid = campoDef ? (campoDef.type === 'fixed_grid' || campoDef.type === 'fixed_grid_dynamic_cols' || campoDef.type === 'fixed_grid_fixed_cols') : false;

      rows.forEach(row => {
        const rowData = {};
        let hasAnyValue = false;

        const labelInput = row.querySelector('.grid-cell-label-input');
        if (labelInput) {
          rowData[customRowLabel || 'Descripción / Fila'] = labelInput.value;
        }

        const inputs = row.querySelectorAll('.grid-cell-input');
        inputs.forEach(input => {
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

        if (labelInput || isFixedGrid || hasAnyValue) {
          gridData.push(rowData);
        }
      });

      datos[gridName] = gridData;
    });
  }

  const tipo = state.tiposSolicitud.find(t => t.id === parseInt(tipoSolicitudId, 10));
  if (enviar && tipo) {
    const containerToClean = camposDinamicosContainer || document.getElementById('campos-dinamicos-container');
    let formValido = true;
    if (containerToClean) {
      containerToClean.querySelectorAll('.is-invalid').forEach(el => {
        el.classList.remove('is-invalid');
      });
      containerToClean.querySelectorAll('.text-list-container.is-invalid').forEach(el => {
        el.classList.remove('is-invalid');
      });
      containerToClean.querySelectorAll('.validation-feedback').forEach(el => {
        el.remove();
      });

      const inputs = containerToClean.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        if (typeof input.validarCampo === 'function') {
          const ok = input.validarCampo();
          if (!ok) {
            formValido = false;
          }
        }
      });
    }

    if (!formValido) {
      toast('Por favor corrige los errores en el formulario.');
      if (btnGuardarBorrador) btnGuardarBorrador.disabled = false;
      if (btnEnviarRevision) btnEnviarRevision.disabled = false;
      return;
    }

    let errorMsg = null;
    const firmantesRegistrados = new Set();
    const cedulasRegistradas = new Set();

    for (const campo of tipo.campos) {
      if (['title', 'subtitle', 'paragraph'].includes(campo.type)) continue;

      const valor = datos[campo.name];

      if (campo.required) {
        if (campo.type === 'date_range') {
          let parsed = { desde: '', hasta: '' };
          try {
            parsed = typeof valor === 'object' ? valor : JSON.parse(valor || '{}');
          } catch (e) { }
          if (!parsed.desde || parsed.desde.trim() === '' || !parsed.hasta || parsed.hasta.trim() === '') {
            errorMsg = `El rango de fechas de "${campo.label}" es obligatorio (requiere fecha Desde y Hasta).`;
            marcarCampoInvalido(campo);
            break;
          }
        } else if (campo.type === 'firmante' || campo.type === 'firmante_seccion') {
          let parsed = { nombre: '', cedula: '', cargo: '' };
          try {
            parsed = JSON.parse(valor || '{}');
          } catch (e) { }
          if (!parsed.nombre || parsed.nombre.trim() === '') {
            errorMsg = `El nombre de "${campo.label}" es obligatorio.`;
            marcarCampoInvalido(campo);
            break;
          }
          if (campo.recoger_cedula && (!parsed.cedula || parsed.cedula.trim() === '')) {
            errorMsg = `La cédula de "${campo.label}" es obligatoria.`;
            marcarCampoInvalido(campo);
            break;
          }
          if (campo.recoger_cargo && (!parsed.cargo || parsed.cargo.trim() === '')) {
            errorMsg = `El cargo de "${campo.label}" es obligatorio.`;
            marcarCampoInvalido(campo);
            break;
          }
        } else if (campo.type === 'text_list' || campo.type === 'firmante_list') {
          if (!Array.isArray(valor) || valor.length === 0) {
            errorMsg = `El campo "${campo.label}" es obligatorio y requiere al menos una entrada.`;
            marcarCampoInvalido(campo);
            break;
          }
        } else if (['grid', 'fixed_grid', 'fixed_grid_dynamic_cols', 'fixed_grid_fixed_cols'].includes(campo.type)) {
          if (!Array.isArray(valor) || valor.length === 0) {
            errorMsg = `La tabla "${campo.label}" es obligatoria y requiere al menos una fila.`;
            const gridContainer = document.querySelector(`.grid-container[data-name="${campo.name}"]`);
            if (gridContainer) gridContainer.classList.add('is-invalid');
            break;
          }
        } else if (campo.type === 'checkbox') {
          if (valor !== 'X') {
            errorMsg = `Debe marcar la casilla de selección "${campo.label}".`;
            marcarCampoInvalido(campo);
            break;
          }
        } else {
          if (valor === undefined || valor === null || String(valor).trim() === '') {
            errorMsg = `El campo "${campo.label}" es obligatorio.`;
            marcarCampoInvalido(campo);
            break;
          }
        }
      }

      if (campo.type === 'text' && valor) {
        if (String(valor).length > 100) {
          errorMsg = `El campo "${campo.label}" no debe superar los 100 caracteres.`;
          marcarCampoInvalido(campo);
          break;
        }
      }
      if (campo.type === 'textarea' && valor) {
        if (String(valor).length > 500) {
          errorMsg = `El campo "${campo.label}" no debe superar los 500 caracteres (máximo un párrafo).`;
          marcarCampoInvalido(campo);
          break;
        }
      }
      if ((campo.type === 'text' || campo.type === 'textarea') && valor) {
        const safeTextRegex = /^[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;\-_!?/@]*$/;
        if (!safeTextRegex.test(String(valor))) {
          errorMsg = `El campo "${campo.label}" contiene caracteres no permitidos. Solo se admiten letras, números, espacios y signos básicos: .,():;-_!?/@`;
          marcarCampoInvalido(campo);
          break;
        }
      }
      if (campo.type === 'text_list' && Array.isArray(valor)) {
        let itemIndex = 0;
        for (const item of valor) {
          if (String(item).length > 100) {
            errorMsg = `Una de las entradas en "${campo.label}" no debe superar los 100 caracteres.`;
            marcarCampoInvalido(campo, null, itemIndex);
            break;
          }
          itemIndex++;
        }
        if (errorMsg) break;
      }

      if ((campo.type === 'firmante' || campo.type === 'firmante_seccion') && valor) {
        let parsed = { nombre: '', cedula: '', cargo: '' };
        try {
          parsed = JSON.parse(valor || '{}');
        } catch (e) { }
        if (parsed.nombre && parsed.nombre.trim() !== '') {
          const trimmedNombre = parsed.nombre.trim();
          const firmanteNameRegex = /^[a-zA-Z\s]*$/;
          if (!firmanteNameRegex.test(trimmedNombre)) {
            errorMsg = `El nombre de "${campo.label}" solo puede contener letras y espacios (sin eñes, tildes ni caracteres especiales).`;
            marcarCampoInvalido(campo);
            break;
          }
          const nombreNormalizado = trimmedNombre.toLowerCase().replace(/\s+/g, ' ');
          if (firmantesRegistrados.has(nombreNormalizado)) {
            errorMsg = `El firmante adicional "${trimmedNombre}" está duplicado en la solicitud.`;
            marcarCampoInvalido(campo);
            break;
          }
          firmantesRegistrados.add(nombreNormalizado);

          if (parsed.cedula && parsed.cedula.trim() !== '') {
            const cedulaNormalizada = parsed.cedula.trim();
            if (cedulasRegistradas.has(cedulaNormalizada)) {
              errorMsg = `El firmante adicional con cédula "${cedulaNormalizada}" está duplicado en la solicitud.`;
              marcarCampoInvalido(campo);
              break;
            }
            cedulasRegistradas.add(cedulaNormalizada);
          }
        }
      }

      if (campo.type === 'firmante_list' && Array.isArray(valor)) {
        let itemIndex = 0;
        for (const item of valor) {
          let parsed = { nombre: '', cedula: '', cargo: '' };
          try {
            parsed = JSON.parse(item || '{}');
          } catch (e) { }
          if (parsed.nombre && parsed.nombre.trim() !== '') {
            const trimmedNombre = parsed.nombre.trim();
            const firmanteNameRegex = /^[a-zA-Z\s]*$/;
            if (!firmanteNameRegex.test(trimmedNombre)) {
              errorMsg = `El nombre de uno de los firmantes en "${campo.label}" solo puede contener letras y espacios (sin eñes, tildes ni caracteres especiales).`;
              marcarCampoInvalido(campo, null, itemIndex);
              break;
            }
            const nombreNormalizado = trimmedNombre.toLowerCase().replace(/\s+/g, ' ');
            if (firmantesRegistrados.has(nombreNormalizado)) {
              errorMsg = `El firmante adicional "${trimmedNombre}" está duplicado en la solicitud.`;
              marcarCampoInvalido(campo, null, itemIndex);
              break;
            }
            firmantesRegistrados.add(nombreNormalizado);

            if (parsed.cedula && parsed.cedula.trim() !== '') {
              const cedulaNormalizada = parsed.cedula.trim();
              if (cedulasRegistradas.has(cedulaNormalizada)) {
                errorMsg = `El firmante adicional con cédula "${cedulaNormalizada}" está duplicado en la solicitud.`;
                marcarCampoInvalido(campo, null, itemIndex);
                break;
              }
              cedulasRegistradas.add(cedulaNormalizada);
            }
          }
          itemIndex++;
        }
        if (errorMsg) break;
      }

      const idRegex = /^\d{10}$/;
      if ((campo.type === 'firmante' || campo.type === 'firmante_seccion') && campo.recoger_cedula && valor) {
        let parsed = { nombre: '', cedula: '', cargo: '' };
        try {
          parsed = JSON.parse(valor || '{}');
        } catch (e) { }
        if (parsed.cedula && parsed.cedula.trim() !== '') {
          if (!idRegex.test(parsed.cedula.trim())) {
            errorMsg = `La cédula de "${campo.label}" debe contener exactamente 10 dígitos numéricos.`;
            marcarCampoInvalido(campo);
            break;
          }
        }
      }

      if (campo.type === 'firmante_list' && campo.recoger_cedula && Array.isArray(valor)) {
        let itemIndex = 0;
        for (const item of valor) {
          let parsed = { nombre: '', cedula: '', cargo: '' };
          try {
            parsed = JSON.parse(item || '{}');
          } catch (e) { }
          if (parsed.cedula && parsed.cedula.trim() !== '') {
            if (!idRegex.test(parsed.cedula.trim())) {
              errorMsg = `La cédula de uno de los firmantes en "${campo.label}" debe contener exactamente 10 dígitos numéricos.`;
              marcarCampoInvalido(campo, null, itemIndex);
              break;
            }
          }
          itemIndex++;
        }
        if (errorMsg) break;
      }

      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        const valorTrim = String(valor).trim();
        if (campo.type === 'ip') {
          const ipRegex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
          if (!ipRegex.test(valorTrim)) {
            errorMsg = `El campo "${campo.label}" debe ser una dirección IP válida (ej. 192.168.1.10).`;
            marcarCampoInvalido(campo);
            break;
          }
        }
        if (campo.type === 'mac') {
          const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;
          if (!macRegex.test(valorTrim)) {
            errorMsg = `El campo "${campo.label}" debe ser una dirección MAC válida (ej. AA:BB:CC:DD:EE:FF).`;
            marcarCampoInvalido(campo);
            break;
          }
        }
        if (campo.type === 'time') {
          const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
          if (!timeRegex.test(valorTrim)) {
            errorMsg = `El campo "${campo.label}" debe ser una hora válida en formato de 24 horas (HH:MM).`;
            marcarCampoInvalido(campo);
            break;
          }
        }
      }

      if (['grid', 'fixed_grid', 'fixed_grid_dynamic_cols', 'fixed_grid_fixed_cols'].includes(campo.type) && Array.isArray(valor)) {
        let rowIndex = 0;
        for (const row of valor) {
          let columns = [...(campo.columns || [])];
          if (campo.type === 'fixed_grid_dynamic_cols') {
            const predefinedColNames = columns.map(col => typeof col === 'object' ? col.name : col);
            const rowLabelKey = campo.row_label || 'Descripción / Fila';
            Object.keys(row).forEach(key => {
              if (key !== rowLabelKey && key !== 'Descripción / Fila' && !predefinedColNames.includes(key)) {
                columns.push({ name: key, type: 'text', required: false });
              }
            });
          }
          for (const col of columns) {
            const colName = typeof col === 'object' ? col.name : col;
            const colType = typeof col === 'object' ? col.type : 'text';
            const isColRequired = (typeof col === 'object' ? (col.required || false) : false) || campo.required;
            const cellVal = row[colName];

            if (isColRequired) {
              if (colType === 'date_range') {
                let parsed = { desde: '', hasta: '' };
                try {
                  parsed = typeof cellVal === 'object' ? cellVal : JSON.parse(cellVal || '{}');
                } catch (e) { }
                if (!parsed.desde || parsed.desde.trim() === '' || !parsed.hasta || parsed.hasta.trim() === '') {
                  errorMsg = `El rango de fechas de la columna "${colName}" en la tabla "${campo.label}" es obligatorio (requiere fecha Desde y Hasta).`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              } else if (colType === 'firmante' || colType === 'firmante_seccion') {
                let parsed = { nombre: '', cedula: '', cargo: '' };
                try {
                  parsed = JSON.parse(cellVal || '{}');
                } catch (e) { }
                if (!parsed.nombre || parsed.nombre.trim() === '') {
                  errorMsg = `El nombre de la columna "${colName}" en la tabla "${campo.label}" es obligatorio.`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
                if (col.recoger_cedula && (!parsed.cedula || parsed.cedula.trim() === '')) {
                  errorMsg = `La cédula de la columna "${colName}" en la tabla "${campo.label}" es obligatoria.`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              } else {
                if (cellVal === undefined || cellVal === null || String(cellVal).trim() === '') {
                  errorMsg = `El campo de la columna "${colName}" en la tabla "${campo.label}" es obligatorio.`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              }
            }

            if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
              const cellValTrim = String(cellVal).trim();
              if (colType === 'text' && cellValTrim.length > 100) {
                errorMsg = `El valor en la columna "${colName}" de la tabla "${campo.label}" no debe superar los 100 caracteres.`;
                marcarCampoInvalido(campo, colName, rowIndex);
                break;
              }
              if (colType === 'textarea' && cellValTrim.length > 500) {
                errorMsg = `El valor en la columna "${colName}" de la tabla "${campo.label}" no debe superar los 500 caracteres.`;
                marcarCampoInvalido(campo, colName, rowIndex);
                break;
              }
              if ((colType === 'text' || colType === 'textarea') && cellValTrim) {
                const safeTextRegex = /^[a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s.,():;\-_!?/@]*$/;
                if (!safeTextRegex.test(cellValTrim)) {
                  errorMsg = `El valor en la columna "${colName}" de la tabla "${campo.label}" contiene caracteres no permitidos. Solo se admiten letras, números, espacios y signos básicos: .,():;-_!?/@`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              }
              if (colType === 'identificacion' && !idRegex.test(cellValTrim)) {
                errorMsg = `La identificación en la columna "${colName}" de la tabla "${campo.label}" debe contener exactamente 10 dígitos numéricos.`;
                marcarCampoInvalido(campo, colName, rowIndex);
                break;
              }
              if (colType === 'email') {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(cellValTrim)) {
                  errorMsg = `El valor "${cellVal}" en la columna "${colName}" de la tabla "${campo.label}" no es un correo electrónico válido.`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              }
              if (colType === 'ip') {
                const ipRegex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
                if (!ipRegex.test(cellValTrim)) {
                  errorMsg = `El valor "${cellVal}" en la columna "${colName}" de la tabla "${campo.label}" debe ser una dirección IP válida (ej. 192.168.1.10).`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              }
              if (colType === 'mac') {
                const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;
                if (!macRegex.test(cellValTrim)) {
                  errorMsg = `El valor "${cellVal}" en la columna "${colName}" de la tabla "${campo.label}" debe ser una dirección MAC válida (ej. AA:BB:CC:DD:EE:FF).`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              }
              if (colType === 'time') {
                const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
                if (!timeRegex.test(cellValTrim)) {
                  errorMsg = `El valor "${cellVal}" en la columna "${colName}" de la tabla "${campo.label}" debe ser una hora válida en formato de 24 horas (HH:MM).`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
              }
              if (colType === 'date_range') {
                let parsed = { desde: '', hasta: '' };
                try {
                  parsed = typeof cellVal === 'object' ? cellVal : JSON.parse(cellVal);
                } catch (e) { }
                if ((parsed.desde && !parsed.hasta) || (!parsed.desde && parsed.hasta)) {
                  errorMsg = `En la columna "${colName}" de la tabla "${campo.label}", debe ingresar tanto la fecha "Desde" como la fecha "Hasta".`;
                  marcarCampoInvalido(campo, colName, rowIndex);
                  break;
                }
                if (parsed.desde && parsed.hasta) {
                  if (parsed.hasta < parsed.desde) {
                    errorMsg = `En la columna "${colName}" de la tabla "${campo.label}", la fecha "Hasta" no puede ser anterior a la fecha "Desde".`;
                    marcarCampoInvalido(campo, colName, rowIndex);
                    break;
                  }
                }
              }
              if (colType === 'firmante' || colType === 'firmante_seccion') {
                let parsed = { nombre: '', cedula: '', cargo: '' };
                try {
                  parsed = JSON.parse(cellVal || '{}');
                } catch (e) { }
                if (parsed.nombre && parsed.nombre.trim() !== '') {
                  const trimmedNombre = parsed.nombre.trim();
                  const firmanteNameRegex = /^[a-zA-Z\s]*$/;
                  if (!firmanteNameRegex.test(trimmedNombre)) {
                    errorMsg = `El nombre del firmante en la columna "${colName}" de la tabla "${campo.label}" solo puede contener letras y espacios (sin eñes, tildes ni caracteres especiales).`;
                    marcarCampoInvalido(campo, colName, rowIndex);
                    break;
                  }
                  const nombreNormalizado = trimmedNombre.toLowerCase().replace(/\s+/g, ' ');
                  if (firmantesRegistrados.has(nombreNormalizado)) {
                    errorMsg = `El firmante adicional "${trimmedNombre}" está duplicado en la solicitud.`;
                    marcarCampoInvalido(campo, colName, rowIndex);
                    break;
                  }
                  firmantesRegistrados.add(nombreNormalizado);

                  if (parsed.cedula && parsed.cedula.trim() !== '') {
                    const cedulaNormalizada = parsed.cedula.trim();
                    if (cedulasRegistradas.has(cedulaNormalizada)) {
                      errorMsg = `El firmante adicional con cédula "${cedulaNormalizada}" está duplicado en la solicitud.`;
                      marcarCampoInvalido(campo, colName, rowIndex);
                      break;
                    }
                    cedulasRegistradas.add(cedulaNormalizada);

                    if (!idRegex.test(cedulaNormalizada)) {
                      errorMsg = `La cédula del firmante en la columna "${colName}" de la tabla "${campo.label}" debe tener exactamente 10 dígitos numéricos.`;
                      marcarCampoInvalido(campo, colName, rowIndex);
                      break;
                    }
                  }
                }
              }
            }
          }
          if (errorMsg) break;
          rowIndex++;
        }
        if (errorMsg) break;
      }
    }

    if (errorMsg) {
      toast(errorMsg);
      if (btnGuardarBorrador) btnGuardarBorrador.disabled = false;
      if (btnEnviarRevision) btnEnviarRevision.disabled = false;
      return;
    }
  }

  const payload = {
    tipo_solicitud_id: parseInt(tipoSolicitudId, 10),
    datos,
    enviar
  };

    let response;
    if (solicitudId) {
      response = await fetch(`/api/solicitudes/${solicitudId}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
    } else {
      response = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error al guardar la solicitud.');
    }

    const { cerrarModal } = await import('./modals.js');
    cerrarModal('modal-solicitud');
    
    const { cargarBandeja } = await import('./app.js');
    await cargarBandeja(true);
  } catch (error) {
    toast(error.message);
  } finally {
    isSubmitting = false;
    if (btnGuardarBorrador) btnGuardarBorrador.disabled = false;
    if (btnEnviarRevision) btnEnviarRevision.disabled = false;
  }
}

function aplicarFiltroEntrada(input, regexNoPermitido, maxLength = null, onValidInput = null) {
  if (!input) return;

  const handler = (e) => {
    let val = input.value;
    
    let canGetSelection = false;
    try {
      canGetSelection = typeof input.selectionStart === 'number';
    } catch (err) {}

    const selectionStart = canGetSelection ? input.selectionStart : null;
    
    regexNoPermitido.lastIndex = 0;
    let cleaned = val.replace(regexNoPermitido, '');
    
    if (maxLength !== null && cleaned.length > maxLength) {
      cleaned = cleaned.slice(0, maxLength);
    }
    
    if (val !== cleaned) {
      input.value = cleaned;
      if (canGetSelection && selectionStart !== null) {
        const diff = val.length - cleaned.length;
        const newPos = Math.max(0, selectionStart - diff);
        input.setSelectionRange(newPos, newPos);
      }
    }
    
    if (onValidInput) {
      onValidInput(e);
    }
  };

  input.addEventListener('input', handler);
  
  input.addEventListener('keypress', (e) => {
    if (e.key.length === 1) {
      regexNoPermitido.lastIndex = 0;
      if (regexNoPermitido.test(e.key)) {
        e.preventDefault();
      }
    }
  });
}

export function registrarValidacionTiempoReal(input, tipo, required, label, maxLength = null) {
  if (!input) return;

  const ipRegex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;
  const idRegex = /^\d{10}$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

  const validar = () => {
    let val = input.value.trim();
    let error = null;

    if (required && val === '') {
      error = `El campo "${label}" es obligatorio.`;
    } else if (val !== '') {
      if (tipo === 'ip' && !ipRegex.test(val)) {
        error = `El campo "${label}" debe ser una dirección IP válida (ej. 192.168.1.10).`;
      } else if (tipo === 'mac' && !macRegex.test(val)) {
        error = `El campo "${label}" debe ser una dirección MAC válida (ej. AA:BB:CC:DD:EE:FF).`;
      } else if (tipo === 'identificacion' && !idRegex.test(val)) {
        error = `El campo "${label}" debe contener exactamente 10 dígitos numéricos.`;
      } else if (tipo === 'email' && !emailRegex.test(val)) {
        error = `El campo "${label}" no es un correo electrónico válido.`;
      } else if (tipo === 'time' && !timeRegex.test(val)) {
        error = `El campo "${label}" debe ser una hora válida (HH:MM).`;
      } else if (maxLength !== null && val.length > maxLength) {
        error = `El campo "${label}" no debe superar los ${maxLength} caracteres.`;
      }
    }

    // Buscar o inyectar feedback
    let feedback = input.parentNode.querySelector('.validation-feedback');
    if (error) {
      input.classList.add('is-invalid');
      if (!feedback) {
        feedback = document.createElement('div');
        feedback.className = 'validation-feedback';
        input.parentNode.insertBefore(feedback, input.nextSibling);
      }
      feedback.textContent = error;
    } else {
      input.classList.remove('is-invalid');
      if (feedback) {
        feedback.remove();
      }
    }
    return !error;
  };

  input.addEventListener('blur', validar);
  input.addEventListener('input', () => {
    if (input.classList.contains('is-invalid')) {
      validar();
    }
  });

  input.validarCampo = validar;
}
