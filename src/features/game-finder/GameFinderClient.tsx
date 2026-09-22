"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowRight,
  Bolt,
  Check,
  CheckCircle2,
  Gamepad2,
  Grid2X2,
  Heart,
  Info,
  List,
  MemoryStick,
  Monitor,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ScreenReaderStatus from "@/components/ui/ScreenReaderStatus";
import touchStyles from "@/components/ui/TouchTarget.module.css";
import UniversalGameCardBase from "@/components/ui/UniversalGameCardBase";
import {
  useFavoriteGame,
} from "@/features/favorites/favorite-store";
import type { Game } from "@/types/game";

import {
  detectBrowserHardware,
  profileFromBrowserSnapshot,
} from "./browser-detection";
import HardwareConfigurationFields, { type ManualDraft } from "./HardwareConfigurationFields";
import GameFinderUnifiedHero from "./GameFinderUnifiedHero";
import {
  cpuCatalog,
  findCpuById,
  findGpuById,
  gpuCatalog,
} from "./hardware-catalog";
import {
  PROFILE_STORAGE_KEY,
  readStoredHardwareProfile,
} from "./hardware-storage";
import {
  resolveGameDetailPresentation,
} from "@/lib/games/game-detail-presentation";
import { estimateGamePerformance } from "./performance-model";
import {
  invalidateDetectedBrowserProfileCache,
  primeDetectedBrowserProfileCache,
} from "./useResolvedHardwareProfile";
import type {
  BrowserHardwareSnapshot,
  EstimateSettings,
  GameEstimate,
  HardwareProfile,
  PerformanceTier,
  QualityPreset,
  ResolutionPreset,
} from "./types";

import styles from "./GameFinderClient.module.css";
import overlayStyles from "./GameFinderOverlay.module.css";

const UNCONFIRMED_OS_OPTION = "Otro / no estoy seguro";

const EMPTY_PROFILE: HardwareProfile = {
  cpu: null,
  gpu: null,
  ramGb: null,
  ramKnowledge: "unknown",
  os: "Sistema sin confirmar",
  memoryMode: "unknown",
  source: "browser",
  confidence: "low",
  updatedAt: "",
};

const tierMeta: Record<
  PerformanceTier,
  { label: string; range: string; className: string }
> = {
  excellent: {
    label: "Excelente",
    range: "60+ FPS",
    className: styles.tierExcellent,
  },
  good: {
    label: "Bueno",
    range: "40–59 FPS",
    className: styles.tierGood,
  },
  acceptable: {
    label: "Aceptable",
    range: "28–39 FPS",
    className: styles.tierAcceptable,
  },
  basic: {
    label: "Básico",
    range: "Menos de 28 FPS",
    className: styles.tierBasic,
  },
};

const resolutionLabels: Record<ResolutionPreset, string> = {
  "720p": "1280×720",
  "1080p": "1920×1080",
  "1440p": "2560×1440",
  "2160p": "3840×2160",
};

const qualityLabels: Record<QualityPreset, string> = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  ultra: "Ultra",
};

type ViewMode = "grid" | "list";
type SortMode = "performance" | "name";
type DetectionState = "idle" | "detecting" | "ready" | "partial" | "error";

type GameFinderClientProps = {
  games: Game[];
  focusedSlug?: string;
  onSaveProfile?: (profile: HardwareProfile) => Promise<void>;
};

function nowIso() {
  return new Date().toISOString();
}

function profileToManualDraft(profile: HardwareProfile | null): ManualDraft {
  const cpuId = profile?.cpu && cpuCatalog.some((cpu) => cpu.id === profile.cpu?.id)
    ? profile.cpu.id
    : "";

  const gpuId = profile?.gpu && gpuCatalog.some((gpu) => gpu.id === profile.gpu?.id)
    ? profile.gpu.id
    : "";

  return {
    cpuId,
    gpuId,
    // Una cifra de RAM expuesta por el navegador no se precarga como si
    // estuviera confirmada. El usuario debe elegir la cantidad física real.
    ramGb: profile?.ramKnowledge === "confirmed" && profile.ramGb
      ? String(profile.ramGb)
      : "",
    os: profile?.os && profile.os !== "Sistema sin confirmar"
      ? profile.os
      : UNCONFIRMED_OS_OPTION,
    memoryMode: profile?.memoryMode ?? "unknown",
  };
}

