import {
  AlertTriangle,
  Database,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type {
  SiteMaintenanceOverview,
} from "@/lib/admin/site-maintenance-service";

import styles from "./SiteMaintenancePanel.module.css";

const CLEAN_CONFIRMATION =
  "LIMPIAR BASURA SEGURA";

function formatBytes(bytes: number) {
  if (bytes < 1_024) {
    return `${bytes} B`;
  }

  if (bytes < 1_024 * 1_024) {
    return `${(
      bytes / 1_024
    ).toFixed(1)} KiB`;
  }

  if (bytes < 1_024 * 1_024 * 1_024) {
    return `${(
      bytes /
      (1_024 * 1_024)
    ).toFixed(1)} MiB`;
  }

  return `${(
    bytes /
    (1_024 * 1_024 * 1_024)
  ).toFixed(2)} GiB`;
}

function CountRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={styles.countRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function SiteMaintenancePanel({
  overview,
}: {
  overview: SiteMaintenanceOverview;
}) {
  const pending =
    overview.pendingMediaCleanups.length;
  const recent =
    overview.media.recentUnreferenced.length;
  const hasSafeCleanup =
    overview.safeRecords > 0 ||
    overview.safeFiles > 0 ||
    overview.safeMarkers > 0 ||
    overview.safeDirectories > 0 ||
    pending > 0;
  const manualEntries = [
    ...overview.media.unknownNamespaces.map(
      (namespace) =>
        `Namespace sin propietario reconocido: ${namespace}`
    ),
    ...overview.media.unexpectedEntries.map(
      (entry) =>
        `${entry.namespace}: ${entry.name}`
    ),
  ];

  return (
    <section
      className={styles.panel}
      aria-labelledby="site-maintenance-title"
    >
      <header className={styles.header}>
        <div>
          <span>MANTENIMIENTO GENERAL</span>
          <h2 id="site-maintenance-title">
            Higiene completa del sitio
          </h2>
          <p>
            Analiza PostgreSQL y el almacén
            multimedia completo. Sólo clasifica
            como basura automática aquello que
            puede eliminarse sin cambiar contenido
            vigente, historiales restaurables,
            cuentas válidas ni recompensas.
          </p>
        </div>
        <div
          className={
            overview.manualIssues > 0
              ? styles.healthWarning
              : hasSafeCleanup
                ? styles.healthAction
                : styles.healthOk
          }
        >
          {overview.manualIssues > 0 ? (
            <AlertTriangle
              size={18}
              aria-hidden="true"
            />
          ) : (
            <ShieldCheck
              size={18}
              aria-hidden="true"
            />
          )}
          <div>
            <strong>
              {overview.manualIssues > 0
                ? "Revisión necesaria"
                : hasSafeCleanup
                  ? "Limpieza disponible"
                  : "Sin basura segura"}
            </strong>
            <small>
              {overview.manualIssues > 0
                ? `${overview.manualIssues} hallazgos no se borrarán automáticamente.`
                : hasSafeCleanup
                  ? "El diagnóstico encontró residuos eliminables de forma segura."
                  : "No se detectaron residuos elegibles en este momento."}
            </small>
          </div>
        </div>
      </header>

      <div className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <Database
            size={18}
            aria-hidden="true"
          />
          <span>Base de datos</span>
          <strong>
            {overview.safeRecords}
          </strong>
          <small>
            filas transitorias o referencias
            inequívocamente huérfanas
          </small>
        </article>
        <article className={styles.summaryCard}>
          <HardDrive
            size={18}
            aria-hidden="true"
          />
          <span>Archivos huérfanos</span>
          <strong>
            {overview.safeFiles}
          </strong>
          <small>
            {formatBytes(overview.safeBytes)}
            {" · "}
            sólo archivos sin referencias y con
            más de 24 h
          </small>
        </article>
        <article className={styles.summaryCard}>
          <Trash2
            size={18}
            aria-hidden="true"
          />
          <span>Restos físicos</span>
          <strong>
            {overview.safeMarkers +
              overview.safeDirectories}
          </strong>
          <small>
            {overview.safeMarkers} marcadores
            {" · "}
            {overview.safeDirectories} directorios
            vacíos
          </small>
        </article>
        <article className={styles.summaryCard}>
          <RotateCcw
            size={18}
            aria-hidden="true"
          />
          <span>Recuperaciones</span>
          <strong>{pending}</strong>
          <small>
            hard-deletes con limpieza física
            todavía pendiente
          </small>
        </article>
      </div>

      <div className={styles.columns}>
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeading}>
            <span>AUTOMÁTICO Y SEGURO</span>
            <h3>Qué limpiará</h3>
          </div>
          <div className={styles.counts}>
            <CountRow
              label="Sesiones Admin vencidas/revocadas"
              value={
                overview.runtime.adminSessions
              }
            />
            <CountRow
              label="Sesiones de cuentas vencidas/revocadas"
              value={
                overview.runtime.accountSessions
              }
            />
            <CountRow
              label="Códigos de recuperación ya usados"
              value={
                overview.runtime.usedRecoveryCodes
              }
            />
            <CountRow
              label="Eventos Admin transitorios > 90 días"
              value={
                overview.runtime.oldAdminEvents
              }
            />
            <CountRow
              label="Preferencias de juegos inexistentes"
              value={
                overview.runtime.orphanPreferences
              }
            />
            <CountRow
              label="Ratings de juegos inexistentes"
              value={
                overview.runtime.orphanRatings
              }
            />
            <CountRow
              label="Insights de juegos inexistentes"
              value={
                overview.runtime.orphanInsights
              }
            />
            <CountRow
              label="Masters multimedia huérfanos"
              value={overview.safeFiles}
            />
            <CountRow
              label="Marcadores de borrado sin archivo"
              value={overview.safeMarkers}
            />
            <CountRow
              label="Namespaces vacíos"
              value={overview.safeDirectories}
            />
            <CountRow
              label="Limpiezas pendientes de hard-delete"
              value={pending}
            />
          </div>
        </div>

        <div className={styles.sectionCard}>
          <div className={styles.sectionHeading}>
            <span>PROTEGIDO</span>
            <h3>Qué no tocará</h3>
          </div>
          <ul className={styles.protectedList}>
            <li>
              borradores y publicaciones actuales;
            </li>
            <li>
              revisiones y snapshots que sigan
              restaurables;
            </li>
            <li>
              archivos referenciados por cualquier
              payload editorial;
            </li>
            <li>
              archivos sin referencia con menos de
              24 horas ({recent} ahora);
            </li>
            <li>
              cuentas, perfiles de hardware,
              avatares y recompensas válidas;
            </li>
            <li>
              el log de auditoría administrativa;
            </li>
            <li>
              historiales editoriales: se limpian
              únicamente con las herramientas de
              Historial de esta misma pantalla.
            </li>
          </ul>
          <div className={styles.referenceStat}>
            <span>
              Referencias multimedia protegidas
            </span>
            <strong>
              {
                overview.media
                  .protectedReferences
              }
            </strong>
          </div>
        </div>
      </div>

      {(overview.manualIssues > 0 ||
        manualEntries.length > 0) && (
        <div className={styles.manualReview}>
          <div>
            <AlertTriangle
              size={18}
              aria-hidden="true"
            />
            <div>
              <strong>Revisión manual</strong>
              <p>
                Estos hallazgos se muestran, pero
                la limpieza general no los borra
                automáticamente porque podrían
                representar contenido o archivos
                que requieren una decisión
                editorial.
              </p>
            </div>
          </div>

          <div className={styles.counts}>
            <CountRow
              label="Actualizaciones cuyo juego ya no existe"
              value={
                overview.runtime
                  .orphanGameUpdates
              }
            />
            <CountRow
              label="Namespaces desconocidos"
              value={
                overview.media
                  .unknownNamespaces.length
              }
            />
            <CountRow
              label="Entradas inesperadas"
              value={
                overview.media
                  .unexpectedEntries.length
              }
            />
          </div>

          {manualEntries.length > 0 && (
            <details className={styles.details}>
              <summary>
                Ver rutas que requieren revisión
              </summary>
              <ul>
                {manualEntries.map(
                  (entry) => (
                    <li key={entry}>
                      {entry}
                    </li>
                  )
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className={styles.cleanupBlock}>
        <div className={styles.sectionHeading}>
          <span>ACCIÓN GENERAL</span>
          <h3>Limpieza general segura</h3>
          <p>
            Ejecuta en una sola operación todos
            los residuos seguros mostrados arriba.
            Antes de borrar vuelve a calcular el
            diagnóstico y aborta si cambió desde
            que cargaste esta pantalla.
          </p>
        </div>

        {hasSafeCleanup ? (
          <form
            className={styles.cleanupForm}
            method="post"
            action="/api/admin/content/maintenance/site-cleanup"
          >
            <input
              type="hidden"
              name="snapshotFingerprint"
              value={overview.fingerprint}
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
              Escribe{" "}
              <strong>
                {CLEAN_CONFIRMATION}
              </strong>
              {" "}para confirmar
              <input
                type="text"
                name="confirmation"
                autoComplete="off"
                required
              />
            </label>
            <button type="submit">
              <Trash2
                size={16}
                aria-hidden="true"
              />
              Limpiar basura segura
            </button>
          </form>
        ) : (
          <div className={styles.empty}>
            No hay residuos automáticos que
            eliminar. Los hallazgos de revisión
            manual, si existen, permanecen
            intactos.
          </div>
        )}
      </div>

      <div className={styles.pendingBlock}>
        <div className={styles.sectionHeading}>
          <span>RECUPERACIÓN</span>
          <h3>Limpiezas multimedia pendientes</h3>
          <p>
            También puedes reintentar una
            recuperación individual sin ejecutar
            el resto de la limpieza general.
          </p>
        </div>

        {pending === 0 ? (
          <div className={styles.empty}>
            No hay hard-deletes pendientes de
            limpieza física.
          </div>
        ) : (
          <div className={styles.pendingList}>
            {overview.pendingMediaCleanups.map(
              (entry) => (
                <article
                  className={styles.pendingItem}
                  key={entry.slug}
                >
                  <div>
                    <strong>
                      {entry.slug}
                    </strong>
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
                      Contraseña actual
                      <input
                        type="password"
                        name="currentPassword"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <label>
                      Escribe{" "}
                      <strong>
                        {entry.slug}
                      </strong>
                      <input
                        type="text"
                        name="confirmSlug"
                        autoComplete="off"
                        required
                      />
                    </label>
                    <button type="submit">
                      <RotateCcw
                        size={16}
                        aria-hidden="true"
                      />
                      Reintentar
                    </button>
                  </form>
                </article>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
