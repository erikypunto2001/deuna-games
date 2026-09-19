"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ImageIcon,
  Palette,
} from "lucide-react";

import SiteLogoMark from "@/components/brand/SiteLogoMark";
import {
  brandForeground,
  safeThemeBackground,
} from "@/lib/site/brand-foreground";
import type {
  SiteBackgroundAsset,
  SiteBackgroundMap,
} from "@/lib/site/backgrounds";
import {
  resolveSiteLogoColor,
  resolveSiteLogoColorMode,
  siteBrandLogoSupportsRecolor,
  type SiteLogoColorMode,
} from "@/lib/site/logo";

import adminStyles from "../../app/admin/admin.module.css";
import SiteBackgroundManager from "./SiteBackgroundManager";
import styles from "./SiteAppearanceWorkspace.module.css";

export type AppearancePanel =
  | "palette"
  | "backgrounds";

type SiteAppearanceWorkspaceProps = {
  revision: number;
  initialPanel?: AppearancePanel;
  name: string;
  shortName: string;
  description: string;
  footerTagline: string;
  language: "es";
  themeColor: string;
  brandColor: string;
  logoAsset?: string;
  logoScale?: number;
  logoColorMode: SiteLogoColorMode;
  logoCustomColor: string;
  customAssets?: SiteBackgroundAsset[];
  pageBackgrounds?: SiteBackgroundMap;
};

const panels: ReadonlyArray<{
  id: AppearancePanel;
  label: string;
  description: string;
  icon: typeof Palette;
}> = [
  {
    id: "palette",
    label: "Marca y color",
    description: "Colores globales",
    icon: Palette,
  },
  {
    id: "backgrounds",
    label: "Fondos",
    description: "Imágenes por página",
    icon: ImageIcon,
  },
];

