import { state } from './state.js';
import { toast } from './utils.js';

// Construye las cabeceras de autenticación (token JWT) para las peticiones a la API.
export function getAuthHeaders(extra) {
  const base = { 'Authorization': 'Bearer ' + (state.authToken || '') };
  return extra ? Object.assign(base, extra) : base;
}

// Descargar PDF firmado
export async function descargarPDF(solicitudId) {
  try {
    const response = await fetch(`/api/solicitudes/${solicitudId}/pdf`, {
      headers: getAuthHeaders()
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
    toast(error.message);
  }
}
