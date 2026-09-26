import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Send,
} from "lucide-react";

import type {
  EditorialPublicationState,
} from "@/lib/admin/publication-service";

import styles from "./PublicationPanel.module.css";

type PublicationPanelProps = {
  state: EditorialPublicationState;
  requestState?: string;
  slug?: string;
  publishAction?: string;
  hideAction?: string;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(value);
}

function StateNotice({ state }: { state?: string }) {
  if (!state) return null;

  if (state === "publicado") {
    return (
      <div className={`${styles.notice} ${styles.noticeSuccess}`} role="status">
        El borrador fue publicado correctamente y reemplazó la publicación activa.
      </div>
    );
  }

  if (state === "oculto") {
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`} role="status">
        El contenido fue retirado de la web. El borrador y la publicación vigente se conservan; no existen versiones anteriores restaurables.
      </div>
    );
  }

  if (state === "sin-cambios") {
    return (
      <div className={styles.notice} role="status">
        No se realizaron cambios porque el estado solicitado ya estaba aplicado.
      </div>
    );
  }

  if (state === "conflicto" || state === "conflicto-publicacion") {
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert">
        El contenido cambió mientras se procesaba la operación. La página se actualizó sin sobrescribir cambios más recientes.
      </div>
    );
  }

  if (state === "solicitud" || state === "datos") {
    return (
      <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
        La solicitud de publicación fue rechazada porque no superó la validación administrativa.
      </div>
    );
  }

  return null;
}

export default function PublicationPanel({
  slug,
  state,
  requestState,
  publishAction,
  hideAction,
}: PublicationPanelProps) {
  const resolvedPublishAction =
    publishAction ??
    (slug
      ? `/api/admin/content/games/${encodeURIComponent(slug)}/publish`
      : null);
  const resolvedHideAction =
    hideAction ??
    (slug
      ? `/api/admin/content/games/${encodeURIComponent(slug)}/hide`
      : null);

  if (!resolvedPublishAction) {
    throw new Error(
      "El panel de publicación requiere una acción de publicación."
    );
  }

  return (
    <div className={styles.panel}>
      <StateNotice state={requestState} />

      <div className={styles.summary}>
        <strong>
          {!state.publicVisible
            ? "Este contenido está oculto de la web."
            : state.hasUnpublishedChanges
              ? "Hay cambios listos para publicar."
              : "El borrador coincide con la publicación activa."}
        </strong>
        <p>
          {state.publicVisible
            ? "Publicar reemplaza la publicación vigente con el borrador actual."
            : "Ocultar mantiene el borrador y la publicación vigente. Publicar borrador volverá a mostrar ese estado actual."}
        </p>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span>Visibilidad</span>
          <strong>{state.publicVisible ? "Visible en la web" : "Oculto de la web"}</strong>
        </div>
        <div className={styles.fact}>
          <span>Publicación actual</span>
          <strong>#{state.publicationNumber}</strong>
        </div>
        <div className={styles.fact}>
          <span>Revisión de origen</span>
          <strong>
            {state.publishedFromRevision
              ? `#${state.publishedFromRevision}`
              : "Estado inicial"}
          </strong>
        </div>
        <div className={styles.fact}>
          <span>Última publicación</span>
          <strong>{formatDate(state.publishedAt)} UTC</strong>
        </div>
      </div>

      <div className={styles.publicationActions}>
        <form method="post" action={resolvedPublishAction} className={styles.publishForm}>
          <input type="hidden" name="expectedRevision" value={state.draftRevision} />
          <button
            type="submit"
            className={styles.publishButton}
            data-brand-action="true"
            disabled={!state.hasUnpublishedChanges}
          >
            <Send size={16} aria-hidden="true" />
            {state.publicVisible ? "Publicar borrador" : "Volver a publicar"}
          </button>
          <span className={styles.statusText}>
            {state.hasUnpublishedChanges ? (
              <AlertTriangle size={15} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={15} aria-hidden="true" />
            )}
            Revisión {state.draftRevision}
          </span>
        </form>

        {resolvedHideAction && state.publicVisible && (
          <form method="post" action={resolvedHideAction} className={styles.hideForm}>
            <input
              type="hidden"
              name="expectedPublicationNumber"
              value={state.publicationNumber}
            />
            <button type="submit" className={styles.hideButton}>
              <EyeOff size={16} aria-hidden="true" />
              Ocultar de la web
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
