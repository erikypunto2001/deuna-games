import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import PublicationPanel from "@/components/admin/PublicationPanel";
import {
  getEditorialItem,
} from "@/lib/admin/content-service";
import {
  getAboutConfigPublicationState,
} from "@/lib/admin/publication-service";
import {
  verifyAdminSession,
} from "@/lib/admin/session";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
  }>;
};

const sections = [
  "encabezado",
  "principios",
  "proposito",
  "cierre",
  "publicacion",
] as const;

type AboutSection = (typeof sections)[number];

function resolveSection(
  value: string | string[] | undefined
): AboutSection {
  const candidate = Array.isArray(value) ? value[0] : value;
  return sections.includes(candidate as AboutSection)
    ? (candidate as AboutSection)
    : "encabezado";
}

export default async function AdminAboutEditorPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [item, parameters] = await Promise.all([
    getEditorialItem("about_config", "about"),
    searchParams,
  ]);

  if (!item) notFound();

  let publicationState = null;

  try {
    publicationState =
      await getAboutConfigPublicationState();
  } catch {
    console.error(
      "No se pudo leer el estado de publicación de Quiénes somos."
    );
  }

  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;
  const section = resolveSection(parameters.seccion);
  const about = item.payload;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <Link href="/admin/paginas" className={styles.backLink}>
          <ArrowLeft size={15} aria-hidden="true" />
          Volver a páginas
        </Link>
        <Link
          href="/quienes-somos"
          className={styles.tableAction}
          target="_blank"
          rel="noreferrer"
        >
          Ver página pública
          <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </div>

      <AdminPageHeader
        eyebrow={<>PÁGINA · REVISIÓN {item.revision}</>}
        title="Quiénes somos"
        description="Edita los textos institucionales sin modificar HTML, scripts, enlaces ni estructura visual. Cada formulario guarda una revisión privada; publicar es una acción separada."
        action={<span className={styles.draftState}>
          {publicationState?.hasUnpublishedChanges
            ? "Cambios sin publicar"
            : item.status === "synced"
              ? "Sin cambios"
              : "Borrador guardado"}
        </span>}
      />

      <EditorStateNotice state={state} />

      {section === "encabezado" && <section className={styles.editorPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span>ENCABEZADO</span>
            <h2>Hero y nuestra idea</h2>
          </div>
          <p>El nombre público se inserta automáticamente desde Configuración.</p>
        </div>

        <form
          className={styles.editorForm}
          method="post"
          action="/api/admin/content/about/hero"
        >
          <input type="hidden" name="expectedRevision" value={item.revision} />

          <label>
            <span>Título</span>
            <input name="heroTitle" defaultValue={about.hero.title} maxLength={180} required />
          </label>
          <label>
            <span>Parte destacada</span>
            <input name="heroHighlight" defaultValue={about.hero.highlight} maxLength={180} required />
          </label>
          <label className={styles.fieldWide}>
            <span>Texto después del nombre del sitio</span>
            <textarea name="heroText" defaultValue={about.hero.text} maxLength={500} rows={4} required />
          </label>

          {about.hero.signals.map((signal, index) => (
            <div key={index} className={styles.fieldWide}>
              <div className={styles.editorForm}>
                <label>
                  <span>Idea {index + 1} · título</span>
                  <input
                    name={`signal${index + 1}Title`}
                    defaultValue={signal.title}
                    maxLength={180}
                    required
                  />
                </label>
                <label>
                  <span>Idea {index + 1} · texto</span>
                  <textarea
                    name={`signal${index + 1}Text`}
                    defaultValue={signal.text}
                    maxLength={500}
                    rows={3}
                    required
                  />
                </label>
              </div>
            </div>
          ))}

          <div className={styles.formActions}>
            <p>Guardar esta sección no modifica la página pública.</p>
            <button type="submit">Guardar hero</button>
          </div>
        </form>
      </section>}

      {section === "principios" && <section className={styles.editorPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span>INTRODUCCIÓN</span>
            <h2>Presentación y principios</h2>
          </div>
          <p>Los tres iconos permanecen fijos para preservar el diseño.</p>
        </div>

        <form
          className={styles.editorForm}
          method="post"
          action="/api/admin/content/about/principles"
        >
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label>
            <span>Título</span>
            <input name="introTitle" defaultValue={about.intro.title} maxLength={180} required />
          </label>
          <label>
            <span>Parte destacada</span>
            <input name="introHighlight" defaultValue={about.intro.highlight} maxLength={180} required />
          </label>
          <label className={styles.fieldWide}>
            <span>Párrafo 1</span>
            <textarea name="introParagraph1" defaultValue={about.intro.paragraphs[0]} maxLength={500} rows={4} required />
          </label>
          <label className={styles.fieldWide}>
            <span>Párrafo 2</span>
            <textarea name="introParagraph2" defaultValue={about.intro.paragraphs[1]} maxLength={500} rows={4} required />
          </label>

          {about.principles.map((principle, index) => (
            <div key={index} className={styles.fieldWide}>
              <div className={styles.editorForm}>
                <label>
                  <span>Principio {index + 1} · etiqueta</span>
                  <input name={`principle${index + 1}Eyebrow`} defaultValue={principle.eyebrow} maxLength={60} required />
                </label>
                <label>
                  <span>Principio {index + 1} · título</span>
                  <input name={`principle${index + 1}Title`} defaultValue={principle.title} maxLength={180} required />
                </label>
                <label className={styles.fieldWide}>
                  <span>Principio {index + 1} · texto</span>
                  <textarea name={`principle${index + 1}Text`} defaultValue={principle.text} maxLength={500} rows={3} required />
                </label>
              </div>
            </div>
          ))}

          <div className={styles.formActions}>
            <p>Los textos se validan y guardan como contenido, nunca como HTML.</p>
            <button type="submit">Guardar introducción</button>
          </div>
        </form>
      </section>}

      {section === "proposito" && <section className={styles.editorPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span>PROPÓSITO</span>
            <h2>Por qué existe y ecosistema</h2>
          </div>
          <p>El nombre corto del sitio se antepone automáticamente al segundo párrafo.</p>
        </div>

        <form
          className={styles.editorForm}
          method="post"
          action="/api/admin/content/about/reason"
        >
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label>
            <span>Título</span>
            <input name="reasonTitle" defaultValue={about.reason.title} maxLength={180} required />
          </label>
          <label>
            <span>Parte destacada</span>
            <input name="reasonHighlight" defaultValue={about.reason.highlight} maxLength={180} required />
          </label>
          <label className={styles.fieldWide}>
            <span>Párrafo 1</span>
            <textarea name="reasonParagraph1" defaultValue={about.reason.paragraphs[0]} maxLength={500} rows={4} required />
          </label>
          <label className={styles.fieldWide}>
            <span>Párrafo 2 · después del nombre corto</span>
            <textarea name="reasonParagraph2" defaultValue={about.reason.paragraphs[1]} maxLength={500} rows={4} required />
          </label>

          {about.ecosystem.map((entry, index) => (
            <div key={index} className={styles.fieldWide}>
              <div className={styles.editorForm}>
                <label>
                  <span>Ecosistema {index + 1} · título</span>
                  <input name={`ecosystem${index + 1}Title`} defaultValue={entry.title} maxLength={180} required />
                </label>
                <label>
                  <span>Ecosistema {index + 1} · texto</span>
                  <textarea name={`ecosystem${index + 1}Text`} defaultValue={entry.text} maxLength={500} rows={3} required />
                </label>
              </div>
            </div>
          ))}

          <div className={styles.formActions}>
            <p>Guardar conserva enlaces, iconos y disposición actuales.</p>
            <button type="submit">Guardar propósito</button>
          </div>
        </form>
      </section>}

      {section === "cierre" && <section className={styles.editorPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span>CIERRE</span>
            <h2>Manifiesto y llamada final</h2>
          </div>
          <p>Los botones públicos continúan apuntando al catálogo y a actualizaciones.</p>
        </div>

        <form
          className={styles.editorForm}
          method="post"
          action="/api/admin/content/about/manifesto"
        >
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label>
            <span>Título del manifiesto</span>
            <input name="manifestoTitle" defaultValue={about.manifesto.title} maxLength={180} required />
          </label>
          <label>
            <span>Parte destacada</span>
            <input name="manifestoHighlight" defaultValue={about.manifesto.highlight} maxLength={180} required />
          </label>
          <label className={styles.fieldWide}>
            <span>Texto del manifiesto</span>
            <textarea name="manifestoText" defaultValue={about.manifesto.text} maxLength={500} rows={4} required />
          </label>
          <label className={styles.fieldWide}>
            <span>Título de llamada final</span>
            <input name="ctaTitle" defaultValue={about.ctaTitle} maxLength={180} required />
          </label>

          <div className={styles.formActions}>
            <p>El borrador completo se publica desde el bloque siguiente.</p>
            <button type="submit">Guardar cierre</button>
          </div>
        </form>
      </section>}

      {section === "publicacion" && <section className={styles.editorPanel}>
        {publicationState ? (
          <PublicationPanel
            state={publicationState}
            requestState={state}
            publishAction="/api/admin/content/about/publish"
          />
        ) : (
          <p>
            La infraestructura de publicación todavía no está disponible. Aplica las migraciones e importa el contenido editorial antes de publicar.
          </p>
        )}
      </section>}
    </>
  );
}
