import "server-only";

import {
  adminQuery,
} from "./database";
import {
  verifyAdminSession,
} from "./session";

export type GameHistoryChange = {
  section: string;
  field: string;
  before: string;
  after: string;
};

export type GameHistoryRevision = {
  kind: "revision";
  id: string;
  revision: number;
  action: "imported" | "source_refreshed" | "draft_saved" | "draft_restored" | "baseline";
  actor: string | null;
  createdAt: Date;
  changes: GameHistoryChange[];
};

export type GameHistoryPublication = {
  kind: "publication";
  id: string;
  publicationNumber: number;
  sourceRevision: number | null;
  action: "bootstrap" | "published" | "rollback" | "baseline";
  actor: string | null;
  createdAt: Date;
};

export type GameHistoryEvent =
  | GameHistoryRevision
  | GameHistoryPublication;

type RevisionRow = {
  id: string;
  revision: number;
  action: GameHistoryRevision["action"];
  actor: string | null;
  created_at: Date;
  payload: Record<string, unknown>;
  previous_payload: Record<string, unknown> | null;
};

type PublicationRow = {
  id: string;
  publication_number: number;
  source_revision: number | null;
  action: GameHistoryPublication["action"];
  actor: string | null;
  created_at: Date;
};

const trackedFields = [
  ["title", "Información", "Título"],
  ["description", "Información", "Descripción"],
  ["shortTitle", "Información", "Título corto"],
  ["highlightedTitle", "Información", "Título destacado"],
  ["developer", "Información", "Desarrollador"],
  ["publisher", "Información", "Publisher"],
  ["releaseDate", "Información", "Fecha de lanzamiento"],
  ["version", "Información", "Versión"],
  ["badge", "Información", "Insignia"],
  ["imageAlt", "Información", "Alternativa general"],
  ["category", "Clasificación", "Clasificación principal"],
  ["genres", "Clasificación", "Clasificaciones adicionales"],
  ["tags", "Clasificación", "Etiquetas"],
  ["ageRating", "Clasificación", "Clasificación etaria"],
  ["platforms", "Compatibilidad", "Plataformas"],
  ["requirements", "Compatibilidad", "Requisitos PC"],
  ["compatibilityMetadata", "Compatibilidad", "Verificación"],
  ["performance", "Rendimiento", "Calibración"],
  ["performanceMetadata", "Rendimiento", "Procedencia del benchmark"],
  ["coverImage", "Multimedia", "Portada"],
  ["heroImage", "Multimedia", "Hero"],
  ["cardImage", "Multimedia", "Card"],
  ["detailImage", "Multimedia", "Contenedor"],
  ["backgroundImage", "Multimedia", "Fondo"],
  ["screenshots", "Multimedia", "Galería"],
  ["galleryMedia", "Multimedia", "Galería multimedia"],
  ["imageMedia", "Multimedia", "Recortes de imagen"],
  ["videoMedia", "Multimedia", "Videos por destino"],
  ["mediaModes", "Multimedia", "Modos multimedia"],
  ["mediaAccessibility", "Multimedia", "Accesibilidad contextual"],
  ["download", "Distribución", "Descargas"],
  ["distributionMetadata", "Distribución", "Canal e integridad"],
  ["rating", "Valoración", "Valoración editorial"],
  ["reviews", "Valoración", "Contador legado"],
] as const;

function equal(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function truncated(value: string, maximum = 140) {
  return value.length > maximum
    ? `${value.slice(0, maximum - 1)}…`
    : value;
}

function present(value: unknown) {
  if (value === undefined || value === null || value === "") return "Sin definir";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return truncated(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "Vacío";
    if (value.every((item) => typeof item === "string")) {
      return truncated(value.join(", "));
    }
    return truncated(JSON.stringify(value));
  }

  if (typeof value === "object") {
    try {
      return truncated(JSON.stringify(value));
    } catch {
      return "Configuración modificada";
    }
  }

  return truncated(String(value));
}

function changesBetween(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown>
) {
  if (!previous) return [];

  return trackedFields.flatMap(([key, section, field]) => {
    const before = previous[key];
    const after = current[key];
    if (equal(before, after)) return [];
    return [{
      section,
      field,
      before: present(before),
      after: present(after),
    }];
  });
}

export async function getGameHistory(
  gameSlug: string
): Promise<GameHistoryEvent[]> {
  await verifyAdminSession();

  const [revisionResult, publicationResult] = await Promise.all([
    adminQuery<RevisionRow>(
      `SELECT
         history.id::text,
         history.revision,
         history.action,
         admin.username AS actor,
         history.created_at,
         history.payload,
         history.previous_payload
       FROM (
         SELECT
           revision.id,
           revision.revision,
           revision.action,
           revision.actor_user_id,
           revision.created_at,
           revision.payload,
           lag(revision.payload) OVER (
             ORDER BY revision.revision ASC
           ) AS previous_payload
         FROM deuna_admin.editorial_revisions AS revision
         INNER JOIN deuna_admin.editorial_items AS item
           ON item.id = revision.item_id
         WHERE item.item_type = 'game'
           AND item.item_key = $1
       ) AS history
       LEFT JOIN deuna_admin.admin_users AS admin
         ON admin.id = history.actor_user_id
       ORDER BY history.revision DESC
       LIMIT 50`,
      [gameSlug]
    ),
    adminQuery<PublicationRow>(
      `SELECT
         publication.id::text,
         publication.publication_number,
         publication.source_revision,
         publication.action,
         admin.username AS actor,
         publication.created_at
       FROM deuna_admin.editorial_publications AS publication
       INNER JOIN deuna_admin.editorial_items AS item
         ON item.id = publication.item_id
       LEFT JOIN deuna_admin.admin_users AS admin
         ON admin.id = publication.actor_user_id
       WHERE item.item_type = 'game'
         AND item.item_key = $1
       ORDER BY publication.created_at DESC
       LIMIT 50`,
      [gameSlug]
    ),
  ]);

  const events: GameHistoryEvent[] = [
    ...revisionResult.rows.map((row) => ({
      kind: "revision" as const,
      id: row.id,
      revision: row.revision,
      action: row.action,
      actor: row.actor,
      createdAt: row.created_at,
      changes: changesBetween(row.previous_payload, row.payload),
    })),
    ...publicationResult.rows.map((row) => ({
      kind: "publication" as const,
      id: row.id,
      publicationNumber: row.publication_number,
      sourceRevision: row.source_revision,
      action: row.action,
      actor: row.actor,
      createdAt: row.created_at,
    })),
  ];

  return events.sort(
    (left, right) => right.createdAt.valueOf() - left.createdAt.valueOf()
  );
}
