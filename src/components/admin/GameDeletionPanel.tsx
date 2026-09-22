import {
  AlertTriangle,
  Trash2,
} from "lucide-react";

import type {
  GameDeletionPreview,
} from "@/lib/admin/editorial-maintenance-service";

import styles from "./GameDeletionPanel.module.css";

export default function GameDeletionPanel({
  slug,
  preview,
}: {
  slug: string;
  preview: GameDeletionPreview;
}) {
  const blockedByHome =
    preview.reason === "home_reference";

  return (
    <section className={styles.panel} aria-labelledby="game-delete-title">
      <div className={styles.heading}>
        <span>ZONA PELIGROSA</span>
        <h2 id="game-delete-title">
          Eliminar definitivamente este juego
        </h2>
        <p>
          Esta acción sólo existe para juegos creados desde el panel. Elimina
          su espacio editorial, historial, actualizaciones asociadas,
          preferencias, valoraciones e Índice DeUna. Las recompensas ya
          concedidas a cuentas no se recalculan ni se eliminan.
        </p>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span>Revisiones</span>
          <strong>{preview.revisions}</strong>
        </div>
        <div className={styles.fact}>
          <span>Publicaciones</span>
          <strong>{preview.publications}</strong>
        </div>
        <div className={styles.fact}>
          <span>Actualizaciones</span>
          <strong>{preview.updates}</strong>
        </div>
        <div className={styles.fact}>
          <span>Multimedia</span>
          <strong>{preview.mediaResources}</strong>
        </div>
        <div className={styles.fact}>
          <span>Preferencias</span>
          <strong>{preview.preferences}</strong>
        </div>
        <div className={styles.fact}>
          <span>Valoraciones</span>
          <strong>{preview.ratings}</strong>
        </div>
        <div className={styles.fact}>
          <span>Índice DeUna</span>
          <strong>{preview.insightSnapshots}</strong>
        </div>
        <div className={styles.fact}>
          <span>Estado público</span>
          <strong>{preview.publicVisible ? "Visible" : "No visible"}</strong>
        </div>
      </div>

      {blockedByHome ? (
        <div className={styles.blocker}>
          <AlertTriangle size={17} aria-hidden="true" />{" "}
          No se puede eliminar todavía. Inicio referencia este juego
          {preview.homeDraftReferences > 0 ? " en su borrador" : ""}
          {preview.homeDraftReferences > 0 && preview.homePublishedReferences > 0
            ? " y"
            : ""}
          {preview.homePublishedReferences > 0 ? " en su snapshot publicado" : ""}.
          Retíralo desde Inicio y publica ese cambio cuando corresponda; esta
          operación nunca modifica ni publica Inicio automáticamente.
        </div>
      ) : preview.reason === "home_history_reference" ? (
        <div className={styles.blocker}>
          <AlertTriangle size={17} aria-hidden="true" />{" "}
          No se puede eliminar todavía. Una versión histórica de Inicio
          referencia este juego. Compacta el historial desde Mantenimiento
          después de retirar el juego del Inicio actual; así ninguna
          restauración futura podrá reintroducir el slug eliminado.
        </div>
      ) : preview.reason === "source_managed" ? (
        <div className={styles.blocker}>
          <AlertTriangle size={17} aria-hidden="true" />{" "}
          Este juego está respaldado por archivos fuente. Se puede ocultar,
          pero no eliminar definitivamente desde el panel porque el importador
          o el fallback podrían recrearlo.
        </div>
      ) : (
        <form
          className={styles.form}
          method="post"
          action={`/api/admin/content/games/${encodeURIComponent(slug)}/delete`}
        >
          <input
            type="hidden"
            name="expectedRevision"
            value={preview.revision}
          />
          <input
            type="hidden"
            name="expectedPublicationNumber"
            value={preview.publicationNumber}
          />
          <label>
            Escribe <strong>{slug}</strong> para confirmar
            <input
              type="text"
              name="confirmSlug"
              autoComplete="off"
              required
              pattern={slug.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")}
            />
          </label>
          <button className={styles.deleteButton} type="submit">
            <Trash2 size={16} aria-hidden="true" />
            Eliminar definitivamente
          </button>
        </form>
      )}
    </section>
  );
}
