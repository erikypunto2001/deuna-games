import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const hoverPreview = await readFile(
  path.join(root, "src/components/ui/HoverPreviewMedia.tsx"),
  "utf8"
);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(
  hoverPreview.includes(
    'const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"'
  ) &&
    hoverPreview.includes(
      "const [playbackAllowed, setPlaybackAllowed] = useState(false)"
    ) &&
    hoverPreview.includes("window.matchMedia(REDUCED_MOTION_QUERY)") &&
    hoverPreview.includes("!document.hidden && !motionQuery.matches") &&
    hoverPreview.includes('"visibilitychange"') &&
    hoverPreview.includes('motionQuery.addEventListener(\n      "change"') &&
    hoverPreview.includes('motionQuery.removeEventListener(\n        "change"') &&
    hoverPreview.includes("if (!playbackAllowed) return null;"),
  "El video de Card debe permanecer desmontado hasta confirmar documento visible y ausencia de reduced-motion, y reaccionar a cambios de ambas señales."
);

assert(
  hoverPreview.includes("const [playing, setPlaying] = useState(false)") &&
    hoverPreview.includes("const AUTOPLAY_RETRY_DELAY_MS = 250") &&
    hoverPreview.includes("function ensurePlayback(video: HTMLVideoElement)") &&
    hoverPreview.includes("window.setTimeout(() => {") &&
    hoverPreview.includes("}, AUTOPLAY_RETRY_DELAY_MS);") &&
    hoverPreview.includes("if (!video.isConnected || !video.paused) return;") &&
    hoverPreview.includes("void video.play().catch(() => {") &&
    hoverPreview.includes(
      "onCanPlay={unscaled ? (event) => ensurePlayback(event.currentTarget) : undefined}"
    ) &&
    hoverPreview.includes("playing ? styles.videoReady") &&
    hoverPreview.includes("onPlaying={() => setPlaying(true)}") &&
    hoverPreview.includes("onWaiting={() => setPlaying(false)}") &&
    hoverPreview.includes("onStalled={() => setPlaying(false)}") &&
    hoverPreview.includes("onError={() => setPlaying(false)}"),
  "El detalle estático debe dar margen al autoplay nativo antes de reintentar reproducción, sin intervenir en Cards interactivas, y la imagen sólo puede ceder cuando el WebM realmente está avanzando."
);

if (failures.length > 0) {
  console.error("\nCard preview runtime: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Card preview runtime: OK (sin video antes de hidratación -> documento visible -> reduced-motion respetado -> Card interactiva intacta -> fallback tardío sólo en detalle estático -> videoReady sólo al reproducir)."
);
