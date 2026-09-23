import type {
  EditorialRevision,
} from "@/lib/admin/content-service";

import styles from "../../app/admin/admin.module.css";

const actionLabels: Record<
  EditorialRevision["action"],
  string
> = {
  imported: "Importación inicial",
  source_refreshed: "Fuente actualizada",
  draft_saved: "Borrador guardado",
  draft_restored: "Revisión restaurada",
  baseline: "Baseline tras mantenimiento",
};

export default function EditorialHistory({
  revisions,
  currentRevision,
}: {
  revisions: EditorialRevision[];
  currentRevision: number;
}) {
  return (
    <section className={`${styles.historyPanel} admin-editorial-history`}>
      <div className={styles.sectionHeading}>
        <div>
          <span>RECUPERACIÓN</span>
          <h2>Historial de revisiones</h2>
        </div>
        <p>
          Restaurar crea una revisión nueva. Ninguna versión anterior se elimina.
        </p>
      </div>

      <ol className={`${styles.historyList} admin-editorial-history__list`}>
        {revisions.map((revision) => {
          const current =
            revision.revision === currentRevision;

          return (
            <li key={revision.id}>
              <div>
                <strong>
                  Revisión {revision.revision}
                  {current ? " · actual" : ""}
                </strong>
                <span>
                  {actionLabels[revision.action]} ·{" "}
                  {new Intl.DateTimeFormat("es", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  }).format(revision.createdAt)}{" "}
                  UTC
                </span>
              </div>

              {!current && (
                <form
                  method="post"
                  action={`/api/admin/content/revisions/${revision.id}/restore`}
                >
                  <input
                    type="hidden"
                    name="expectedRevision"
                    value={currentRevision}
                  />
                  <button
                    type="submit"
                    className="admin-history-action"
                    aria-label={`Restaurar revisión ${revision.revision}`}
                  >
                    Restaurar
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
