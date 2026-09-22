import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
  FilePenLine,
  RotateCcw,
  Rocket,
} from "lucide-react";

import {
  gameEditorReadinessTarget,
} from "@/lib/admin/game-editor-flow";
import {
  evaluateGamePublicationChanges,
} from "@/lib/admin/game-publication-changes";
import {
  evaluateGamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import type {
  EditorialPublicationState,
} from "@/lib/admin/publication-service";
import type { Game } from "@/types/game";

import styles from "./GamePublicationWorkspace.module.css";

type MediaHygieneSummary = {
  ready: boolean;
  blockingCount: number;
  unused: number;
  publishedOnly: number;
  historical: number;
};

type GamePublicationWorkspaceProps = {
  game: Game;
  publishedGame: Game | null;
  slug: string;
  state: EditorialPublicationState;
  requestState?: string;
  neverPublished: boolean;
  panelCreated: boolean;
  mediaHygiene: MediaHygieneSummary;
};

const publicationActionLabels = {
  bootstrap: "Base inicial",
  published: "Publicación",
  rollback: "Restauración",
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

function RequestNotice({
  state,
  slug,
}: {
  state?: string;
  slug: string;
}) {
  if (!state) return null;

  if (state === "publicado") {
    return (
      <div className={`${styles.notice} ${styles.noticeSuccess}`}>
        Publicación completada. El snapshot visible ya corresponde a este borrador.
      </div>
    );
  }

  if (state === "oculto") {
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`}>
        El juego fue retirado de la web. El borrador, el último snapshot y todo el historial siguen conservados.
      </div>
    );
  }

  if (state === "publicacion-restaurada") {
    return (
      <div className={`${styles.notice} ${styles.noticeSuccess}`}>
        La versión histórica fue restaurada como una publicación nueva. Ninguna publicación anterior se eliminó.
      </div>
    );
  }

  if (state === "sin-cambios") {
    return (
      <div className={styles.notice}>
        No había un cambio nuevo que aplicar al estado publicado.
      </div>
    );
  }

  if (state === "higiene-multimedia") {
    return (
      <div className={`${styles.notice} ${styles.noticeError}`}>
        <strong>Publicación bloqueada por higiene multimedia.</strong>{" "}
        Hay masters editoriales realmente huérfanos: no los usa el borrador, la publicación actual ni ningún snapshot histórico restaurable. Asígnalos o elimínalos desde Biblioteca multimedia antes de publicar.{" "}
        <Link href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=multimedia`}>
          Resolver Biblioteca multimedia
        </Link>
      </div>
    );
  }

  if (state === "catalogos-sin-publicar") {
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`}>
        <strong>Publicación bloqueada por Catálogos.</strong>{" "}
        Este juego usa una clasificación o etiqueta que todavía no existe en el snapshot público de Catálogos. Publica primero los datos maestros para mantener una sola definición en toda la web.{" "}
        <Link href="/admin/catalogos?seccion=publicacion">
          Revisar publicación de Catálogos
        </Link>
      </div>
    );
  }

  if (
    state === "preparacion-incompleta" ||
    state === "restauracion-incompleta"
  ) {
    return (
      <div className={`${styles.notice} ${styles.noticeError}`}>
        <strong>Publicación bloqueada por preparación incompleta.</strong>{" "}
        Portada, Hero, Card, Contenedor y Galería deben cumplir sus destinos obligatorios y la ficha principal debe estar completa. La web pública no fue modificada.{" "}
        <Link
          href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=multimedia`}
        >
          Completar Multimedia
        </Link>
      </div>
    );
  }

  if (
    state === "asset-publicacion" ||
    state === "asset-restauracion"
  ) {
    return (
      <div className={`${styles.notice} ${styles.noticeError}`}>
        <strong>Publicación bloqueada por integridad multimedia.</strong>{" "}
        Una imagen o un video referenciado ya no existe en el almacenamiento. La web no fue modificada.{" "}
        <Link
          href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=multimedia`}
        >
          Abrir Multimedia para corregirlo
        </Link>
      </div>
    );
  }

  if (
    state === "conflicto" ||
    state === "conflicto-publicacion"
  ) {
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`}>
        El juego cambió mientras se procesaba la operación. La pantalla se actualizó sin sobrescribir la revisión más reciente.
      </div>
    );
  }

  if (state === "eliminacion-confirmacion") {
    return (
      <div className={`${styles.notice} ${styles.noticeError}`}>
        La eliminación no se ejecutó porque la confirmación no coincide exactamente con el identificador del juego.
      </div>
    );
  }

  if (state === "eliminacion-fuente") {
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`}>
        Este juego está respaldado por archivos fuente y no puede eliminarse definitivamente desde el panel. Puedes ocultarlo o retirarlo mediante un cambio versionado de la fuente.
      </div>
    );
  }

  if (state === "eliminacion-home") {
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`}>
        Inicio todavía referencia este juego. Retíralo del borrador y del snapshot público de Inicio antes de volver a intentar la eliminación.
      </div>
    );
  }

  if (state === "solicitud" || state === "datos") {
    return (
      <div className={`${styles.notice} ${styles.noticeError}`}>
        La operación fue rechazada por la validación administrativa. Revisa el estado actual antes de volver a intentarlo.
      </div>
    );
  }

  return null;
}