export default function SiteAppearanceWorkspace({
  revision,
  initialPanel = "palette",
  name,
  shortName,
  description,
  footerTagline,
  language,
  themeColor: initialThemeColor,
  brandColor: initialBrandColor,
  logoAsset,
  logoScale = 100,
  logoColorMode,
  logoCustomColor,
  customAssets = [],
  pageBackgrounds = {},
}: SiteAppearanceWorkspaceProps) {
  const [activePanel, setActivePanel] =
    useState<AppearancePanel>(initialPanel);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [themeColor, setThemeColor] =
    useState(initialThemeColor);
  const [brandColor, setBrandColor] =
    useState(initialBrandColor);
  const effectiveLogoColorMode = resolveSiteLogoColorMode(
    logoAsset,
    logoColorMode
  );
  const isRasterLogo =
    Boolean(logoAsset) && !siteBrandLogoSupportsRecolor(logoAsset);

  const safeBackground = useMemo(
    () => safeThemeBackground(themeColor),
    [themeColor]
  );
  const onBrand = useMemo(
    () => brandForeground(brandColor),
    [brandColor]
  );
  const logoColor = useMemo(
    () => resolveSiteLogoColor({
      brandColor,
      logoColorMode: effectiveLogoColorMode,
      logoCustomColor,
    }),
    [brandColor, effectiveLogoColorMode, logoCustomColor]
  );
  const themeWasAdapted =
    safeBackground.toLowerCase() !== themeColor.toLowerCase();
  const previewStyle = {
    "--appearance-preview-bg": safeBackground,
    "--appearance-preview-brand": brandColor,
    "--appearance-preview-on-brand": onBrand,
  } as CSSProperties;

  function moveTab(
    currentIndex: number,
    event: KeyboardEvent<HTMLButtonElement>
  ) {
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % panels.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + panels.length) % panels.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = panels.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextPanel = panels[nextIndex];
    setActivePanel(nextPanel.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={styles.workspace}>
      <nav
        className={styles.tabs}
        role="tablist"
        aria-label="Herramientas de apariencia"
      >
        {panels.map((panel, index) => {
          const Icon = panel.icon;
          const selected = activePanel === panel.id;

          return (
            <button
              key={panel.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`appearance-tab-${panel.id}`}
              aria-selected={selected}
              aria-controls={`appearance-panel-${panel.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? styles.tabActive : undefined}
              onClick={() => setActivePanel(panel.id)}
              onKeyDown={(event) => moveTab(index, event)}
            >
              <span className={styles.tabIcon} aria-hidden="true">
                <Icon size={17} strokeWidth={1.9} />
              </span>
              <span className={styles.tabCopy}>
                <strong>{panel.label}</strong>
                <small>{panel.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <section
        id="appearance-panel-palette"
        role="tabpanel"
        aria-labelledby="appearance-tab-palette"
        hidden={activePanel !== "palette"}
        className={`${adminStyles.editorPanel} ${styles.palettePanel}`}
      >
        <div className={styles.panelHeading}>
          <span>MARCA Y COLOR</span>
          <h2>Paleta global del sitio</h2>
          <p>
            Aquí cambias los colores generales. Las imágenes de fondo se administran por separado en la pestaña Fondos.
          </p>
        </div>

        <div className={styles.paletteLayout}>
          <form
            className={adminStyles.editorForm}
            method="post"
            action="/api/admin/content/configuration?seccion=apariencia"
          >
            <input
              type="hidden"
              name="expectedRevision"
              value={revision}
            />
            <input type="hidden" name="name" value={name} />
            <input
              type="hidden"
              name="shortName"
              value={shortName}
            />
            <input
              type="hidden"
              name="description"
              value={description}
            />
            <input
              type="hidden"
              name="footerTagline"
              value={footerTagline}
            />
            <input
              type="hidden"
              name="language"
              value={language}
            />
            <input
              type="hidden"
              name="logoAsset"
              value={logoAsset ?? ""}
            />
            <input
              type="hidden"
              name="logoColorMode"
              value={effectiveLogoColorMode}
            />
            <input
              type="hidden"
              name="logoScale"
              value={logoScale}
            />
            <input
              type="hidden"
              name="logoCustomColor"
              value={logoCustomColor}
            />

            <div className={`${styles.colorFields} ${adminStyles.fieldWide}`}>
              <label className={styles.colorField}>
                <span className={styles.colorText}>
                  <strong>Fondo y navegador</strong>
                  <small>
                    Base oscura de páginas, cabecera y superficies globales.
                  </small>
                  <code>{themeColor}</code>
                </span>
                <input
                  type="color"
                  name="themeColor"
                  value={themeColor}
                  aria-label="Color de fondo y navegador"
                  onChange={(event) =>
                    setThemeColor(event.target.value)
                  }
                  required
                />
              </label>

              <label className={styles.colorField}>
                <span className={styles.colorText}>
                  <strong>Color de marca</strong>
                  <small>
                    Botones, enlaces, estados activos y acentos; el logo lo sigue cuando está en modo Marca.
                  </small>
                  <code>{brandColor}</code>
                </span>
                <input
                  type="color"
                  name="brandColor"
                  value={brandColor}
                  aria-label="Color de marca"
                  onChange={(event) =>
                    setBrandColor(event.target.value)
                  }
                  required
                />
              </label>
            </div>

            <div className={adminStyles.formActions}>
              <p>
                Guardar actualiza el borrador. El sitio público conserva la versión publicada hasta que uses Publicación.
              </p>
              <button type="submit">Guardar colores</button>
            </div>
          </form>

          <aside
            className={styles.palettePreview}
            style={previewStyle}
            aria-label="Vista previa de la paleta"
          >
            <div className={styles.previewTopbar}>
              <SiteLogoMark
                size={18}
                asset={logoAsset ?? null}
                scale={logoScale}
                color={logoColor}
                colorMode={effectiveLogoColorMode}
              />
              <strong>{shortName.trim() || name}</strong>
              <span className={styles.previewNavItem} />
              <span className={styles.previewNavItem} />
              <span className={styles.previewNavItem} />
            </div>

            <div className={styles.previewBody}>
              <span className={styles.previewEyebrow}>VISTA PREVIA</span>
              <strong>Así se combinarán los colores</strong>
              <p>
                Los fondos de cada página se eligen y ajustan desde su editor específico.
              </p>
              <button type="button" tabIndex={-1}>
                Acción principal
              </button>
            </div>

            <div className={styles.previewStatus}>
              <span>
                Fondo aplicado
                <code>{safeBackground}</code>
              </span>
              <span>
                Marca
                <code>{brandColor}</code>
              </span>
              <span>
                Logo
                <code>
                  {effectiveLogoColorMode === "original" && logoAsset
                    ? isRasterLogo
                      ? "Colores raster"
                      : "Colores SVG"
                    : logoColor}
                </code>
              </span>
            </div>

            {themeWasAdapted && (
              <p className={styles.contrastNotice}>
                El tono {themeColor} se oscurece automáticamente a {safeBackground} para mantener contraste legible.
              </p>
            )}
          </aside>
        </div>
      </section>

      <div
        id="appearance-panel-backgrounds"
        role="tabpanel"
        aria-labelledby="appearance-tab-backgrounds"
        hidden={activePanel !== "backgrounds"}
      >
        <SiteBackgroundManager
          revision={revision}
          brandColor={brandColor}
          customAssets={customAssets}
          pageBackgrounds={pageBackgrounds}
        />
      </div>
    </div>
  );
}
