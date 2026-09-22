import {
  History,
  RotateCcw,
  Send,
} from "lucide-react";

import type {
  GameHistoryEvent,
} from "@/lib/admin/game-history";

import adminStyles from "../../app/admin/admin.module.css";

const revisionActionLabels = {
  imported: "Importación inicial",
  source_refreshed: "Fuente actualizada",
  draft_saved: "Borrador guardado",
  draft_restored: "Revisión restaurada",
  baseline: "Baseline tras mantenimiento",
} as const;

const publicationActionLabels = {
  bootstrap: "Snapshot público inicial",
  published: "Publicación",
  rollback: "Rollback público",
  baseline: "Baseline tras mantenimiento",
} as const;

function formatDate(date: Date) {
  return `${new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Etc/GMT+3",
  }).format(date)} UTC−3`;
}

export default function GameHistoryPanel({
  events,
  currentRevision,
}: {
  events: GameHistoryEvent[];
  currentRevision: number;
}) {
  return (
    <section className={`${adminStyles.historyPanel} admin-editorial-history`}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>AUDITORÍA Y RECUPERACIÓN</span>
          <h2>Historial completo del juego</h2>
        </div>
        <p>
          Combina revisiones y publicaciones. Restaurar nunca elimina versiones anteriores: crea una revisión nueva y deja trazabilidad. Las horas se muestran en la zona administrativa UTC−3.
        </p>
      </div>

      {events.length === 0 ? (
        <p className={adminStyles.emptyState}>Todavía no hay eventos registrados.</p>
      ) : (
        <ol className={`${adminStyles.historyList} admin-editorial-history__list`}>
          {events.map((event) => {
            if (event.kind === "publication") {
              return (
                <li key={`publication-${event.id}`}>
                  <div>
                    <strong>
                      <Send size={14} aria-hidden="true" />{" "}
                      {publicationActionLabels[event.action]} #{event.publicationNumber}
                    </strong>
                    <span>
                      {event.actor ?? "Sistema"} · {formatDate(event.createdAt)}
                      {event.sourceRevision ? ` · desde revisión ${event.sourceRevision}` : ""}
                    </span>
                  </div>
                </li>
              );
            }

            const current = event.revision === currentRevision;
            return (
              <li key={`revision-${event.id}`}>
                <div>
                  <strong>
                    <History size={14} aria-hidden="true" />{" "}
                    Revisión {event.revision}{current ? " · actual" : ""}
                  </strong>
                  <span>
                    {revisionActionLabels[event.action]} · {event.actor ?? "Sistema"} · {formatDate(event.createdAt)}
                  </span>

                  {event.changes.length > 0 && (
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                      {event.changes.slice(0, 8).map((change, index) => (
                        <li key={`${change.section}-${change.field}-${index}`}>
                          <small>
                            <strong>{change.section} · {change.field}:</strong>{" "}
                            {change.before} → {change.after}
                          </small>
                        </li>
                      ))}
                      {event.changes.length > 8 && (
                        <li><small>+{event.changes.length - 8} cambios adicionales en esta revisión</small></li>
                      )}
                    </ul>
                  )}
                </div>

                {!current && (
                  <form
                    method="post"
                    action={`/api/admin/content/revisions/${event.id}/restore`}
                  >
                    <input type="hidden" name="expectedRevision" value={currentRevision} />
                    <button type="submit" className="admin-history-action">
                      <RotateCcw size={14} aria-hidden="true" />
                      Restaurar
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