function resolveStatus(
  state: EditorialPublicationState,
  neverPublished: boolean
) {
  if (neverPublished) {
    return {
      eyebrow: "NUNCA PUBLICADO",
      title: "Borrador privado listo para revisar",
      text: "Nada de este juego es visible públicamente todavía. Publicar por primera vez creará el primer snapshot público real.",
      tone: "new" as const,
    };
  }

  if (!state.publicVisible) {
    return {
      eyebrow: "OCULTO",
      title: "El juego está fuera de la web",
      text: "El último snapshot sigue conservado. Puedes seguir editando el borrador y volver a publicarlo cuando quieras.",
      tone: "hidden" as const,
    };
  }

  if (state.hasUnpublishedChanges) {
    return {
      eyebrow: "CAMBIOS PENDIENTES",
      title: "La web todavía muestra la versión anterior",
      text: "Los cambios están guardados únicamente como borrador. Publicar creará un snapshot nuevo sin borrar el anterior.",
      tone: "pending" as const,
    };
  }

  return {
    eyebrow: "PUBLICADO",
    title: "Borrador y web están sincronizados",
    text: "La publicación activa coincide con la revisión actual. Se puede seguir editando: guardar no modificará la web hasta la próxima publicación.",
    tone: "published" as const,
  };
}

