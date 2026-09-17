import "server-only";

import {
  parseEditorialPayload,
} from "@/lib/admin/content-validation";
import {
  adminQuery,
} from "@/lib/admin/database";
import {
  isAdminEnabled,
} from "@/lib/admin/database-config";
import {
  listGameImageReferences,
  listGameVideoReferences,
} from "@/lib/admin/game-media-integrity";
import {
  PUBLIC_EXPOSURE_PUBLICATION_SQL,
} from "@/lib/admin/publication-history";
import {
  readAdminSessionToken,
  resolveAdminSession,
} from "@/lib/admin/session";
import {
  EDITORIAL_MEDIA_PUBLIC_PREFIX,
} from "@/lib/media/editorial-media";
import {
  legacyGameCoverVideoReference,
} from "@/lib/media/legacy-game-cover-video";
import {
  SITE_BRAND_LOGO_SLUG,
} from "@/lib/site/logo";

export const TAXONOMY_ICON_MEDIA_SLUG =
  "taxonomy-icons";

export type EditorialMediaServingAccess =
  | "public"
  | "admin";

type MediaOwnerType =
  | "game"
  | "game_taxonomy"
  | "site_config";

type MediaOwner = {
  type: MediaOwnerType;
  key: string;
};

type MediaOwnerRow = {
  id: string;
  publication_number: number;
  published_payload: unknown;
  public_visible: boolean;
};

type MediaPublicationRow = {
  payload: unknown;
};

type PublishedReferenceCacheEntry = {
  itemId: string;
  publicationNumber: number;
  references: Set<string>;
};

const publishedReferenceCache = new Map<
  string,
  PublishedReferenceCacheEntry
>();
const MAX_PUBLISHED_REFERENCE_CACHE_ENTRIES = 128;

function ownerForSlug(slug: string): MediaOwner {
  if (slug === TAXONOMY_ICON_MEDIA_SLUG) {
    return {
      type: "game_taxonomy",
      key: "games",
    };
  }

  if (slug === SITE_BRAND_LOGO_SLUG) {
    return {
      type: "site_config",
      key: "site",
    };
  }

  return {
    type: "game",
    key: slug,
  };
}

function ownerCacheKey(owner: MediaOwner) {
  return `${owner.type}:${owner.key}`;
}

function isEditorialMediaReference(
  value: string
) {
  return value.startsWith(
    `${EDITORIAL_MEDIA_PUBLIC_PREFIX}/`
  );
}

function publicationReferences(
  owner: MediaOwner,
  payload: unknown
) {
  if (owner.type === "game") {
    const game = parseEditorialPayload(
      "game",
      payload
    );
    const legacyCoverVideo =
      legacyGameCoverVideoReference(payload);

    return [
      ...listGameImageReferences(game),
      ...listGameVideoReferences(game),
      ...(legacyCoverVideo ? [legacyCoverVideo] : []),
    ].filter(isEditorialMediaReference);
  }

  if (owner.type === "game_taxonomy") {
    const taxonomy = parseEditorialPayload(
      "game_taxonomy",
      payload
    );

    return [
      ...taxonomy.classifications,
      ...taxonomy.tags,
    ]
      .map((term) => term.iconAsset)
      .filter(
        (value): value is string =>
          typeof value === "string" &&
          isEditorialMediaReference(value)
      );
  }

  const site = parseEditorialPayload(
    "site_config",
    payload
  );

  return site.logoAsset &&
    isEditorialMediaReference(site.logoAsset)
    ? [site.logoAsset]
    : [];
}

function safePublicationReferences(
  owner: MediaOwner,
  payload: unknown
) {
  try {
    return publicationReferences(owner, payload);
  } catch {
    /*
     * Una publicación histórica que ya no pueda interpretarse con el contrato
     * actual no debe exponer ninguno de sus recursos, pero tampoco debe bloquear
     * las publicaciones posteriores válidas del mismo item. La decisión sigue
     * siendo fail-closed para ese snapshot concreto.
     */
    return [];
  }
}

