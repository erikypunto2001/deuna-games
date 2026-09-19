import {
  Gauge,
  Info,
} from "lucide-react";

import {
  performanceModelReference,
  resolvePerformanceProfile,
} from "@/features/game-finder/performance-data";
import type {
  GamePerformanceCalibration,
  GamePerformanceMetadata,
} from "@/types/game";

import adminStyles from "../../app/admin/admin.module.css";
import GameEditorFormActions from "./GameEditorFormActions";

type GamePerformanceEditorProps = {
  slug: string;
  revision: number;
  action: string;
  calibration?: GamePerformanceCalibration;
  metadata?: GamePerformanceMetadata;
};

export default function GamePerformanceEditor({
  slug,
  revision,
  action,
  calibration,
  metadata,
}: GamePerformanceEditorProps) {
  const legacyProfile = calibration
    ? null
    : resolvePerformanceProfile(slug);
  const legacyReferenceFps = legacyProfile?.referenceFps;
  const legacyRamGb = legacyProfile?.ramGb;
  const legacyFpsCap = legacyProfile?.fpsCap;
  const usesLegacyFallback = legacyProfile !== null;

  return (
    <section className={adminStyles.editorPanel}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>RENDIMIENTO</span>
          <h2>Calibración de FPS</h2>
        </div>
        <p>
          Define el punto de referencia que usa el estimador y documenta de dónde sale el benchmark para que el dato sea auditable.
        </p>
      </div>

      <form
        className={adminStyles.editorForm}
        method="post"
        action={action}
      >
        <input
          type="hidden"
          name="expectedRevision"
          value={revision}
        />

        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>
            Equipo de referencia · {performanceModelReference.resolution} · calidad {performanceModelReference.quality}
          </strong>
          <span>
            Ryzen 5 5600X + RTX 3060 · rasterización · sin ray tracing, frame generation ni escalado.
          </span>
        </div>

        {calibration ? (
          <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeSuccess} ${adminStyles.fieldWide}`}>
            <Gauge size={16} aria-hidden="true" />
            Este borrador ya tiene calibración editorial. Al publicar, valores y procedencia viajarán dentro del mismo snapshot del juego.
          </div>
        ) : usesLegacyFallback ? (
          <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeWarning} ${adminStyles.fieldWide}`}>
            <Info size={16} aria-hidden="true" />
            La web todavía puede estimar este juego con su perfil histórico de código ({legacyReferenceFps} FPS, {legacyRamGb} GB de RAM de referencia). Guardar aquí lo convierte en contenido editorial versionado.
          </div>
        ) : (
          <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeWarning} ${adminStyles.fieldWide}`}>
            <Info size={16} aria-hidden="true" />
            Este juego nuevo todavía no tiene calibración. Puede publicarse sin romper la ficha, pero el visitante verá que aún no hay datos suficientes para estimar FPS.
          </div>
        )}

        <label id="performance">
          <span>FPS de referencia</span>
          <input
            name="referenceFps"
            type="number"
            min="0.01"
            max="1000"
            step="0.01"
            defaultValue={calibration?.referenceFps ?? ""}
            placeholder={
              legacyReferenceFps !== undefined
                ? String(legacyReferenceFps)
                : "Ej. 72"
            }
          />
          <small>
            FPS observados en el equipo de referencia a 1080p y calidad media.
          </small>
        </label>

        <label>
          <span>RAM de referencia (GB)</span>
          <input
            name="ramGb"
            type="number"
            min="0.01"
            max="512"
            step="0.01"
            defaultValue={calibration?.ramGb ?? ""}
            placeholder={
              legacyRamGb !== undefined
                ? String(legacyRamGb)
                : "Ej. 16"
            }
          />
          <small>
            Cantidad de RAM usada para calibrar la penalización cuando el equipo del visitante queda por debajo.
          </small>
        </label>

        <label className={adminStyles.fieldWide}>
          <span>Límite de FPS — opcional</span>
          <input
            name="fpsCap"
            type="number"
            min="0.01"
            max="1000"
            step="0.01"
            defaultValue={calibration?.fpsCap ?? ""}
            placeholder={
              legacyFpsCap !== undefined
                ? String(legacyFpsCap)
                : "Ej. 60 si el juego está limitado a 60 FPS"
            }
          />
          <small>
            Déjalo vacío cuando el juego no tenga un límite conocido. Nunca puede ser menor que los FPS de referencia.
          </small>
        </label>

        <div id="performance-provenance" className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Procedencia del benchmark</strong>
          <span>
            Estos campos no cambian el cálculo: documentan la calidad editorial del dato y permiten explicar públicamente su origen.
          </span>
        </div>

        <label>
          <span>Origen</span>
          <select
            name="benchmarkSource"
            defaultValue={metadata?.source ?? ""}
          >
            <option value="">Sin documentar</option>
            <option value="internal">Prueba interna</option>
            <option value="developer">Desarrollador</option>
            <option value="publisher">Publisher</option>
            <option value="community">Comunidad</option>
            <option value="external">Fuente externa</option>
          </select>
        </label>

        <label>
          <span>Confianza de la fuente</span>
          <select
            name="benchmarkConfidence"
            defaultValue={metadata?.confidence ?? ""}
          >
            <option value="">Sin evaluar</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja / orientativa</option>
          </select>
        </label>

        <label>
          <span>Fuente / referencia</span>
          <input
            name="benchmarkSourceLabel"
            defaultValue={metadata?.sourceLabel ?? ""}
            maxLength={160}
            placeholder="Ej. benchmark interno v2 o nombre de la fuente"
          />
          <small>
            Texto descriptivo únicamente; no ejecuta ni consulta URLs externas.
          </small>
        </label>

        <label>
          <span>Fecha de medición</span>
          <input
            name="benchmarkMeasuredAt"
            type="date"
            defaultValue={metadata?.measuredAt ?? ""}
          />
          <small>
            Fecha del benchmark o de la última comprobación conocida.
          </small>
        </label>

        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Calibración opcional y reversible</strong>
          <span>
            Si dejas los tres campos numéricos vacíos y guardas, se elimina la calibración editorial y también su procedencia. Los juegos históricos conservan su respaldo de código; los juegos nuevos quedan sin estimación hasta que vuelvas a calibrarlos.
          </span>
        </div>

        <GameEditorFormActions
          note="Guardar sólo modifica el borrador. Los FPS públicos y la procedencia no cambian hasta crear una nueva publicación."
          action={action}
          continueTo="multimedia"
          saveLabel="Guardar rendimiento"
          continueLabel="Guardar y continuar a Multimedia"
        />
      </form>
    </section>
  );
}
