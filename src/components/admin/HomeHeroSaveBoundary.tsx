"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";

import styles from "./HomeHeroEditor.module.css";

const HERO_SAVE_ACTION = "/api/admin/content/home/hero";
const HERO_DRAFT_PREFIX = "deuna:hero-draft:";
const HERO_DRAFT_LATEST_KEY = `${HERO_DRAFT_PREFIX}latest`;
const subscribeStorage = () => () => {};
const serverBlockedRecoverySnapshot = () => "";

type SaveNotice = { error: boolean; message: string };
type SaveResponse = { state?: string; revision?: number };
type HeroSaveFields = { expectedRevision: string; heroJson: string };
type HeroSaveState = { mode: unknown; slugs: unknown; presentation: unknown };
type BlockedRecovery = { revision: number | null };

function clearStoredHeroDrafts() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(HERO_DRAFT_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // El guardado confirmado en el servidor sigue siendo la fuente de verdad.
  }
}

function readBlockedHeroRecovery(currentRevision: number): BlockedRecovery | null {
  try {
    const stable = sessionStorage.getItem(HERO_DRAFT_LATEST_KEY);
    if (stable) {
      try {
        const parsed = JSON.parse(stable) as unknown;
        if (typeof parsed === "object" && parsed !== null && "revision" in parsed && typeof parsed.revision === "number" && Number.isInteger(parsed.revision)) {
          const recoveryRevision = parsed.revision;
          return recoveryRevision === currentRevision ? null : { revision: recoveryRevision };
        }
      } catch {
        // Una copia sin metadatos verificables nunca debe rebasarse sobre otra revisión.
      }
      return { revision: null };
    }
    if (sessionStorage.getItem(`${HERO_DRAFT_PREFIX}${currentRevision}`)) return null;
    let newestRevision: number | null = null;
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      const match = key?.match(/^deuna:hero-draft:(\d+)$/);
      if (!match) continue;
      const recoveryRevision = Number(match[1]);
      if (!Number.isInteger(recoveryRevision) || recoveryRevision === currentRevision || (newestRevision !== null && recoveryRevision <= newestRevision)) continue;
      if (!sessionStorage.getItem(key!)) continue;
      newestRevision = recoveryRevision;
    }
    return newestRevision === null ? null : { revision: newestRevision };
  } catch {
    return null;
  }
}

function readBlockedHeroRecoverySnapshot(currentRevision: number) {
  const blocked = readBlockedHeroRecovery(currentRevision);
  if (!blocked) return "";
  return blocked.revision === null ? "unknown" : `revision:${blocked.revision}`;
}

function decodeBlockedHeroRecoverySnapshot(snapshot: string): BlockedRecovery | null {
  if (!snapshot) return null;
  if (snapshot === "unknown") return { revision: null };
  const match = snapshot.match(/^revision:(\d+)$/);
  if (!match) return { revision: null };
  const revision = Number(match[1]);
  return Number.isInteger(revision) ? { revision } : { revision: null };
}

function readHeroSaveFields(form: HTMLFormElement): HeroSaveFields | null {
  const formData = new FormData(form);
  const expectedRevision = formData.get("expectedRevision");
  const heroJson = formData.get("heroJson");
  if (typeof expectedRevision !== "string" || typeof heroJson !== "string") return null;
  return { expectedRevision, heroJson };
}

function readHeroState(fields: HeroSaveFields): HeroSaveState | null {
  try {
    const parsed = JSON.parse(fields.heroJson) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const payload = parsed as Record<string, unknown>;
    return { mode: payload.mode, slugs: payload.slugs, presentation: payload.presentation };
  } catch {
    return null;
  }
}

function normalizedHeroSaveFields(fields: HeroSaveFields): HeroSaveFields | null {
  const state = readHeroState(fields);
  if (!state) return null;
  return { expectedRevision: fields.expectedRevision, heroJson: JSON.stringify(state) };
}

function persistHeroRecoveryFields(fields: HeroSaveFields) {
  try {
    const revision = Number(fields.expectedRevision);
    if (!Number.isInteger(revision) || revision < 1) return;
    const state = readHeroState(fields);
    if (!state) return;
    sessionStorage.setItem(HERO_DRAFT_LATEST_KEY, JSON.stringify({ revision, state }));
    sessionStorage.setItem(`${HERO_DRAFT_PREFIX}${revision}`, JSON.stringify(state));
  } catch {
    // Si storage está bloqueado, el editor conserva igualmente el estado en memoria.
  }
}

function errorMessage(response: Response, result: SaveResponse | null) {
  if (response.status === 409) return "Hay una revisión más reciente de Inicio. Tus cambios siguen abiertos y en la copia local; mantenlos en esta pestaña y compara la revisión nueva antes de recargar para no rebasar cambios antiguos sobre un borrador más reciente.";
  if (response.status === 403) return "El servidor rechazó la solicitud. Abre el editor desde su dirección HTTPS autorizada e intenta de nuevo. Tus cambios siguen aquí.";
  if (response.status === 400 || result?.state === "datos") return "No se pudo guardar porque algún valor del Hero no es válido. Tus cambios siguen aquí para que puedas revisarlos.";
  if (response.status === 404) return "No se encontró la configuración editorial de Inicio. Tus cambios siguen aquí; actualiza el panel antes de reintentar.";
  if (response.status === 503) return "El servicio administrativo no está disponible. Tus cambios siguen aquí y en la copia local; vuelve a intentarlo cuando el servicio responda.";
  return "No se pudo guardar el borrador. Tus cambios siguen aquí y en la copia local; vuelve a intentarlo.";
}

