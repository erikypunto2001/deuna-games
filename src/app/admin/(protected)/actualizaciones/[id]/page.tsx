import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  notFound,
  redirect,
} from "next/navigation";

import EditorStateNotice from "@/components/admin/EditorStateNotice";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import PublicationPanel from "@/components/admin/PublicationPanel";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  getUpdatePublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

const updateSections = [
  "editar",
  "publicacion",
] as const;

type UpdateSection = (typeof updateSections)[number];

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
  }>;
};

function resolveUpdateSection(
  value: string | string[] | undefined
): UpdateSection {
  const candidate = Array.isArray(value)
    ? value[0]
    : value;

  return updateSections.includes(candidate as UpdateSection)
    ? (candidate as UpdateSection)
    : "editar";
}

export default async function AdminUpdateEditorPage({
  params,
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [{ id }, parameters] = await Promise.all([
    params,
    searchParams,
  ]);
  const item = await getEditorialItem(
    "game_update",
    id
  );

  if (!item) notFound();

  let publicationState = null;

  try {
    publicationState =
      await getUpdatePublicationState(id);
  } catch {
    console.error(
      "No se pudo leer el estado de publicación de la actualización."
    );
  }

  const update = item.payload;

  if (
    publicationState?.publicVisible &&
    !publicationState.hasUnpublishedChanges
  ) {
    redirect(
      `/admin/juegos/${encodeURIComponent(update.gameSlug)}/actualizacion`
    );
  }

  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;
  const section = resolveUpdateSection(parameters.seccion);
  const publishedAt = new Date(
    update.publishedAt
  )
    .toISOString()
    .slice(0, 16);

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
        eyebrow={<>BORRADOR HISTÓRICO · REVISIÓN {item.revision}</>}
        title={update.version}
        description={<>Compatibilidad editorial para un borrador antiguo relacionado con {update.gameSlug}. Las versiones nuevas se gestionan desde Distribución → Nueva versión dentro del propio juego.</>}
        action={<span className={styles.draftState}>
          {publicationState?.publicVisible === false
            ? "Oculta de la web"
            : publicationState?.hasUnpublishedChanges
              ? "Cambios sin publicar"
              : item.status === "synced"
                ? "Sin cambios"
                : "Borrador guardado"}
        </span>}
      />

      <EditorStateNotice state={state} />

      {section === "editar" && (
        <section className={styles.editorPanel}>
          <form
            className={styles.editorForm}
            method="post"
            action={`/api/admin/content/updates/${encodeURIComponent(id)}`}
          >
            <input
              type="hidden"
              name="expectedRevision"
              value={item.revision}
            />

            <label>
              <span>Versión</span>
              <input
                name="version"
                defaultValue={update.version}
                maxLength={80}
                required
              />
            </label>

            <label>
              <span>Fecha y hora UTC</span>
              <input
                name="publishedAt"
                type="datetime-local"
                defaultValue={publishedAt}
                required
              />
            </label>

            <label>
              <span>Tipo</span>
              <select
                name="type"
                defaultValue={update.type}
                required
              >
                <option value="update">Actualización</option>
                <option value="content">Contenido</option>
                <option value="fix">Corrección</option>
                <option value="improvement">Mejora</option>
              </select>
            </label>

            <label>
              <span>Destacada</span>
              <select
                name="featured"
                defaultValue={
                  update.featured ? "true" : "false"
                }
                required
              >
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </label>

            <label className={styles.fieldWide}>
              <span>Resumen</span>
              <textarea
                name="summary"
                defaultValue={update.summary}
                maxLength={1500}
                rows={6}
                required
              />
            </label>

            <div className={styles.formActions}>
              <p>
                Este editor se conserva únicamente para resolver borradores históricos. Las versiones nuevas deben publicarse desde Distribución → Nueva versión.
              </p>
              <button type="submit">
                Guardar borrador histórico
              </button>
            </div>
          </form>
        </section>
      )}

      {section === "publicacion" && (
        <section className={styles.editorPanel}>
          {publicationState ? (
            <PublicationPanel
              state={publicationState}
              requestState={state}
              publishAction={`/api/admin/content/updates/${encodeURIComponent(id)}/publish`}
              hideAction={`/api/admin/content/updates/${encodeURIComponent(id)}/hide`}
            />
          ) : (
            <p>
              La infraestructura de publicación todavía no está disponible en esta base. El borrador permanece intacto hasta aplicar la migración editorial correspondiente.
            </p>
          )}
        </section>
      )}
    </>
  );
}
