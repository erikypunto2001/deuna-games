"use client";

import Image from "next/image";
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createDefaultBackgroundSetting,
  getSiteBackgroundAssets,
  resolveBackgroundSetting,
  siteBackgroundPageOptions,
  type ResolvedSiteBackgroundSetting,
  type SiteBackgroundAsset,
  type SiteBackgroundMap,
  type SiteBackgroundPage,
} from "@/lib/site/backgrounds";

import adminStyles from "../../app/admin/admin.module.css";
import styles from "./SiteBackgroundManager.module.css";

type SiteBackgroundManagerProps = {
  revision: number;
  brandColor: string;
  customAssets?: SiteBackgroundAsset[];
  pageBackgrounds?: SiteBackgroundMap;
};

type SliderProps = {
  label: string;
  name: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  hint?: string;
  onChange: (value: number) => void;
};

type BackgroundPreset = {
  label: string;
  description: string;
  values: Pick<
    ResolvedSiteBackgroundSetting,
    | "imageOpacity"
    | "brightness"
    | "saturation"
    | "contrast"
    | "blur"
    | "shadeOpacity"
    | "tintOpacity"
  >;
};

const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_SAFE_DIMENSION = 8_192;
const MAX_SAFE_PIXELS = 33_554_432;
const qualities = [0.94, 0.9, 0.84, 0.78, 0.7, 0.62, 0.54];
const acceptedTypes = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const backgroundPresets: BackgroundPreset[] = [
  {
    label: "Nítido",
    description: "Definido y equilibrado",
    values: {
      imageOpacity: 78,
      brightness: 105,
      saturation: 100,
      contrast: 106,
      blur: 0,
      shadeOpacity: 88,
      tintOpacity: 24,
    },
  },
  {
    label: "Luminoso",
    description: "Más presencia y detalle",
    values: {
      imageOpacity: 92,
      brightness: 145,
      saturation: 108,
      contrast: 100,
      blur: 0,
      shadeOpacity: 52,
      tintOpacity: 18,
    },
  },
  {
    label: "Atmosférico",
    description: "Profundidad suave de fondo",
    values: {
      imageOpacity: 72,
      brightness: 92,
      saturation: 118,
      contrast: 104,
      blur: 7,
      shadeOpacity: 92,
      tintOpacity: 38,
    },
  },
  {
    label: "Suave",
    description: "Fondo discreto y difuso",
    values: {
      imageOpacity: 64,
      brightness: 92,
      saturation: 86,
      contrast: 98,
      blur: 15,
      shadeOpacity: 100,
      tintOpacity: 34,
    },
  },
];

