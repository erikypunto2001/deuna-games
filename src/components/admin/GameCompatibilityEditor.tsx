import {
  TriangleAlert,
} from "lucide-react";

import type {
  Game,
  GameHardwareRequirements,
} from "@/types/game";

import GameEditorFormActions from "./GameEditorFormActions";
import GamePlatformEditor from "./GamePlatformEditor";

import adminStyles from "../../app/admin/admin.module.css";

function legacyMinimum(
  requirements: GameHardwareRequirements | undefined
) {
  if (!requirements) return undefined;
  const minimum: GameHardwareRequirements = {
    system: requirements.system,
    processor: requirements.processor,
    ram: requirements.ram,
    graphics: requirements.graphics,
    storage: requirements.storage,
  };
  return Object.values(minimum).some(Boolean) ? minimum : undefined;
}

function hasRequirements(
  requirements: GameHardwareRequirements | undefined
) {
  return Boolean(
    requirements &&
    Object.values(requirements).some((value) => Boolean(value?.trim()))
  );
}

export default function GameCompatibilityEditor({
  game,
  revision,
  action,
}: {
  game: Game;
  revision: number;
  action: string;
}) {
  const requirements = game.requirements;
  const minimum = requirements?.minimum ?? legacyMinimum(requirements);
  const recommended = requirements?.recommended;
  const verification = game.compatibilityMetadata;
  const hasPcRequirements =
    hasRequirements(minimum) || hasRequirements(recommended);
  const pcDeclared = game.platforms?.includes("PC") ?? false;
  const legacyMismatch = hasPcRequirements && !pcDeclared;

  return (
    <section className={adminStyles.editorPanel}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>COMPATIBILIDAD</span>
          <h2>Plataformas y requisitos</h2>
        </div>
        <p>
          Confirma dónde funciona el juego y, para PC, registra mínimos y recomendados. Una lista de plataformas vacía significa “sin confirmar”, no “PC”.
        </p>
      </div>

      <form className={adminStyles.editorForm} method="post" action={action}>
        <input type="hidden" name="expectedRevision" value={revision} />

        <div className={adminStyles.fieldWide}>
          <GamePlatformEditor id="platforms" initialPlatforms={game.platforms ?? []} />
        </div>

        {legacyMismatch && (
          <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeWarning} ${adminStyles.fieldWide}`}>
            <TriangleAlert size={17} aria-hidden="true" />
            Este borrador histórico contiene requisitos de PC pero PC no figura entre sus plataformas. Para volver a guardar Compatibilidad, declara PC arriba o elimina los requisitos. Así evitamos publicar datos contradictorios sin alterar snapshots antiguos automáticamente.
          </div>
        )}

        <div id="minimum-requirements" className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Requisitos mínimos · PC</strong>
          <span>
            Equipo base para ejecutar el juego. Cualquier requisito de hardware exige que PC esté seleccionado entre las plataformas.
          </span>
        </div>

        <label>
          <span>Sistema operativo</span>
          <input
            name="minimumSystem"
            defaultValue={minimum?.system ?? ""}
            maxLength={240}
            placeholder="Windows 10 de 64 bits"
          />
        </label>
        <label>
          <span>Procesador</span>
          <input name="minimumProcessor" defaultValue={minimum?.processor ?? ""} maxLength={240} />
        </label>
        <label>
          <span>Memoria RAM</span>
          <input name="minimumRam" defaultValue={minimum?.ram ?? ""} maxLength={240} placeholder="12 GB" />
        </label>
        <label>
          <span>Gráficos</span>
          <input name="minimumGraphics" defaultValue={minimum?.graphics ?? ""} maxLength={240} />
        </label>
        <label className={adminStyles.fieldWide}>
          <span>Almacenamiento</span>
          <input name="minimumStorage" defaultValue={minimum?.storage ?? ""} maxLength={240} placeholder="60 GB" />
        </label>

        <div id="recommended-requirements" className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Requisitos recomendados · PC</strong>
          <span>Configuración sugerida para una experiencia mejor. También requiere PC declarado.</span>
        </div>

        <label>
          <span>Sistema operativo</span>
          <input name="recommendedSystem" defaultValue={recommended?.system ?? ""} maxLength={240} />
        </label>
        <label>
          <span>Procesador</span>
          <input name="recommendedProcessor" defaultValue={recommended?.processor ?? ""} maxLength={240} />
        </label>
        <label>
          <span>Memoria RAM</span>
          <input name="recommendedRam" defaultValue={recommended?.ram ?? ""} maxLength={240} />
        </label>
        <label>
          <span>Gráficos</span>
          <input name="recommendedGraphics" defaultValue={recommended?.graphics ?? ""} maxLength={240} />
        </label>
        <label className={adminStyles.fieldWide}>
          <span>Almacenamiento</span>
          <input name="recommendedStorage" defaultValue={recommended?.storage ?? ""} maxLength={240} />
        </label>

        <div id="compatibility-verification" className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Estado de verificación</strong>
          <span>
            Documenta si los datos fueron sólo declarados, revisados editorialmente o probados. No modifica la estimación de FPS.
          </span>
        </div>

        <label>
          <span>Verificación</span>
          <select
            name="verificationStatus"
            defaultValue={verification?.status ?? ""}
          >
            <option value="">Sin verificar</option>
            <option value="declared">Declarado</option>
            <option value="reviewed">Revisado</option>
            <option value="tested">Probado</option>
          </select>
        </label>

        <label>
          <span>Origen de los datos</span>
          <select
            name="verificationSource"
            defaultValue={verification?.source ?? ""}
          >
            <option value="">Sin documentar</option>
            <option value="developer">Desarrollador</option>
            <option value="publisher">Publisher</option>
            <option value="internal">Verificación interna</option>
            <option value="community">Comunidad</option>
            <option value="external">Fuente externa</option>
          </select>
        </label>

        <label className={adminStyles.fieldWide}>
          <span>Última verificación</span>
          <input
            name="verifiedAt"
            type="date"
            defaultValue={verification?.verifiedAt ?? ""}
          />
          <small>
            Este dato se publica como contexto de compatibilidad; no se guarda ubicación, dispositivo ni información personal de quien hizo la prueba.
          </small>
        </label>

        <GameEditorFormActions
          note="Plataformas, requisitos y verificación se guardan juntos para que Compatibilidad sea la única fuente editorial de estos datos."
          action={action}
          continueTo="rendimiento"
          saveLabel="Guardar compatibilidad"
          continueLabel="Guardar y continuar a Rendimiento"
        />
      </form>
    </section>
  );
}
