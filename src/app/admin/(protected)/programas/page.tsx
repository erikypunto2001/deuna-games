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

export default async function AdminProgramsPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [items, states, params] = await Promise.all([
    listEditorialItems("software"),
    listPublicationStates("software"),
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
        title="Programas"
        description="Publica emuladores, utilidades, escaladores, launchers y otras herramientas con sus propias plataformas y descargas."
        action={
          <Link href="/admin/programas/nuevo" className={styles.tableAction}>
            <Plus size={15} aria-hidden="true" />
            Nuevo programa
          </Link>
        }
      />
      <EditorStateNotice state={state} />

      <section className={styles.tablePanel}>
        <div className={styles.tableSummary}>
          <strong>Catálogo de programas</strong>
          <span>{items.length} elementos</span>
        </div>

        {items.length ? (
          <div className={styles.tableWrap}>
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Programa</th>
                  <th>Tipo</th>
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
                        <strong>{item.payload.name}</strong>
                        <span>{item.key}</span>
                      </th>
                      <td>{item.payload.kind}</td>
                      <td>
                        {publication?.publicVisible
                          ? publication.hasUnpublishedChanges
                            ? "Cambios pendientes"
                            : "Publicado"
                          : "Oculto / sin publicar"}
                      </td>
                      <td>
                        <Link
                          href={"/admin/programas/" + encodeURIComponent(item.key)}
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
            Todavía no hay programas. Crea el primero desde “Nuevo programa”.
          </p>
        )}
      </section>
    </>
  );
}
