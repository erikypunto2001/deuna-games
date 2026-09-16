import type { Game } from "@/types/game";
import type { GameTaxonomyTerm } from "@/types/game-taxonomy";

import GameEditorFormActions from "./GameEditorFormActions";
import GameTaxonomyMultiSelect from "./GameTaxonomyMultiSelect";

import adminStyles from "../../app/admin/admin.module.css";

type GameTaxonomyEditorTerm = GameTaxonomyTerm & {
  missingFromCatalog?: boolean;
};

const ageRatingSystems = [
  ["ESRB", "ESRB"],
  ["PEGI", "PEGI"],
  ["IARC", "IARC"],
  ["CLASSIND", "ClassInd"],
  ["USK", "USK"],
  ["ACB", "Australian Classification Board"],
  ["GRAC", "GRAC"],
  ["CERO", "CERO"],
  ["OTHER", "Otro sistema"],
] as const;

export default function GameClassificationEditor({
  game,
  revision,
  action,
  classificationTerms,
  tagTerms,
}: {
  game: Game;
  revision: number;
  action: string;
  classificationTerms: GameTaxonomyEditorTerm[];
  tagTerms: GameTaxonomyEditorTerm[];
}) {
  return (
    <section className={adminStyles.editorPanel}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>CLASIFICACIÓN</span>
          <h2>Clasificación y descubrimiento</h2>
        </div>
        <p>
          La clasificación principal, las adicionales y las etiquetas comparten los catálogos maestros. La clasificación etaria se registra aparte y nunca se infiere desde géneros o etiquetas.
        </p>
      </div>

      <form className={adminStyles.editorForm} method="post" action={action}>
        <input type="hidden" name="expectedRevision" value={revision} />

        <label className={adminStyles.fieldWide}>
          <span>Clasificación principal</span>
          <select name="category" defaultValue={game.category} required>
            {classificationTerms.map((term) => (
              <option key={term.key} value={term.label}>
                {term.label}
                {term.missingFromCatalog
                  ? " · Fuera de Catálogos"
                  : term.active
                    ? ""
                    : " · Inactiva"}
              </option>
            ))}
          </select>
          <small>
            Define la clasificación primaria mostrada y utilizada por filtros. No se duplica dentro de las adicionales.
          </small>
        </label>

        <GameTaxonomyMultiSelect
          name="genresText"
          label="Clasificaciones adicionales"
          terms={classificationTerms}
          initialValues={game.genres ?? []}
          maximum={20}
        />

        <GameTaxonomyMultiSelect
          name="tagsText"
          label="Etiquetas"
          terms={tagTerms}
          initialValues={game.tags ?? []}
          maximum={30}
        />

        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Clasificación etaria · opcional</strong>
          <span>
            Registra únicamente una clasificación publicada por un organismo o sistema reconocido. No conviertas edades entre sistemas ni inventes equivalencias.
          </span>
        </div>

        <label>
          <span>Sistema de clasificación</span>
          <select
            name="ageRatingSystem"
            defaultValue={game.ageRating?.system ?? ""}
          >
            <option value="">Sin clasificación confirmada</option>
            {ageRatingSystems.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <small>
            Selecciona el sistema que emitió el rating; “Otro sistema” conserva el dato sin adjudicarlo a un organismo incorrecto.
          </small>
        </label>

        <label>
          <span>Rating publicado</span>
          <input
            name="ageRatingValue"
            defaultValue={game.ageRating?.rating ?? ""}
            maxLength={40}
            placeholder="Ej. T, 16, 18, M"
          />
          <small>
            Copia la etiqueta literalmente como fue publicada por el sistema seleccionado.
          </small>
        </label>

        <label className={adminStyles.fieldWide}>
          <span>Descriptores de contenido</span>
          <textarea
            name="ageRatingDescriptorsText"
            defaultValue={game.ageRating?.descriptors?.join("\n") ?? ""}
            maxLength={800}
            rows={4}
            placeholder={"Violencia\nLenguaje fuerte\nCompras dentro del juego"}
          />
          <small>
            Opcional · hasta 8 descriptores, separados por coma o línea. Conserva el sentido publicado y evita conclusiones editoriales propias.
          </small>
        </label>

        <GameEditorFormActions
          note="Los términos inactivos o fuera de Catálogos ya utilizados se conservan por compatibilidad hasta que decidas retirarlos. La clasificación etaria forma parte del mismo snapshot y sólo cambia la web al publicar."
          action={action}
          continueTo="requisitos"
          saveLabel="Guardar clasificación"
          continueLabel="Guardar y continuar a Compatibilidad"
        />
      </form>
    </section>
  );
}
