"use client";

import Link from "next/link";
import {
  Cpu,
  Gauge,
  MemoryStick,
  Monitor,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useMemo } from "react";

import {
  estimateGamePerformance,
} from "@/features/game-finder/performance-model";
import type {
  HardwareProfile,
  PerformanceTier,
} from "@/features/game-finder/types";
import {
  useGameCompatibilityMetadata,
} from "@/features/game-finder/useGameCompatibilityMetadata";
import {
  useGamePerformanceCalibration,
} from "@/features/game-finder/useGamePerformanceCalibration";
import {
  useResolvedHardwareProfile,
} from "@/features/game-finder/useResolvedHardwareProfile";
import type {
  GameCompatibilityMetadata,
} from "@/types/game";

import styles from "./page.module.css";

type GameCompatibilityCardProps = {
  slug: string;
  supportsPc: boolean;
};

const tierLabels: Record<
  PerformanceTier,
  string
> = {
  excellent: "Excelente",
  good: "Bueno",
  acceptable: "Aceptable",
  basic: "Básico",
};

const confidenceLabels = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
} as const;

const bottleneckLabels = {
  cpu: "CPU",
  gpu: "GPU",
  ram: "RAM",
  balanced: "Equilibrado",
} as const;

const verificationStatusLabels: Record<
  NonNullable<GameCompatibilityMetadata["status"]>,
  string
> = {
  declared: "Declarado",
  reviewed: "Revisado",
  tested: "Probado",
};

const verificationSourceLabels: Record<
  NonNullable<GameCompatibilityMetadata["source"]>,
  string
> = {
  developer: "Desarrollador",
  publisher: "Publisher",
  internal: "Verificación interna",
  community: "Comunidad",
  external: "Fuente externa",
};

function ramLabel(profile: HardwareProfile) {
  if (!profile.ramGb) return "Sin detectar";
  if (profile.ramKnowledge === "lower-bound") {
    return `${profile.ramGb} GB o más`;
  }
  if (profile.ramKnowledge === "approximate") {
    return `≈ ${profile.ramGb} GB`;
  }
  return `${profile.ramGb} GB`;
}

function profileStatusLabel(profile: HardwareProfile) {
  if (profile.source === "saved") {
    return "Perfil guardado";
  }

  if (profile.source === "browser") {
    return "Detección local";
  }

  return "Perfil local";
}

function UnsupportedPlatformCompatibilityCard() {
  return (
    <aside
      className={styles.compatibilityCard}
      aria-labelledby="compatibility-title"
    >
      <div className={styles.compatibilityTopline}>
        <div className={styles.compatibilityHeading}>
          <span className={styles.compatibilityIcon}>
            <Gauge size={20} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.compatibilityEyebrow}>
              COMPATIBILIDAD
            </span>
            <h2 id="compatibility-title">
              Análisis de PC
            </h2>
            <p>No aplica a esta plataforma</p>
          </div>
        </div>
      </div>

      <p className={styles.compatibilityEmpty}>
        Este juego no tiene PC entre sus plataformas publicadas. DeUna Games no calcula FPS de CPU/GPU de PC para una plataforma distinta ni pendiente de confirmar.
      </p>
    </aside>
  );
}

