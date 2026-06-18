const db = require('./db');

/**
 * Inicializa o resetea las aprobaciones asociadas a una solicitud técnica.
 * 
 * @param {number} solicitudId - ID de la solicitud
 * @param {Array<string>} areas - Áreas validadoras configuradas para esta solicitud
 * @param {object} [client=db] - Cliente de base de datos para soporte de transacciones
 */
async function inicializarAprobaciones(solicitudId, areas, client = db) {
  try {
    // 1. Eliminar aprobaciones que ya no aplican para esta solicitud (dinámico)
    await client.query(
      'DELETE FROM aprobaciones WHERE solicitud_id = $1 AND NOT (area = ANY($2::varchar[]))',
      [solicitudId, areas]
    );

    const dirUserRes = await client.query("SELECT id FROM usuarios WHERE area = 'director' AND rol = 'tecnico' LIMIT 1");
    const dirUserId = dirUserRes.rows.length > 0 ? dirUserRes.rows[0].id : null;

    for (const area of areas) {
      if (area === 'director') {
        await client.query(
          `INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
           VALUES ($1, $2, 'aprobado', $3, CURRENT_TIMESTAMP)
           ON CONFLICT (solicitud_id, area)
           DO UPDATE SET estado = 'aprobado', tecnico_id = $3, fecha = CURRENT_TIMESTAMP`,
          [solicitudId, area, dirUserId]
        );
      } else {
        await client.query(
          `INSERT INTO aprobaciones (solicitud_id, area, estado, tecnico_id, fecha)
           VALUES ($1, $2, 'pendiente', NULL, NULL)
           ON CONFLICT (solicitud_id, area)
           DO NOTHING`,
          [solicitudId, area]
        );
      }
    }
  } catch (error) {
    console.error('Error al inicializar/resetear aprobaciones:', error);
    throw error;
  }
}

module.exports = {
  inicializarAprobaciones
};
