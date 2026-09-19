import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const unifiedHeroSource = readFileSync(
  new URL("../src/features/game-finder/GameFinderUnifiedHero.tsx", import.meta.url),
  "utf8"
);
const modalSource = readFileSync(
  new URL("../src/features/game-finder/HardwareSetupModal.tsx", import.meta.url),
  "utf8"
);
const modalCss = readFileSync(
  new URL("../src/features/game-finder/HardwareSetupModal.module.css", import.meta.url),
  "utf8"
);
const cpuAssistantSource = readFileSync(
  new URL("../src/features/game-finder/CpuIdentificationAssistant.tsx", import.meta.url),
  "utf8"
);
const hardwareFieldsSource = readFileSync(
  new URL("../src/features/game-finder/HardwareConfigurationFields.tsx", import.meta.url),
  "utf8"
);

assert.ok(
  unifiedHeroSource.includes("HardwareSetupModal") &&
    unifiedHeroSource.includes("setupModalRequested") &&
    unifiedHeroSource.includes("showSetupModal"),
  "La detección incompleta debe poder abrir un modal dentro de la app."
);

assert.ok(
  unifiedHeroSource.includes("setSetupModalRequested(true)") &&
    unifiedHeroSource.includes("handleDetect"),
  "Detectar otra vez debe volver a habilitar el modal si sigue faltando la CPU."
);

assert.ok(
  modalSource.includes("createPortal") &&
    modalSource.includes("document.body") &&
    modalSource.includes('role="dialog"') &&
    modalSource.includes('aria-modal="true"'),
  "El asistente inicial debe ser un modal real dentro de la web, no una ventana del navegador."
);

assert.ok(
  modalSource.includes('event.key === "Escape"') &&
    modalSource.includes('event.key !== "Tab"') &&
    modalSource.includes('document.body.style.overflow = "hidden"'),
  "El modal debe cerrar con Escape, contener el foco y bloquear el scroll del fondo."
);

assert.ok(
  modalCss.includes("position: fixed") &&
    modalCss.includes("backdrop-filter") &&
    modalCss.includes("z-index"),
  "El modal debe superponerse visualmente a la aplicación."
);

assert.ok(
  cpuAssistantSource.includes("useId") &&
    cpuAssistantSource.includes("showCloseButton"),
  "El selector de CPU debe soportar simultáneamente el aviso inline y el modal sin IDs duplicados."
);

assert.ok(
  hardwareFieldsSource.includes("const searchFocusFrameRef = useRef<number | null>(null)") &&
    hardwareFieldsSource.includes("window.cancelAnimationFrame(searchFocusFrameRef.current)") &&
    hardwareFieldsSource.includes("triggerRef.current?.focus()") &&
    !hardwareFieldsSource.includes("window.requestAnimationFrame(() => triggerRef.current?.focus())"),
  "Cerrar un selector de hardware debe cancelar el autofocus pendiente y devolver foco al trigger sin una carrera entre frames."
);

console.log("Modal de configuración de hardware: OK (entrada automática, reapertura, foco, Escape y overlay verificados).");
