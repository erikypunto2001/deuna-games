"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import styles from "./HomeHeroEditor.module.css";

const HERO_SAVE_ACTION = "/api/admin/content/home/hero";

type SaveNotice = { error: boolean; message: string };
type SaveResponse = { state?: string; revision?: number };
type HeroSaveFields = { expectedRevision: string; heroJson: string };
type HeroSaveState = { mode: unknown; slugs: unknown; presentation: unknown };

function readHeroSaveFields(form: HTMLFormElement): HeroSaveFields | null {
  const formData = new FormData(form);
  const expectedRevision = formData.get("expectedRevision");
  const heroJson = formData.get("heroJson");

  if (
    typeof expectedRevision !== "string" ||
    typeof heroJson !== "string"
  ) {
    return null;
  }

  return { expectedRevision, heroJson };
}

function readHeroState(fields: HeroSaveFields): HeroSaveState | null {
  try {
    const parsed = JSON.parse(fields.heroJson) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;

    const payload = parsed as Record<string, unknown>;
    return {
      mode: payload.mode,
      slugs: payload.slugs,
      presentation: payload.presentation,
    };
  } catch {
    return null;
  }
}

function normalizedHeroSaveFields(
  fields: HeroSaveFields
): HeroSaveFields | null {
  const state = readHeroState(fields);
  if (!state) return null;

  return {
    expectedRevision: fields.expectedRevision,
    heroJson: JSON.stringify(state),
  };
}

function errorMessage(
  response: Response,
  result: SaveResponse | null
) {
  if (response.status === 409) {
    return "Hay una revisión más reciente de Inicio. Tus cambios siguen abiertos en esta pestaña; compara la revisión nueva antes de volver a guardar.";
  }
  if (response.status === 403) {
    return "El servidor rechazó la solicitud. Abre el editor desde su dirección HTTPS autorizada e intenta de nuevo. Tus cambios siguen aquí.";
  }
  if (response.status === 400 || result?.state === "datos") {
    return "No se pudo guardar porque algún valor del Hero no es válido. Tus cambios siguen aquí para que puedas revisarlos.";
  }
  if (response.status === 404) {
    return "No se encontró la configuración editorial de Inicio. Tus cambios siguen aquí; actualiza el panel antes de reintentar.";
  }
  if (response.status === 503) {
    return "El servicio administrativo no está disponible. Tus cambios siguen abiertos en esta pestaña; vuelve a intentarlo cuando el servicio responda.";
  }
  return "No se pudo guardar el borrador. Tus cambios siguen abiertos en esta pestaña; vuelve a intentarlo.";
}

export default function HomeHeroSaveBoundary({
  revision,
  children,
}: {
  revision: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const saving = useRef(false);
  const [savePending, setSavePending] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const waitingForRefresh =
    savedRevision !== null && revision < savedRevision;
  const busy = savePending || waitingForRefresh;

  const readPreparedFormFields = useCallback(
    (form: HTMLFormElement) => {
      const raw = readHeroSaveFields(form);
      return raw ? normalizedHeroSaveFields(raw) : null;
    },
    []
  );

  useEffect(() => {
    if (savedRevision === null || revision < savedRevision) return;
    saving.current = false;
  }, [revision, savedRevision]);

  useEffect(() => {
    if (!waitingForRefresh || savedRevision === null) return;

    const timeout = window.setTimeout(() => {
      saving.current = false;
      setSavedRevision(null);
      setNotice((current) =>
        current?.error
          ? current
          : {
              error: false,
              message: `Borrador guardado correctamente · revisión ${savedRevision}. Si la revisión visible todavía no cambió, actualiza el panel antes de seguir editando.`,
            }
      );
    }, 5_000);

    return () => window.clearTimeout(timeout);
  }, [waitingForRefresh, savedRevision]);

  const submitPreparedFields = useCallback(
    async (fields: HeroSaveFields) => {
      if (saving.current) return;

      saving.current = true;
      setSavedRevision(null);
      setSavePending(true);
      setNotice(null);

      let waitForRefresh = false;

      try {
        const response = await fetch(HERO_SAVE_ACTION, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new URLSearchParams(fields),
        });

        if (response.redirected) {
          throw new Error(
            "La sesión administrativa expiró. Inicia sesión en otra pestaña y vuelve a guardar; tus cambios siguen aquí."
          );
        }

        const result = response.headers
          .get("content-type")
          ?.includes("application/json")
          ? ((await response.json()) as SaveResponse)
          : null;

        if (
          !response.ok ||
          result?.state !== "guardado" ||
          !Number.isInteger(result.revision)
        ) {
          throw new Error(errorMessage(response, result));
        }

        const nextRevision = result.revision as number;
        setSavePending(false);
        setSavedRevision(nextRevision);
        setNotice({
          error: false,
          message: `Borrador guardado correctamente · revisión ${nextRevision}.`,
        });
        waitForRefresh = true;
        router.refresh();
      } catch (error) {
        setNotice({
          error: true,
          message:
            error instanceof Error && error.name !== "TypeError"
              ? error.message
              : "No se pudo conectar con el servidor. Tus cambios siguen abiertos en esta pestaña; vuelve a intentarlo.",
        });
      } finally {
        if (!waitForRefresh) {
          saving.current = false;
          setSavePending(false);
        }
      }
    },
    [router]
  );

  const saveHero = (event: FormEvent<HTMLDivElement>) => {
    const form = event.target;
    if (
      !(form instanceof HTMLFormElement) ||
      form.getAttribute("action") !== HERO_SAVE_ACTION
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (saving.current) return;

    const fields = readPreparedFormFields(form);
    if (!fields) {
      setNotice({
        error: true,
        message:
          "No se pudo preparar el guardado del Hero. Tus cambios siguen abiertos en el editor.",
      });
      return;
    }

    void submitPreparedFields(fields);
  };

  return (
    <div aria-busy={busy} onSubmitCapture={saveHero}>
      {notice && (
        <p
          className={styles.workspaceNote}
          role={notice.error ? "alert" : "status"}
        >
          {notice.message}
        </p>
      )}
      <div inert={busy || undefined}>{children}</div>
    </div>
  );
}
