import GameEditorFormActions from "./GameEditorFormActions";
import type { Game } from "@/types/game";

import adminStyles from "../../app/admin/admin.module.css";

function dateInputValue(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const legacy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return legacy ? `${legacy[3]}-${legacy[2]}-${legacy[1]}` : "";
}

export default function GameInformationEditor({
  game,
  revision,
  action,
  hasPublicVersion,
}: {
  game: Game;
  revision: number;
  action: string;
  hasPublicVersion: boolean;
}) {
  const badgeListId = `game-badges-${game.slug}`;

  return (
    <section className={adminStyles.editorPanel}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>INFORMACIÓN</span>
          <h2>Identidad e información del juego</h2>
        </div>
        <p>
          Título, presentación, autoría y lanzamiento. Clasificación, plataformas y valoración se administran en sus secciones específicas.
        </p>
      </div>

      <form className={adminStyles.editorForm} method="post" action={action}>
        <input type="hidden" name="expectedRevision" value={revision} />

        <label className={adminStyles.fieldWide}>
          <span>Título</span>
          <input name="title" defaultValue={game.title} maxLength={140} required />
        </label>

        <label>
          <span>Título corto</span>
          <input
            name="shortTitle"
            defaultValue={game.shortTitle ?? ""}
            maxLength={140}
            placeholder="Versión compacta para espacios reducidos"
          />
        </label>

        <label>
          <span>Parte destacada del título</span>
          <input
            name="highlightedTitle"
            defaultValue={game.highlightedTitle ?? ""}
            maxLength={140}
          />
        </label>

        <label className={adminStyles.fieldWide}>
          <span>Descripción</span>
          <textarea
            name="description"
            defaultValue={game.description}
            maxLength={2500}
            rows={6}
            required
          />
        </label>

        <label>
          <span>Desarrollador</span>
          <input name="developer" defaultValue={game.developer ?? ""} maxLength={160} />
        </label>

        <label>
          <span>Editor / publisher</span>
          <input name="publisher" defaultValue={game.publisher ?? ""} maxLength={160} />
        </label>

        <label>
          <span>Fecha de lanzamiento</span>
          <input
            name="releaseDate"
            type="date"
            defaultValue={dateInputValue(game.releaseDate)}
          />
          <small>Se guarda con un formato de fecha canónico para ordenar y filtrar correctamente.</small>
        </label>

        <label>
          <span>Insignia</span>
          <input
            name="badge"
            defaultValue={game.badge ?? ""}
            maxLength={240}
            list={badgeListId}
            placeholder="Nuevo, Destacado, Recomendado…"
          />
          <datalist id={badgeListId}>
            <option value="Nuevo" />
            <option value="Destacado" />
            <option value="Recomendado" />
            <option value="Actualizado" />
            <option value="Próximamente" />
          </datalist>
        </label>

        {hasPublicVersion ? (
          <>
            <input type="hidden" name="version" value={game.version ?? ""} />
            <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
              <strong>Versión pública</strong>
              <span>
                {game.version?.trim() || "Sin versión registrada"} · Las versiones publicadas se modifican desde Distribución → Nueva versión.
              </span>
            </div>
          </>
        ) : (
          <label>
            <span>Versión inicial</span>
            <input name="version" defaultValue={game.version ?? ""} maxLength={240} />
            <small>Después de la primera publicación se administra desde Distribución.</small>
          </label>
        )}

        <label className={adminStyles.fieldWide}>
          <span>Descripción alternativa general</span>
          <input
            name="imageAlt"
            defaultValue={game.imageAlt}
            maxLength={240}
            required
          />
          <small>
            Se conserva como alternativa general por compatibilidad. Multimedia puede evolucionar a descripciones específicas por recurso sin mezclar esta identidad editorial.
          </small>
        </label>

        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>URL pública estable</strong>
          <span>/juegos/{game.slug} · El slug no se modifica desde este formulario para evitar romper enlaces existentes.</span>
        </div>

        <GameEditorFormActions
          note="Guardar actualiza el borrador actual y no publica cambios."
          action={action}
          continueTo="datos"
          saveLabel="Guardar información"
          continueLabel="Guardar y continuar a Clasificación"
        />
      </form>
    </section>
  );
}
