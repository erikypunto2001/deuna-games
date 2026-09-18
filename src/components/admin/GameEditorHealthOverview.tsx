import Link from "next/link";
import {
  CheckCircle2,
  CircleEllipsis,
  History,
  Rocket,
  TriangleAlert,
} from "lucide-react";

import type {
  GamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";
import {
  gameReadinessSections,
} from "@/lib/admin/game-editor-sections";

import styles from "./GameEditorHealthOverview.module.css";

export default function GameEditorHealthOverview({
  slug,
  activeSection,
  readiness,
}: {
  slug: string;
  activeSection: string;
  readiness: GamePublicationReadiness;
}) {
  return (
    <section className={styles.root} aria-label="Estado editorial del juego">
      <div className={styles.summary}>
        <div>
          <span>ESTADO DEL JUEGO</span>
          <strong>{readiness.percentage}% completo</strong>
          <small>
            {readiness.essentialsReady
              ? "Los requisitos esenciales están listos."
              : "Hay requisitos esenciales pendientes antes de publicar."}
          </small>
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={readiness.percentage}
        >
          <span style={{ width: `${readiness.percentage}%` }} />
        </div>
        <div className={styles.summaryMeta}>
          <span>{readiness.completed}/{readiness.total} controles</span>
          <span>{readiness.recommendedMissing} recomendaciones</span>
        </div>
      </div>

      <nav className={styles.sections} aria-label="Secciones del editor del juego">
        {gameReadinessSections.map((section) => {
          const items = readiness.items.filter(
            (item) => item.section === section.key
          );
          const complete = items.filter((item) => item.complete).length;
          const essentialPending = items.some(
            (item) => item.priority === "essential" && !item.complete
          );
          const ready = items.length > 0 && complete === items.length;
          const active = activeSection === section.key;

          return (
            <Link
              key={section.key}
              href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=${section.key}`}
              className={styles.section}
              data-active={active}
              data-state={essentialPending ? "danger" : ready ? "ready" : "pending"}
              aria-current={active ? "page" : undefined}
            >
              {ready ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : essentialPending ? (
                <TriangleAlert size={16} aria-hidden="true" />
              ) : (
                <CircleEllipsis size={16} aria-hidden="true" />
              )}
              <span>
                <strong>{section.label}</strong>
                <small>{items.length ? `${complete}/${items.length}` : "Sin controles"}</small>
              </span>
            </Link>
          );
        })}

        <Link
          href={`/admin/juegos/${encodeURIComponent(slug)}/publicacion`}
          className={styles.section}
          data-state={readiness.essentialsReady ? "ready" : "danger"}
        >
          {readiness.essentialsReady ? (
            <Rocket size={16} aria-hidden="true" />
          ) : (
            <TriangleAlert size={16} aria-hidden="true" />
          )}
          <span>
            <strong>Publicación</strong>
            <small>
              {readiness.essentialsReady
                ? "Revisar snapshot"
                : "Pendientes esenciales"}
            </small>
          </span>
        </Link>

        <Link
          href={`/admin/juegos/${encodeURIComponent(slug)}?seccion=historial`}
          className={styles.section}
          data-active={activeSection === "historial"}
          data-state="neutral"
          aria-current={activeSection === "historial" ? "page" : undefined}
        >
          <History size={16} aria-hidden="true" />
          <span>
            <strong>Historial</strong>
            <small>Auditoría</small>
          </span>
        </Link>
      </nav>
    </section>
  );
}
