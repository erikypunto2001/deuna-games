import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import SoftwareEditor from "@/components/admin/SoftwareEditor";
import { getEditorialItem } from "@/lib/admin/content-service";
import { verifyAdminSession } from "@/lib/admin/session";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function AdminNewProgramPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [platforms, params] = await Promise.all([
    getEditorialItem("platform_catalog", "platforms"),
    searchParams,
  ]);
  const state = Array.isArray(params.estado)
    ? params.estado[0]
    : params.estado;

  return (
    <>
      <Link href="/admin/programas" className={styles.backLink}>
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a programas
      </Link>
      <AdminPageHeader
        eyebrow="PROGRAMA"
        title="Nuevo programa"
        description="Crea un borrador privado. La publicación sigue siendo una operación separada."
      />
      <EditorStateNotice state={state} />
      {!platforms ? (
        <section className={styles.editorPanel}>
          <p>Aplica las migraciones e importa el catálogo de plataformas.</p>
        </section>
      ) : (
        <section className={styles.editorPanel}>
          <SoftwareEditor
            mode="create"
            platforms={platforms.payload.platforms}
          />
        </section>
      )}
    </>
  );
}
