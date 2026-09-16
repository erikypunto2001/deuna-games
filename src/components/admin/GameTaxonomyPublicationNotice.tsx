import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import type {
  GameTaxonomyPublicationIntegrity,
} from "@/lib/admin/game-publication-review";

import styles from "./GameTaxonomyPublicationNotice.module.css";

function MissingGroup({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  if (values.length === 0) return null;

  return (
    <div className={styles.group}>
      <strong>{label}</strong>
      <div className={styles.chips}>
        {values.map((value) => (
          <span key={value}>{value}</span>
        ))}
      </div>
    </div>
  );
}

export default function GameTaxonomyPublicationNotice({
  integrity,
}: {
  integrity: GameTaxonomyPublicationIntegrity;
}) {
  if (integrity.ok) return null;

  return (
    <aside className={styles.notice} aria-labelledby="taxonomy-publication-warning">
      <AlertTriangle size={19} aria-hidden="true" />
      <div>
        <strong id="taxonomy-publication-warning">
          Publicación bloqueada por Catálogos
        </strong>
        <p>
          El borrador usa valores que todavía no existen en el snapshot público
          de Clasificaciones y etiquetas. Publica primero esos datos maestros o
          retíralos del juego.
        </p>

        <div className={styles.groups}>
          <MissingGroup
            label="Clasificaciones pendientes"
            values={integrity.missingClassifications}
          />
          <MissingGroup
            label="Etiquetas pendientes"
            values={integrity.missingTags}
          />
        </div>

        <Link href="/admin/catalogos?seccion=publicacion">
          Revisar y publicar Catálogos
        </Link>
      </div>
    </aside>
  );
}