function profileLabel(profile: HardwareProfile | null) {
  if (!profile) return "Sin configurar";
  if (profile.source === "example") return "Perfil de demostración";
  if (profile.source === "manual") return "Perfil confirmado";
  if (profile.source === "saved") return "Perfil guardado";
  return "Detección orientativa";
}

function profileRamLabel(profile: HardwareProfile) {
  if (!profile.ramGb) return "No disponible";
  if (profile.ramKnowledge === "lower-bound") return `${profile.ramGb} GB o más`;
  if (profile.ramKnowledge === "approximate") return `≈ ${profile.ramGb} GB`;
  return `${profile.ramGb} GB`;
}

function confidenceLabel(estimate: GameEstimate | null) {
  if (!estimate?.canEstimate) return "Sin cálculo";
  if (estimate.confidence === "high") return "Confianza alta";
  if (estimate.confidence === "medium") return "Confianza media";
  return "Confianza baja";
}

function bottleneckLabel(estimate: GameEstimate | null) {
  if (!estimate?.canEstimate) return "—";
  if (estimate.bottleneck === "cpu") return "CPU";
  if (estimate.bottleneck === "gpu") return "GPU";
  if (estimate.bottleneck === "ram") return "RAM";
  return "Equilibrado";
}

function sourceLabel(snapshot: BrowserHardwareSnapshot | null) {
  if (!snapshot) return "Sin lectura automática";
  if (snapshot.gpuSource === "webgpu") return "GPU vía WebGPU";
  if (snapshot.gpuSource === "webgl") return "GPU vía WebGL";
  return "GPU protegida";
}

function detectionLabel(
  state: DetectionState,
  profile: HardwareProfile | null
) {
  if (state === "detecting") return "Detectando hardware disponible";
  if (state === "error") return "Detección automática no disponible";
  if (state === "partial") return "Lectura parcial del navegador";
  if (profile?.source === "manual" || profile?.source === "saved") {
    return "Componentes confirmados";
  }
  if (profile?.source === "example") return "Perfil de demostración activo";
  if (profile) return "Detección local orientativa";
  return "Esperando lectura local";
}

function detectionHint(
  state: DetectionState,
  profile: HardwareProfile | null,
  snapshot: BrowserHardwareSnapshot | null
) {
  if (state === "detecting") {
    return "Leemos únicamente los datos que el navegador permite exponer.";
  }
  // Las limitaciones del snapshot sólo importan mientras el perfil activo sea
  // realmente una detección web. Si el usuario ya confirmó los componentes,
  // ese perfil es la fuente del cálculo y no debe heredar avisos antiguos.
  if (profile?.source === "manual" || profile?.source === "saved") {
    if (snapshot) {
      return "Volvimos a consultar el navegador. CPU, GPU y RAM confirmadas se conservan porque son más fiables; la lectura automática sólo completa o mejora datos que la web puede identificar con certeza.";
    }
    return "Este perfil local se usa para calcular los rangos de FPS del catálogo.";
  }
  if (profile?.source === "example") {
    return "El ejemplo no reemplaza el perfil guardado de tu PC.";
  }
  if (snapshot?.secureContext === false) {
    return "Estás usando una conexión HTTP de red local: la web funciona, pero WebGPU y parte de la detección avanzada pueden quedar limitados. Para una lectura más completa usa HTTPS o localhost.";
  }
  if (state === "error") {
    return "Puedes configurar CPU, GPU y RAM manualmente sin instalar nada.";
  }
  if (state === "partial") {
    return "Parte del hardware está protegida; confirma los componentes para mejorar los FPS estimados.";
  }
  return "La detección web es orientativa; puedes confirmar los modelos cuando quieras.";
}