export default function HomeHeroSaveBoundary({ revision, children }: { revision: number; children: ReactNode }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const backupFrame = useRef<number | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const blockedRecoverySnapshot = useSyncExternalStore(subscribeStorage, () => readBlockedHeroRecoverySnapshot(revision), serverBlockedRecoverySnapshot);
  const blockedRecovery = decodeBlockedHeroRecoverySnapshot(blockedRecoverySnapshot);
  const waitingForRefresh = savedRevision !== null && revision < savedRevision;
  const busy = savePending || waitingForRefresh;

  const findHeroForm = useCallback(() => rootRef.current?.querySelector<HTMLFormElement>(`form[action="${HERO_SAVE_ACTION}"]`) ?? null, []);
  const readPreparedFormFields = useCallback((form: HTMLFormElement) => {
    const raw = readHeroSaveFields(form);
    return raw ? normalizedHeroSaveFields(raw) : null;
  }, []);

  const scheduleRecoverySnapshot = () => {
    if (saving.current || blockedRecovery) return;
    if (backupFrame.current !== null) cancelAnimationFrame(backupFrame.current);
    backupFrame.current = requestAnimationFrame(() => {
      backupFrame.current = null;
      if (saving.current || blockedRecovery) return;
      const form = findHeroForm();
      if (!form) return;
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
      if (submit?.disabled) {
        clearStoredHeroDrafts();
        return;
      }
      const fields = readPreparedFormFields(form);
      if (fields) persistHeroRecoveryFields(fields);
    });
  };

  useEffect(() => () => {
    if (backupFrame.current !== null) cancelAnimationFrame(backupFrame.current);
  }, []);

  useEffect(() => {
    if (savedRevision === null || revision < savedRevision) return;
    saving.current = false;
  }, [revision, savedRevision]);

  useEffect(() => {
    if (!waitingForRefresh || savedRevision === null) return;
    const timeout = window.setTimeout(() => {
      saving.current = false;
      setSavedRevision(null);
      setNotice((current) => current?.error ? current : { error: false, message: `Borrador guardado correctamente · revisión ${savedRevision}. Si la revisión visible todavía no cambió, actualiza el panel antes de seguir editando.` });
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [waitingForRefresh, savedRevision]);

  const submitPreparedFields = useCallback(async (fields: HeroSaveFields) => {
    if (saving.current || blockedRecovery) return;
    persistHeroRecoveryFields(fields);
    saving.current = true;
    setSavedRevision(null);
    setSavePending(true);
    setNotice(null);
    let waitForRefresh = false;
    try {
      const response = await fetch(HERO_SAVE_ACTION, { method: "POST", headers: { Accept: "application/json" }, body: new URLSearchParams(fields) });
      if (response.redirected) throw new Error("La sesión administrativa expiró. Inicia sesión en otra pestaña y vuelve a guardar; tus cambios siguen aquí.");
      const result = response.headers.get("content-type")?.includes("application/json") ? (await response.json()) as SaveResponse : null;
      if (!response.ok || result?.state !== "guardado" || !Number.isInteger(result.revision)) throw new Error(errorMessage(response, result));
      const nextRevision = result.revision as number;
      clearStoredHeroDrafts();
      setSavePending(false);
      setSavedRevision(nextRevision);
      setNotice({ error: false, message: `Borrador guardado correctamente · revisión ${nextRevision}.` });
      waitForRefresh = true;
      router.refresh();
    } catch (error) {
      persistHeroRecoveryFields(fields);
      setNotice({ error: true, message: error instanceof Error && error.name !== "TypeError" ? error.message : "No se pudo conectar con el servidor. Tus cambios siguen aquí y en la copia local; vuelve a intentarlo." });
    } finally {
      if (!waitForRefresh) {
        saving.current = false;
        setSavePending(false);
      }
    }
  }, [blockedRecovery, router]);

  const saveHero = (event: FormEvent<HTMLDivElement>) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.getAttribute("action") !== HERO_SAVE_ACTION) return;
    event.preventDefault();
    event.stopPropagation();
    if (saving.current || blockedRecovery) return;
    const fields = readPreparedFormFields(form);
    if (!fields) {
      setNotice({ error: true, message: "No se pudo preparar el guardado del Hero. Tus cambios siguen abiertos en el editor." });
      return;
    }
    void submitPreparedFields(fields);
  };

  const discardBlockedRecovery = () => {
    if (backupFrame.current !== null) {
      cancelAnimationFrame(backupFrame.current);
      backupFrame.current = null;
    }
    clearStoredHeroDrafts();
    setRecoveryEpoch((current) => current + 1);
  };

  return (
    <div ref={rootRef} aria-busy={busy} onSubmitCapture={saveHero} onClickCapture={scheduleRecoverySnapshot} onChangeCapture={scheduleRecoverySnapshot} onInputCapture={scheduleRecoverySnapshot} onPointerUpCapture={scheduleRecoverySnapshot} onKeyUpCapture={scheduleRecoverySnapshot}>
      {notice && <p className={styles.workspaceNote} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
      {blockedRecovery && <div className={styles.workspaceNote} role="alert"><strong>Copia local de otra revisión bloqueada.</strong>{" "}{blockedRecovery.revision === null ? "No se pudo verificar de qué revisión proviene. Por seguridad no puede recuperarse sobre el borrador actual." : `La copia pertenece a la revisión ${blockedRecovery.revision} y el servidor está en la revisión ${revision}. Por seguridad no puede recuperarse sobre una revisión distinta.`}{" "}Descarta esa copia para desbloquear el Hero actual.<button type="button" onClick={discardBlockedRecovery}>Descartar copia obsoleta</button></div>}
      <div key={recoveryEpoch} inert={busy || blockedRecovery !== null || undefined}>{children}</div>
    </div>
  );
}
