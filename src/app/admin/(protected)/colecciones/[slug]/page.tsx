import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import GameCollectionEditor from "@/components/admin/GameCollectionEditor";
import PublicationPanel from "@/components/admin/PublicationPanel";
import {
  getEditorialItem,
  listEditorialItems,
} from "@/lib/admin/content-service";
import {
  getGameCollectionPublicationState,
} from "@/lib/admin/publication-service";
import { verifyAdminSession } from "@/lib/admin/session";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function AdminCollectionPage({
  params,
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [item, games, publication] = await Promise.all([
    getEditorialItem("game_collection", slug),
    listEditorialItems("game"),
    getGameCollectionPublicationState(slug),
  ]);
  if (!item) notFound();

  const state = Array.isArray(query.estado)
    ? query.estado[0]
    : query.estado;

  return (
    <>
      <Link href="/admin/colecciones" className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a colecciones
      </Link>
      <AdminPageHeader
        eyebrow={"COLECCIÓN · REVISIÓN " + item.revision}
        title={item.payload.title}
        description="Ordena los juegos y publica la colección cuando esté lista."
        action={
          publication?.publicVisible ? (
            <Link
              href={"/colecciones/" + encodeURIComponent(slug)}
              target="_blank"
              rel="noreferrer"
              className={styles.tableAction}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Ver pública
            </Link>
          ) : undefined
        }
      />
      <EditorStateNotice state={state} />
      <section className={styles.editorPanel}>
        <GameCollectionEditor
          mode="edit"
          collection={item.payload}
          revision={item.revision}
          games={games.map((game) => ({
            slug: game.payload.slug,
            title: game.payload.title,
          }))}
        />
      </section>

      {publication && (
        <section className={styles.editorPanel}>
          <PublicationPanel
            state={publication}
            requestState={state}
            publishAction={
              "/api/admin/content/collections/" +
              encodeURIComponent(slug) +
              "/publish"
            }
            hideAction={
              "/api/admin/content/collections/" +
              encodeURIComponent(slug) +
              "/hide"
            }
          />
        </section>
      )}
    </>
  );
}
