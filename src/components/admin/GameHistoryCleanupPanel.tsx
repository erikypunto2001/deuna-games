import {
  Trash2,
} from "lucide-react";

import type {
  EditorialItemHistoryOverview,
} from "@/lib/admin/editorial-maintenance-service";

import styles from "./GameHistoryCleanupPanel.module.css";

type GameHistoryCleanupPanelProps = {
  slug: string;
  mode: "snapshots" | "full";
  overview: EditorialItemHistoryOverview;
};

export default function GameHistoryCleanupPanel({
  slug,
  mode,
  overview,
}: GameHistoryCleanupPanelProps) {
  const snapshotsRemoved = Math.max(
    0,
    overview.publications - 1
  );
  const revisionsRemoved = Math.max(
    0,
    overview.revisions - 1
  );
  const removable =
    mode === "snapshots"
      ? snapshotsRemoved
      : snapshotsRemoved + revisionsRemoved;
  const action =
    mode === "snapshots"
      ? `/api/admin/content/games/${encodeURIComponent(slug)}/history/publications/reset`
      : `/api/admin/content/games/${encodeURIComponent(slug)}/history/reset`;

  return (
    <div className={styles.panel}>
      <div className={styles.copy}>
        <span>
          {mode === "snapshots"
            ? "LIMPIEZA DE SNAPSHOTS"
            : "LIMPIEZA DEL HISTORIAL"}
        </span>
        <strong>
          {mode === "snapshots"
            ? "Eliminar snapshots antiguos"
            : "Eliminar respaldos históricos del juego"}
        </strong>
        <p>
          {mode === "snapshots"
            ? "Conserva únicamente el snapshot publicado actual. Las revisiones del borrador siguen disponibles en Historial."
            : "Conserva el borrador y el snapshot actuales como baseline, pero elimina las revisiones y publicaciones anteriores de este juego."}
        </p>
      </div>

      <div className={styles.facts}>
        {mode === "full" && (
          <div>
            <span>Revisiones</span>
            <strong>
              {overview.revisions} → 1
            </strong>
          </div>
        )}
        <div>
          <span>Snapshots</span>
          <strong>
            {overview.publications} → 1
          </strong>
        </div>
        <div>
          <span>Respaldos a eliminar</span>
          <strong>{removable}</strong>
        </div>
      </div>

      {removable > 0 ? (
        <form
          className={styles.form}
          method="post"
          action={action}
        >
          {mode === "full" && (
            <input
              type="hidden"
              name="expectedRevisions"
              value={overview.revisions}
            />
          )}
          <input
            type="hidden"
            name="expectedPublications"
            value={overview.publications}
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
            />
          </label>

          <button type="submit">
            <Trash2 size={16} aria-hidden="true" />
            {mode === "snapshots"
              ? "Limpiar snapshots antiguos"
              : "Limpiar historial del juego"}
          </button>
        </form>
      ) : (
        <div className={styles.empty}>
          No hay respaldos antiguos que limpiar en este alcance.
        </div>
      )}

      <small className={styles.note}>
        Esta acción no despublica el juego ni borra multimedia automáticamente.
        Los recursos que queden realmente huérfanos se gestionan desde
        Multimedia.
      </small>
    </div>
  );
}
