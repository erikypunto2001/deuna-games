import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import GameCollectionEditor from "@/components/admin/GameCollectionEditor";
import { listEditorialItems } from "@/lib/admin/content-service";
import { verifyAdminSession } from "@/lib/admin/session";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function AdminNewCollectionPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [games, params] = await Promise.all([
    listEditorialItems("game"),
    searchParams,
  ]);
  const state = Array.isArray(params.estado)
    ? params.estado[0]
    : params.estado;

  return (
    <>
      <Link href="/admin/colecciones" className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a colecciones
      </Link>
      <AdminPageHeader
        eyebrow="COLECCIÓN"
        title="Nueva colección"
        description="Crea una saga o franquicia y ordena sus juegos. La publicación se realiza después."
      />
      <EditorStateNotice state={state} />
      <section className={styles.editorPanel}>
        <GameCollectionEditor
          mode="create"
          games={games.map((game) => ({
            slug: game.payload.slug,
            title: game.payload.title,
          }))}
        />
      </section>
    </>
  );
}
