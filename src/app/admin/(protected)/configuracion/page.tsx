import { notFound } from "next/navigation";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import PublicationPanel from "@/components/admin/PublicationPanel";
import SiteAppearanceWorkspace, {
  type AppearancePanel,
} from "@/components/admin/SiteAppearanceWorkspace";
import SiteBrandLogoEditor from "@/components/admin/SiteBrandLogoEditor";
import SiteIdentityPreview from "@/components/admin/SiteIdentityPreview";
import { getEditorialItem } from "@/lib/admin/content-service";
import { getSiteConfigPublicationState } from "@/lib/admin/publication-service";
import { verifyAdminSession } from "@/lib/admin/session";
import { siteConfig as sourceSiteConfig } from "@/lib/site";

import styles from "../../admin.module.css";
import configStyles from "./configuration.module.css";

export const dynamic = "force-dynamic";

const sections = [
  "identidad",
  "apariencia",
  "publicacion",
] as const;

const appearancePanels: AppearancePanel[] = [
  "palette",
  "backgrounds",
];

type ConfigurationSection = (typeof sections)[number];

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    seccion?: string | string[];
    panel?: string | string[];
  }>;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveSection(
  value: string | string[] | undefined
): ConfigurationSection {
  const candidate = single(value);

  return sections.includes(candidate as ConfigurationSection)
    ? (candidate as ConfigurationSection)
    : "identidad";
}

function resolveAppearancePanel(
  value: string | string[] | undefined
): AppearancePanel {
  const candidate = single(value) as AppearancePanel | undefined;

  return candidate && appearancePanels.includes(candidate)
    ? candidate
    : "palette";
}

function pageHeading(section: ConfigurationSection) {
  switch (section) {
    case "apariencia":
      return {
        title: "Apariencia del sitio",
        description:
          "Administra colores y fondos de las páginas desde un único espacio. Todo se guarda primero como borrador y sólo llega al sitio al publicar.",
      };
    case "publicacion":
      return {
        title: "Publicación de marca y apariencia",
        description:
          "Revisa el borrador completo de identidad y apariencia antes de convertirlo en la versión pública activa.",
      };
    default:
      return {
        title: "Identidad de marca",
        description:
          "Administra nombre, descripción, logo y presentación institucional. Todo se guarda primero como borrador.",
      };
  }
}

export default async function AdminConfigurationPage({
  searchParams,
}: PageProps) {
  await verifyAdminSession();
  const [item, parameters] = await Promise.all([
    getEditorialItem("site_config", "site"),
    searchParams,
  ]);

  if (!item) notFound();

  let publicationState = null;

  try {
    publicationState = await getSiteConfigPublicationState();
  } catch {
    console.error(
      "No se pudo leer el estado de publicación de Marca y apariencia."
    );
  }

  const state = single(parameters.estado);
  const section = resolveSection(parameters.seccion);
  const appearancePanel = resolveAppearancePanel(parameters.panel);
  const heading = pageHeading(section);
  const config = {
    ...sourceSiteConfig,
    ...item.payload,
    footerTagline:
      item.payload.footerTagline ?? sourceSiteConfig.footerTagline,
    brandColor:
      item.payload.brandColor ?? sourceSiteConfig.brandColor,
    logoAsset: item.payload.logoAsset,
    logoScale: item.payload.logoScale ?? 100,
    logoColorMode:
      item.payload.logoColorMode ?? sourceSiteConfig.logoColorMode,
    logoCustomColor:
      item.payload.logoCustomColor ?? sourceSiteConfig.logoCustomColor,
  };
  const status = publicationState?.hasUnpublishedChanges
    ? "Cambios sin publicar"
    : item.status === "synced"
      ? "Sin cambios"
      : "Borrador guardado";

  return (
    <>
      <AdminPageHeader
        eyebrow={<>MARCA Y APARIENCIA · REVISIÓN {item.revision}</>}
        title={heading.title}
        description={heading.description}
        action={<span className={styles.draftState}>{status}</span>}
      />

      <EditorStateNotice state={state} />

      {section === "identidad" && (
        <div className={configStyles.workspace}>
          <section className={`${styles.editorPanel} ${configStyles.formPanel}`}>
            <div className={configStyles.sectionIntro}>
              <span>DATOS GENERALES</span>
              <h2>Nombre y presentación</h2>
              <p>
                Estos datos y el símbolo de marca se guardan juntos como borrador hasta que decidas publicarlos.
              </p>
            </div>

            <form
              className={styles.editorForm}
              method="post"
              action="/api/admin/content/configuration?seccion=identidad"
            >
              <input
                type="hidden"
                name="expectedRevision"
                value={item.revision}
              />
              <input
                type="hidden"
                name="themeColor"
                value={config.themeColor}
              />
              <input
                type="hidden"
                name="brandColor"
                value={config.brandColor}
              />

              <label>
                <span>Nombre</span>
                <input
                  name="name"
                  defaultValue={config.name}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                <span>Nombre corto</span>
                <input
                  name="shortName"
                  defaultValue={config.shortName}
                  maxLength={100}
                  required
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Descripción</span>
                <textarea
                  name="description"
                  defaultValue={config.description}
                  maxLength={500}
                  rows={5}
                  required
                />
              </label>
              <label className={styles.fieldWide}>
                <span>Lema del pie de página</span>
                <input
                  name="footerTagline"
                  defaultValue={config.footerTagline}
                  maxLength={180}
                  required
                />
                <small>
                  Se muestra junto al copyright; los enlaces del pie permanecen protegidos.
                </small>
              </label>
              <label className={styles.fieldWide}>
                <span>Idioma</span>
                <select
                  name="language"
                  defaultValue={config.language}
                  required
                >
                  <option value="es">Español neutral</option>
                </select>
                <small>
                  La interfaz pública actual está disponible en español.
                </small>
              </label>

              <SiteBrandLogoEditor
                revision={item.revision}
                initialAsset={config.logoAsset}
                initialScale={config.logoScale}
                brandColor={config.brandColor}
                initialColorMode={config.logoColorMode}
                initialCustomColor={config.logoCustomColor}
              />

              <div className={styles.formActions}>
                <p>
                  Guardar no publica. La identidad activa permanece intacta hasta pulsar Publicar.
                </p>
                <button type="submit">Guardar borrador</button>
              </div>
            </form>
          </section>

          <SiteIdentityPreview {...config} />
        </div>
      )}

      {section === "apariencia" && (
        <SiteAppearanceWorkspace
          revision={item.revision}
          initialPanel={appearancePanel}
          name={config.name}
          shortName={config.shortName}
          description={config.description}
          footerTagline={config.footerTagline}
          language={config.language}
          themeColor={config.themeColor}
          brandColor={config.brandColor}
          logoAsset={config.logoAsset}
          logoScale={config.logoScale}
          logoColorMode={config.logoColorMode}
          logoCustomColor={config.logoCustomColor}
          customAssets={config.backgroundLibrary ?? []}
          pageBackgrounds={config.pageBackgrounds ?? {}}
        />
      )}

      {section === "publicacion" && (
        <section className={styles.editorPanel}>
          {publicationState ? (
            <PublicationPanel
              state={publicationState}
              requestState={state}
              publishAction="/api/admin/content/configuration/publish"
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
