import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import GameClassificationEditor from "@/components/admin/GameClassificationEditor";
import GameCompatibilityEditor from "@/components/admin/GameCompatibilityEditor";
import GameDistributionEditor from "@/components/admin/GameDistributionEditor";
import GameEditorHealthOverview from "@/components/admin/GameEditorHealthOverview";
import GameHistoryPanel from "@/components/admin/GameHistoryPanel";
import GameInformationEditor from "@/components/admin/GameInformationEditor";
import GameMultimediaEditor from "@/components/admin/GameMultimediaEditor";
import GamePerformanceEditor from "@/components/admin/GamePerformanceEditor";
import GameValuationEditor from "@/components/admin/GameValuationEditor";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  getGameHistory,
} from "@/lib/admin/game-history";
import {
  evaluateGamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import {
  getGamePublicationIdentity,
} from "@/lib/admin/publication-overview";
import {
  verifyAdminSession,
} from "@/lib/admin/session";
import type {
  GameTaxonomyTerm,
} from "@/types/game-taxonomy";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

const gameSections = [
  "ficha",
  "datos",
  "requisitos",
  "rendimiento",
  "multimedia",
  "descargas",
  "valoracion",
  "historial",
] as const;

type GameSection = (typeof gameSections)[number];

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
  }>;
};

type GameTaxonomyEditorTerm = GameTaxonomyTerm & {
  missingFromCatalog?: boolean;
};

function resolveGameSection(
  value: string | string[] | undefined
): GameSection {
  const candidate = Array.isArray(value) ? value[0] : value;

  return gameSections.includes(candidate as GameSection)
    ? (candidate as GameSection)
    : "ficha";
}

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

function fallbackTerms(
  values: readonly string[]
): GameTaxonomyEditorTerm[] {
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

function termsForEditor(
  terms: readonly GameTaxonomyTerm[],
  currentValues: readonly string[],
  keyPrefix: string
): GameTaxonomyEditorTerm[] {
  const current = new Map<string, string>();

  for (const raw of currentValues) {
    const label = raw.trim();
    if (!label) continue;
    const normalized = normalizeClassification(label);
    if (!current.has(normalized)) current.set(normalized, label);
  }

  const known = new Set(
    terms.map((term) => normalizeClassification(term.label))
  );
  const visible = terms.filter(
    (term) =>
      term.active ||
      current.has(normalizeClassification(term.label))
  );
  const missing = [...current.entries()]
    .filter(([normalized]) => !known.has(normalized))
    .map(([, label], index) => ({
      key: `legacy-missing-${keyPrefix}-${index}`,
      label,
      active: false,
      missingFromCatalog: true,
    }));

  return [...visible, ...missing];
}

export default async function AdminGameEditorPage({
  params,
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [{ slug }, parameters] = await Promise.all([
    params,
    searchParams,
  ]);
  const [item, publicationIdentity, taxonomyItem] = await Promise.all([
    getEditorialItem("game", slug),
    getGamePublicationIdentity(slug),
    getEditorialItem("game_taxonomy", "games"),
  ]);

  if (!item) notFound();

  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;
  const section = resolveGameSection(parameters.seccion);
  const panelCreated = publicationIdentity?.panelCreated ?? false;
  const game = item.payload;
  const taxonomy = taxonomyItem?.payload;
  const currentClassifications = [
    game.category,
    ...(game.genres ?? []),
  ];
  const classificationTerms = taxonomy
    ? termsForEditor(
        taxonomy.classifications,
        currentClassifications,
        "classification"
      )
    : fallbackTerms(currentClassifications);
  const tagTerms = taxonomy
    ? termsForEditor(
        taxonomy.tags,
        game.tags ?? [],
        "tag"
      )
    : fallbackTerms(game.tags ?? []);
  const coreAction =
    `/api/admin/content/games/${encodeURIComponent(slug)}`;
  const informationAction = `${coreAction}/information`;
  const classificationAction = `${coreAction}/classification`;
  const compatibilityAction = `${coreAction}/compatibility`;
  const performanceAction = `${coreAction}/performance`;
  const downloadAction = `${coreAction}/download`;
  const valuationAction = `${coreAction}/valuation`;
  const hasPublicVersion = publicationIdentity?.everPublished ?? false;
  const readiness = evaluateGamePublicationReadiness(game);
  const history = section === "historial"
    ? await getGameHistory(slug)
    : [];

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
        activeSection={section}
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
          calibration={game.performance}
          metadata={game.performanceMetadata}
        />
      )}

      {section === "multimedia" && (
        <GameMultimediaEditor
          slug={slug}
          revision={item.revision}
          coverImage={game.coverImage}
          heroImage={game.heroImage}
          screenshots={game.screenshots}
        />
      )}

      {section === "descargas" && (
        <GameDistributionEditor
          game={game}
          revision={item.revision}
          action={downloadAction}
        />
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

      {section === "historial" && (
        <GameHistoryPanel
          events={history}
          currentRevision={item.revision}
        />
      )}
    </>
  );
}
