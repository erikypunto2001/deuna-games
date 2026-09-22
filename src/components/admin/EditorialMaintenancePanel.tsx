import {
  ArchiveRestore,
  AlertTriangle,
} from "lucide-react";

import type {
  EditorialHistoryMaintenanceOverview,
} from "@/lib/admin/editorial-maintenance-service";

import styles from "./EditorialMaintenancePanel.module.css";

const CONFIRMATION = "REINICIAR HISTORIAL";

export default function EditorialMaintenancePanel({
  overview,
}: {
  overview: EditorialHistoryMaintenanceOverview;
}) {
  const revisionsRemoved = Math.max(
    0,
    overview.revisions -
      overview.revisionsAfterCompaction
  );
  const publicationsRemoved = Math.max(
    0,
    overview.publications -
      overview.publicationsAfterCompaction
  );

  return (
    <section className={styles.panel} aria-labelledby="maintenance-history-title">
      <div>
        <span>HIGIENE EDITORIAL</span>
        <h2 id="maintenance-history-title">
          Reiniciar historial conservando el estado actual
        </h2>
        <p>
          Compacta revisiones y snapshots antiguos a un único punto actual por
          registro. No cambia borradores, payloads publicados, visibilidad,
          cuentas, recompensas ni el log administrativo.
        </p>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span>Registros editoriales</span>
          <strong>{overview.items}</strong>
          <small>Todos conservarán su estado actual.</small>
        </div>
        <div className={styles.fact}>
          <span>Revisiones</span>
          <strong>
            {overview.revisions} → {overview.revisionsAfterCompaction}
          </strong>
          <small>{revisionsRemoved} versiones antiguas dejarán de existir.</small>
        </div>
        <div className={styles.fact}>
          <span>Publicaciones</span>
          <strong>
            {overview.publications} → {overview.publicationsAfterCompaction}
          </strong>
          <small>{publicationsRemoved} snapshots históricos dejarán de existir.</small>
        </div>
      </div>

      <div className={styles.warning}>
        <AlertTriangle size={17} aria-hidden="true" />{" "}
        Esta operación es irreversible desde el panel. Los snapshots eliminados
        ya no podrán restaurarse y los recursos multimedia que sólo estén
        protegidos por ese historial podrán pasar a ser huérfanos y elegibles
        para la limpieza multimedia.
      </div>

      <form
        className={styles.form}
        method="post"
        action="/api/admin/content/maintenance/history-reset"
      >
        <input type="hidden" name="expectedItems" value={overview.items} />
        <input type="hidden" name="expectedRevisions" value={overview.revisions} />
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
          Escribe <strong>{CONFIRMATION}</strong> para confirmar
          <input
            type="text"
            name="confirmation"
            autoComplete="off"
            required
          />
        </label>
        <button className={styles.button} type="submit">
          <ArchiveRestore size={16} aria-hidden="true" />
          Reiniciar historial editorial
        </button>
      </form>
    </section>
  );
}
