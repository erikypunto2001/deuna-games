import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  RotateCcw,
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
  restoreActionBase?: string;
  hideAction?: string;
};

const actionLabels = {
  bootstrap: "Snapshot inicial",
  published: "Publicación",
  rollback: "Restauración",
  baseline: "Baseline",
} as const;

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

function StateNotice({
  state,
}: {
  state?: string;
}) {
  if (!state) return null;

  if (state === "publicado") {
    return (
      <div
        className={`${styles.notice} ${styles.noticeSuccess}`}
        role="status"
      >
        El borrador fue publicado correctamente y ya es el snapshot activo.
      </div>
    );
  }

  if (state === "oculto") {
    return (
      <div
        className={`${styles.notice} ${styles.noticeWarning}`}
        role="status"
      >
        El contenido fue retirado de la web. El borrador, el snapshot y todo el historial siguen conservados.
      </div>
    );
  }

  if (state === "publicacion-restaurada") {
    return (
      <div
        className={`${styles.notice} ${styles.noticeSuccess}`}
        role="status"
      >
        La publicación histórica fue restaurada como una nueva publicación activa.
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

  if (
    state === "conflicto" ||
    state === "conflicto-publicacion"
  ) {
    return (
      <div
        className={`${styles.notice} ${styles.noticeWarning}`}
        role="alert"
      >
        El contenido cambió mientras se procesaba la operación. La página se actualizó sin sobrescribir cambios más recientes.
      </div>
    );
  }

  if (state === "solicitud" || state === "datos") {
    return (
      <div
        className={`${styles.notice} ${styles.noticeError}`}
        role="alert"
      >
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
  restoreActionBase,
  hideAction,
}: PublicationPanelProps) {
  const resolvedPublishAction =
    publishAction ??
    (slug
      ? `/api/admin/content/games/${encodeURIComponent(slug)}/publish`
      : null);
  const resolvedRestoreActionBase =
    restoreActionBase ??
    "/api/admin/content/publications";
  const resolvedHideAction =
    hideAction ??
    (slug
      ? `/api/admin/content/games/${encodeURIComponent(slug)}/hide`
      : null);
  const current = state.publications.find(
    (publication) =>
      publication.publicationNumber ===
      state.publicationNumber
  );

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
            ? "Publicar crea un snapshot separado del borrador. Restaurar una versión anterior crea otra publicación nueva y conserva todo el historial."
            : "Ocultar no borra nada. El snapshot publicado sigue conservado y Publicar borrador volverá a mostrar el contenido mediante una nueva publicación."}
        </p>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span>Visibilidad</span>
          <strong>
            {state.publicVisible
              ? "Visible en la web"
              : "Oculto de la web"}
          </strong>
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
              : "Snapshot inicial"}
          </strong>
        </div>
        <div className={styles.fact}>
          <span>Último snapshot</span>
          <strong>{formatDate(state.publishedAt)} UTC</strong>
        </div>
      </div>

      <div className={styles.publicationActions}>
        <form
          method="post"
          action={resolvedPublishAction}
          className={styles.publishForm}
        >
          <input
            type="hidden"
            name="expectedRevision"
            value={state.draftRevision}
          />
          <button
            type="submit"
            className={styles.publishButton}
            data-brand-action="true"
            disabled={!state.hasUnpublishedChanges}
          >
            <Send size={16} aria-hidden="true" />
            {state.publicVisible
              ? "Publicar borrador"
              : "Volver a publicar"}
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
          <form
            method="post"
            action={resolvedHideAction}
            className={styles.hideForm}
          >
            <input
              type="hidden"
              name="expectedPublicationNumber"
              value={state.publicationNumber}
            />
            <button
              type="submit"
              className={styles.hideButton}
            >
              <EyeOff size={16} aria-hidden="true" />
              Ocultar de la web
            </button>
          </form>
        )}
      </div>

      <div className={styles.history}>
        <div className={styles.historyHeading}>
          <div>
            <strong>Historial de publicaciones</strong>
            <span>Últimas {state.publications.length} versiones conservadas</span>
          </div>
          {current && (
            <span className={styles.historyMeta}>
              checksum {current.checksum.slice(0, 10)}…
            </span>
          )}
        </div>

        <div className={styles.historyList}>
          {state.publications.map((publication) => {
            const isCurrent =
              publication.publicationNumber ===
              state.publicationNumber;

            return (
              <div
                key={publication.id}
                className={styles.historyRow}
              >
                <div className={styles.historyCopy}>
                  <div className={styles.historyTitle}>
                    <strong>
                      #{publication.publicationNumber} · {actionLabels[publication.action]}
                    </strong>
                    {isCurrent && (
                      <span className={styles.currentBadge}>
                        {state.publicVisible
                          ? "Activa"
                          : "Snapshot actual"}
                      </span>
                    )}
                  </div>
                  <span className={styles.historyMeta}>
                    {formatDate(publication.createdAt)} UTC
                    {publication.sourceRevision
                      ? ` · revisión ${publication.sourceRevision}`
                      : " · origen inicial"}
                    {` · ${publication.checksum.slice(0, 10)}…`}
                  </span>
                </div>

                <form
                  method="post"
                  action={`${resolvedRestoreActionBase}/${publication.id}/restore`}
                >
                  <input
                    type="hidden"
                    name="expectedPublicationNumber"
                    value={state.publicationNumber}
                  />
                  <button
                    type="submit"
                    className={styles.restoreButton}
                    disabled={isCurrent}
                    aria-label={
                      isCurrent
                        ? undefined
                        : `Restaurar publicación ${publication.publicationNumber}`
                    }
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    {isCurrent
                      ? state.publicVisible
                        ? "Versión activa"
                        : "Snapshot actual"
                      : "Restaurar"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
