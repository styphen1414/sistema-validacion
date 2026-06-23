const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { generarCodigoSeguimiento } = require('./dbHelper');

function generarReportePDFInternal(doc, solicitud, aprobaciones, directorSigner) {
  // local variables and compatibility layer
  const apRes = { rows: aprobaciones };
  const fecha = new Date(solicitud.fecha_creacion);
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();
  const codigoSeguimiento = generarCodigoSeguimiento(solicitud);


  // DISEÑO DEL PDF Y CONFIGURACIONES
  const logoPath = path.join(__dirname, 'public', 'logo.png');

  // Funciones auxiliares locales para maquetación limpia
  const renderSectionHeader = (titleText) => {
    doc.x = 50;
    doc.moveDown(1);
    const startY = doc.y;
    
    // Dibujar barra vertical de acento (Azul Marino)
    doc.rect(50, startY, 4, 14).fill('#1E3A8A');
    
    // Dibujar texto del título
    doc.fillColor('#1E3A8A')
       .font('Helvetica-Bold')
       .fontSize(11)
       .text(titleText.toUpperCase(), 60, startY + 1.5);
       
    doc.y = startY + 22; // Margen inferior consistente
  };

  const checkSpace = (heightNeeded) => {
    if (doc.y + heightNeeded > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      return true;
    }
    return false;
  };

  // Encabezado Ejecutivo
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 40, { fit: [160, 50] });
  } else {
    // Fallback corporativo elegante en caso de ausencia física del logo
    doc.fillColor('#1E3A8A').font('Helvetica-Bold').fontSize(12).text('MINISTERIO DE SALUD PÚBLICA', 50, 40);
    doc.fillColor('#64748B').font('Helvetica').fontSize(8).text('DIRECCIÓN DE TECNOLOGÍAS DE LA INFORMACIÓN', 50, 55);
  }

  // Títulos a la derecha del encabezado (Alineación y espaciado adaptables para evitar superposiciones)
  doc.fillColor('#1E3A8A')
     .font('Helvetica-Bold')
     .fontSize(11)
     .text('SISTEMA DE VALIDACIÓN TÉCNICA (SVT)', 230, 36, { align: 'right', width: 332 });

  doc.fillColor('#475569')
     .font('Helvetica')
     .fontSize(8)
     .text((solicitud.tipo_nombre || '').toUpperCase(), 230, doc.y + 2, { align: 'right', width: 332 });

  doc.fillColor('#0EA5E9')
     .font('Helvetica-Bold')
     .fontSize(9)
     .text(`Solicitud: ${codigoSeguimiento}`, 230, doc.y + 2, { align: 'right', width: 332 });

  const logoBottom = 40 + 50;
  const headerBottomY = Math.max(logoBottom, doc.y) + 8;

  // Línea divisoria de cabecera (Estilo doble ejecutivo)
  doc.lineWidth(1.5).strokeColor('#1E3A8A').moveTo(50, headerBottomY).lineTo(562, headerBottomY).stroke();
  doc.lineWidth(0.5).strokeColor('#0EA5E9').moveTo(50, headerBottomY + 3).lineTo(562, headerBottomY + 3).stroke();

  doc.y = headerBottomY + 15;

  // 1. INFORMACIÓN GENERAL DE LA SOLICITUD
  renderSectionHeader('1. INFORMACIÓN GENERAL DE LA SOLICITUD');

  const fechaCreacionStr = new Date(solicitud.fecha_creacion).toLocaleString('es-ES');
  const cardY = doc.y;

  // Calcular alturas de columna de forma dinámica para evitar superposiciones
  doc.fontSize(8.5);
  const heightNumSol = doc.heightOfString(codigoSeguimiento, { width: 230 });
  const heightSol = doc.heightOfString(`${solicitud.solicitante_nombre} (C.I. ${solicitud.solicitante_cedula || 'N/A'})`, { width: 230 });
  const heightCargo = doc.heightOfString(solicitud.solicitante_cargo || 'N/A', { width: 230 });
  const totalLeftHeight = 8 + 10 + heightNumSol + 6 + 10 + heightSol + 6 + 10 + heightCargo + 8;

  const heightProyecto = doc.heightOfString(solicitud.solicitante_direccion_proyecto || 'N/A', { width: 230 });
  const heightCorreo = doc.heightOfString(solicitud.solicitante_correo || 'N/A', { width: 230 });
  const heightFecha = doc.heightOfString(fechaCreacionStr, { width: 230 });
  const totalRightHeight = 8 + 10 + heightProyecto + 6 + 10 + heightCorreo + 6 + 10 + heightFecha + 8;

  const cardHeight = Math.max(85, totalLeftHeight, totalRightHeight);

  // Dibujar tarjeta contenedora de datos generales
  doc.roundedRect(50, cardY, 512, cardHeight, 4).fill('#F8FAFC');
  doc.lineWidth(1).strokeColor('#E2E8F0').roundedRect(50, cardY, 512, cardHeight, 4).stroke();

  // Renderizar Columna Izquierda con flujo relativo
  doc.x = 65;
  let leftY = cardY + 8;

  doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Número de Solicitud:', 65, leftY);
  leftY = doc.y + 2;
  doc.fillColor('#334155').font('Helvetica').text(codigoSeguimiento, 65, leftY, { width: 230 });
  leftY = doc.y + 6;

  doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Solicitante:', 65, leftY);
  leftY = doc.y + 2;
  doc.fillColor('#334155').font('Helvetica').text(`${solicitud.solicitante_nombre} (C.I. ${solicitud.solicitante_cedula || 'N/A'})`, 65, leftY, { width: 230 });
  leftY = doc.y + 6;

  doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Cargo:', 65, leftY);
  leftY = doc.y + 2;
  doc.fillColor('#334155').font('Helvetica').text(solicitud.solicitante_cargo || 'N/A', 65, leftY, { width: 230 });

  // Renderizar Columna Derecha con flujo relativo
  doc.x = 310;
  let rightY = cardY + 8;

  doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Dirección / Proyecto al que pertenece:', 310, rightY);
  rightY = doc.y + 2;
  doc.fillColor('#334155').font('Helvetica').text(solicitud.solicitante_direccion_proyecto || 'N/A', 310, rightY, { width: 230 });
  rightY = doc.y + 6;

  doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Correo Electrónico:', 310, rightY);
  rightY = doc.y + 2;
  doc.fillColor('#334155').font('Helvetica').text(solicitud.solicitante_correo || 'N/A', 310, rightY, { width: 230 });
  rightY = doc.y + 6;

  doc.fillColor('#1E3A8A').font('Helvetica-Bold').text('Fecha de Registro:', 310, rightY);
  rightY = doc.y + 2;
  doc.fillColor('#334155').font('Helvetica').text(fechaCreacionStr, 310, rightY, { width: 230 });

  doc.y = cardY + cardHeight + 10;

  // 2. DETALLES TÉCNICOS INGRESADOS
  renderSectionHeader('2. DETALLES TÉCNICOS INGRESADOS');

  const campos = solicitud.campos;
  const datos = solicitud.datos;
  
  // Función auxiliar para formatear los valores de firmantes dinámicos compuestos en el cuerpo del PDF
  const formatearValorFirmanteBackend = (val) => {
    const v = String(val || '').trim();
    if (!v) return 'N/A';
    try {
      const parsed = JSON.parse(v);
      const parts = [];
      if (parsed.nombre) parts.push(parsed.nombre);
      if (parsed.cedula) parts.push(`C.I. ${parsed.cedula}`);
      if (parsed.cargo) parts.push(parsed.cargo);
      return parts.length > 0 ? parts.join(' - ') : 'N/A';
    } catch (e) {
      return v;
    }
  };

  doc.fontSize(9.5);
  campos.forEach(campo => {
    if (campo.type === 'firmante_seccion' || campo.type === 'info_no_pdf') return; // Se omite en los detalles técnicos del PDF
    doc.x = 50; // Asegurar alineación izquierda reseteando la posición x
    if (campo.type === 'title') {
      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').fontSize(10.5).text(campo.label.toUpperCase());
      // Dibujar una línea sutil bajo el título dinámico
      doc.lineWidth(1).strokeColor('#BAE6FD').moveTo(50, doc.y + 2).lineTo(562, doc.y + 2).stroke();
      doc.font('Helvetica'); 
      doc.moveDown(0.6);
      doc.fontSize(9.5); 
    } else if (campo.type === 'subtitle') {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').fontSize(9.5).text(campo.label);
      doc.font('Helvetica');
      doc.moveDown(0.3);
      doc.fontSize(9.5);
    } else if (campo.type === 'paragraph') {
      doc.moveDown(0.3);
      doc.font('Helvetica-Oblique').fillColor('#475569').fontSize(8.5).text(campo.label);
      doc.font('Helvetica');
      doc.moveDown(0.4);
      doc.fontSize(9.5);
    } else if (campo.type === 'grid' || campo.type === 'fixed_grid' || campo.type === 'fixed_grid_dynamic_cols' || campo.type === 'fixed_grid_fixed_cols') {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}:`);
      doc.moveDown(0.3);

      const gridData = datos[campo.name];
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
        // --- ALGORITMO DE ANCHOS DINÁMICOS DE COLUMNAS ---
        const totalTableWidth = 512;
        const colWidths = [];
        let remainingWidth = totalTableWidth;
        let flexibleColsCount = 0;

        columns.forEach((col, idx) => {
          const colType = typeof col === 'object' ? col.type : 'text';
          const colName = typeof col === 'object' ? col.name : col;
          
          if (colType === 'checkbox') {
            colWidths[idx] = 45;
            remainingWidth -= 45;
          } else if (colType === 'date') {
            colWidths[idx] = 70;
            remainingWidth -= 70;
          } else if (colType === 'date_range') {
            colWidths[idx] = 125;
            remainingWidth -= 125;
          } else if (colType === 'identificacion') {
            colWidths[idx] = 75;
            remainingWidth -= 75;
          } else if (colType === 'firmante' || colType === 'firmante_seccion') {
            colWidths[idx] = 110;
            remainingWidth -= 110;
          } else if (colType === 'time') {
            colWidths[idx] = 50;
            remainingWidth -= 50;
          } else if (colType === 'ip') {
            colWidths[idx] = 85;
            remainingWidth -= 85;
          } else if (colType === 'mac') {
            colWidths[idx] = 95;
            remainingWidth -= 95;
          } else if (colName === 'Descripción / Fila' || (campo.row_label && colName === campo.row_label)) {
            colWidths[idx] = 120;
            flexibleColsCount++;
          } else {
            colWidths[idx] = null;
            flexibleColsCount++;
          }
        });

        if (flexibleColsCount > 0) {
          const flexWidth = Math.max(50, remainingWidth / flexibleColsCount);
          columns.forEach((col, idx) => {
            if (colWidths[idx] === null) {
              colWidths[idx] = flexWidth;
            } else if (typeof col === 'object' && (col.name === 'Descripción / Fila' || (campo.row_label && col.name === campo.row_label))) {
              colWidths[idx] = flexWidth;
            }
          });
        }

        // Normalizar
        const sumWidths = colWidths.reduce((a, b) => a + b, 0);
        const scale = totalTableWidth / sumWidths;
        colWidths.forEach((w, idx) => {
          colWidths[idx] = w * scale;
        });

        const startY = doc.y;

        // Dibujar fondo de cabecera en azul marino ejecutivo
        doc.rect(50, startY, 512, 18).fill('#1E3A8A');
        
        // Línea horizontal superior de la cabecera
        doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, startY).lineTo(562, startY).stroke();

        // Dibujar textos de cabecera y bordes verticales de cabecera
        let headerX = 50;
        doc.lineWidth(0.5).strokeColor('#CBD5E1');
        columns.forEach((col, index) => {
          const colName = typeof col === 'object' ? col.name : col;
          const colType = typeof col === 'object' ? col.type : 'text';
          const colW = colWidths[index];

          // Borde vertical izquierdo de la celda
          doc.moveTo(headerX, startY).lineTo(headerX, startY + 18).stroke();

          // Texto en color blanco
          doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(8)
            .text(colName, headerX + 5, startY + 5, {
              width: colW - 10,
              height: 10,
              ellipsis: true,
              align: colType === 'checkbox' ? 'center' : 'left'
            });
          headerX += colW;
        });
        doc.moveTo(562, startY).lineTo(562, startY + 18).stroke();

        doc.y = startY + 18;

        // Dibujar filas
        gridData.forEach(rowVal => {
          // Calcular altura de la fila
          let maxCellHeight = 10;
          columns.forEach((col, idx) => {
            const colName = typeof col === 'object' ? col.name : col;
            const colType = typeof col === 'object' ? col.type : 'text';
            let val = rowVal[colName];
            if (val === undefined) {
              if (colName === campo.row_label) {
                val = rowVal['Descripción / Fila'];
              } else if (colName === 'Descripción / Fila') {
                val = campo.row_label ? rowVal[campo.row_label] : undefined;
              }
            }
            val = val || '';
            if (colType === 'firmante' || colType === 'firmante_seccion') {
              val = formatearValorFirmanteBackend(val);
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
              val = formattedVal;
            }
            const cellHeight = doc.heightOfString(String(val), {
              width: colWidths[idx] - 10,
              fontSize: 8
            });
            if (cellHeight > maxCellHeight) {
              maxCellHeight = cellHeight;
            }
          });

          const rowHeight = maxCellHeight + 10;
          const rowY = doc.y;

          // Salto de página si no cabe
          if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom) {
            // Dibujar línea inferior antes del salto de página
            doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, rowY).lineTo(562, rowY).stroke();
            doc.addPage();
            
            // Redibuja cabecera azul marino en nueva página
            const newStartY = doc.y;
            doc.rect(50, newStartY, 512, 18).fill('#1E3A8A');
            // Línea superior de cabecera
            doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, newStartY).lineTo(562, newStartY).stroke();
            
            let freshX = 50;
            columns.forEach((col, index) => {
              const colName = typeof col === 'object' ? col.name : col;
              const colType = typeof col === 'object' ? col.type : 'text';
              const colW = colWidths[index];
              doc.moveTo(freshX, newStartY).lineTo(freshX, newStartY + 18).stroke();
              doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(8)
                .text(colName, freshX + 5, newStartY + 5, {
                  width: colW - 10,
                  height: 10,
                  ellipsis: true,
                  align: colType === 'checkbox' ? 'center' : 'left'
                });
              freshX += colW;
            });
            doc.moveTo(562, newStartY).lineTo(562, newStartY + 18).stroke();
            doc.y = newStartY + 18;
          }

          const currentY = doc.y;
          // Línea horizontal superior
          doc.lineWidth(0.5).strokeColor('#CBD5E1').moveTo(50, currentY).lineTo(562, currentY).stroke();

          // Dibujar celdas y bordes verticales de la fila
          let cellX = 50;
          columns.forEach((col, index) => {
            const colName = typeof col === 'object' ? col.name : col;
            const colType = typeof col === 'object' ? col.type : 'text';
            const colW = colWidths[index];
            let val = rowVal[colName];
            if (val === undefined) {
              if (colName === campo.row_label) {
                val = rowVal['Descripción / Fila'];
              } else if (colName === 'Descripción / Fila') {
                val = campo.row_label ? rowVal[campo.row_label] : undefined;
              }
            }
            val = val || '';
            if (colType === 'firmante' || colType === 'firmante_seccion') {
              val = formatearValorFirmanteBackend(val);
            } else if (colType === 'time' && val) {
              const parts = String(val).split(':');
              if (parts.length >= 2) {
                val = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
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
              val = formattedVal;
            }
            const isCheckbox = colType === 'checkbox';

            // Borde vertical izquierdo
            doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();

            doc.font(isCheckbox && val === 'X' ? 'Helvetica-Bold' : 'Helvetica')
              .fillColor(isCheckbox && val === 'X' ? '#10B981' : '#334155') // Verde si está chequeado
              .fontSize(8)
              .text(String(val), cellX + 5, currentY + 5, {
                width: colW - 10,
                align: isCheckbox ? 'center' : 'left'
              });

            cellX += colW;
          });
          doc.moveTo(562, currentY).lineTo(562, currentY + rowHeight).stroke();

          doc.y = currentY + rowHeight;
        });

        // Dibujar línea inferior final de la tabla
        doc.lineWidth(1).strokeColor('#CBD5E1').moveTo(50, doc.y).lineTo(562, doc.y).stroke();
        doc.moveDown(0.5);
        doc.font('Helvetica');
      } else {
        doc.font('Helvetica-Oblique').fillColor('#64748B').fontSize(9).text('Sin registros ingresados');
        doc.moveDown(0.5);
        doc.font('Helvetica');
      }
    } else if (campo.type === 'firmante') {
      const rawVal = datos[campo.name];
      const valor = formatearValorFirmanteBackend(rawVal);
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
        .font('Helvetica').fillColor('#334155').text(`${valor}`)
        .moveDown(0.5);
    } else if (campo.type === 'firmante_list') {
      const listData = datos[campo.name];
      const valor = (Array.isArray(listData) && listData.length > 0)
        ? listData.map(v => formatearValorFirmanteBackend(v)).join(', ')
        : 'N/A';
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
        .font('Helvetica').fillColor('#334155').text(`${valor}`)
        .moveDown(0.5);
    } else if (campo.type === 'text_list') {
      const listData = datos[campo.name];
      const valor = (Array.isArray(listData) && listData.length > 0) ? listData.join(', ') : 'N/A';
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
        .font('Helvetica').fillColor('#334155').text(`${valor}`)
        .moveDown(0.5);
    } else if (campo.type === 'checkbox') {
      const rawVal = datos[campo.name];
      const isChecked = (rawVal === 'X' || rawVal === true || rawVal === 'true');
      const displayVal = isChecked ? '[X]' : '[ ]';
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
        .font('Helvetica-Bold').fillColor(isChecked ? '#10B981' : '#64748B').text(`${displayVal}`)
        .moveDown(0.5);
    } else if (campo.type === 'date_range') {
      const rawVal = datos[campo.name];
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
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
        .font('Helvetica').fillColor('#334155').text(`${valor}`)
        .moveDown(0.5);
    } else {
      let valor = datos[campo.name] !== undefined && datos[campo.name] !== null && datos[campo.name] !== '' ? datos[campo.name] : 'N/A';
      if (campo.type === 'time' && valor !== 'N/A') {
        const parts = String(valor).split(':');
        if (parts.length >= 2) {
          valor = `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
      }
      doc.font('Helvetica-Bold').fillColor('#1E3A8A').text(`${campo.label}: `, { continued: true })
        .font('Helvetica').fillColor('#334155').text(`${valor}`)
        .moveDown(0.5);
    }
  });

  doc.moveDown(1);
  
  let sectionNum = 3; 

   // Recopilar firmantes adicionales dinámicos
  const firmantesAdicionales = []; 
  
  // Función auxiliar para extraer y parsear firmante de forma segura
  const registrarFirmanteAdicional = (valorStr, rol = 'Firma de Responsabilidad') => {
    const val = String(valorStr || '').trim();
    if (!val) return;
    
    let nombre = val;
    let cedula = '';
    let cargo = '';
    
    try {
      const parsed = JSON.parse(val);
      nombre = parsed.nombre || '';
      cedula = parsed.cedula || '';
      cargo = parsed.cargo || '';
    } catch (e) {
      nombre = val;
    }
    
    if (!nombre) return;
    
    if (!firmantesAdicionales.some(f => f.nombre === nombre)) {
      firmantesAdicionales.push({ nombre, cedula, cargo, rol });
    }
  };

  campos.forEach(campo => {
    const valor = datos[campo.name];
    if (!valor) return;

    if (campo.type === 'firmante') {
      registrarFirmanteAdicional(valor, 'Firma de Responsabilidad');
    } else if (campo.type === 'firmante_seccion') {
      registrarFirmanteAdicional(valor, campo.label);
    } else if (campo.type === 'firmante_list') {
      if (Array.isArray(valor)) {
        valor.forEach(v => {
          registrarFirmanteAdicional(v, 'Firma de Responsabilidad');
        });
      }
    } else if (campo.type === 'grid' || campo.type === 'fixed_grid') {
      const columns = campo.columns || [];
      const firmanteCols = columns.filter(col => typeof col === 'object' && col.type === 'firmante').map(col => col.name);
      const firmanteSecCols = columns.filter(col => typeof col === 'object' && col.type === 'firmante_seccion').map(col => col.name);
      
      if (Array.isArray(valor)) {
        valor.forEach(row => {
          firmanteCols.forEach(colName => {
            registrarFirmanteAdicional(row[colName], 'Firma de Responsabilidad');
          });
          firmanteSecCols.forEach(colName => {
            registrarFirmanteAdicional(row[colName], colName);
          });
        });
      }
    }
  });

  // --- SECCIÓN 3: REVISIÓN Y APROBACIÓN TÉCNICA ---
  const tieneSeguridad = (solicitud.areas_validadoras || []).includes('seguridad');
  const tieneGibdd = (solicitud.areas_validadoras || []).includes('gibdd');
  const tieneGiitrc = (solicitud.areas_validadoras || []).includes('giitrc');

  if (tieneSeguridad || tieneGibdd || tieneGiitrc) {
    checkSpace(120);
    const numStrT = `${sectionNum}. REVISIÓN Y APROBACIÓN TÉCNICA`;
    sectionNum++;
    renderSectionHeader(numStrT);

    // Agrupar los datos de revisión técnica
    const areasTecnicas = [];
    if (tieneSeguridad) {
      const ap = apRes.rows.find(a => a.area === 'seguridad');
      areasTecnicas.push({
        sigla: 'GISICS',
        nombreLargo: 'Gestión Interna de Seguridad Informática y Calidad de Software',
        ap: ap
      });
    }
    if (tieneGibdd) {
      const ap = apRes.rows.find(a => a.area === 'gibdd');
      areasTecnicas.push({
        sigla: 'GIBDD',
        nombreLargo: 'Gestión Interna de Base de Datos',
        ap: ap
      });
    }
    if (tieneGiitrc) {
      const ap = apRes.rows.find(a => a.area === 'giitrc');
      areasTecnicas.push({
        sigla: 'GIITRC',
        nombreLargo: 'Gestión Interna de Infraestructura',
        ap: ap
      });
    }

    areasTecnicas.forEach(item => {
      const ap = item.ap;
      const tecNombre = ap ? (ap.tecnico_nombre || 'N/A') : 'N/A';
      const tecCargo = ap ? (ap.tecnico_cargo || 'N/A') : 'N/A';
      const tecFecha = ap && ap.fecha ? new Date(ap.fecha).toLocaleDateString('es-ES') : 'N/A';
      const tieneObs = ap && ap.observacion ? true : false;
      const obsTexto = ap && ap.observacion ? ap.observacion : 'Sin observaciones';
      const estadoTexto = tieneObs ? 'Aprobado con Observación' : 'Aprobado';

      const obsHeight = doc.heightOfString(obsTexto, { width: 235, fontSize: 8 });

      // Calcular altura de la columna izquierda de forma dinámica
      const revisorHeight = doc.heightOfString(`Revisor: ${tecNombre}`, { width: 230, fontSize: 8 });
      const cargoHeight = doc.heightOfString(`Cargo: ${tecCargo}`, { width: 230, fontSize: 8 });
      const leftColumnHeight = 25 + revisorHeight + 3 + cargoHeight + 3 + 10 + 10;
      
      const rightColumnHeight = 45 + obsHeight + 10;
      const boxHeight = Math.max(65, leftColumnHeight, rightColumnHeight);

      // Validar espacio en la página
      checkSpace(boxHeight + 15);
      const currentCardY = doc.y;

      // Dibujar tarjeta informativa
      doc.roundedRect(50, currentCardY, 512, boxHeight, 4).fill('#F8FAFC');
      doc.lineWidth(1).strokeColor('#E2E8F0').roundedRect(50, currentCardY, 512, boxHeight, 4).stroke();

      // Título del Área
      doc.fontSize(8.5).fillColor('#1E3A8A').font('Helvetica-Bold')
        .text(`${item.nombreLargo} - (${item.sigla})`, 65, currentCardY + 8);

      // Línea divisoria interna
      doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(65, currentCardY + 20).lineTo(547, currentCardY + 20).stroke();

      // Columna Izquierda (Revisor, Cargo y Fecha con flujo relativo para evitar superposiciones)
      doc.x = 65;
      doc.y = currentCardY + 25;
      doc.fontSize(8).fillColor('#0F172A');
      
      doc.font('Helvetica-Bold').text('Revisor: ', { width: 230, continued: true })
         .font('Helvetica').text(tecNombre);
         
      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').text('Cargo: ', { width: 230, continued: true })
         .font('Helvetica').text(tecCargo);
         
      doc.moveDown(0.15);
      doc.font('Helvetica-Bold').text('Fecha: ', { width: 230, continued: true })
         .font('Helvetica').text(tecFecha);

      // Columna Derecha (Estado & Observación)
      doc.font('Helvetica-Bold').text('Estado:', 310, currentCardY + 25, { continued: true })
        .font('Helvetica-Bold').fillColor(tieneObs ? '#F59E0B' : '#10B981').text(` ${estadoTexto}`)
        .fillColor('#0F172A')
        .font('Helvetica-Bold').text('Observaciones:', 310, currentCardY + 35);
      
      doc.font('Helvetica').fillColor('#334155')
        .text(obsTexto, 310, currentCardY + 45, { width: 235, height: obsHeight });

      doc.y = currentCardY + boxHeight + 10; // Espaciado después del bloque
    });
  }

  // --- SECCIÓN: REVISIÓN Y APROBACIÓN DE NORMATIVA ---
  const tieneOsi = (solicitud.areas_validadoras || []).includes('osi');
  if (tieneOsi) {
    checkSpace(120);
    const numStrN = `${sectionNum}. REVISIÓN Y APROBACIÓN DE NORMATIVA`;
    sectionNum++;
    renderSectionHeader(numStrN);

    const ap = apRes.rows.find(a => a.area === 'osi');
    const tecNombre = ap ? (ap.tecnico_nombre || 'N/A') : 'N/A';
    const tecCargo = ap ? (ap.tecnico_cargo || 'N/A') : 'N/A';
    const tecFecha = ap && ap.fecha ? new Date(ap.fecha).toLocaleDateString('es-ES') : 'N/A';
    const tieneObs = ap && ap.observacion ? true : false;
    const obsTexto = ap && ap.observacion ? ap.observacion : 'Sin observaciones';
    const estadoTexto = tieneObs ? 'Aprobado con Observación' : 'Aprobado';

    const obsHeight = doc.heightOfString(obsTexto, { width: 235, fontSize: 8 });

    // Calcular altura de la columna izquierda de forma dinámica
    const revisorHeight = doc.heightOfString(`Revisor: ${tecNombre}`, { width: 230, fontSize: 8 });
    const cargoHeight = doc.heightOfString(`Cargo: ${tecCargo}`, { width: 230, fontSize: 8 });
    const leftColumnHeight = 25 + revisorHeight + 3 + cargoHeight + 3 + 10 + 10;
    
    const rightColumnHeight = 45 + obsHeight + 10;
    const boxHeight = Math.max(65, leftColumnHeight, rightColumnHeight);

    // Validar espacio en la página
    checkSpace(boxHeight + 15);
    const currentCardY = doc.y;

    // Dibujar tarjeta informativa
    doc.roundedRect(50, currentCardY, 512, boxHeight, 4).fill('#F8FAFC');
    doc.lineWidth(1).strokeColor('#E2E8F0').roundedRect(50, currentCardY, 512, boxHeight, 4).stroke();

    // Título del Área
    doc.fontSize(8.5).fillColor('#1E3A8A').font('Helvetica-Bold')
      .text('Oficina de Seguridad de la Información - (OSI)', 65, currentCardY + 8);

    // Línea divisoria interna
    doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(65, currentCardY + 20).lineTo(547, currentCardY + 20).stroke();

    // Columna Izquierda (Revisor, Cargo y Fecha con flujo relativo)
    doc.x = 65;
    doc.y = currentCardY + 25;
    doc.fontSize(8).fillColor('#0F172A');
    
    doc.font('Helvetica-Bold').text('Revisor: ', { width: 230, continued: true })
       .font('Helvetica').text(tecNombre);
       
    doc.moveDown(0.15);
    doc.font('Helvetica-Bold').text('Cargo: ', { width: 230, continued: true })
       .font('Helvetica').text(tecCargo);
       
    doc.moveDown(0.15);
    doc.font('Helvetica-Bold').text('Fecha: ', { width: 230, continued: true })
       .font('Helvetica').text(tecFecha);

    // Columna Derecha (Estado & Observación)
    doc.font('Helvetica-Bold').text('Estado:', 310, currentCardY + 25, { continued: true })
      .font('Helvetica-Bold').fillColor(tieneObs ? '#F59E0B' : '#10B981').text(` ${estadoTexto}`)
      .fillColor('#0F172A')
      .font('Helvetica-Bold').text('Observaciones:', 310, currentCardY + 35);
    
    doc.font('Helvetica').fillColor('#334155')
      .text(obsTexto, 310, currentCardY + 45, { width: 235, height: obsHeight });

    doc.y = currentCardY + boxHeight + 10; // Espaciado después del bloque
  }

  // --- SECCIÓN 4: SOLICITANTE Y ADICIONALES ---
  const firmasSolicitud = [
    {
      rol: 'Firma del Solicitante',
      nombre: solicitud.solicitante_nombre,
      cedula: solicitud.solicitante_cedula,
      cargo: solicitud.solicitante_cargo
    }
  ];

  firmantesAdicionales.forEach(f => {
    firmasSolicitud.push({
      rol: f.rol || 'Firma de Responsabilidad',
      nombre: f.nombre,
      cedula: f.cedula,
      cargo: f.cargo
    });
  });

  checkSpace(190);
  const numStr1 = `${sectionNum}. FIRMAS DE RESPONSABILIDAD`;
  sectionNum++;
  
  renderSectionHeader(numStr1);

  let currentYF = doc.y + 105;
  const colWidthS = 140;
  const colGapS = 30;
  const startXS = 65;

  for (let i = 0; i < firmasSolicitud.length; i += 3) {
    const chunk = firmasSolicitud.slice(i, i + 3);
    
    if (doc.y + 170 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      currentYF = doc.y + 105;
    } else {
      currentYF = doc.y + 105;
    }

    // Dibujar línea de firma
    doc.lineWidth(1).strokeColor('#CBD5E1');
    chunk.forEach((firma, index) => {
      const x = startXS + index * (colWidthS + colGapS);
      doc.moveTo(x, currentYF).lineTo(x + colWidthS, currentYF).stroke();
    });

    const textYF = currentYF + 5;
    chunk.forEach((firma, index) => {
      const x = startXS + index * (colWidthS + colGapS);
      doc.fontSize(8).fillColor('#1E3A8A').font('Helvetica-Bold')
        .text(firma.rol, x, textYF, { width: colWidthS, align: 'center' });
      doc.font('Helvetica').fillColor('#0F172A')
        .text(firma.nombre, x, textYF + 12, { width: colWidthS, align: 'center' });
      
      let det = '';
      if (firma.cedula) det += `C.I. ${firma.cedula}`;
      if (firma.cargo) det += (det ? ' - ' : '') + firma.cargo;
      
      doc.font('Helvetica-Oblique').fillColor('#475569')
        .text(det || 'Personal Autorizado', x, textYF + 24, { width: colWidthS, align: 'center' });
    });

    doc.y = currentYF + 65;
  }
  doc.moveDown(1);

  // OSI ahora es parte de la Sección: Revisión y Aprobación de Normativa, dibujada arriba.

  // --- SECCIÓN: APROBADO DTIC ---
  const tieneDirector = (solicitud.areas_validadoras || []).includes('director');
  if (tieneDirector) {
    checkSpace(170);
    const numStr5 = `${sectionNum}. APROBADO DTIC`;
    sectionNum++;
    
    renderSectionHeader(numStr5);

    const ap = apRes.rows.find(a => a.area === 'director');
    const tecNombre = directorSigner ? directorSigner.nombre : (ap ? (ap.tecnico_nombre || 'N/A') : 'N/A');
    const tecCedula = directorSigner ? directorSigner.cedula : (ap ? (ap.tecnico_cedula || 'N/A') : 'N/A');

    const boxY = doc.y;
    const boxHeight = 150;

    // Tarjeta contenedora de Aprobación
    doc.roundedRect(50, boxY, 512, boxHeight, 4).fill('#F8FAFC');
    doc.lineWidth(1).strokeColor('#CBD5E1').roundedRect(50, boxY, 512, boxHeight, 4).stroke();

    // Rol del Aprobador
    doc.fontSize(8.5).fillColor('#1E3A8A').font('Helvetica-BoldOblique')
      .text('Director de Tecnologías de la Información y Comunicación', 65, boxY + 8);

    // Línea divisoria interna
    doc.lineWidth(0.5).strokeColor('#E2E8F0').moveTo(65, boxY + 20).lineTo(547, boxY + 20).stroke();

    // Columna Izquierda (Firma Digital con espacio amplio y sin redundancias)
    const colLeftX = 65;
    doc.fontSize(8).fillColor('#0F172A').font('Helvetica')
      .font('Helvetica-Bold').text('Firma Digital / Electrónica:', colLeftX, boxY + 28)
      .font('Helvetica').text(`Nombre: ${tecNombre} (C.I. ${tecCedula})`, colLeftX, boxY + 125);

    doc.y = boxY + boxHeight;
    doc.moveDown(1.5);
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('#64748B')
    .text('Este documento digital fue generado y aprobado en el SVT bajo políticas internas de seguridad.', { align: 'center' });
}

function generarPDF(solicitud, aprobaciones, directorSigner) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        resolve(pdfBuffer);
      });

      generarReportePDFInternal(doc, solicitud, aprobaciones, directorSigner);
      
      doc.end(); // Finalizar el documento de forma segura
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generarPDF
};
