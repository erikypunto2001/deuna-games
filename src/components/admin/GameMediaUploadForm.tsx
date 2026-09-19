"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import adminStyles from "../../app/admin/admin.module.css";
import localStyles from "./GameMediaUploadForm.module.css";

type GameMediaUploadFormProps = {
  slug: string;
  revision: number;
};

type SourceMode = "file" | "url";
type ProcessingMode = "auto" | "manual";

const MAX_OUTPUT_BYTES = 6 * 1024 * 1024;
const MAX_LOCAL_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_SAFE_DIMENSION = 8_192;
const MAX_SAFE_PIXELS = 33_554_432;
const automaticQualities = [
  0.94,
  0.9,
  0.84,
  0.78,
  0.7,
  0.62,
  0.54,
];
const acceptedLocalTypes = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function encodeWebp(
  canvas: HTMLCanvasElement,
  quality: number
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error(
              "El navegador no pudo generar el WebP."
            )
          );
          return;
        }

        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

function safeInitialScale(
  width: number,
  height: number,
  maximumDimension: number
) {
  const dimensionScale =
    maximumDimension /
    Math.max(width, height);
  const pixelScale = Math.sqrt(
    MAX_SAFE_PIXELS / (width * height)
  );

  return Math.min(
    1,
    dimensionScale,
    pixelScale
  );
}

