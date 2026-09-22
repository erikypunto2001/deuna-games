import "server-only";

import type { Game } from "@/types/game";

import {
  parseEditorialPayload,
} from "@/lib/admin/content-validation";
import {
  adminQuery,
} from "@/lib/admin/database";
import {
  listGameImageReferences,
  listGameVideoReferences,
} from "@/lib/admin/game-media-integrity";
import {
  PUBLIC_EXPOSURE_PUBLICATION_SQL,
} from "@/lib/admin/publication-history";
import {
  verifyAdminSession,
} from "@/lib/admin/session";
import {
  legacyGameCoverVideoReference,
} from "@/lib/media/legacy-game-cover-video";

type HistoricalPayloadRow = {
  payload: unknown;
};

export async function getHistoricalGameMediaReferences(
  slug: string
) {
  await verifyAdminSession();

  const result = await adminQuery<HistoricalPayloadRow>(
    `SELECT revision.payload
       FROM deuna_admin.editorial_revisions AS revision
       INNER JOIN deuna_admin.editorial_items AS item
         ON item.id = revision.item_id
      WHERE item.item_type = 'game'
        AND item.item_key = $1
     UNION ALL
     SELECT publication.payload
       FROM deuna_admin.editorial_publications AS publication
       INNER JOIN deuna_admin.editorial_items AS item
         ON item.id = publication.item_id
      WHERE item.item_type = 'game'
        AND item.item_key = $1
        AND ${PUBLIC_EXPOSURE_PUBLICATION_SQL}`,
    [slug]
  );

  const references = new Set<string>();

  for (const row of result.rows) {
    // Portada dejó de admitir video. El parser actual elimina esa capa, pero
    // un WebM guardado en una revisión o publicación restaurable debe seguir
    // protegido mientras esa versión exista.
    const legacyCoverVideo = legacyGameCoverVideoReference(row.payload);
    if (legacyCoverVideo) references.add(legacyCoverVideo);

    let game: Game;
    try {
      game = parseEditorialPayload("game", row.payload);
    } catch {
      // Un snapshot histórico inválido ya no es restaurable por validación de
      // contenido; no debe retener archivos indefinidamente por un payload
      // que el sistema no puede interpretar.
      continue;
    }

    for (const reference of listGameImageReferences(game)) {
      references.add(reference);
    }
    for (const reference of listGameVideoReferences(game)) {
      references.add(reference);
    }
  }

  return [...references];
}