function detectionSource(
  profile: HardwareProfile | null,
  snapshot: BrowserHardwareSnapshot | null
) {
  // El origen visible debe describir el perfil que realmente está usando el
  // cálculo. Un snapshot automático anterior no debe eclipsar un perfil
  // manual, guardado o de demostración que esté activo ahora.
  if (profile?.source === "manual") {
    return snapshot ? "Manual + verificación web" : "Entrada manual";
  }
  if (profile?.source === "saved") {
    return snapshot ? "Guardado + verificación web" : "Perfil local";
  }
  if (profile?.source === "example") return "Ejemplo local";
  if (snapshot) return sourceLabel(snapshot);
  return "Sin lectura automática";
}

function FinderFavoriteButton({
  gameSlug,
  gameTitle,
  className,
}: {
  gameSlug: string;
  gameTitle: string;
  className: string;
}) {
  const {
    favorite,
    pending,
    toggle,
  } = useFavoriteGame(gameSlug);
  const [status, setStatus] = useState("");

  async function handleToggle() {
    const nextFavorite = !favorite;
    setStatus("");
    const saved = await toggle();

    setStatus(
      saved
        ? nextFavorite
          ? `${gameTitle} añadido a favoritos.`
          : `${gameTitle} quitado de favoritos.`
        : `No se pudo actualizar el favorito de ${gameTitle}.`
    );
  }

  return (
    <>
      <button
        type="button"
        className={`${className} ${touchStyles.minimum} ${favorite ? styles.favoriteButtonActive : ""}`}
        aria-label={
          favorite
            ? `Quitar ${gameTitle} de favoritos`
            : `Añadir ${gameTitle} a favoritos`
        }
        aria-pressed={favorite}
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={() => void handleToggle()}
        data-game-favorite={gameSlug}
      >
        <Heart size={19} fill={favorite ? "currentColor" : "none"} />
      </button>
      <ScreenReaderStatus>{status}</ScreenReaderStatus>
    </>
  );
}

function GameResultCard({
  game,
  estimate,
  selected,
  onSelect,
}: {
  game: Game;
  estimate: GameEstimate;
  selected: boolean;
  onSelect: () => void;
}) {
  const tier = tierMeta[estimate.tier];

  return (
    <UniversalGameCardBase
      game={game}
      primaryAction={{
        kind: "button",
        ariaLabel: `Seleccionar ${game.title}`,
        pressed: selected,
        onClick: onSelect,
      }}
      supplementalContent={(
        <div className={styles.finderCardSignals}>
          {selected && (
            <span className={styles.selectedMark}>
              <Check size={13} aria-hidden="true" />
              Seleccionado
            </span>
          )}

          {estimate.canEstimate ? (
            <div className={`${styles.performanceBar} ${tier.className}`}>
              <span>
                <Bolt size={14} aria-hidden="true" />
                {tier.label}
              </span>
              <strong>{estimate.minFps}–{estimate.maxFps} FPS</strong>
            </div>
          ) : (
            <div className={`${styles.performanceBar} ${styles.performancePending}`}>
              <span>
                <Info size={14} aria-hidden="true" />
                Falta configurar
              </span>
              <strong>— FPS</strong>
            </div>
          )}

          <div className={styles.gameCardMeta}>
            <span>
              <Gamepad2 size={13} aria-hidden="true" />
              {game.category}
            </span>
            <span>
              <Monitor size={13} aria-hidden="true" />
              PC
            </span>
          </div>
        </div>
      )}
      overlayAction={(
        <FinderFavoriteButton
          gameSlug={game.slug}
          gameTitle={game.title}
          className={styles.favoriteButton}
        />
      )}
    />
  );
}