function rememberPublishedReferences(
  key: string,
  entry: PublishedReferenceCacheEntry
) {
  publishedReferenceCache.delete(key);
  publishedReferenceCache.set(key, entry);

  while (
    publishedReferenceCache.size >
    MAX_PUBLISHED_REFERENCE_CACHE_ENTRIES
  ) {
    const oldest =
      publishedReferenceCache.keys().next().value;
    if (!oldest) break;
    publishedReferenceCache.delete(oldest);
  }
}

async function loadEverPublishedReferences(
  owner: MediaOwner,
  cached: PublishedReferenceCacheEntry | undefined
) {
  const itemResult = await adminQuery<MediaOwnerRow>(
    `SELECT
       id::text,
       publication_number,
       published_payload,
       public_visible
     FROM deuna_admin.editorial_items
     WHERE item_type = $1
       AND item_key = $2
     LIMIT 1`,
    [owner.type, owner.key]
  );
  const item = itemResult.rows[0];

  if (!item) return null;

  if (
    cached &&
    cached.itemId === item.id &&
    cached.publicationNumber ===
      item.publication_number
  ) {
    return cached;
  }

  const reusable =
    cached &&
    cached.itemId === item.id &&
    cached.publicationNumber < item.publication_number
      ? cached
      : undefined;
  const afterPublication =
    reusable?.publicationNumber ?? 0;
  const publicationResult =
    await adminQuery<MediaPublicationRow>(
      `SELECT publication.payload
       FROM deuna_admin.editorial_publications AS publication
       WHERE publication.item_id = $1
         AND publication.publication_number > $2
         AND ${PUBLIC_EXPOSURE_PUBLICATION_SQL}
       ORDER BY publication.publication_number ASC`,
      [item.id, afterPublication]
    );
  const references = new Set<string>(
    reusable?.references ?? []
  );

  /*
   * published_payload es la fuente de verdad de la web pública. El historial
   * conserva rollback y recursos que alguna vez fueron públicos, pero una fila
   * histórica legacy faltante o no interpretable no puede negar los recursos
   * del snapshot público actual. Los items todavía privados no obtienen esta
   * vía: para ellos seguimos dependiendo exclusivamente de publicaciones que
   * hayan sido expuestas realmente.
   */
  if (item.public_visible) {
    for (const reference of safePublicationReferences(
      owner,
      item.published_payload
    )) {
      references.add(reference);
    }
  }

  for (const publication of publicationResult.rows) {
    for (const reference of safePublicationReferences(
      owner,
      publication.payload
    )) {
      references.add(reference);
    }
  }

  return {
    itemId: item.id,
    publicationNumber: item.publication_number,
    references,
  };
}

async function wasEverPublished(
  slug: string,
  publicPath: string
) {
  const owner = ownerForSlug(slug);
  const cacheKey = ownerCacheKey(owner);
  const cached = publishedReferenceCache.get(cacheKey);

  if (cached?.references.has(publicPath)) {
    return true;
  }

  const refreshed = await loadEverPublishedReferences(
    owner,
    cached
  );

  if (!refreshed) {
    publishedReferenceCache.delete(cacheKey);
    return false;
  }

  rememberPublishedReferences(
    cacheKey,
    refreshed
  );

  return refreshed.references.has(publicPath);
}

async function hasAdminMediaAccess() {
  if (!isAdminEnabled()) return false;

  try {
    const session = await resolveAdminSession(
      await readAdminSessionToken()
    );
    return Boolean(session);
  } catch {
    return false;
  }
}

export async function resolveEditorialMediaServingAccess(
  slug: string,
  publicPath: string
): Promise<EditorialMediaServingAccess | null> {
  try {
    if (await wasEverPublished(slug, publicPath)) {
      return "public";
    }
  } catch {
    // Fallamos cerrado: un problema leyendo snapshot/historial editorial
    // nunca convierte un recurso de borrador en público.
  }

  return (await hasAdminMediaAccess())
    ? "admin"
    : null;
}
