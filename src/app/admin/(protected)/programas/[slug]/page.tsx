import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import PublicationPanel from "@/components/admin/PublicationPanel";
import SoftwareEditor from "@/components/admin/SoftwareEditor";
import { getEditorialItem } from "@/lib/admin/content-service";
import { getSoftwarePublicationState } from "@/lib/admin/publication-service";
import { verifyAdminSession } from "@/lib/admin/session";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function AdminProgramPage({
  params,
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [item, platforms, publication] = await Promise.all([
    getEditorialItem("software", slug),
    getEditorialItem("platform_catalog", "platforms"),
    getSoftwarePublicationState(slug),
  ]);
  if (!item) notFound();

  const state = Array.isArray(query.estado)
    ? query.estado[0]
    : query.estado;

  return (
    <>
      <Link href="/admin/programas" className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a programas
      </Link>
      <AdminPageHeader
        eyebrow={"PROGRAMA · REVISIÓN " + item.revision}
        title={item.payload.name}
        description="Edita la ficha, plataformas y descargas. Guardar conserva el borrador; Publicar actualiza la web."
        action={
          publication?.publicVisible ? (
            <Link
              href={"/programas/" + encodeURIComponent(slug)}
              target="_blank"
              rel="noreferrer"
              className={styles.tableAction}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Ver público
            </Link>
          ) : undefined
        }
      />
      <EditorStateNotice state={state} />

      {platforms && (
        <section className={styles.editorPanel}>
          <SoftwareEditor
            mode="edit"
            software={item.payload}
            revision={item.revision}
            platforms={platforms.payload.platforms}
          />
        </section>
      )}

      {publication && (
        <section className={styles.editorPanel}>
          <PublicationPanel
            state={publication}
            requestState={state}
            publishAction={
              "/api/admin/content/software/" +
              encodeURIComponent(slug) +
              "/publish"
            }
            hideAction={
              "/api/admin/content/software/" +
              encodeURIComponent(slug) +
              "/hide"
            }
          />
        </section>
      )}
    </>
  );
}