export default function GameFinderClient({
  games,
  focusedSlug,
  onSaveProfile,
}: GameFinderClientProps) {
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [snapshot, setSnapshot] = useState<BrowserHardwareSnapshot | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>(() => profileToManualDraft(null));

  const settingsDialogRef = useRef<HTMLDivElement | null>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);

  const [estimateSettings, setEstimateSettings] = useState<EstimateSettings>({
    resolution: "1080p",
    quality: "medium",
  });

  const [genre, setGenre] = useState("all");
  const [tierFilter, setTierFilter] = useState<PerformanceTier | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("performance");
  const [view, setView] = useState<ViewMode>("grid");
  const validFocusedSlug =
    focusedSlug && games.some((game) => game.slug === focusedSlug)
      ? focusedSlug
      : undefined;
  const [selectedGameState, setSelectedGameState] = useState(() => ({
    focusKey: validFocusedSlug,
    slug: validFocusedSlug ?? games[0]?.slug ?? "",
  }));
  const storedSelectionIsValid = games.some(
    (game) => game.slug === selectedGameState.slug
  );
  const selectedSlug =
    selectedGameState.focusKey === validFocusedSlug &&
    storedSelectionIsValid
      ? selectedGameState.slug
      : validFocusedSlug ?? games[0]?.slug ?? "";

  const runDetection = useCallback(async (preferredProfile: HardwareProfile | null = null) => {
    setDetectionState("detecting");
    invalidateDetectedBrowserProfileCache();

    try {
      const detected = await detectBrowserHardware();
      const browserProfile = profileFromBrowserSnapshot(detected, preferredProfile);

      primeDetectedBrowserProfileCache(browserProfile);
      setSnapshot(detected);
      setHardware(browserProfile);
      setManualDraft(profileToManualDraft(browserProfile));

      const complete = Boolean(browserProfile.cpu && browserProfile.gpu && browserProfile.ramGb);
      setDetectionState(complete ? "ready" : "partial");
    } catch {
      setDetectionState("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readStoredHardwareProfile();

      if (saved) {
        setHardware(saved);
        setManualDraft(profileToManualDraft(saved));
        setDetectionState("ready");
        return;
      }

      void runDetection();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [runDetection]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (
        event.storageArea !== window.localStorage ||
        event.key !== PROFILE_STORAGE_KEY
      ) {
        return;
      }

      const saved = readStoredHardwareProfile();
      if (!saved) {
        setSnapshot(null);
        setHardware(null);
        setManualDraft(profileToManualDraft(null));
        setDetectionState("idle");
        void runDetection();
        return;
      }

      setSnapshot(null);
      setHardware(saved);
      setManualDraft(profileToManualDraft(saved));
      setDetectionState("ready");
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [runDetection]);

  useEffect(() => {
    if (
      !hardware ||
      hardware.source === "browser" ||
      hardware.source === "example" ||
      !hardware.cpu ||
      !hardware.gpu ||
      !hardware.ramGb
    ) {
      return;
    }

    try {
      window.localStorage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({
          cpuId: hardware.cpu.id,
          gpuId: hardware.gpu.id,
          ramGb: hardware.ramGb,
          os: hardware.os,
          osConfirmed: hardware.osConfirmed === true,
          memoryMode: hardware.memoryMode,
          updatedAt: hardware.updatedAt,
        })
      );
    } catch {
      // El sitio funciona aunque el usuario bloquee localStorage.
    }
  }, [hardware]);

  useEffect(() => {
    if (!settingsOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      settingsDialogRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      settingsReturnFocusRef.current?.focus();
    };
  }, [settingsOpen]);

  const activeHardware = hardware ?? EMPTY_PROFILE;

  const estimates = useMemo(() => {
    return new Map(
      games.map((game) => [
        game.slug,
        estimateGamePerformance(game.slug, activeHardware, estimateSettings),
      ])
    );
  }, [activeHardware, estimateSettings, games]);

  const heroRecommendations = useMemo(() => {
    const rankedGames = [...games].sort((a, b) => {
      const aEstimate = estimates.get(a.slug);
      const bEstimate = estimates.get(b.slug);
      const aReady = Boolean(aEstimate?.canEstimate);
      const bReady = Boolean(bEstimate?.canEstimate);

      if (aReady !== bReady) return aReady ? -1 : 1;
      if (aReady && bReady) {
        return (bEstimate?.fps ?? 0) - (aEstimate?.fps ?? 0);
      }

      // Sin un perfil suficiente conservamos el orden editorial original.
      return 0;
    });

    return rankedGames.slice(0, 4).map((game) => ({
      game,
      estimate: estimates.get(game.slug) ?? null,
    }));
  }, [estimates, games]);

  const genres = useMemo(() => {
    return [...new Set(games.map((game) => game.category))].sort((a, b) => a.localeCompare(b, "es"));
  }, [games]);

  const tierCounts = useMemo(() => {
    const counts: Record<PerformanceTier, number> = {
      excellent: 0,
      good: 0,
      acceptable: 0,
      basic: 0,
    };

    for (const estimate of estimates.values()) {
      if (estimate.canEstimate) counts[estimate.tier] += 1;
    }

    return counts;
  }, [estimates]);

  const visibleGames = useMemo(() => {
    const filtered = games.filter((game) => {
      if (genre !== "all" && game.category !== genre) return false;

      const estimate = estimates.get(game.slug);
      if (
        tierFilter !== "all" &&
        (!estimate?.canEstimate || estimate.tier !== tierFilter)
      ) {
        return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === "name") return a.title.localeCompare(b.title, "es");

      const aFps = estimates.get(a.slug)?.fps ?? -1;
      const bFps = estimates.get(b.slug)?.fps ?? -1;
      return bFps - aFps;
    });
  }, [estimates, games, genre, sortMode, tierFilter]);

  const selectedGame =
    visibleGames.find((game) => game.slug === selectedSlug) ??
    visibleGames[0];
  const selectedEstimate = selectedGame ? estimates.get(selectedGame.slug) ?? null : null;
  const selectedSizeLabel = selectedGame
    ? resolveGameDetailPresentation(selectedGame).sizeLabel
    : "A confirmar";
  const selectedManualGpu = findGpuById(manualDraft.gpuId);
  const manualRamGb = Number(manualDraft.ramGb);
  const manualProfileReady = Boolean(
    manualDraft.cpuId &&
    manualDraft.gpuId &&
    Number.isFinite(manualRamGb) &&
    manualRamGb >= 1 &&
    manualRamGb <= 256
  );

  function setSelectedSlug(slug: string) {
    setSelectedGameState({
      focusKey: validFocusedSlug,
      slug,
    });
  }

  function openSettings() {
    settingsReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const sourceProfile = hardware?.source === "example"
      ? readStoredHardwareProfile()
      : hardware;

    setManualDraft(profileToManualDraft(sourceProfile));
    setSettingsOpen(true);
  }

  function closeSettings() {
    if (savingProfile) return;
    setProfileSaveError(null);
    setSettingsOpen(false);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSettings();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = settingsDialogRef.current?.querySelectorAll<HTMLElement>(
      "button:enabled, select:enabled, input:enabled:not([type='hidden']), a[href], [tabindex]:not([tabindex='-1'])"
    );

    if (!focusable?.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const activeIsFocusable =
      active instanceof HTMLElement &&
      Array.from(focusable).includes(active);

    // El diálogo recibe el foco inicial mediante tabIndex=-1. Desde ese punto,
    // Tab debe entrar por el primer control y Shift+Tab por el último, sin
    // permitir que el foco escape hacia la página que queda detrás del modal.
    if (!activeIsFocusable) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function applyManualProfile() {
    if (savingProfile) return;
    const cpu = findCpuById(manualDraft.cpuId);
    const gpu = findGpuById(manualDraft.gpuId);
    const ramGb = Number(manualDraft.ramGb);
    const osConfirmed =
      manualDraft.os.trim().length > 0 &&
      manualDraft.os !== UNCONFIRMED_OS_OPTION;

    if (!cpu || !gpu || !Number.isFinite(ramGb) || ramGb < 1 || ramGb > 256) return;

    const manualProfile: HardwareProfile = {
      cpu,
      gpu,
      ramGb,
      ramKnowledge: "confirmed",
      os: osConfirmed ? manualDraft.os : "Sistema sin confirmar",
      osConfirmed,
      memoryMode: gpu.integrated ? manualDraft.memoryMode : "unknown",
      source: "manual",
      confidence: "high",
      updatedAt: nowIso(),
    };

    setSavingProfile(true);
    setProfileSaveError(null);
    try {
      await onSaveProfile?.(manualProfile);
    } catch {
      setProfileSaveError("No se pudo guardar tu PC en la cuenta. Tus cambios siguen aquí; vuelve a intentarlo.");
      return;
    } finally {
      setSavingProfile(false);
    }

    setSnapshot(null);
    setHardware(manualProfile);
    setDetectionState("ready");
    setSettingsOpen(false);
  }

  function scrollToResults() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.requestAnimationFrame(() => {
      document.getElementById("results-title")?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function useExampleProfile() {
    resetFilters();

    const firstAnalyzableGame =
      games.find((game) => Boolean(getPerformanceProfile(game.slug))) ?? games[0];

    if (firstAnalyzableGame) {
      setSelectedSlug(firstAnalyzableGame.slug);
    }

    const hasUsableRealProfile = Boolean(
      hardware?.source !== "example" &&
      hardware?.cpu &&
      hardware?.gpu &&
      hardware?.ramGb
    );

    if (hasUsableRealProfile) {
      scrollToResults();
      return;
    }

    const saved = readStoredHardwareProfile();
    if (saved) {
      setHardware(saved);
      setManualDraft(profileToManualDraft(saved));
      setDetectionState("ready");
      scrollToResults();
      return;
    }

    const cpu = findCpuById("ryzen-5-5600g");
    const gpu = findGpuById("radeon-vega-7");
    if (!cpu || !gpu) return;

    const example: HardwareProfile = {
      cpu,
      gpu,
      ramGb: 16,
      ramKnowledge: "confirmed",
      os: "Windows 11 64-bit",
      memoryMode: "dual",
      source: "example",
      confidence: "high",
      updatedAt: nowIso(),
    };

    setHardware(example);
    setDetectionState("ready");
    scrollToResults();
  }

  function resetFilters() {
    setGenre("all");
    setTierFilter("all");
    setSortMode("performance");
  }

  const canEstimate = Boolean(activeHardware.cpu && activeHardware.gpu && activeHardware.ramGb);
  const hasRealAnalysis = Boolean(canEstimate && hardware?.source !== "example");

  return (
    <div className={styles.finderRoot}>
      <GameFinderUnifiedHero
        recommendations={heroRecommendations}
        hardware={activeHardware}
        profileTitle={profileLabel(hardware)}
        ramLabel={profileRamLabel(activeHardware)}
        detectionState={detectionState}
        detectionStatus={detectionLabel(detectionState, hardware)}
        detectionHint={detectionHint(detectionState, hardware, snapshot)}
        detectionSource={detectionSource(hardware, snapshot)}
        hasRealAnalysis={hasRealAnalysis}
        onAnalyze={useExampleProfile}
        onConfigure={openSettings}
        onDetect={() => void runDetection(hardware)}
        onSelectGame={(slug) => {
          setSelectedSlug(slug);
          scrollToResults();
        }}
        onViewAll={scrollToResults}
      />

      {settingsOpen && (
        <div
          className={overlayStyles.backdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSettings();
            }
          }}
        >
          <div
            ref={settingsDialogRef}
            className={overlayStyles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="config-title"
            aria-describedby="config-description"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
          >
            <section className={styles.configPanel}>
              <div className={styles.configHeader}>
                <div>
                  <span className={styles.sectionKicker}>PERFIL MANUAL</span>
                  <h2 id="config-title">Confirma los componentes de tu PC</h2>
                  <p id="config-description">
                    Los datos automáticos sirven como ayuda. Para estimaciones más útiles, confirma el modelo exacto de CPU, GPU y la RAM física.
                  </p>
                </div>

                <button
                  type="button"
                  className={styles.closeConfig}
                  onClick={closeSettings}
                  aria-label="Cerrar configuración"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              <HardwareConfigurationFields draft={manualDraft} onChange={setManualDraft} disabled={savingProfile} />

              <div className={styles.configFooter}>
                <div>
                  {profileSaveError && <p role="alert">{profileSaveError}</p>}
                  {onSaveProfile && <p>CPU, gráfica y RAM se guardan en tu cuenta. El sistema operativo se conserva en este navegador.</p>}
                <p>
                  <Info size={15} aria-hidden="true" />
                  {selectedManualGpu?.integrated
                    ? "En gráficas integradas, single/dual-channel puede cambiar bastante el rendimiento y por eso entra en el cálculo."
                    : "La CPU exacta no puede leerse desde una web estándar. Si el navegador no la identifica, elegirla aquí es la opción más fiable."}
                </p>

                </div>
                <button
                  type="button"
                  className={styles.saveProfileButton}
                  onClick={applyManualProfile}
                  disabled={!manualProfileReady || savingProfile}
                >
                  {savingProfile ? "Guardando..." : "Guardar y recalcular"}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      <section className={styles.resultsSection} aria-labelledby="results-title">
        <div className={styles.resultsHeader}>
          <div>
            <span className={styles.sectionKicker}>RESULTADOS PARA TU PERFIL</span>
            <div className={styles.resultsTitleLine}>
              <h2 id="results-title">Juegos que puedes jugar</h2>
              <span>{visibleGames.length} analizados</span>
            </div>
            <p>
              {canEstimate
                ? `Estimación en ${resolutionLabels[estimateSettings.resolution]} · calidad ${qualityLabels[estimateSettings.quality].toLowerCase()}.`
                : "Completa CPU, GPU y RAM para activar los FPS orientativos."}
            </p>
          </div>

          <div className={styles.resultControls}>
            <div className={styles.viewToggle} aria-label="Vista de resultados">
              <button type="button" className={view === "grid" ? styles.viewActive : ""} onClick={() => setView("grid")} aria-label="Vista cuadrícula" aria-pressed={view === "grid"}>
                <Grid2X2 size={17} />
              </button>
              <button type="button" className={view === "list" ? styles.viewActive : ""} onClick={() => setView("list")} aria-label="Vista lista" aria-pressed={view === "list"}>
                <List size={18} />
              </button>
            </div>

            <label className={styles.sortControl}>
              <span>Ordenar por</span>
              <select value={sortMode} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSortMode(event.target.value as SortMode)}>
                <option value="performance">Mejor rendimiento</option>
                <option value="name">Nombre A–Z</option>
              </select>
            </label>
          </div>
        </div>

        <div className={styles.resultsLayout}>
          <aside className={styles.filtersPanel} aria-label="Filtros de rendimiento">
            <h3>Rendimiento estimado</h3>

            <div className={styles.tierFilters}>
              {(Object.keys(tierMeta) as PerformanceTier[]).map((tier) => {
                const meta = tierMeta[tier];
                const active = tierFilter === tier;

                return (
                  <button
                    type="button"
                    key={tier}
                    className={`${styles.tierFilter} ${meta.className} ${active ? styles.tierFilterActive : ""}`}
                    onClick={() => setTierFilter((current) => current === tier ? "all" : tier)}
                    aria-pressed={active}
                  >
                    <span className={styles.tierDot} />
                    <span>
                      <strong>{meta.label}</strong>
                      <small>{meta.range}</small>
                    </span>
                    <b>{tierCounts[tier]}</b>
                  </button>
                );
              })}
            </div>

            <div className={styles.filterDivider} />

            <label className={styles.filterField}>
              <span>Género</span>
              <select value={genre} onChange={(event: ChangeEvent<HTMLSelectElement>) => setGenre(event.target.value)}>
                <option value="all">Todos los géneros</option>
                {genres.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Resolución</span>
              <select
                value={estimateSettings.resolution}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setEstimateSettings((current) => ({ ...current, resolution: event.target.value as ResolutionPreset }))}
              >
                {(Object.keys(resolutionLabels) as ResolutionPreset[]).map((item) => (
                  <option key={item} value={item}>{item} · {resolutionLabels[item]}</option>
                ))}
              </select>
            </label>

            <label className={styles.filterField}>
              <span>Calidad gráfica</span>
              <select
                value={estimateSettings.quality}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setEstimateSettings((current) => ({ ...current, quality: event.target.value as QualityPreset }))}
              >
                {(Object.keys(qualityLabels) as QualityPreset[]).map((item) => (
                  <option key={item} value={item}>{qualityLabels[item]}</option>
                ))}
              </select>
            </label>

            <button type="button" className={styles.clearFilters} onClick={resetFilters}>
              <RotateCcw size={16} aria-hidden="true" />
              Limpiar filtros
            </button>

            <div className={styles.privacyBox}>
              <ShieldCheck size={18} aria-hidden="true" />
              <div>
                <strong>Tu privacidad primero</strong>
                <p>
                  {onSaveProfile
                    ? "CPU, gráfica y RAM confirmadas se guardan en tu cuenta. El sistema operativo queda en este navegador y la detección automática no se sube."
                    : "El perfil confirmado se guarda solo en este navegador. Una nueva detección automática no borra ese perfil."}
                </p>
              </div>
            </div>
          </aside>

          <div className={`${styles.gamesArea} ${view === "list" ? styles.gamesAreaList : ""}`}>
            {visibleGames.length ? (
              visibleGames.map((game) => (
                <GameResultCard
                  key={game.slug}
                  game={game}
                  estimate={estimates.get(game.slug)!}
                  selected={selectedGame?.slug === game.slug}
                  onSelect={() => setSelectedSlug(game.slug)}
                />
              ))
            ) : (
              <div className={styles.emptyResults}>
                <SlidersHorizontal size={26} aria-hidden="true" />
                <h3>No hay juegos con esos filtros</h3>
                <p>Prueba otra categoría o quita el filtro de rendimiento.</p>
                <button type="button" onClick={resetFilters}>Restablecer filtros</button>
              </div>
            )}
          </div>

          {selectedGame && (
            <aside className={styles.detailPanel} aria-label={`Detalle de ${selectedGame.title}`}>
              <div className={styles.detailMedia}>
                {selectedGame.coverImage && (
                  <Image
                    src={selectedGame.coverImage}
                    alt={selectedGame.imageAlt}
                    fill
                    sizes="330px"
                    className={styles.detailImage}
                  />
                )}
                <div className={styles.detailShade} aria-hidden="true" />

                <FinderFavoriteButton
                  gameSlug={selectedGame.slug}
                  gameTitle={selectedGame.title}
                  className={styles.detailFavorite}
                />
              </div>

              <div className={styles.detailBody}>
                <h3>{selectedGame.title}</h3>

                <div className={styles.detailTags}>
                  <span>{selectedGame.category}</span>
                  <span>PC</span>
                  <span>{confidenceLabel(selectedEstimate)}</span>
                </div>

                <div className={styles.detailEstimate}>
                  <span>Rendimiento estimado</span>
                  {selectedEstimate?.canEstimate ? (
                    <strong className={tierMeta[selectedEstimate.tier].className}>
                      {tierMeta[selectedEstimate.tier].label}
                      <b>{selectedEstimate.minFps}–{selectedEstimate.maxFps} FPS</b>
                    </strong>
                  ) : (
                    <strong className={styles.performancePending}>Configura tu PC <b>— FPS</b></strong>
                  )}
                </div>

                <p className={styles.detailDescription}>{selectedGame.description}</p>

                <div className={styles.quickInfo}>
                  <h4>Información rápida</h4>
                  <dl>
                    <div><dt>Espacio requerido</dt><dd>{selectedSizeLabel}</dd></div>
                    <div><dt>Género</dt><dd>{selectedGame.category}</dd></div>
                    <div><dt>Cuello de botella</dt><dd>{bottleneckLabel(selectedEstimate)}</dd></div>
                    <div><dt>Escenario</dt><dd>{estimateSettings.resolution} · {qualityLabels[estimateSettings.quality]}</dd></div>
                  </dl>
                </div>

                <Link href={`/juegos/${selectedGame.slug}`} className={styles.detailPrimaryLink}>
                  Ver ficha del juego
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>

                <Link href="/juegos" className={styles.detailSecondaryLink}>
                  <Monitor size={16} aria-hidden="true" />
                  Explorar catálogo completo
                </Link>

                <div className={styles.detailFootnote}>
                  <span><CheckCircle2 size={13} /> Datos orientativos</span>
                  <span><MemoryStick size={13} /> Sin escaneo real</span>
                </div>
              </div>
            </aside>
          )}
        </div>
      </section>

      <section className={styles.methodNote} aria-label="Cómo interpretar las estimaciones">
        <Bolt size={20} aria-hidden="true" />
        <div>
          <strong>Los FPS son un rango, no una promesa.</strong>
          <p>
            Drivers, temperatura, procesos en segundo plano, versión del juego y memoria pueden cambiar el resultado. La RAM expuesta por el navegador se trata como aproximada —8 GB puede significar 8 GB o más— y ensancha el rango en lugar de asumirse como exacta. El modelo toma 1080p/Medio como referencia y no simula ray tracing, frame generation ni escalado.
          </p>
        </div>
      </section>
    </div>
  );
}
