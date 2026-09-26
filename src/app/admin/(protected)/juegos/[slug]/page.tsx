import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import GameClassificationEditor from "@/components/admin/GameClassificationEditor";
import GameCompatibilityEditor from "@/components/admin/GameCompatibilityEditor";
import GameReleasesEditor from "@/components/admin/GameReleasesEditor";
import GameEditorHealthOverview from "@/components/admin/GameEditorHealthOverview";
import GameInformationEditor from "@/components/admin/GameInformationEditor";
import GameMultimediaEditor from "@/components/admin/GameMultimediaEditor";
import GamePerformanceEditor from "@/components/admin/GamePerformanceEditor";
import GameValuationEditor from "@/components/admin/GameValuationEditor";
import {
  getEditorialItem,
  listEditorialItems,
} from "@/lib/admin/content-service";
import {
  evaluateGamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import {
  resolveGameReleases,
  resolvePcRelease,
} from "@/lib/games/releases";
import {
  resolveGameEditorSection,
} from "@/lib/admin/game-editor-sections";
import {
  getGamePublicationIdentity,
} from "@/lib/admin/publication-overview";
import type {
  GameTaxonomyTerm,
} from "@/types/game-taxonomy";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
  }>;
};

type PrimaryGameTaxonomyTerm = GameTaxonomyTerm & {
  missingFromCatalog?: boolean;
};

function publicationLabel(
  identity: Awaited<ReturnType<typeof getGamePublicationIdentity>>,
  fallbackSynced: boolean
) {
  if (!identity) {
    return fallbackSynced ? "Sin cambios" : "Borrador modificado";
  }
  if (identity.panelCreated && !identity.everPublished) {
    return "Sin publicar";
  }
  if (!identity.publicVisible) {
    return `Oculto · Pub. #${identity.publicationNumber}`;
  }
  if (identity.hasUnpublishedChanges) {
    return `Cambios pendientes · Pub. #${identity.publicationNumber}`;
  }
  return `Publicado · #${identity.publicationNumber}`;
}

function normalizeClassification(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function ensurePrimaryClassificationTerm(
  terms: readonly GameTaxonomyTerm[],
  currentValue: string
): PrimaryGameTaxonomyTerm[] {
  const label = currentValue.trim();
  if (!label) return [...terms];

  const currentKey = normalizeClassification(label);
  if (
    terms.some(
      (term) => normalizeClassification(term.label) === currentKey
    )
  ) {
    return [...terms];
  }

  return [
    {
      key: "legacy-missing-primary-classification",
      label,
      active: false,
      missingFromCatalog: true,
    },
    ...terms,
  ];
}

function fallbackTerms(
  values: readonly string[]
): GameTaxonomyTerm[] {
  const labels = new Map<string, string>();

  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const normalized = normalizeClassification(label);
    if (!labels.has(normalized)) labels.set(normalized, label);
  }

  return [...labels.values()].map((label, index) => ({
    key: `legacy-${index}`,
    label,
    active: true,
  }));
}

