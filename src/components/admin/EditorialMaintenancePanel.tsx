import {
  ArchiveRestore,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

import type {
  EditorialHistoryMaintenanceOverview,
} from "@/lib/admin/editorial-maintenance-service";

import styles from "./EditorialMaintenancePanel.module.css";

const HOME_CONFIRMATION = "REINICIAR INICIO";
const GLOBAL_CONFIRMATION = "REINICIAR HISTORIAL";

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
  const homeRevisionsRemoved = Math.max(
    0,
    overview.homeRevisions - 1
  );
  const homePublicationsRemoved = Math.max(
    0,
    overview.homePublications - 1
  );

  return (
    <section className={styles.panel} aria-labelledby="maintenance-history-title">
      <div>
        <span>HIGIENE EDITORIAL</span>
        <h2 id="maintenance-history-title">
          Mantenimiento de historial
        </h2>
        <p>
          Las operaciones conservan el borrador, el snapshot publicado y la
          visibilidad actuales. Sólo eliminan versiones anteriores y dejan un
          baseline explícito y auditable.
        </p>
      </div>

      <div className={styles.warning}>
        <AlertTriangle size={17} aria-hidden="true" />{" "}
        Toda compactación es irreversible desde el panel. Antes de ejecutarla
        sobre datos valiosos debe existir un backup verificado.
      </div>

      <div className={styles.heading}>
        <span>ALCANCE MÍNIMO</span>
        <h3>Reiniciar sólo el historial de Inicio</h3>
        <p>
          Úsalo cuando una versión histórica de Inicio impide eliminar un juego
          ya retirado de la portada actual. No toca historiales de juegos,
          cuentas, catálogos ni otras configuraciones.
        </p>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span>Revisiones de Inicio</span>
          <strong>{overview.homeRevisions} → 1</strong>
          <small>{homeRevisionsRemoved} versiones antiguas se eliminarán.</small>
        </div>
        <div className={styles.fact}>
          <span>Publicaciones de Inicio</span>
          <strong>{overview.homePublications} → 1</strong>
          <small>{homePublicationsRemoved} snapshots antiguos se eliminarán.</small>
        </div>
      </div>

      <form
        className={styles.form}
        method="post"
        action="/api/admin/content/maintenance/history-reset/home"
      >
        <input
          type="hidden"
          name="expectedRevisions"
          value={overview.homeRevisions}
        />
        <input
          type="hidden"
          name="expectedPublications"
          value={overview.homePublications}
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
          Escribe <strong>{HOME_CONFIRMATION}</strong> para confirmar
          <input
            type="text"
            name="confirmation"
            autoComplete="off"
            required
          />
        </label>
        <button className={styles.button} type="submit">
          <ArchiveRestore size={16} aria-hidden="true" />
          Reiniciar historial de Inicio
        </button>
      </form>

      <div className={styles.heading}>
        <span>ALCANCE GLOBAL</span>
        <h3>Reiniciar todo el historial editorial</h3>
        <p>
          Compacta todos los registros editoriales a un único baseline actual.
          No cambia borradores, payloads publicados, visibilidad, cuentas,
          recompensas ni el log administrativo.
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
          Escribe <strong>{GLOBAL_CONFIRMATION}</strong> para confirmar
          <input
            type="text"
            name="confirmation"
            autoComplete="off"
            required
          />
        </label>
        <button className={styles.button} type="submit">
          <ArchiveRestore size={16} aria-hidden="true" />
          Reiniciar todo el historial editorial
        </button>
      </form>

      <div className={styles.heading}>
        <span>RECUPERACIÓN DE ARCHIVOS</span>
        <h3>Limpiezas multimedia pendientes</h3>
        <p>
          Si un hard-delete eliminó correctamente la base pero el filesystem
          falló, el slug queda bloqueado y aparece aquí hasta que el namespace
          multimedia se elimine por completo.
        </p>
      </div>

      {overview.pendingGameMediaCleanups.length === 0 ? (
        <div className={styles.empty}>
          No hay limpiezas multimedia pendientes.
        </div>
      ) : (
        <div className={styles.pendingList}>
          {overview.pendingGameMediaCleanups.map((entry) => (
            <div className={styles.pendingItem} key={entry.slug}>
              <div>
                <strong>{entry.slug}</strong>
                <small>
                  Intentos: {entry.attempts}
                  {entry.lastAttemptAt
                    ? ` · último: ${entry.lastAttemptAt.toISOString()}`
                    : " · todavía sin reintentos"}
                </small>
              </div>

              <form
                className={styles.retryForm}
                method="post"
                action={`/api/admin/content/maintenance/media-cleanup/${encodeURIComponent(entry.slug)}`}
              >
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
                  Escribe <strong>{entry.slug}</strong>
                  <input
                    type="text"
                    name="confirmSlug"
                    autoComplete="off"
                    required
                  />
                </label>
                <button className={styles.button} type="submit">
                  <RotateCcw size={16} aria-hidden="true" />
                  Reintentar limpieza
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
