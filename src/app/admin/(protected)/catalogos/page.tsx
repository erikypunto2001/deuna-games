import {
  BookOpenCheck,
} from "lucide-react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import GameTaxonomyEditor from "@/components/admin/GameTaxonomyEditor";
import PublicationPanel from "@/components/admin/PublicationPanel";
import {
  getEditorialItem,
  listEditorialItems,
} from "@/lib/admin/content-service";
import {
  getGameTaxonomyPublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";
import type {
  GameTaxonomy,
  GameTaxonomyKind,
} from "@/types/game-taxonomy";

import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

const catalogSections = [
  "clasificaciones",
  "etiquetas",
  "publicacion",
] as const;

type CatalogSection = (typeof catalogSections)[number];

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
  }>;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function resolveCatalogSection(
  value: string | string[] | undefined
): CatalogSection {
  const candidate = Array.isArray(value)
    ? value[0]
    : value;

  return catalogSections.includes(candidate as CatalogSection)
    ? (candidate as CatalogSection)
    : "clasificaciones";
}

function buildUsage(
  taxonomy: GameTaxonomy,
  games: Awaited<ReturnType<typeof listEditorialItems<"game">>>
) {
  const usage: Record<
    GameTaxonomyKind,
    Record<string, number>
  > = {
    classifications: {},
    tags: {},
  };

  const lookup = {
    classifications: new Map(
      taxonomy.classifications.map((term) => [
        normalize(term.label),
        term.key,
      ])
    ),
    tags: new Map(
      taxonomy.tags.map((term) => [normalize(term.label), term.key])
    ),
  };

  function count(
    kind: GameTaxonomyKind,
    value: string
  ) {
    const key = lookup[kind].get(normalize(value));
    if (!key) return;
    usage[kind][key] = (usage[kind][key] ?? 0) + 1;
  }

  for (const game of games) {
    const seenClassifications = new Set<string>();

    for (const value of [
      game.payload.category,
      ...(game.payload.genres ?? []),
    ]) {
      const normalized = normalize(value);
      if (!normalized || seenClassifications.has(normalized)) continue;
      seenClassifications.add(normalized);
      count("classifications", value);
    }

    for (const tag of game.payload.tags ?? []) {
      count("tags", tag);
    }
  }

  return usage;
}

export default async function AdminCatalogsPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [item, games, parameters] = await Promise.all([
    getEditorialItem("game_taxonomy", "games"),
    listEditorialItems("game"),
    searchParams,
  ]);
  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;
  const section = resolveCatalogSection(parameters.seccion);

  let publicationState = null;

  try {
    publicationState =
      await getGameTaxonomyPublicationState();
  } catch {
    console.error(
      "No se pudo leer el estado de publicación de Clasificaciones y etiquetas."
    );
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="ORGANIZACIÓN DEL CATÁLOGO"
        title="Clasificaciones y etiquetas"
        description="Administra las clasificaciones y etiquetas maestras que organizan los juegos. Los cambios permanecen en borrador hasta publicar su snapshot."
        action={<span className={styles.draftState}>
          <BookOpenCheck size={15} aria-hidden="true" />
          {publicationState?.hasUnpublishedChanges
            ? "Cambios sin publicar"
            : item?.status === "synced"
              ? "Sin cambios"
              : "Borrador guardado"}
        </span>}
      />

      <EditorStateNotice state={state} />

      {!item ? (
        <section className={styles.editorPanel}>
          <h2>Clasificaciones y etiquetas pendientes</h2>
          <p>
            Ejecuta la actualización local para generar la definición inicial a partir de los juegos existentes.
          </p>
        </section>
      ) : section === "publicacion" ? (
        <section className={styles.editorPanel}>
          {publicationState ? (
            <PublicationPanel
              state={publicationState}
              requestState={state}
              publishAction="/api/admin/content/catalogs/publish"
            />
          ) : (
            <p>
              El snapshot publicado todavía no está disponible. Ejecuta la actualización local antes de publicar cambios visuales o de orden.
            </p>
          )}
        </section>
      ) : (
        <GameTaxonomyEditor
          initialTaxonomy={item.payload}
          revision={item.revision}
          usage={buildUsage(item.payload, games)}
          section={
            section === "clasificaciones"
              ? "classifications"
              : "tags"
          }
        />
      )}
    </>
  );
}
