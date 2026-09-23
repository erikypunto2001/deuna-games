import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import GameDeletionPanel from "@/components/admin/GameDeletionPanel";
import GamePublicationWorkspace from "@/components/admin/GamePublicationWorkspace";
import GameTaxonomyPublicationNotice from "@/components/admin/GameTaxonomyPublicationNotice";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  getGameDeletionPreview,
} from "@/lib/admin/editorial-maintenance-service";
import {
  getGameMediaWorkspaceSnapshot,
} from "@/lib/admin/game-media-workspace";
import {
  getPublishedGameSnapshot,
  inspectPublishedGameTaxonomyIntegrity,
} from "@/lib/admin/game-publication-review";
import {
  getGamePublicationIdentity,
} from "@/lib/admin/publication-overview";
import {
  getGamePublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";

import styles from "../../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    estado?: string | string[];
  }>;
};

export default async function AdminGamePublicationPage({
  params,
  searchParams,
}: PageProps) {
  const session = await verifyAdminSession();
  const [{ slug }, parameters] = await Promise.all([
    params,
    searchParams,
  ]);
  const item = await getEditorialItem("game", slug);

  if (!item) notFound();

  const [
    publicationState,
    publicationIdentity,
    mediaWorkspace,
    taxonomyIntegrity,
  ] = await Promise.all([
    getGamePublicationState(slug),
    getGamePublicationIdentity(slug),
    getGameMediaWorkspaceSnapshot(slug),
    inspectPublishedGameTaxonomyIntegrity(item.payload),
  ]);

  if (!publicationState || !mediaWorkspace) notFound();

  const requestState = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;
  const workspaceRequestState =
    requestState === "catalogos-sin-publicar" && !taxonomyIntegrity.ok
      ? undefined
      : requestState;
  const panelCreated =
    publicationIdentity?.panelCreated ?? false;
  const neverPublished = Boolean(
    panelCreated &&
      !publicationState.publicVisible &&
      !publicationIdentity?.everPublished
  );
  const publishedGame = neverPublished
    ? null
    : await getPublishedGameSnapshot(slug);
  const deletionPreview = session.role === "owner"
    ? await getGameDeletionPreview(slug)
    : null;

  return (
    <>
      <Link
        href="/admin/juegos"
        className={styles.backLink}
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a juegos
      </Link>

      <AdminPageHeader
        eyebrow={<>PUBLICACIÓN · REVISIÓN {item.revision}</>}
        title={item.payload.title}
        description="Revisa el borrador, comprueba la preparación editorial y decide cuándo debe cambiar la web pública."
        action={<Link
          href={`/admin/juegos/${encodeURIComponent(slug)}/vista-previa`}
          className={styles.tableAction}
        >
          <Eye size={15} aria-hidden="true" />
          Vista previa
        </Link>}
      />

      <GameTaxonomyPublicationNotice integrity={taxonomyIntegrity} />

      <GamePublicationWorkspace
        game={item.payload}
        publishedGame={publishedGame}
        slug={slug}
        state={publicationState}
        requestState={workspaceRequestState}
        neverPublished={neverPublished}
        mediaHygiene={mediaWorkspace.hygiene}
      />

      {deletionPreview && (
        <GameDeletionPanel
          slug={slug}
          preview={deletionPreview}
        />
      )}
    </>
  );
}