export default async function AdminGameEditorPage({
  params,
  searchParams,
}: PageProps) {
  const [{ slug }, parameters] = await Promise.all([
    params,
    searchParams,
  ]);
  const [
    item,
    publicationIdentity,
    taxonomyItem,
    platformItem,
    softwareItems,
  ] = await Promise.all([
    getEditorialItem("game", slug),
    getGamePublicationIdentity(slug),
    getEditorialItem("game_taxonomy", "games"),
    getEditorialItem("platform_catalog", "platforms"),
    listEditorialItems("software"),
  ]);

  if (!item) notFound();

  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;
  const section = resolveGameEditorSection(parameters.seccion);
  const panelCreated = publicationIdentity?.panelCreated ?? false;
  const game = item.payload;
  const taxonomy = taxonomyItem?.payload;
  const currentClassifications = [
    game.category,
    ...(game.genres ?? []),
  ];
  const currentClassificationSet = new Set(
    currentClassifications.map(normalizeClassification)
  );
  const classificationTerms =
    taxonomy?.classifications.filter(
      (term) =>
        term.active ||
        currentClassificationSet.has(
          normalizeClassification(term.label)
        )
    ) ?? fallbackTerms(currentClassifications);
  const tagTerms = taxonomy?.tags ?? fallbackTerms(game.tags ?? []);
  const primaryClassificationTerms =
    ensurePrimaryClassificationTerm(
      classificationTerms,
      game.category
    );
  const coreAction =
    `/api/admin/content/games/${encodeURIComponent(slug)}`;
  const informationAction = `${coreAction}/information`;
  const classificationAction = `${coreAction}/classification`;
  const compatibilityAction = `${coreAction}/compatibility`;
  const performanceAction = `${coreAction}/performance`;
  const valuationAction = `${coreAction}/valuation`;
  const hasPublicVersion = publicationIdentity?.everPublished ?? false;
  const readiness = evaluateGamePublicationReadiness(game);
  const pcRelease =
    resolvePcRelease(
      game
    );

  return (
    <>
      <Link href="/admin/juegos" className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a juegos
      </Link>

      <AdminPageHeader
        eyebrow={<>JUEGO · REVISIÓN {item.revision}</>}
        title={game.title}
        description="Gestiona identidad, clasificación, compatibilidad, rendimiento, multimedia, distribución, valoración y auditoría desde un flujo editorial único. Guardar conserva el borrador; Publicar sigue siendo una acción separada."
        action={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <Link
              href={`/admin/juegos/${encodeURIComponent(slug)}/vista-previa`}
              className={styles.tableAction}
            >
              <Eye size={14} aria-hidden="true" />
              Vista previa
            </Link>
            <Link
              href={`/admin/juegos/${encodeURIComponent(slug)}/publicacion`}
              className={styles.draftState}
            >
              {publicationLabel(
                publicationIdentity,
                item.status === "synced"
              )}
            </Link>
          </div>
        }
      />

      <EditorStateNotice state={state} />

      {!item.sourcePresent && !panelCreated && (
        <div className={`${styles.editorNotice} ${styles.editorNoticeWarning}`}>
          Este juego ya no está presente en los archivos fuente. Se conserva para revisión y recuperación.
        </div>
      )}

      <GameEditorHealthOverview
        slug={slug}
        readiness={readiness}
      />

      {section === "ficha" && (
        <GameInformationEditor
          game={game}
          revision={item.revision}
          action={informationAction}
          hasPublicVersion={hasPublicVersion}
        />
      )}

      {section === "datos" && (
        <GameClassificationEditor
          game={game}
          revision={item.revision}
          action={classificationAction}
          primaryClassificationTerms={primaryClassificationTerms}
          classificationTerms={classificationTerms}
          tagTerms={tagTerms}
        />
      )}

      {section === "requisitos" && (
        <GameCompatibilityEditor
          game={game}
          revision={item.revision}
          action={compatibilityAction}
        />
      )}

      {section === "rendimiento" && (
        <GamePerformanceEditor
          slug={slug}
          revision={item.revision}
          action={performanceAction}
          calibration={
            pcRelease?.performance
          }
          metadata={
            pcRelease?.performanceMetadata
          }
        />
      )}

      {section === "multimedia" && (
        <GameMultimediaEditor
          slug={slug}
          revision={item.revision}
        />
      )}

      {section === "descargas" && (
        platformItem ? (
          <GameReleasesEditor
            slug={slug}
            revision={item.revision}
            initialReleases={resolveGameReleases(game)}
            platforms={platformItem.payload.platforms}
            software={softwareItems.map((software) => ({
              slug: software.payload.slug,
              name: software.payload.name,
            }))}
          />
        ) : (
          <section className={styles.editorPanel}>
            <h2>Plataformas pendientes</h2>
            <p>
              Ejecuta la actualización local para importar el catálogo
              maestro de plataformas antes de editar releases.
            </p>
          </section>
        )
      )}

      {section === "valoracion" && (
        <GameValuationEditor
          slug={slug}
          revision={item.revision}
          editorialRating={game.rating}
          legacyReviews={game.reviews}
          action={valuationAction}
        />
      )}

    </>
  );
}
