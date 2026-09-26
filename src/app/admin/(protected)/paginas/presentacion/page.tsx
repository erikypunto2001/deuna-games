import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import PublicationPanel from "@/components/admin/PublicationPanel";
import {
  PUBLIC_PAGES_EDITORIAL_KEY,
} from "@/data/public-pages-config";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  getPublicPagesConfigPublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

type Section =
  | "juegos"
  | "actualizaciones"
  | "compatibilidad"
  | "publicacion"
;

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
  }>;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveSection(value: string | undefined): Section {
  return value === "actualizaciones" ||
    value === "compatibilidad" ||
    value === "publicacion"
    ? value
    : "juegos";
}

export default async function AdminPublicPresentationPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [item, parameters] = await Promise.all([
    getEditorialItem(
      "public_pages_config",
      PUBLIC_PAGES_EDITORIAL_KEY
    ),
    searchParams,
  ]);

  if (!item) notFound();

  const section = resolveSection(
    single(parameters.seccion)
  );
  const state = single(parameters.estado);
  const config = item.payload;
  let publicationState = null;

  try {
    publicationState =
      await getPublicPagesConfigPublicationState();
  } catch {
    console.error(
      "No se pudo leer el estado de publicación de las superficies públicas."
    );
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={<>PRESENTACIÓN PÚBLICA · REVISIÓN {item.revision}</>}
        title="Textos y cabeceras públicas"
        description="Administra el contenido editorial de Juegos, Actualizaciones y ¿Qué puedo jugar? sin exponer filtros, rutas, estados técnicos ni lógica del producto."
        action={<span className={styles.draftState}>
          {publicationState?.hasUnpublishedChanges
            ? "Cambios sin publicar"
            : item.status === "synced"
              ? "Sin cambios"
              : "Borrador guardado"}
        </span>}
      />

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <Link className={styles.tableAction} href="/admin/paginas">
          <ArrowLeft size={13} aria-hidden="true" />
          Volver a Páginas
        </Link>
        <Link className={styles.tableAction} href="/juegos" target="_blank" rel="noreferrer">
          <ExternalLink size={13} aria-hidden="true" />
          Ver Juegos
        </Link>
        <Link className={styles.tableAction} href="/actualizaciones" target="_blank" rel="noreferrer">
          <ExternalLink size={13} aria-hidden="true" />
          Ver Actualizaciones
        </Link>
        <Link className={styles.tableAction} href="/requisitos" target="_blank" rel="noreferrer">
          <ExternalLink size={13} aria-hidden="true" />
          Ver recomendador
        </Link>
      </div>

      <EditorStateNotice state={state} />

      {section === "juegos" && (
        <section className={styles.editorPanel}>
          <form
            className={styles.editorForm}
            method="post"
            action="/api/admin/content/public-pages/games"
          >
            <input type="hidden" name="expectedRevision" value={item.revision} />

            <label>
              <span>Antetítulo</span>
              <input name="eyebrow" defaultValue={config.games.eyebrow} maxLength={100} required />
            </label>

            <label>
              <span>Título</span>
              <input name="title" defaultValue={config.games.title} maxLength={180} required />
            </label>

            <label className={styles.fieldWide}>
              <span>Descripción</span>
              <textarea name="description" defaultValue={config.games.description} rows={5} maxLength={900} required />
            </label>

            <label>
              <span>Etiqueta de plataforma</span>
              <input name="platformLabel" defaultValue={config.games.platformLabel} maxLength={100} required />
            </label>

            <div className={styles.formActions}>
              <p>
                La cabecera de Juegos conserva sólo contenido textual. El fondo general de la página se administra desde Configuración → Apariencia → Fondos.
              </p>
              <button type="submit">Guardar borrador</button>
            </div>
          </form>
        </section>
      )}

      {section === "actualizaciones" && (
        <section className={styles.editorPanel}>
          <form
            className={styles.editorForm}
            method="post"
            action="/api/admin/content/public-pages/updates"
          >
            <input type="hidden" name="expectedRevision" value={item.revision} />

            <label>
              <span>Antetítulo</span>
              <input name="eyebrow" defaultValue={config.updates.eyebrow} maxLength={100} required />
            </label>
            <label>
              <span>Título</span>
              <input name="title" defaultValue={config.updates.title} maxLength={180} required />
            </label>
            <label>
              <span>Texto destacado</span>
              <input name="highlight" defaultValue={config.updates.highlight} maxLength={180} required />
            </label>
            <label className={styles.fieldWide}>
              <span>Descripción</span>
              <textarea name="description" defaultValue={config.updates.description} rows={4} maxLength={900} required />
            </label>

            {config.updates.infoCards.map((card, index) => (
              <div key={index} className={styles.fieldWide}>
                <div className={styles.tableSummary}>
                  <strong>Bloque informativo {index + 1}</strong>
                  <span>El icono y la estructura visual permanecen definidos por el producto.</span>
                </div>
                <label>
                  <span>Título</span>
                  <input
                    name={`info${index + 1}Title`}
                    defaultValue={card.title}
                    maxLength={180}
                    required
                  />
                </label>
                <label>
                  <span>Texto</span>
                  <textarea
                    name={`info${index + 1}Text`}
                    defaultValue={card.text}
                    rows={3}
                    maxLength={900}
                    required
                  />
                </label>
              </div>
            ))}

            <div className={styles.formActions}>
              <p>
                Los contadores, fechas y estados de versión son datos del sistema y no se convierten en contenido manual.
              </p>
              <button type="submit">Guardar borrador</button>
            </div>
          </form>
        </section>
      )}

      {section === "compatibilidad" && (
        <section className={styles.editorPanel}>
          <form
            className={styles.editorForm}
            method="post"
            action="/api/admin/content/public-pages/finder"
          >
            <input type="hidden" name="expectedRevision" value={item.revision} />

            <label>
              <span>Antetítulo</span>
              <input name="eyebrow" defaultValue={config.finder.eyebrow} maxLength={100} required />
            </label>
            <label>
              <span>Título</span>
              <input name="title" defaultValue={config.finder.title} maxLength={180} required />
            </label>
            <label>
              <span>Texto destacado</span>
              <input name="highlight" defaultValue={config.finder.highlight} maxLength={180} required />
            </label>
            <label className={styles.fieldWide}>
              <span>Descripción</span>
              <textarea name="description" defaultValue={config.finder.description} rows={4} maxLength={900} required />
            </label>

            {config.finder.flow.map((label, index) => (
              <label key={index}>
                <span>Paso {index + 1}</span>
                <input
                  name={`flow${index + 1}`}
                  defaultValue={label}
                  maxLength={100}
                  required
                />
              </label>
            ))}

            <label className={styles.fieldWide}>
              <span>Mensaje de privacidad</span>
              <textarea name="trustText" defaultValue={config.finder.trustText} rows={3} maxLength={900} required />
            </label>

            <div className={styles.formActions}>
              <p>
                CPU, GPU, RAM, rangos FPS, estados de detección y reglas del recomendador siguen siendo lógica protegida del producto.
              </p>
              <button type="submit">Guardar borrador</button>
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
              publishAction="/api/admin/content/public-pages/publish"
            />
          ) : (
            <p>
              La infraestructura de publicación todavía no está disponible. Aplica las migraciones e importa el contenido editorial antes de publicar.
            </p>
          )}
        </section>
      )}
    </>
  );
}