function PcGameCompatibilityCard({
  slug,
}: {
  slug: string;
}) {
  const {
    profile,
    status,
  } = useResolvedHardwareProfile();
  const {
    calibration,
    loading: calibrationLoading,
  } = useGamePerformanceCalibration(slug);
  const {
    metadata: compatibilityMetadata,
  } = useGameCompatibilityMetadata(slug);

  const estimate = useMemo(
    () =>
      profile
        ? estimateGamePerformance(
            slug,
            profile,
            {
              resolution: "1080p",
              quality: "medium",
            },
            calibration ?? undefined
          )
        : null,
    [calibration, profile, slug]
  );

  if (
    calibrationLoading ||
    status !== "ready" ||
    !profile ||
    !estimate?.canEstimate
  ) {
    const loading =
      calibrationLoading || status === "loading";
    const statusLabel = loading
      ? "Detectando"
      : "Datos incompletos";

    const description = loading
      ? "Estamos comprobando la calibración publicada, el perfil guardado y los datos que el navegador pueda identificar."
      : estimate?.reason ??
        "La detección automática no obtuvo CPU, GPU y RAM suficientes para calcular un rango fiable.";

    return (
      <aside
        className={styles.compatibilityCard}
        aria-labelledby="compatibility-title"
        aria-live="polite"
      >
        <div className={styles.compatibilityTopline}>
          <div className={styles.compatibilityHeading}>
            <span className={styles.compatibilityIcon}>
              <Gauge size={20} aria-hidden="true" />
            </span>
            <div>
              <span className={styles.compatibilityEyebrow}>
                COMPATIBILIDAD
              </span>
              <h2 id="compatibility-title">
                ¿Me funciona?
              </h2>
              <p>Estimación para tu equipo</p>
            </div>
          </div>

          <span className={styles.compatibilityStatus}>
            {statusLabel}
          </span>
        </div>

        <p className={styles.compatibilityEmpty}>
          {description}
        </p>

        {compatibilityMetadata?.status && (
          <p className={styles.compatibilityNote}>
            Datos de compatibilidad: {verificationStatusLabels[compatibilityMetadata.status]}
            {compatibilityMetadata.source
              ? ` · ${verificationSourceLabels[compatibilityMetadata.source]}`
              : ""}
            {compatibilityMetadata.verifiedAt
              ? ` · ${compatibilityMetadata.verifiedAt}`
              : ""}.
          </p>
        )}

        <ol className={styles.compatibilitySteps}>
          <li>Detectamos los datos disponibles</li>
          <li>Confirmas CPU, GPU y RAM si falta información</li>
          <li>Calculamos rendimiento orientativo</li>
        </ol>

        <Link
          href={`/requisitos?juego=${encodeURIComponent(
            slug
          )}`}
          className={styles.compatibilityAction}
        >
          <Settings2 size={16} aria-hidden="true" />
          Analizar o configurar mi PC
        </Link>
      </aside>
    );
  }

  return (
    <aside
      className={styles.compatibilityCard}
      aria-labelledby="compatibility-title"
    >
      <div className={styles.compatibilityTopline}>
        <div className={styles.compatibilityHeading}>
          <span className={styles.compatibilityIcon}>
            <Gauge size={20} aria-hidden="true" />
          </span>
          <div>
            <span className={styles.compatibilityEyebrow}>
              COMPATIBILIDAD
            </span>
            <h2 id="compatibility-title">
              ¿Me funciona?
            </h2>
            <p>1080p · calidad media</p>
          </div>
        </div>

        <span
          className={`${styles.compatibilityStatus} ${styles.compatibilityStatusReady}`}
        >
          <ShieldCheck size={13} aria-hidden="true" />
          {profileStatusLabel(profile)}
        </span>
      </div>

      <dl className={styles.compatibilitySpecs}>
        <div>
          <dt>
            <Cpu size={15} aria-hidden="true" />
            Procesador
          </dt>
          <dd>{profile.cpu?.name}</dd>
        </div>
        <div>
          <dt>
            <Monitor size={15} aria-hidden="true" />
            Gráficos
          </dt>
          <dd>{profile.gpu?.name}</dd>
        </div>
        <div>
          <dt>
            <MemoryStick size={15} aria-hidden="true" />
            Memoria RAM
          </dt>
          <dd>{ramLabel(profile)}</dd>
        </div>
      </dl>

      <div
        className={`${styles.compatibilityResult} ${styles[`compatibility_${estimate.tier}`]}`}
      >
        <div>
          <span>Rendimiento estimado</span>
          <strong>{tierLabels[estimate.tier]}</strong>
        </div>
        <p>
          <strong>
            {estimate.minFps}–{estimate.maxFps}
          </strong>
          <span>FPS</span>
        </p>
      </div>

      <dl className={styles.compatibilityMeta}>
        <div>
          <dt>Confianza del cálculo</dt>
          <dd>{confidenceLabels[estimate.confidence]}</dd>
        </div>
        <div>
          <dt>Posible límite</dt>
          <dd>{bottleneckLabels[estimate.bottleneck]}</dd>
        </div>
        {compatibilityMetadata?.status && (
          <div>
            <dt>Estado de verificación</dt>
            <dd>{verificationStatusLabels[compatibilityMetadata.status]}</dd>
          </div>
        )}
        {compatibilityMetadata?.source && (
          <div>
            <dt>Origen</dt>
            <dd>{verificationSourceLabels[compatibilityMetadata.source]}</dd>
          </div>
        )}
        {compatibilityMetadata?.verifiedAt && (
          <div>
            <dt>Última verificación</dt>
            <dd>{compatibilityMetadata.verifiedAt}</dd>
          </div>
        )}
      </dl>

      <p className={styles.compatibilityNote}>
        La confianza del cálculo describe la estimación para tu hardware; el estado de verificación describe cómo fueron comprobados los datos editoriales del juego.
      </p>

      <Link
        href={`/requisitos?juego=${encodeURIComponent(
          slug
        )}`}
        className={styles.compatibilityAction}
      >
        Ajustar resolución y calidad
      </Link>
    </aside>
  );
}

export default function GameCompatibilityCard({
  slug,
  supportsPc,
}: GameCompatibilityCardProps) {
  return supportsPc
    ? <PcGameCompatibilityCard slug={slug} />
    : <UnsupportedPlatformCompatibilityCard />;
}
