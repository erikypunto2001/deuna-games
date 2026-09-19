import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Rocket,
  TriangleAlert,
} from "lucide-react";

import {
  gameReadinessHref,
  getGameEditorSection,
} from "@/lib/admin/game-editor-sections";
import type {
  GamePublicationReadiness,
} from "@/lib/admin/game-publication-readiness";

import styles from "./GameEditorHealthOverview.module.css";

export default function GameEditorHealthOverview({
  slug,
  readiness,
}: {
  slug: string;
  readiness: GamePublicationReadiness;
}) {
  const essentialPending = readiness.items.filter(
    (item) => item.priority === "essential" && !item.complete
  );

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

      {essentialPending.length > 0 ? (
        <div className={styles.attention}>
          <div className={styles.attentionHeading}>
            <TriangleAlert size={17} aria-hidden="true" />
            <div>
              <strong>Bloqueos antes de publicar</strong>
              <span>
                {essentialPending.length} {essentialPending.length === 1 ? "control esencial pendiente" : "controles esenciales pendientes"}
              </span>
            </div>
          </div>

          <ul>
            {essentialPending.slice(0, 4).map((item) => {
              const section = getGameEditorSection(item.section);

              return (
                <li key={item.id}>
                  <Link
                    href={gameReadinessHref(slug, item)}
                  >
                    <span>
                      <strong>{item.label}</strong>
                      <small>{section.label}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>

          {essentialPending.length > 4 && (
            <small className={styles.morePending}>
              Hay {essentialPending.length - 4} controles esenciales adicionales. Publicación muestra el detalle completo.
            </small>
          )}
        </div>
      ) : (
        <div className={styles.ready}>
          <CheckCircle2 size={18} aria-hidden="true" />
          <div>
            <strong>Requisitos esenciales completos</strong>
            <span>Las recomendaciones pendientes no bloquean la revisión final.</span>
          </div>
          <Link href={`/admin/juegos/${encodeURIComponent(slug)}/publicacion`}>
            <Rocket size={15} aria-hidden="true" />
            Revisar publicación
          </Link>
        </div>
      )}
    </section>
  );
}
