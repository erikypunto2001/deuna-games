import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import HomeContentEditor from "@/components/admin/HomeContentEditor";
import HomeHeroEditor from "@/components/admin/HomeHeroEditor";
import HomeHeroSaveBoundary from "@/components/admin/HomeHeroSaveBoundary";
import PublicationPanel from "@/components/admin/PublicationPanel";
import {
  resolveHomeConfig,
} from "@/data/home-config";
import {
  getEditorialItem,
  listEditorialItems,
} from "@/lib/admin/content-service";
import {
  resolveHomeAdminSection,
} from "@/lib/admin/home-admin-sections";
import {
  getHomeConfigPublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  getHomeRankingReferenceTime,
} from "@/lib/home/server-ranking-reference";
import { getPublicSiteConfig } from "@/lib/site/public-site-config";

import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
  }>;
};

async function readPublicationState() {
  try {
    return await getHomeConfigPublicationState();
  } catch {
    console.error(
      "No se pudo leer el estado de publicación de Inicio."
    );
    return null;
  }
}

export default async function AdminHomeEditorPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();

  const parameters = await searchParams;
  const section = resolveHomeAdminSection(parameters.seccion);
  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;

  const [item, publicationState] = await Promise.all([
    getEditorialItem("home_config", "home"),
    readPublicationState(),
  ]);

  if (!item) notFound();

  const resolved = resolveHomeConfig(item.payload);

  let sectionContent: ReactNode = null;

  if (section === "hero") {
    const rankingReferenceTime = getHomeRankingReferenceTime();
    const [games, publicGames, siteConfig] = await Promise.all([
      listEditorialItems("game"),
      getPublicGames(),
      getPublicSiteConfig(),
    ]);
    const publicBySlug = new Map(
      publicGames.map((game) => [game.slug, game])
    );
    const curationGames = games.map((game) =>
      publicBySlug.get(game.key) ?? game.payload
    );

    sectionContent = (
      <HomeHeroSaveBoundary revision={item.revision}>
        <HomeHeroEditor
          key={item.revision}
          config={resolved}
          games={curationGames}
          publicGames={publicGames}
          revision={item.revision}
          rankingReferenceTime={rankingReferenceTime}
          background={{
            brandColor: siteConfig.brandColor,
            customAssets: siteConfig.backgroundLibrary,
            pageBackgrounds: siteConfig.pageBackgrounds,
          }}
        />
      </HomeHeroSaveBoundary>
    );
  }

  if (section === "contenido") {
    const rankingReferenceTime = getHomeRankingReferenceTime();
    const [games, publicGames] = await Promise.all([
      listEditorialItems("game"),
      getPublicGames(),
    ]);
    const publicBySlug = new Map(
      publicGames.map((game) => [game.slug, game])
    );
    const curationGames = games.map((game) =>
      publicBySlug.get(game.key) ?? game.payload
    );
    const publishedSlugs = publicGames.map(
      (game) => game.slug
    );

    sectionContent = (
      <HomeContentEditor
        key={item.revision}
        config={resolved}
        games={curationGames}
        publishedSlugs={publishedSlugs}
        revision={item.revision}
        rankingReferenceTime={rankingReferenceTime}
      />
    );
  }

  if (section === "publicacion") {
    sectionContent = (
      <section className={styles.editorPanel}>
        {publicationState ? (
          <PublicationPanel
            state={publicationState}
            requestState={state}
            publishAction="/api/admin/content/home/publish"
          />
        ) : (
          <p>
            La infraestructura de publicación todavía no está disponible en esta base. Aplica las migraciones e importa el contenido editorial antes de publicar Inicio.
          </p>
        )}
      </section>
    );
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={<>INICIO · REVISIÓN {item.revision}</>}
        title="Inicio"
        description="Administra curaduría, automatización, orden, visibilidad y textos de la página principal sin mezclar contenido con la lógica de los componentes. Todo queda en borrador hasta publicar."
        action={
          <span className={styles.draftState}>
            {publicationState?.hasUnpublishedChanges
              ? "Cambios sin publicar"
              : item.status === "synced"
                ? "Sin cambios"
                : "Borrador guardado"}
          </span>
        }
      />

      <EditorStateNotice state={state} />
      {sectionContent}
    </>
  );
}