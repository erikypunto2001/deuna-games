"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import VideoTrimEditor from "@/components/admin/VideoTrimEditor";
import {
  buildPreviewProviderEmbed,
  getPreviewProvider,
  parseDirectVideoUrl,
  parsePreviewProviderUrl,
  previewProviderList,
  type PreviewProviderId,
} from "@/lib/media/preview-providers";
import {
  DEFAULT_PREVIEW_FPS,
  DEFAULT_PREVIEW_QUALITY,
  DEFAULT_PREVIEW_VIEWPORT,
  MAX_PREVIEW_SOURCE_BYTES,
  PREVIEW_HERO_QUALITY_OPTIONS,
  type PreviewFps,
  type PreviewQualityId,
  type PreviewTrimWindow,
  type PreviewViewport,
} from "@/lib/media/preview-video-policy";

import adminStyles from "../../app/admin/admin.module.css";
import localStyles from "./GamePreviewClipUploadForm.module.css";

const acceptedTypes = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/x-matroska",
  "video/avi",
  "video/x-msvideo",
]);
const acceptedExtensions = /\.(mp4|webm|mov|m4v|mkv|avi)$/i;
const MEDIA_PROBE_TIMEOUT_MS = 10_000;

type SourceMode = "file" | "direct" | PreviewProviderId;
type RemoteDelivery = "stream" | "staged" | "proxy";

type PreparedSource =
  | {
      mode: "file";
      src: string;
      label: string;
      file: File;
    }
  | {
      mode: "staged";
      src: string;
      label: string;
      token: string;
      bytes: number;
      delivery: RemoteDelivery;
    };

type StagedSourceResponse = {
  token?: unknown;
  src?: unknown;
  bytes?: unknown;
  delivery?: unknown;
  error?: unknown;
};

type ProxyResponse = {
  src?: unknown;
  error?: unknown;
};

type Props = {
  slug: string;
  revision: number;
};

const providerOptions = previewProviderList();

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function sourceExtension(filename: string) {
  const match = filename.match(/\.[^.]+$/);
  const extension = match?.[0]?.toLowerCase() ?? "";
  return acceptedExtensions.test(extension) ? extension : ".video";
}

function stagedSourcePath(slug: string, token: string) {
  return `/api/admin/content/games/${encodeURIComponent(slug)}/preview-source/${token}`;
}

function validLocalFile(file: File) {
  const extensionOk = acceptedExtensions.test(file.name);
  return !(
    file.size <= 0 ||
    file.size > MAX_PREVIEW_SOURCE_BYTES ||
    (!extensionOk &&
      file.type &&
      !acceptedTypes.has(file.type.toLowerCase()))
  );
}

function probeBrowserPlayback(src: string) {
  return new Promise<boolean>((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finish = (playable: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.pause();
      video.removeAttribute("src");
      video.load();
      resolve(playable);
    };

    const timeout = window.setTimeout(
      () => finish(false),
      MEDIA_PROBE_TIMEOUT_MS
    );
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    video.addEventListener("loadeddata", () => finish(true), {
      once: true,
    });
    video.addEventListener("error", () => finish(false), {
      once: true,
    });
    video.src = src;
    video.load();
  });
}

function uploadError(state: string | null) {
  if (state === "conflicto") {
    return "Otra pestaña guardó una revisión más reciente. Recarga Multimedia antes de continuar.";
  }
  if (state === "ffmpeg") {
    return "FFmpeg/FFprobe no está disponible para crear el WebM optimizado.";
  }
  if (state === "video-pesado") {
    return "El master sigue superando el límite seguro de 32 MB. Acorta el tramo, usa 720p o reduce FPS.";
  }
  if (state === "preview-recorte-invalido") {
    return "El tramo no es válido. Ajusta IN y OUT.";
  }
  if (state === "preview-calidad-invalida") {
    return "La resolución elegida no es válida.";
  }
  if (state === "preview-fps-invalido") {
    return "Los FPS elegidos no son válidos. El máximo permitido es 60 FPS.";
  }
  if (state === "preview-source-expirada") {
    return "La fuente temporal venció. Prepárala otra vez.";
  }
  if (state === "solicitud") {
    return "La solicitud fue rechazada por seguridad. Recarga el editor.";
  }
  return "No se pudo guardar el video en la biblioteca.";
}

