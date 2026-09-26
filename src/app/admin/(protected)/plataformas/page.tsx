import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import PlatformCatalogEditor from "@/components/admin/PlatformCatalogEditor";
import PublicationPanel from "@/components/admin/PublicationPanel";
import { getEditorialItem } from "@/lib/admin/content-service";
import {
  getPlatformCatalogPublicationState,
} from "@/lib/admin/publication-service";
import { verifyAdminSession } from "@/lib/admin/session";

import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function AdminPlatformsPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [item, publication, params] = await Promise.all([
    getEditorialItem("platform_catalog", "platforms"),
    getPlatformCatalogPublicationState(),
    searchParams,
  ]);
  const state = Array.isArray(params.estado)
    ? params.estado[0]
    : params.estado;

  return (
    <>
      <AdminPageHeader
        eyebrow="CATÁLOGO MAESTRO"
        title="Plataformas"
        description="Agrega nuevas consolas sin modificar el código. Los identificadores existentes son permanentes; nombres, orden y visibilidad pueden evolucionar."
      />
      <EditorStateNotice state={state} />
      {!item ? (
        <section className={styles.editorPanel}>
          <p>
            Ejecuta la actualización local para importar el catálogo inicial.
          </p>
        </section>
      ) : (
        <>
          <section className={styles.editorPanel}>
            <PlatformCatalogEditor
              revision={item.revision}
              initialCatalog={item.payload}
            />
          </section>
          {publication && (
            <section className={styles.editorPanel}>
              <PublicationPanel
                state={publication}
                requestState={state}
                publishAction="/api/admin/content/platforms/publish"
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