async function normalizeToSafeWebp(
  source: Blob,
  mode: ProcessingMode,
  manualQuality: number,
  manualMaximumDimension: number
) {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error(
      "La imagen no pudo decodificarse. Usa PNG, JPEG, AVIF o WebP válido."
    );
  }

  try {
    const maximumDimension =
      mode === "manual"
        ? Math.min(
            MAX_SAFE_DIMENSION,
            Math.max(256, manualMaximumDimension)
          )
        : MAX_SAFE_DIMENSION;
    let scale = safeInitialScale(
      bitmap.width,
      bitmap.height,
      maximumDimension
    );
    const qualities =
      mode === "manual"
        ? [
            Math.min(
              1,
              Math.max(0.4, manualQuality / 100)
            ),
          ]
        : automaticQualities;

    for (
      let resizeAttempt = 0;
      resizeAttempt < (mode === "auto" ? 7 : 1);
      resizeAttempt += 1
    ) {
      const width = Math.max(
        1,
        Math.round(bitmap.width * scale)
      );
      const height = Math.max(
        1,
        Math.round(bitmap.height * scale)
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", {
        alpha: true,
      });

      if (!context) {
        throw new Error(
          "El navegador no pudo preparar el lienzo de imagen."
        );
      }

      context.drawImage(
        bitmap,
        0,
        0,
        width,
        height
      );

      let lastBlob: Blob | null = null;

      for (const quality of qualities) {
        const blob = await encodeWebp(
          canvas,
          quality
        );
        lastBlob = blob;

        if (blob.size <= MAX_OUTPUT_BYTES) {
          return {
            blob,
            width,
            height,
            quality: Math.round(quality * 100),
          };
        }
      }

      if (mode === "manual") {
        const size = lastBlob
          ? (lastBlob.size / 1024 / 1024).toFixed(2)
          : "más de 6";
        throw new Error(
          `Con esos ajustes el WebP pesa ${size} MB. Reduce calidad o lado máximo.`
        );
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

function uploadRedirectError(state: string | null) {
  if (state === "conflicto") {
    return "Otra pestaña guardó una revisión más reciente. Recarga el editor antes de volver a subir.";
  }

  if (state === "solicitud") {
    return "La solicitud multimedia fue rechazada por seguridad. Recarga el editor e inténtalo otra vez.";
  }

  if (state === "imagen-invalida") {
    return "El servidor no pudo normalizar el WebP preparado. La selección se conserva para que puedas reintentar sin empezar de cero.";
  }

  return "La imagen no pudo guardarse. La selección y los ajustes se mantienen para reintentar.";
}

function localImageError(file: File) {
  if (file.size <= 0 || file.size > MAX_LOCAL_SOURCE_BYTES) {
    return "La imagen local debe pesar como máximo 24 MB antes de normalizarla.";
  }

  if (
    file.type &&
    !acceptedLocalTypes.has(file.type.toLowerCase())
  ) {
    return "Usa una imagen PNG, JPEG, AVIF o WebP.";
  }

  return null;
}

function formatLocalFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function GameMediaUploadForm({
  slug,
  revision,
}: GameMediaUploadFormProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const submitLock = useRef(false);
  const [sourceMode, setSourceMode] =
    useState<SourceMode>("file");
  const [processingMode, setProcessingMode] =
    useState<ProcessingMode>("auto");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [quality, setQuality] = useState(88);
  const [maximumDimension, setMaximumDimension] =
    useState(2560);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(
    null
  );

  useEffect(() => () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  function setLocalFile(file: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    setSelectedFile(file);
    setDragging(false);

    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const error = localImageError(file);
    if (error) {
      setPreviewUrl(null);
      setStatus(error);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setStatus(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setLocalFile(event.currentTarget.files?.[0] ?? null);
  }

  function handleFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (busy) return;
    const file = event.dataTransfer.files?.[0] ?? null;
    setLocalFile(file);
  }

  async function sourceBlob() {
    if (sourceMode === "file") {
      const file = selectedFile ?? fileInput.current?.files?.[0];

      if (!file) {
        throw new Error(
          "Selecciona una imagen para continuar."
        );
      }

      const error = localImageError(file);
      if (error) throw new Error(error);

      return file;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(sourceUrl.trim());
    } catch {
      throw new Error(
        "Escribe una URL directa de imagen válida."
      );
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error(
        "La importación por URL sólo admite HTTPS."
      );
    }

    const response = await fetch(
      `/api/admin/content/games/${encodeURIComponent(slug)}/media-source`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          url: parsedUrl.toString(),
        }),
      }
    );

    if (!response.ok) {
      const message = (await response.text()).trim();
      throw new Error(
        message ||
          "No se pudo importar la imagen desde esa URL."
      );
    }

    const blob = await response.blob();

    if (
      blob.size <= 0 ||
      !acceptedLocalTypes.has(
        blob.type.toLowerCase()
      )
    ) {
      throw new Error(
        "La URL no devolvió una imagen compatible."
      );
    }

    return blob;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submitLock.current) return;

    const kind = "library";

    submitLock.current = true;
    setBusy(true);
    setStatus("Preparando imagen…");

    try {
      const original = await sourceBlob();
      const normalized = await normalizeToSafeWebp(
        original,
        processingMode,
        quality,
        maximumDimension
      );
      const upload = new FormData();
      upload.set(
        "expectedRevision",
        String(revision)
      );
      upload.set("kind", kind);
      upload.set(
        "image",
        new File(
          [normalized.blob],
          `${slug}-${kind}.webp`,
          { type: "image/webp" }
        )
      );

      setStatus(
        `WebP listo: ${normalized.width}×${normalized.height}, calidad ${normalized.quality}, ${(normalized.blob.size / 1024 / 1024).toFixed(2)} MB. Guardando…`
      );

      const response = await fetch(
        `/api/admin/content/games/${encodeURIComponent(slug)}/media-upload`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          body: upload,
        }
      );

      if (!response.ok) {
        throw new Error(
          "El servidor rechazó la carga multimedia."
        );
      }

      const resultUrl = new URL(
        response.url,
        window.location.href
      );
      const resultState =
        resultUrl.searchParams.get("estado");
      if (resultState !== "recurso-subido") {
        throw new Error(
          uploadRedirectError(resultState)
        );
      }

      window.location.assign(resultUrl.toString());
    } catch (error) {
      submitLock.current = false;
      setStatus(
        error instanceof Error
          ? error.message
          : "No se pudo preparar la imagen."
      );
      setBusy(false);
    }
  }

  return (
    <form
      className={adminStyles.editorForm}
      method="post"
      encType="multipart/form-data"
      action={`/api/admin/content/games/${encodeURIComponent(slug)}/media-upload`}
      onSubmit={handleSubmit}
    >
      <input
        type="hidden"
        name="expectedRevision"
        value={revision}
      />

      <input type="hidden" name="kind" value="library" />
      <div
        className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}
      >
        <strong>Destino · Biblioteca compartida</strong>
        <span>
          El archivo se almacena una sola vez por hash. Después podrás asignarlo a Portada, Hero, Card, Contenedor o Galería sin volver a subirlo.
        </span>
      </div>

      <label>
        <span>Origen de la imagen</span>
        <select
          value={sourceMode}
          onChange={(event) => {
            const nextMode = event.target.value as SourceMode;
            setSourceMode(nextMode);
            setStatus(null);
            if (nextMode !== "file") setDragging(false);
          }}
        >
          <option value="file">Archivo de mi equipo</option>
          <option value="url">URL directa HTTPS</option>
        </select>
      </label>

      {sourceMode === "file" ? (
        <div className={`${adminStyles.fieldWide} ${localStyles.fileField}`}>
          <span>Archivo de imagen</span>
          <div
            className={localStyles.dropZone}
            data-dragging={dragging}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragging(false);
            }}
            onDrop={handleFileDrop}
          >
            <div className={localStyles.preview} aria-label="Vista previa de la imagen seleccionada">
              {previewUrl ? (
                <div
                  className={localStyles.previewImage}
                  style={{ backgroundImage: `url(${JSON.stringify(previewUrl).slice(1, -1)})` }}
                  role="img"
                  aria-label={selectedFile ? `Vista previa de ${selectedFile.name}` : "Vista previa de imagen"}
                />
              ) : (
                <div className={localStyles.previewEmpty}>
                  Arrastra una imagen o selecciónala desde tu equipo.
                </div>
              )}
            </div>
            <div className={localStyles.dropCopy}>
              <strong>{dragging ? "Suelta la imagen aquí" : "Arrastra y suelta o elige un archivo"}</strong>
              <span>PNG, JPEG, AVIF o WebP · máximo 24 MB antes de normalizar.</span>
              <input
                ref={fileInput}
                className={localStyles.fileInput}
                type="file"
                accept="image/avif,image/jpeg,image/png,image/webp,.avif,.jpg,.jpeg,.png,.webp"
                disabled={busy}
                onChange={handleFileChange}
              />
              {selectedFile && (
                <small title={selectedFile.name}>
                  {selectedFile.name} · {formatLocalFileSize(selectedFile.size)}
                </small>
              )}
            </div>
          </div>
        </div>
      ) : (
        <label className={adminStyles.fieldWide}>
          <span>URL directa de imagen</span>
          <input
            type="url"
            inputMode="url"
            value={sourceUrl}
            onChange={(event) =>
              setSourceUrl(event.target.value)
            }
            maxLength={2048}
            placeholder="https://sitio.example/imagen.jpg"
            required
          />
        </label>
      )}

      <div
        className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}
      >
        <strong>Preparación de la imagen</strong>
        <span>
          Siempre se genera un WebP estático limpio. El navegador convierte y el servidor vuelve a retirar ICC, EXIF y XMP antes de validar el archivo final.
        </span>
      </div>

      <label>
        <span>Modo de ajuste</span>
        <select
          value={processingMode}
          onChange={(event) =>
            setProcessingMode(
              event.target.value as ProcessingMode
            )
          }
        >
          <option value="auto">
            Automático — resolver lo necesario
          </option>
          <option value="manual">
            Manual — elegir calidad y tamaño
          </option>
        </select>
      </label>

      {processingMode === "manual" ? (
        <>
          <label>
            <span>Calidad WebP — {quality}%</span>
            <input
              type="range"
              min="40"
              max="100"
              step="1"
              value={quality}
              onChange={(event) =>
                setQuality(Number(event.target.value))
              }
            />
          </label>

          <label>
            <span>Lado máximo (px)</span>
            <input
              type="number"
              min="256"
              max="8192"
              step="1"
              value={maximumDimension}
              onChange={(event) =>
                setMaximumDimension(
                  Number(event.target.value)
                )
              }
            />
          </label>
        </>
      ) : (
        <div className={adminStyles.fieldWide}>
          <p>
            Automático conserva la resolución mientras sea segura, convierte PNG/JPEG/AVIF/WebP, elimina metadatos y reduce calidad o dimensiones sólo si hace falta para quedar por debajo de 6 MB.
          </p>
        </div>
      )}

      {status && (
        <div
          className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}
          role="status"
          aria-live="polite"
        >
          <strong>Estado</strong>
          <span>{status}</span>
        </div>
      )}

      <div className={adminStyles.formActions}>
        <p>
          Subir aquí no cambia Portada, Hero, Card, Contenedor ni Galería: sólo agrega el WebP seguro a la Biblioteca para reutilizarlo después.
        </p>
        <button type="submit" disabled={busy}>
          {busy
            ? "Preparando…"
            : "Preparar y guardar en biblioteca"}
        </button>
      </div>
    </form>
  );
}
