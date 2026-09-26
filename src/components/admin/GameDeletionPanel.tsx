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
          Esta acción elimina definitivamente el juego del estado editorial
          actual, junto con actualizaciones asociadas, preferencias,
          valoraciones e Índice DeUna. Si proviene de la fuente inicial,
          también registra su retiro para que el importador no lo recree.
          Las recompensas ya concedidas a cuentas no se recalculan ni se eliminan.
        </p>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span>Actualizaciones</span>
          <strong>{preview.updates}</strong>
        </div>
        <div className={styles.fact}>
          <span>Multimedia</span>
          <strong>
            {preview.mediaResources === null
              ? "No verificado"
              : preview.mediaResources}
          </strong>
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

      {preview.reason === "still_public" ? (
        <div className={styles.blocker}>
          <AlertTriangle size={17} aria-hidden="true" />{" "}
          No se puede eliminar definitivamente mientras el juego siga visible
          en la web. Ocúltalo primero desde Publicación; retirar y destruir
          contenido son operaciones separadas.
        </div>
      ) : preview.reason === "media_unverified" ? (
        <div className={styles.blocker}>
          <AlertTriangle size={17} aria-hidden="true" />{" "}
          No se pudo verificar por completo el namespace multimedia del juego.
          Por seguridad, la eliminación queda bloqueada hasta corregir esa
          inconsistencia o entrada no reconocida.
        </div>
      ) : blockedByHome ? (
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
            name="deletePublicationNumber"
            value={preview.publicationNumber}
          />
          <label>
            Contraseña actual del Owner
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </label>
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