function Slider({
  label,
  name,
  value,
  min,
  max,
  unit = "%",
  hint,
  onChange,
}: SliderProps) {
  const progress = ((value - min) / (max - min)) * 100;

  return (
    <label className={styles.sliderControl}>
      <span className={styles.sliderHeading}>
        <strong>{label}</strong>
        <output htmlFor={name}>
          {value}{unit}
        </output>
      </span>
      <input
        id={name}
        type="range"
        name={name}
        min={min}
        max={max}
        step="1"
        value={value}
        style={{ "--range-progress": `${progress}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function encodeWebp(
  canvas: HTMLCanvasElement,
  quality: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("El navegador no pudo generar el WebP."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

function safeInitialScale(width: number, height: number) {
  const dimensionScale =
    MAX_SAFE_DIMENSION / Math.max(width, height);
  const pixelScale = Math.sqrt(
    MAX_SAFE_PIXELS / (width * height)
  );

  return Math.min(1, dimensionScale, pixelScale);
}

async function normalizeBackground(file: File) {
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      "La imagen debe pesar como máximo 24 MB antes de prepararla."
    );
  }

  if (
    file.type &&
    !acceptedTypes.has(file.type.toLowerCase())
  ) {
    throw new Error("Usa una imagen PNG, JPEG, AVIF o WebP.");
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "La imagen no pudo decodificarse. Usa PNG, JPEG, AVIF o WebP válido."
    );
  }

  try {
    let scale = safeInitialScale(bitmap.width, bitmap.height);

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });

      if (!context) {
        throw new Error(
          "El navegador no pudo preparar la imagen."
        );
      }

      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await encodeWebp(canvas, quality);

        if (blob.size <= MAX_OUTPUT_BYTES) {
          return {
            blob,
            width,
            height,
          };
        }
      }

      scale *= 0.82;
    }
  } finally {
    bitmap.close();
  }

  throw new Error(
    "No fue posible reducir la imagen por debajo de 6 MB de forma segura."
  );
}

function uploadError(state: string | null) {
  if (state === "conflicto") {
    return "Otra pestaña guardó una revisión más reciente. Recarga antes de volver a subir.";
  }
  if (state === "solicitud") {
    return "La carga fue rechazada por seguridad. Recarga el panel e inténtalo otra vez.";
  }
  if (state === "datos") {
    return "No se pudo agregar el fondo. Revisa el nombre o el límite de imágenes guardadas.";
  }
  return "El servidor no pudo guardar la imagen de fondo.";
}

export default function SiteBackgroundManager({
  revision,
  brandColor,
  customAssets = [],
  pageBackgrounds = {},
}: SiteBackgroundManagerProps) {
  const [page, setPage] = useState<SiteBackgroundPage>("home");
  const pageTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [drafts, setDrafts] = useState<
    Record<SiteBackgroundPage, ResolvedSiteBackgroundSetting>
  >(() =>
    Object.fromEntries(
      siteBackgroundPageOptions.map(({ key }) => [
        key,
        resolveBackgroundSetting(pageBackgrounds[key], brandColor),
      ])
    ) as Record<SiteBackgroundPage, ResolvedSiteBackgroundSetting>
  );
  const [uploadName, setUploadName] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const assets = useMemo(
    () => getSiteBackgroundAssets(customAssets),
    [customAssets]
  );
  const current = drafts[page];
  const currentAsset = assets.find((asset) => asset.id === current.assetId);
  const tintColor =
    current.colorMode === "custom"
      ? current.customColor
      : brandColor;

  useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    };
  }, [uploadPreview]);

  function movePageTab(
    currentIndex: number,
    event: KeyboardEvent<HTMLButtonElement>
  ) {
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % siteBackgroundPageOptions.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + siteBackgroundPageOptions.length) %
        siteBackgroundPageOptions.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = siteBackgroundPageOptions.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setPage(siteBackgroundPageOptions[nextIndex].key);
    pageTabRefs.current[nextIndex]?.focus();
  }

  function updateCurrent(
    patch: Partial<ResolvedSiteBackgroundSetting>
  ) {
    setDrafts((previous) => ({
      ...previous,
      [page]: {
        ...previous[page],
        ...patch,
      },
    }));
  }

  function applyPreset(preset: BackgroundPreset) {
    updateCurrent(preset.values);
  }

  function resetCurrent() {
    const defaults = createDefaultBackgroundSetting(brandColor);
    updateCurrent({
      ...defaults,
      assetId: current.assetId,
      colorMode: current.colorMode,
      customColor: current.customColor,
    });
  }

  function handleFileChange(file: File | undefined) {
    if (uploadPreview) {
      URL.revokeObjectURL(uploadPreview);
    }

    setUploadPreview(file ? URL.createObjectURL(file) : null);
    setUploadStatus(null);
  }

  async function handleUpload(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (uploadLock.current) return;

    const file = fileInput.current?.files?.[0];
    const name = uploadName.trim();

    if (!name) {
      setUploadStatus("Escribe un nombre para identificar el fondo.");
      return;
    }

    if (!file) {
      setUploadStatus("Selecciona una imagen para continuar.");
      return;
    }

    uploadLock.current = true;
    setUploadBusy(true);
    setUploadStatus("Preparando imagen…");

    try {
      const normalized = await normalizeBackground(file);
      const form = new FormData();
      form.set("expectedRevision", String(revision));
      form.set("name", name);
      form.set(
        "image",
        new File([normalized.blob], "site-background.webp", {
          type: "image/webp",
        })
      );

      setUploadStatus(
        `WebP listo: ${normalized.width}×${normalized.height}, ${(normalized.blob.size / 1024 / 1024).toFixed(2)} MB. Guardando borrador…`
      );

      const response = await fetch(
        "/api/admin/content/configuration/background-upload",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          body: form,
        }
      );

      if (!response.ok) {
        throw new Error("El servidor rechazó la carga multimedia.");
      }

      const resultUrl = new URL(response.url, window.location.href);
      const state = resultUrl.searchParams.get("estado");

      if (state !== "imagen-subida") {
        throw new Error(uploadError(state));
      }

      window.location.assign(resultUrl.toString());
    } catch (error) {
      uploadLock.current = false;
      setUploadStatus(
        error instanceof Error
          ? error.message
          : "No se pudo preparar la imagen."
      );
      setUploadBusy(false);
    }
  }

  const previewScale = 1.015 + current.blur / 350;

  return (
    <section className={`${adminStyles.editorPanel} ${styles.panel}`}>
      <div className={styles.heading}>
        <span>FONDOS DE PÁGINA</span>
        <h2>Biblioteca y editor visual</h2>
        <p>
          Selecciona una imagen, ajusta su aspecto sin modificar el archivo original y guarda una configuración distinta para cada página.
        </p>
      </div>

      <div className={styles.pageTabs} role="tablist" aria-label="Página a personalizar">
        {siteBackgroundPageOptions.map((option, index) => {
          const selected = page === option.key;

          return (
            <button
              key={option.key}
              ref={(node) => {
                pageTabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`background-page-tab-${option.key}`}
              aria-selected={selected}
              aria-controls="background-page-panel"
              tabIndex={selected ? 0 : -1}
              className={selected ? styles.pageTabActive : ""}
              onClick={() => setPage(option.key)}
              onKeyDown={(event) => movePageTab(index, event)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div
        id="background-page-panel"
        role="tabpanel"
        aria-labelledby={`background-page-tab-${page}`}
        className={styles.managerGrid}
      >
        <form
          className={styles.editorForm}
          method="post"
          action="/api/admin/content/configuration/background"
        >
          <input type="hidden" name="expectedRevision" value={revision} />
          <input type="hidden" name="page" value={page} />

          <section className={styles.editorBlock}>
            <div className={styles.blockHeading}>
              <div>
                <span>01</span>
                <div>
                  <strong>Elige la imagen</strong>
                  <p>Las imágenes propias aparecen junto con las opciones incluidas.</p>
                </div>
              </div>
              <span className={styles.assetCount}>{assets.length} fondos</span>
            </div>

            <fieldset className={styles.assetFieldset}>
              <legend className={styles.srOnly}>Imagen de fondo</legend>
              <div className={styles.assetGrid}>
                <label
                  className={`${styles.assetCard} ${current.assetId === null ? styles.assetCardSelected : ""}`}
                >
                  <input
                    type="radio"
                    name="assetId"
                    value=""
                    checked={current.assetId === null}
                    onChange={() => updateCurrent({ assetId: null })}
                  />
                  <span className={styles.noBackground}>Sin imagen</span>
                  <strong>Color base del sitio</strong>
                  <span className={styles.assetMeta}>Fondo plano</span>
                </label>

                {assets.map((asset) => (
                  <label
                    key={asset.id}
                    className={`${styles.assetCard} ${current.assetId === asset.id ? styles.assetCardSelected : ""}`}
                  >
                    <input
                      type="radio"
                      name="assetId"
                      value={asset.id}
                      checked={current.assetId === asset.id}
                      onChange={() => updateCurrent({ assetId: asset.id })}
                    />
                    <Image
                      src={asset.image}
                      alt=""
                      width={320}
                      height={180}
                      sizes="(max-width: 720px) 45vw, 220px"
                      unoptimized
                    />
                    <strong>{asset.name}</strong>
                    <span className={styles.assetMeta}>
                      {asset.id.startsWith("custom-") ? "Subido" : "Incluido"}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className={styles.editorBlock}>
            <div className={styles.blockHeading}>
              <div>
                <span>02</span>
                <div>
                  <strong>Ajusta el aspecto</strong>
                  <p>Los cambios se ven aquí al instante y no degradan la imagen.</p>
                </div>
              </div>
              <button type="button" className={styles.resetButton} onClick={resetCurrent}>
                Restablecer
              </button>
            </div>

            <div className={styles.previewShell}>
              <div className={styles.previewViewport}>
                {currentAsset ? (
                  <div
                    className={styles.previewImage}
                    style={{
                      backgroundImage: `url(${JSON.stringify(currentAsset.image)})`,
                      opacity: current.imageOpacity / 100,
                      filter: `brightness(${current.brightness}%) saturate(${current.saturation}%) contrast(${current.contrast}%) blur(${current.blur}px)`,
                      transform: `scale(${previewScale.toFixed(3)})`,
                    }}
                  />
                ) : (
                  <div className={styles.previewEmpty} />
                )}
                <div
                  className={styles.previewTint}
                  style={{
                    backgroundColor: tintColor,
                    opacity: current.tintOpacity / 100,
                  }}
                />
                <div
                  className={styles.previewShade}
                  style={{ opacity: current.shadeOpacity / 100 }}
                />
                <div className={styles.previewContent}>
                  <div className={styles.previewHeader}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.previewHero}>
                    <span>Vista previa</span>
                    <strong>{siteBackgroundPageOptions.find((option) => option.key === page)?.label}</strong>
                    <i />
                  </div>
                  <div className={styles.previewCards}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
              <div className={styles.previewCaption}>
                <strong>{currentAsset?.name ?? "Sin imagen"}</strong>
                <span>Vista aproximada del fondo detrás del contenido</span>
              </div>
            </div>

            <div className={styles.presetSection}>
              <div className={styles.subheading}>
                <strong>Estilos rápidos</strong>
                <span>Punto de partida; después puedes afinar cada valor.</span>
              </div>
              <div className={styles.presetGrid}>
                {backgroundPresets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className={styles.presetButton}
                    onClick={() => applyPreset(preset)}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.controlGroups}>
              <div className={styles.controlGroup}>
                <div className={styles.subheading}>
                  <strong>Imagen</strong>
                  <span>Luz, fuerza y definición de la fotografía.</span>
                </div>
                <div className={styles.sliderGrid}>
                  <Slider
                    label="Presencia"
                    name="imageOpacity"
                    value={current.imageOpacity}
                    min={20}
                    max={100}
                    hint="Cuánto se ve la imagen antes de aplicar color y sombras."
                    onChange={(imageOpacity) => updateCurrent({ imageOpacity })}
                  />
                  <Slider
                    label="Brillo"
                    name="brightness"
                    value={current.brightness}
                    min={40}
                    max={220}
                    hint="100% conserva el brillo original; puedes llevarlo hasta 220%."
                    onChange={(brightness) => updateCurrent({ brightness })}
                  />
                  <Slider
                    label="Saturación"
                    name="saturation"
                    value={current.saturation}
                    min={0}
                    max={200}
                    onChange={(saturation) => updateCurrent({ saturation })}
                  />
                  <Slider
                    label="Contraste"
                    name="contrast"
                    value={current.contrast}
                    min={70}
                    max={160}
                    onChange={(contrast) => updateCurrent({ contrast })}
                  />
                  <Slider
                    label="Desenfoque"
                    name="blur"
                    value={current.blur}
                    min={0}
                    max={30}
                    unit=" px"
                    hint="0 px mantiene la imagen completamente nítida."
                    onChange={(blur) => updateCurrent({ blur })}
                  />
                </div>
              </div>

              <div className={styles.controlGroup}>
                <div className={styles.subheading}>
                  <strong>Color y legibilidad</strong>
                  <span>Tinte de marca y separación respecto del contenido.</span>
                </div>

                <div className={styles.colorGrid}>
                  <label>
                    <span>Color aplicado</span>
                    <select
                      name="colorMode"
                      value={current.colorMode}
                      onChange={(event) =>
                        updateCurrent({
                          colorMode: event.target.value as "brand" | "custom",
                        })
                      }
                    >
                      <option value="brand">Color de marca ({brandColor})</option>
                      <option value="custom">Color personalizado</option>
                    </select>
                  </label>

                  <label className={styles.colorPicker} data-disabled={current.colorMode !== "custom"}>
                    <span>Color personalizado</span>
                    <div>
                      <input
                        type="color"
                        name="customColor"
                        value={current.customColor}
                        disabled={current.colorMode !== "custom"}
                        onChange={(event) =>
                          updateCurrent({ customColor: event.target.value })
                        }
                        aria-label="Color personalizado del fondo"
                      />
                      <code>{current.customColor.toUpperCase()}</code>
                    </div>
                  </label>
                </div>

                {current.colorMode !== "custom" && (
                  <input type="hidden" name="customColor" value={current.customColor} />
                )}

                <div className={styles.sliderGrid}>
                  <Slider
                    label="Intensidad del color"
                    name="tintOpacity"
                    value={current.tintOpacity}
                    min={0}
                    max={100}
                    onChange={(tintOpacity) => updateCurrent({ tintOpacity })}
                  />
                  <Slider
                    label="Oscurecimiento"
                    name="shadeOpacity"
                    value={current.shadeOpacity}
                    min={0}
                    max={100}
                    hint="Reduce este valor si quieres que el fondo gane mucha más luz."
                    onChange={(shadeOpacity) => updateCurrent({ shadeOpacity })}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className={styles.saveBar}>
            <div>
              <strong>Configuración de {siteBackgroundPageOptions.find((option) => option.key === page)?.label}</strong>
              <span>Guardar no publica ni modifica las demás páginas.</span>
            </div>
            <button type="submit" disabled={uploadBusy}>Guardar fondo</button>
          </div>
        </form>

        <aside className={styles.uploadPanel}>
          <div className={styles.uploadHeading}>
            <span>03</span>
            <div>
              <h3>Agregar imagen</h3>
              <p>
                Sube un fondo propio a la biblioteca. El archivo se optimiza a WebP y los ajustes visuales se aplican después, sin alterar el original guardado.
              </p>
            </div>
          </div>

          <form
            className={adminStyles.editorForm}
            method="post"
            encType="multipart/form-data"
            action="/api/admin/content/configuration/background-upload"
            onSubmit={handleUpload}
          >
            <input type="hidden" name="expectedRevision" value={revision} />

            <label className={adminStyles.fieldWide}>
              <span>Nombre del fondo</span>
              <input
                name="name"
                value={uploadName}
                disabled={uploadBusy}
                onChange={(event) => setUploadName(event.target.value)}
                maxLength={80}
                placeholder="Ej. Ciudad nocturna"
                required
              />
            </label>

            <label className={`${adminStyles.fieldWide} ${styles.fileField}`}>
              <span>Archivo</span>
              <input
                ref={fileInput}
                type="file"
                name="image"
                disabled={uploadBusy}
                accept="image/avif,image/jpeg,image/png,image/webp,.avif,.jpg,.jpeg,.png,.webp"
                onChange={(event) => handleFileChange(event.target.files?.[0])}
                required
              />
              <small>PNG, JPEG, AVIF o WebP · máximo 24 MB · salida optimizada hasta 6 MB.</small>
            </label>

            <div className={styles.uploadPreview} data-empty={!uploadPreview}>
              {uploadPreview ? (
                <div
                  className={styles.uploadPreviewImage}
                  style={{ backgroundImage: `url(${JSON.stringify(uploadPreview)})` }}
                  aria-label="Vista previa de la imagen elegida"
                />
              ) : (
                <div className={styles.uploadPlaceholder}>
                  <span>Vista previa</span>
                  <strong>Selecciona una imagen</strong>
                </div>
              )}
            </div>

            {uploadStatus && (
              <div
                className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}
                role="status"
                aria-live="polite"
              >
                <strong>Estado</strong>
                <span>{uploadStatus}</span>
              </div>
            )}

            <div className={styles.uploadActions}>
              <p>
                Después de agregarla aparecerá en la biblioteca para que puedas ajustar brillo, saturación, contraste, blur, tinte y oscuridad.
              </p>
              <button type="submit" disabled={uploadBusy}>
                {uploadBusy ? "Preparando…" : "Agregar a biblioteca"}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </section>
  );
}
