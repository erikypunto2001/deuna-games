import "server-only";

/*
 * `bootstrap` tiene dos significados históricos:
 *
 * - importación/migración: representa el snapshot público inicial;
 * - creación desde Admin: conserva numeración/historia interna mientras el
 *   contenido nace `public_visible=false`, `source_present=false` y con
 *   `source_payload={}`.
 *
 * La identidad no depende de una revisión histórica concreta: el historial
 * puede compactarse sin convertir un borrador privado en exposición pública.
 * Tampoco se infiere desde actor_user_id: esa FK usa ON DELETE SET NULL.
 *
 * Las consultas que lo interpolen deben usar el alias `publication` para
 * deuna_admin.editorial_publications.
 */
export const PUBLIC_EXPOSURE_PUBLICATION_SQL = `(
  publication.action IN ('published', 'rollback')
  OR (
    publication.action = 'bootstrap'
    AND NOT EXISTS (
      SELECT 1
        FROM deuna_admin.editorial_items AS created_item
       WHERE created_item.id = publication.item_id
         AND created_item.source_present = false
         AND created_item.source_payload = '{}'::jsonb
    )
  )
)`;