export default function GamePublicationWorkspace({
  game,
  publishedGame,
  slug,
  state,
  requestState,
  neverPublished,
  panelCreated,
  mediaHygiene,
}: GamePublicationWorkspaceProps) {
  const readiness = evaluateGamePublicationReadiness(game);
  const publicationChanges = evaluateGamePublicationChanges(
    game,
    publishedGame
  );
  const publicationStatus = resolveStatus(
    state,
    neverPublished
  );
  const publishLabel = neverPublished
    ? "Publicar por primera vez"
    : state.publicVisible
      ? "Publicar cambios"
      : "Volver a publicar";
  const publicationEssentialsReady =
    readiness.essentialsReady && mediaHygiene.ready;
  const completedControls =
    readiness.completed + (mediaHygiene.ready ? 1 : 0);
  const totalControls = readiness.total + 1;
  const preparationPercentage = Math.round(
    (completedControls / totalControls) * 100
  );

  return (
    <div className={styles.workspace}>
      <RequestNotice state={requestState} slug={slug} />

      <section
        className={styles.statusCard}
        data-tone={publicationStatus.tone}
      >
        <div>
          <span>{publicationStatus.eyebrow}</span>
          <h2>{publicationStatus.title}</h2>
          <p>{publicationStatus.text}</p>
        </div>

        <div className={styles.quickActions}>
          <Link
            href={`/admin/juegos/${encodeURIComponent(slug)}/vista-previa`}
          >
            <Eye size={16} aria-hidden="true" />
            Vista previa del borrador
          </Link>
          {state.publicVisible && (
            <Link
              href={`/juegos/${encodeURIComponent(slug)}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Ver publicación actual
            </Link>
          )}
        </div>
      </section>

      <section className={styles.summaryGrid} aria-label="Resumen editorial">
        <article>
          <span>Revisión del borrador</span>
          <strong>#{state.draftRevision}</strong>
          <small>Se publica exactamente esta revisión.</small>
        </article>
        <article>
          <span>Publicación interna</span>
          <strong>
            {neverPublished
              ? "Sin publicación pública"
              : `#${state.publicationNumber}`}
          </strong>
          <small>
            {state.publicVisible
              ? "Snapshot visible actualmente."
              : "Conservada, pero no visible."}
          </small>
        </article>
        <article>
          <span>Preparación editorial</span>
          <strong>{preparationPercentage}%</strong>
          <small>
            {completedControls} de {totalControls} controles completos.
          </small>
        </article>
        <article>
          <span>Estado público</span>
          <strong>
            {state.publicVisible
              ? "Visible"
              : "No visible"}
          </strong>
          <small>
            Guardar borradores nunca cambia este estado.
          </small>
        </article>
      </section>

      <section className={styles.checklistPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span>CONTROL ANTES DE PUBLICAR</span>
            <h2>Preparación de la ficha</h2>
          </div>
          <p>
            Los controles recomendados no bloquean la publicación, pero muestran qué conviene completar antes de hacer visible el juego.
          </p>
        </div>

        <div className={styles.progressTrack} aria-hidden="true">
          <span style={{ width: `${preparationPercentage}%` }} />
        </div>

        <div className={styles.checklist}>
          {readiness.items.map((item) => (
            <Link
              key={item.id}
              href={gameEditorReadinessTarget(slug, item.section, item.id)}
              className={item.complete ? styles.checkComplete : styles.checkMissing}
            >
              <span className={styles.checkIcon}>
                {item.complete ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Circle size={16} aria-hidden="true" />
                )}
              </span>
              <span className={styles.checkCopy}>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <span className={styles.checkState}>
                {item.complete
                  ? "Completo"
                  : item.priority === "essential"
                    ? "Necesario"
                    : "Recomendado"}
              </span>
            </Link>
          ))}

          <Link
            href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=multimedia`}
            className={mediaHygiene.ready ? styles.checkComplete : styles.checkMissing}
          >
            <span className={styles.checkIcon}>
              {mediaHygiene.ready ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Circle size={16} aria-hidden="true" />
              )}
            </span>
            <span className={styles.checkCopy}>
              <strong>Higiene multimedia</strong>
              <small>
                {mediaHygiene.ready
                  ? "No hay masters editoriales huérfanos. Los recursos necesarios para borrador, publicación o historial permanecen protegidos."
                  : `${mediaHygiene.blockingCount} master${mediaHygiene.blockingCount === 1 ? "" : "s"} sin ninguna referencia editorial ni histórica. Asígnalos o elimínalos desde Biblioteca.`}
              </small>
            </span>
            <span className={styles.checkState}>
              {mediaHygiene.ready ? "Completo" : "Necesario"}
            </span>
          </Link>
        </div>
      </section>

      <section className={styles.checklistPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span>CAMBIOS QUE SALDRÁN A LA WEB</span>
            <h2>Contenido incluido en la próxima publicación</h2>
          </div>
          <p>
            La comparación se hace entre el borrador actual y el último snapshot publicado. Sirve para revisar el alcance antes de confirmar.
          </p>
        </div>

        {publicationChanges.length > 0 ? (
          <div className={styles.checklist}>
            {publicationChanges.map((change) => (
              <Link
                key={change.id}
                href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=${change.section}`}
                className={styles.checkComplete}
              >
                <span className={styles.checkIcon}>
                  <FilePenLine size={16} aria-hidden="true" />
                </span>
                <span className={styles.checkCopy}>
                  <strong>{change.label}</strong>
                  <small>{change.detail}</small>
                </span>
                <span className={styles.checkState}>
                  Se publicará
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.notice}>
            {state.publicVisible
              ? "No hay diferencias de contenido entre el borrador y el snapshot público actual."
              : "No hay diferencias de contenido. Al volver a publicar se reactivará el juego conservando el mismo contenido como un snapshot nuevo y auditable."}
          </div>
        )}
      </section>

      <section className={styles.publishPanel}>
        <div className={styles.publishCopy}>
          <span>ACCIÓN EDITORIAL</span>
          <h2>{publishLabel}</h2>
          <p>
            {neverPublished
              ? "Al confirmar, este borrador empezará a aparecer en el catálogo público. La operación queda auditada y el borrador seguirá separado para futuros cambios."
              : "Al confirmar, se copiará la revisión actual a un snapshot público nuevo. Las publicaciones anteriores permanecen en el historial."}
          </p>

          {readiness.recommendedMissing > 0 && (
            <div className={styles.advisory}>
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                Quedan {readiness.recommendedMissing} controles recomendados sin completar. Se puede publicar igualmente si el contenido es correcto para el criterio editorial.
              </span>
            </div>
          )}

          {!readiness.essentialsReady && (
            <div className={styles.advisory}>
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                Faltan controles esenciales. La publicación permanecerá bloqueada hasta completar la ficha principal y los destinos multimedia obligatorios.
              </span>
            </div>
          )}

          {!mediaHygiene.ready && (
            <div className={styles.advisory}>
              <AlertTriangle size={17} aria-hidden="true" />
              <span>
                Hay {mediaHygiene.blockingCount} master{mediaHygiene.blockingCount === 1 ? "" : "s"} editorial{mediaHygiene.blockingCount === 1 ? "" : "es"} realmente huérfano{mediaHygiene.blockingCount === 1 ? "" : "s"}. Asígnalos a un destino o Galería, o elimínalos desde Biblioteca multimedia antes de publicar.
              </span>
            </div>
          )}
        </div>

        <div className={styles.publishActions}>
          <form
            method="post"
            action={`/api/admin/content/games/${encodeURIComponent(slug)}/publish`}
          >
            <input
              type="hidden"
              name="expectedRevision"
              value={state.draftRevision}
            />
            <button
              type="submit"
              className={styles.publishButton}
              disabled={
                !state.hasUnpublishedChanges ||
                !publicationEssentialsReady
              }
            >
              <Rocket size={17} aria-hidden="true" />
              {publishLabel}
            </button>
          </form>

          {state.publicVisible && (
            <form
              method="post"
              action={`/api/admin/content/games/${encodeURIComponent(slug)}/hide`}
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
                <EyeOff size={17} aria-hidden="true" />
                Ocultar de la web
              </button>
            </form>
          )}
        </div>
      </section>

      <section className={styles.historyPanel}>
        <div className={styles.sectionHeading}>
          <div>
            <span>PUBLICACIONES</span>
            <h2>Historial de snapshots</h2>
          </div>
          <p>
            Restaurar no borra ni retrocede el historial: crea una publicación nueva con el contenido seleccionado.
          </p>
        </div>

        <div className={styles.historyList}>
          {state.publications.map((publication) => {
            const current =
              publication.publicationNumber ===
              state.publicationNumber;
            const privateBootstrap =
              panelCreated &&
              publication.action === "bootstrap";

            return (
              <div
                key={publication.id}
                className={styles.historyRow}
              >
                <div>
                  <strong>
                    {privateBootstrap
                      ? "Base privada inicial"
                      : `#${publication.publicationNumber} · ${publicationActionLabels[publication.action]}`}
                  </strong>
                  <span>
                    {formatDate(publication.createdAt)} UTC
                    {publication.sourceRevision
                      ? ` · revisión ${publication.sourceRevision}`
                      : " · origen inicial"}
                    {` · ${publication.checksum.slice(0, 10)}…`}
                  </span>
                </div>

                <div className={styles.historyAction}>
                  {current && (
                    <span>
                      {state.publicVisible
                        ? "Snapshot actual"
                        : neverPublished
                          ? "Base privada"
                          : "Último snapshot"}
                    </span>
                  )}

                  {!current && !privateBootstrap && (
                    <form
                      method="post"
                      action={`/api/admin/content/publications/${publication.id}/restore`}
                    >
                      <input
                        type="hidden"
                        name="expectedPublicationNumber"
                        value={state.publicationNumber}
                      />
                      <button type="submit">
                        <RotateCcw size={14} aria-hidden="true" />
                        Restaurar y publicar
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
