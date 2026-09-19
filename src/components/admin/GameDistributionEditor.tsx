import Link from "next/link";
import {
  RefreshCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import type { Game } from "@/types/game";

import GameDownloadEditor from "./GameDownloadEditor";
import GameEditorFormActions from "./GameEditorFormActions";

import adminStyles from "../../app/admin/admin.module.css";

const channelLabels = {
  stable: "Estable",
  beta: "Beta",
  testing: "Pruebas",
} as const;

export default function GameDistributionEditor({
  game,
  revision,
  action,
}: {
  game: Game;
  revision: number;
  action: string;
}) {
  const download = game.download;
  const sources = download?.sources ?? [];
  const available = sources.filter(
    (source) => source.enabled !== false && source.status !== "down"
  ).length;
  const down = sources.filter((source) => source.status === "down").length;
  const maintenance = sources.filter(
    (source) => source.status === "maintenance"
  ).length;
  const declaredPlatforms = game.platforms ?? [];
  const packagePlatform = download?.platform?.trim() || "";
  const platformMismatch = Boolean(
    packagePlatform &&
      declaredPlatforms.length > 0 &&
      !declaredPlatforms.includes(packagePlatform as never)
  );
  const distributionMetadata = game.distributionMetadata;
  const channel = distributionMetadata?.channel ?? "";
  const checksumSha256 = distributionMetadata?.checksumSha256 ?? "";

  return (
    <section className={adminStyles.editorPanel}>
      <div className={adminStyles.sectionHeading}>
        <div>
          <span>DISTRIBUCIÓN</span>
          <h2>Descargas, mirrors e integridad</h2>
        </div>
        <p>
          Mantiene la versión actual, sus fuentes y la identidad verificable del paquete. Las nuevas versiones se publican mediante una operación atómica separada.
        </p>
      </div>

      <div className={adminStyles.editorForm}>
        <div className={adminStyles.tableSummary}>
          <strong>Fuentes configuradas</strong>
          <span>{sources.length} · {available} visibles/no caídas</span>
        </div>
        <div className={adminStyles.tableSummary}>
          <strong>Estado declarado</strong>
          <span>{down} caídas · {maintenance} en mantenimiento</span>
        </div>
        <div className={adminStyles.tableSummary}>
          <strong>Plataforma del paquete</strong>
          <span>{packagePlatform || "Sin definir"}</span>
        </div>
        <div className={adminStyles.tableSummary}>
          <strong>Canal</strong>
          <span>{channel ? channelLabels[channel] : "Sin definir"}</span>
        </div>
        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Integridad SHA-256</strong>
          <span>
            {checksumSha256
              ? `${checksumSha256.slice(0, 12)}…${checksumSha256.slice(-12)}`
              : "Sin checksum declarado"}
          </span>
        </div>

        {platformMismatch ? (
          <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeWarning} ${adminStyles.fieldWide}`}>
            <TriangleAlert size={17} aria-hidden="true" />
            La plataforma “{packagePlatform}” no está declarada en Compatibilidad. Corrige uno de los dos datos para evitar una ficha contradictoria.
          </div>
        ) : (
          <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeSuccess} ${adminStyles.fieldWide}`}>
            <ShieldCheck size={17} aria-hidden="true" />
            No se detectaron contradicciones entre la plataforma del paquete y Compatibilidad.
          </div>
        )}

        {download?.href && (
          <div className={`${adminStyles.editorNotice} ${adminStyles.editorNoticeWarning} ${adminStyles.fieldWide}`}>
            Este borrador todavía conserva un enlace principal heredado. Las fuentes modernas pueden coexistir hasta completar la migración.
          </div>
        )}

        <div className={`${adminStyles.tableSummary} ${adminStyles.fieldWide}`}>
          <strong>Verificación de mirrors</strong>
          <span>
            El checksum pertenece al paquete, no a una URL concreta: todos los mirrors de esta revisión deben entregar los mismos bytes. El panel valida HTTPS, formato del SHA-256 y estados editoriales, pero no realiza solicitudes servidoras automáticas a URLs arbitrarias para evitar SSRF y falsos positivos.
          </span>
        </div>

        <div className={adminStyles.fieldWide}>
          <Link
            href={`/admin/juegos/${encodeURIComponent(game.slug)}/actualizacion`}
            className={adminStyles.tableAction}
          >
            <RefreshCcw size={15} aria-hidden="true" />
            Publicar nueva versión
          </Link>
        </div>
      </div>

      <form className={adminStyles.editorForm} method="post" action={action}>
        <input type="hidden" name="expectedRevision" value={revision} />

        <label>
          <span>Tamaño total (GB)</span>
          <input
            name="sizeGb"
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            defaultValue={download?.sizeGb ?? ""}
            placeholder="60"
          />
        </label>

        <label>
          <span>Cantidad de archivos</span>
          <input
            name="fileCount"
            type="number"
            min="1"
            max="10000"
            step="1"
            defaultValue={download?.fileCount ?? ""}
            placeholder="1"
          />
        </label>

        <label className={adminStyles.fieldWide}>
          <span>Plataforma / paquete</span>
          {declaredPlatforms.length ? (
            <select name="platform" defaultValue={packagePlatform}>
              <option value="">Sin definir</option>
              {platformMismatch && packagePlatform && (
                <option value={packagePlatform}>{packagePlatform} · no declarada</option>
              )}
              {declaredPlatforms.map((platform) => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
          ) : (
            <input
              name="platform"
              defaultValue={packagePlatform}
              maxLength={80}
              placeholder="Configura primero las plataformas en Compatibilidad"
            />
          )}
          <small>
            Cuando Compatibilidad tiene plataformas confirmadas, Distribución restringe el paquete a esa misma fuente de verdad.
          </small>
        </label>

        <label id="distribution-integrity">
          <span>Canal de distribución</span>
          <select name="channel" defaultValue={channel}>
            <option value="">Sin definir</option>
            <option value="stable">Estable</option>
            <option value="beta">Beta</option>
            <option value="testing">Pruebas</option>
          </select>
          <small>
            Declara el estado editorial del paquete; no se infiere desde el nombre de versión ni desde el mirror.
          </small>
        </label>

        <label className={adminStyles.fieldWide}>
          <span>SHA-256 del paquete</span>
          <input
            name="checksumSha256"
            defaultValue={checksumSha256}
            minLength={64}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            placeholder="64 caracteres hexadecimales"
          />
          <small>
            Calcula el SHA-256 sobre el paquete final antes de subirlo. El mismo valor debe corresponder a todas las fuentes configuradas para esta revisión.
          </small>
        </label>

        <GameDownloadEditor id="downloads" initialSources={sources} />

        <GameEditorFormActions
          note="Las URLs HTTP inseguras se rechazan; canal y SHA-256 quedan versionados junto con el paquete, y cada fuente conserva estado, visibilidad y orden editorial."
          action={action}
          continueTo="valoracion"
          saveLabel="Guardar distribución"
          continueLabel="Guardar y continuar a Valoración"
        />
      </form>
    </section>
  );
}