export default function GameVideoLibraryEditor({
  slug,
  revision,
}: Props) {
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [sourceUrl, setSourceUrl] = useState("");
  const [preparedSource, setPreparedSource] =
    useState<PreparedSource | null>(null);
  const [trim, setTrim] = useState<PreviewTrimWindow | null>(null);
  const [quality, setQuality] = useState<PreviewQualityId>(
    DEFAULT_PREVIEW_QUALITY
  );
  const [fps, setFps] = useState<PreviewFps>(DEFAULT_PREVIEW_FPS);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>({
    ...DEFAULT_PREVIEW_VIEWPORT,
  });
  const operationLock = useRef(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const selectedProvider =
    sourceMode !== "file" && sourceMode !== "direct"
      ? getPreviewProvider(sourceMode)
      : null;
  const selectedQuality =
    PREVIEW_HERO_QUALITY_OPTIONS.find((option) => option.id === quality) ??
    PREVIEW_HERO_QUALITY_OPTIONS[0]!;
  const normalizedRemoteUrl = useMemo(() => {
    if (sourceMode === "file") return null;
    if (sourceMode === "direct") {
      return parseDirectVideoUrl(sourceUrl);
    }
    return parsePreviewProviderUrl(sourceMode, sourceUrl);
  }, [sourceMode, sourceUrl]);
  const providerEmbed = useMemo(() => {
    if (
      !selectedProvider ||
      !normalizedRemoteUrl ||
      typeof window === "undefined"
    ) {
      return null;
    }
    return buildPreviewProviderEmbed(
      selectedProvider.id,
      normalizedRemoteUrl,
      window.location.hostname
    );
  }, [normalizedRemoteUrl, selectedProvider]);

  useEffect(() => {
    const source = preparedSource;
    return () => {
      if (!source) return;
      if (source.mode === "file") {
        URL.revokeObjectURL(source.src);
        return;
      }
      void fetch(stagedSourcePath(slug, source.token), {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [preparedSource, slug]);

  function resetPreparedSource() {
    setPreparedSource(null);
    setTrim(null);
    setPreviewViewport({ ...DEFAULT_PREVIEW_VIEWPORT });
  }

  function switchSourceMode(mode: SourceMode) {
    if (operationLock.current) return;
    resetPreparedSource();
    setSourceMode(mode);
    setSourceUrl("");
    setStatus(null);
  }

  async function removeStagedSource(token: string) {
    await fetch(stagedSourcePath(slug, token), {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    }).catch(() => undefined);
  }

  async function createProxyForStagedToken(token: string) {
    const response = await fetch(
      `${stagedSourcePath(slug, token)}/proxy`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          expectedRevision: String(revision),
        }),
      }
    );
    const result = (await response.json()) as ProxyResponse;
    if (!response.ok || typeof result.src !== "string") {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "No se pudo crear un proxy compatible para editar."
      );
    }
    return result.src;
  }

  async function prepareLocalCodecFallback(file: File) {
    setStatus(
      `Este códec no se reproduce directamente. Subiendo ${formatSize(file.size)} y creando un proxy privado de edición…`
    );
    const response = await fetch(
      `/api/admin/content/games/${encodeURIComponent(slug)}/preview-source-upload`,
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Deuna-Expected-Revision": String(revision),
          "X-Deuna-Source-Extension": sourceExtension(file.name),
        },
        body: file,
      }
    );
    const result = (await response.json()) as StagedSourceResponse;
    if (
      !response.ok ||
      typeof result.token !== "string" ||
      typeof result.src !== "string" ||
      typeof result.bytes !== "number"
    ) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : "No se pudo preparar el archivo."
      );
    }

    try {
      const proxySrc = await createProxyForStagedToken(result.token);
      setPreparedSource({
        mode: "staged",
        src: proxySrc,
        label: `${file.name} · ${formatSize(file.size)} · proxy de edición`,
        token: result.token,
        bytes: result.bytes,
        delivery: "proxy",
      });
      setStatus(
        "Proxy listo. El WebM de biblioteca se generará desde el archivo original."
      );
    } catch (error) {
      await removeStagedSource(result.token);
      throw error;
    }
  }

  async function prepareLocalFile(file: File) {
    if (operationLock.current) return;

    operationLock.current = true;
    setSourceBusy(true);
    const src = URL.createObjectURL(file);
    let keepObjectUrl = false;

    try {
      if (await probeBrowserPlayback(src)) {
        keepObjectUrl = true;
        setPreparedSource({
          mode: "file",
          src,
          label: `${file.name} · ${formatSize(file.size)}`,
          file,
        });
        setStatus(
          "Archivo listo. Elige IN, OUT, resolución y FPS; todavía no se subió el archivo grande."
        );
      } else {
        await prepareLocalCodecFallback(file);
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el archivo."
      );
    } finally {
      if (!keepObjectUrl) URL.revokeObjectURL(src);
      operationLock.current = false;
      setSourceBusy(false);
    }
  }

  function handleLocalFile(event: ChangeEvent<HTMLInputElement>) {
    if (operationLock.current) return;

    const file = event.target.files?.[0];
    resetPreparedSource();
    setStatus(null);
    if (!file) return;

    if (!validLocalFile(file)) {
      event.target.value = "";
      setStatus(
        "Usa MP4, WebM, MOV, M4V, MKV o AVI de hasta 1 GB."
      );
      return;
    }

    void prepareLocalFile(file);
  }

  async function prepareRemoteSource() {
    if (sourceMode === "file" || operationLock.current) return;

    if (!normalizedRemoteUrl) {
      setStatus(
        sourceMode === "direct"
          ? "Pega una URL HTTP/HTTPS directa a un archivo o stream de video."
          : `Ese enlace no pertenece al formato aceptado por ${selectedProvider?.label ?? "la plataforma elegida"}.`
      );
      return;
    }

    operationLock.current = true;
    resetPreparedSource();
    setSourceBusy(true);
    const label = selectedProvider?.label ?? "URL directa";
    setStatus(`Analizando ${label} sin descargar el video completo…`);
    let stagedToken: string | null = null;

    try {
      const endpoint =
        sourceMode === "direct"
          ? `/api/admin/content/games/${encodeURIComponent(slug)}/preview-direct`
          : `/api/admin/content/games/${encodeURIComponent(slug)}/preview-provider/${encodeURIComponent(sourceMode)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          expectedRevision: String(revision),
          url: normalizedRemoteUrl,
        }),
      });
      const result = (await response.json()) as StagedSourceResponse;
      if (
        !response.ok ||
        typeof result.token !== "string" ||
        typeof result.src !== "string" ||
        typeof result.bytes !== "number"
      ) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : `No se pudo preparar ${label}.`
        );
      }

      stagedToken = result.token;
      const lazyDelivery = result.delivery === "stream";
      let editorSrc = result.src;
      let delivery: RemoteDelivery = lazyDelivery ? "stream" : "staged";

      if (!(await probeBrowserPlayback(editorSrc))) {
        setStatus(
          `${label} no pudo editarse por streaming/códec directo. Activando el fallback privado y un proxy WebM…`
        );
        editorSrc = await createProxyForStagedToken(result.token);
        delivery = "proxy";
      }

      setPreparedSource({
        mode: "staged",
        src: editorSrc,
        label: `${label} · ${formatSize(result.bytes)} de fuente${
          delivery === "stream"
            ? " · streaming parcial"
            : delivery === "proxy"
              ? " · proxy de compatibilidad"
              : " · copia temporal"
        }`,
        token: result.token,
        bytes: result.bytes,
        delivery,
      });
      stagedToken = null;
      setStatus(
        delivery === "stream"
          ? `${label} listo por streaming parcial. Al guardar se extraerá únicamente el tramo elegido.`
          : `${label} listo en modo compatible. La web pública nunca conservará ni consultará esta URL externa.`
      );
    } catch (error) {
      if (stagedToken) {
        await removeStagedSource(stagedToken);
      }
      setStatus(
        error instanceof Error
          ? error.message
          : `No se pudo preparar ${label}.`
      );
    } finally {
      operationLock.current = false;
      setSourceBusy(false);
    }
  }

  async function saveVideo() {
    if (operationLock.current) {
      setStatus("Espera a que termine la operación multimedia actual.");
      return;
    }

    if (!preparedSource || !trim) {
      setStatus(
        "Prepara la fuente y selecciona un tramo válido con IN y OUT."
      );
      return;
    }

    let endpoint: string;
    let body: BodyInit;
    let headers: HeadersInit;

    if (preparedSource.mode === "file") {
      endpoint = `/api/admin/content/games/${encodeURIComponent(slug)}/preview-upload`;
      body = preparedSource.file;
      headers = {
        "Content-Type":
          preparedSource.file.type || "application/octet-stream",
        "X-Deuna-Expected-Revision": String(revision),
        "X-Deuna-Trim-Start": String(trim.startSeconds),
        "X-Deuna-Trim-End": String(trim.endSeconds),
        "X-Deuna-Source-Extension": sourceExtension(
          preparedSource.file.name
        ),
        "X-Deuna-Preview-Quality": quality,
        "X-Deuna-Preview-Fps": String(fps),
        "X-Deuna-Preview-Target": "library",
      };
    } else {
      endpoint = `/api/admin/content/games/${encodeURIComponent(slug)}/preview-import`;
      body = new URLSearchParams({
        expectedRevision: String(revision),
        sourceToken: preparedSource.token,
        startSeconds: String(trim.startSeconds),
        endSeconds: String(trim.endSeconds),
        quality,
        fps: String(fps),
        target: "library",
      });
      headers = {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8",
      };
    }

    operationLock.current = true;
    setBusy(true);
    setStatus(
      `Creando master ${selectedQuality.label} · ${fps} FPS solicitados con el tramo ${trim.startSeconds}s → ${trim.endSeconds}s…`
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body,
      });
      if (!response.ok) {
        throw new Error(
          response.status === 413
            ? "El video supera el límite máximo permitido."
            : "El servidor rechazó la creación del recurso de video."
        );
      }

      const resultUrl = new URL(response.url, window.location.href);
      const resultState = resultUrl.searchParams.get("estado");
      if (resultState !== "recurso-subido") {
        throw new Error(uploadError(resultState));
      }
      window.location.assign(resultUrl.toString());
    } catch (error) {
      operationLock.current = false;
      setStatus(
        error instanceof Error
          ? error.message
          : "No se pudo crear el WebM."
      );
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveVideo();
  }

  return (
    <form className={adminStyles.editorForm} onSubmit={handleSubmit}>
      {!preparedSource && (
        <div
          className={`${localStyles.sourceGrid} ${adminStyles.fieldWide}`}
          aria-label="Tipos de fuente de video"
        >
          <button
            type="button"
            className={`${localStyles.sourceButton} ${
              sourceMode === "file" ? localStyles.sourceButtonActive : ""
            }`}
            onClick={() => switchSourceMode("file")}
            disabled={busy || sourceBusy}
          >
            Archivo de mi equipo
          </button>
          <button
            type="button"
            className={`${localStyles.sourceButton} ${
              sourceMode === "direct" ? localStyles.sourceButtonActive : ""
            }`}
            onClick={() => switchSourceMode("direct")}
            disabled={busy || sourceBusy}
          >
            URL directa
          </button>
          {providerOptions.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={`${localStyles.sourceButton} ${
                sourceMode === provider.id
                  ? localStyles.sourceButtonActive
                  : ""
              }`}
              onClick={() => switchSourceMode(provider.id)}
              disabled={busy || sourceBusy}
            >
              {provider.label}
            </button>
          ))}
        </div>
      )}

      {!preparedSource && sourceMode === "file" && (
        <label className={adminStyles.fieldWide}>
          <span>Archivo · máximo 1 GB</span>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-m4v,video/x-matroska,video/x-msvideo,.mp4,.webm,.mov,.m4v,.mkv,.avi"
            disabled={busy || sourceBusy}
            onChange={handleLocalFile}
          />
          <small>
            Se edita localmente si el navegador soporta el códec; si no,
            se crea un proxy privado.
          </small>
        </label>
      )}

      {!preparedSource && sourceMode !== "file" && (
        <>
          <div
            className={`${localStyles.providerHeader} ${adminStyles.fieldWide}`}
          >
            <strong>{selectedProvider?.label ?? "URL directa"}</strong>
            <span className={localStyles.providerBadge}>
              {sourceMode === "direct"
                ? "archivo / stream"
                : "proveedor aislado"}
            </span>
          </div>

          <label className={adminStyles.fieldWide}>
            <span>
              {sourceMode === "direct"
                ? "URL HTTP/HTTPS del archivo o stream"
                : `URL de ${selectedProvider?.label}`}
            </span>
            <input
              type="text"
              inputMode="url"
              value={sourceUrl}
              disabled={busy || sourceBusy}
              onChange={(event) => {
                setSourceUrl(event.target.value);
                setStatus(null);
              }}
              maxLength={2048}
              placeholder={
                sourceMode === "direct"
                  ? "https://servidor/video.mp4"
                  : selectedProvider?.placeholder
              }
              autoComplete="off"
              spellCheck={false}
            />
            <small>
              {sourceMode === "direct"
                ? "Debe devolver bytes de video; una página HTML será rechazada."
                : `Sólo se acepta ${selectedProvider?.label}. Una URL de otra red será rechazada antes de cualquier importación.`}
            </small>
          </label>

          {normalizedRemoteUrl && selectedProvider && (
            providerEmbed ? (
              <div
                className={`${localStyles.embedStage} ${adminStyles.fieldWide}`}
              >
                <iframe
                  src={providerEmbed.src}
                  title={providerEmbed.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              <div
                className={`${localStyles.nativeNotice} ${adminStyles.fieldWide}`}
              >
                {selectedProvider.label} no ofrece aquí un reproductor web
                controlable y estable. Se intentará primero una fuente HTTP
                parcial y sólo después el fallback privado completo.
              </div>
            )
          )}

          <div
            className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}
          >
            <strong>Preparar esta fuente</strong>
            <span>
              {sourceMode === "direct"
                ? "Primero se prueba acceso parcial por bytes con protección SSRF. La descarga completa queda sólo como fallback."
                : `La ruta de ${selectedProvider?.label} intenta resolver un stream HTTP seekable sin descargarlo; conserva el fallback temporal si la plataforma no lo permite.`}
            </span>
            <button
              type="button"
              disabled={busy || sourceBusy || !normalizedRemoteUrl}
              onClick={() => void prepareRemoteSource()}
            >
              {sourceBusy
                ? "Preparando…"
                : `Preparar ${selectedProvider?.label ?? "URL directa"} para editar`}
            </button>
          </div>
        </>
      )}

      {preparedSource && (
        <div className={adminStyles.fieldWide}>
          <div className={adminStyles.tableSummary}>
            <strong>Master reutilizable</strong>
            <span>
              Elige una sola vez IN, OUT, resolución y FPS. El marco de área
              visible sirve sólo para inspeccionar la fuente: el WebM se guarda
              con el fotograma completo y Hero/Card reciben después su encuadre
              independiente.
            </span>
          </div>

          <VideoTrimEditor
            key={`library:${preparedSource.src}`}
            src={preparedSource.src}
            sourceLabel={preparedSource.label}
            quality={quality}
            fps={fps}
            qualityOptions={PREVIEW_HERO_QUALITY_OPTIONS}
            viewport={previewViewport}
            qualityDisabled={busy || sourceBusy}
            onQualityChange={setQuality}
            onFpsChange={setFps}
            onViewportChange={setPreviewViewport}
            onTrimChange={setTrim}
          />
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
          Agregar el recurso no cambia Hero ni Card. Se guarda una sola vez
          como WebM/VP9 interno, silencioso, de hasta 30 segundos y con un
          límite duro de 32 MB para masters HD.
        </p>
        <button
          type="submit"
          disabled={busy || sourceBusy || !trim || !preparedSource}
        >
          {busy
            ? "Guardando…"
            : `Agregar video · ${selectedQuality.label} · ${fps} FPS`}
        </button>
      </div>
    </form>
  );
}
