"use client";

import { useState } from "react";

import MediaViewportEditor from "@/components/admin/MediaViewportEditor";
import GameDetailBackgroundMedia from "@/components/games/GameDetailBackgroundMedia";
import { normalizeGameImageViewport } from "@/lib/media/image-viewport";
import { normalizeGameVideoViewport } from "@/lib/media/game-video-media";
import type { PreviewViewport } from "@/lib/media/preview-video-policy";
import type {
  GameImageViewport,
  GameVideoViewport,
} from "@/types/game";

import dialogStyles from "./ContextualMediaDialog.module.css";
import styles from "./GameBackgroundViewportEditor.module.css";

type Props = {
  slug: string;
  revision: number;
  kind: "image" | "video";
  src: string;
  label: string;
  initialViewport?: GameImageViewport | GameVideoViewport;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function AdaptivePreview({
  kind,
  src,
  viewport,
}: {
  kind: "image" | "video";
  src: string;
  viewport: PreviewViewport;
}) {
  const imageViewport: GameImageViewport = {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
    confirmed: true,
  };
  const videoViewport: GameVideoViewport = {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom,
    aspect: "source",
    confirmed: true,
  };

  return (
    <section
      className={styles.adaptivePreview}
      aria-label="Previsualización adaptable del fondo"
    >
      <div className={styles.previewHeading}>
        <div>
          <span>PREVISUALIZACIÓN ADAPTABLE</span>
          <strong>Un recorte, distintas pantallas</strong>
        </div>
        <p>
          Estas dos ventanas usan la misma capa, posición, zoom, color y sombra
          que se publicarán. El fondo se adapta sin crear otro archivo.
        </p>
      </div>

      <div className={styles.previewGrid}>
        {([
          ["Escritorio", styles.desktopFrame, "420px"],
          ["Móvil", styles.mobileFrame, "150px"],
        ] as const).map(([label, frameClass, sizes]) => (
          <div key={label} className={styles.previewItem}>
            <span>{label}</span>
            <div className={`${styles.previewFrame} ${frameClass}`}>
              <GameDetailBackgroundMedia
                sizes={sizes}
                override={{
                  mode: kind,
                  imageSrc: kind === "image" ? src : null,
                  imageViewport: kind === "image" ? imageViewport : null,
                  videoSrc: kind === "video" ? src : null,
                  videoViewport: kind === "video" ? videoViewport : null,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function GameBackgroundViewportEditor({
  slug,
  revision,
  kind,
  src,
  label,
  initialViewport,
  onClose,
  onSaved,
}: Props) {
  const [viewport, setViewport] = useState<PreviewViewport>(() => {
    if (kind === "video") {
      return {
        ...normalizeGameVideoViewport(initialViewport as GameVideoViewport | undefined),
        aspect: "source",
      };
    }

    return {
      ...normalizeGameImageViewport(initialViewport as GameImageViewport | undefined),
      aspect: "source",
    };
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setStatus(`Confirmando el recorte adaptable de ${kind === "image" ? "la imagen" : "el video"}…`);

    try {
      const response = await fetch(
        `/api/admin/content/games/${encodeURIComponent(slug)}/background-media`,
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: new URLSearchParams({
            expectedRevision: String(revision),
            action: kind === "image" ? "layout-image" : "layout-video",
            resource: src,
            viewportX: String(viewport.x),
            viewportY: String(viewport.y),
            viewportZoom: String(viewport.zoom),
          }),
        }
      );

      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "El servidor rechazó el recorte adaptable del fondo.");
      }

      await onSaved();
      onClose();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el recorte adaptable del fondo."
      );
      setBusy(false);
    }
  }

  return (
    <>
      <MediaViewportEditor
        key={`background:${kind}:${src}`}
        kind={kind}
        src={src}
        sourceLabel={label}
        viewport={viewport}
        requiredAspect="source"
        disabled={busy}
        onViewportChange={setViewport}
      />

      <AdaptivePreview
        kind={kind}
        src={src}
        viewport={viewport}
      />

      {status && (
        <p className={styles.status} role="status">
          {status}
        </p>
      )}

      <div className={dialogStyles.actions}>
        <button
          type="button"
          className={dialogStyles.secondary}
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={dialogStyles.primary}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? "Guardando…" : "Confirmar recorte adaptable"}
        </button>
      </div>
    </>
  );
}
