import Link from "next/link";
import { Plus } from "lucide-react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import { listEditorialItems } from "@/lib/admin/content-service";
import { listPublicationStates } from "@/lib/admin/publication-overview";
import { verifyAdminSession } from "@/lib/admin/session";

import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function AdminCollectionsPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [items, states, params] = await Promise.all([
    listEditorialItems("game_collection"),
    listPublicationStates("game_collection"),
    searchParams,
  ]);
  const state = Array.isArray(params.estado)
    ? params.estado[0]
    : params.estado;
  const stateByKey = new Map(
    (states ?? []).map((item) => [item.key, item])
  );

  return (
    <>
      <AdminPageHeader
        eyebrow="CONTENIDO"
        title="Colecciones"
        description="Administra sagas y franquicias como Mortal Kombat, God of War o Resident Evil. Las colecciones por consola se generan automáticamente desde los releases."
        action={
          <Link href="/admin/colecciones/nueva" className={styles.tableAction}>
            <Plus size={15} aria-hidden="true" />
            Nueva colección
          </Link>
        }
      />
      <EditorStateNotice state={state} />
      <section className={styles.tablePanel}>
        <div className={styles.tableSummary}>
          <strong>Sagas y franquicias</strong>
          <span>{items.length} colecciones</span>
        </div>
        {items.length ? (
          <div className={styles.tableWrap}>
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Colección</th>
                  <th>Juegos</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const publication = stateByKey.get(item.key);
                  return (
                    <tr key={item.key}>
                      <th scope="row">
                        <strong>{item.payload.title}</strong>
                        <span>{item.key}</span>
                      </th>
                      <td>{item.payload.gameSlugs.length}</td>
                      <td>
                        {publication?.publicVisible
                          ? publication.hasUnpublishedChanges
                            ? "Cambios pendientes"
                            : "Publicada"
                          : "Oculta / sin publicar"}
                      </td>
                      <td>
                        <Link
                          href={
                            "/admin/colecciones/" +
                            encodeURIComponent(item.key)
                          }
                          className={styles.tableAction}
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.emptyState}>
            Todavía no hay colecciones editoriales.
          </p>
        )}
      </section>
    </>
  );
}
