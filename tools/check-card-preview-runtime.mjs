import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const [hoverPreview, clientSignals] = await Promise.all([
  readFile(
    path.join(root, "src/components/ui/HoverPreviewMedia.tsx"),
    "utf8"
  ),
  readFile(
    path.join(root, "src/lib/browser/client-signals.ts"),
    "utf8"
  ),
]);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(
  hoverPreview.includes(
    'const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"'
  ) &&
    hoverPreview.includes("const documentVisible = useDocumentVisible()") &&
    hoverPreview.includes(
      "const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)"
    ) &&
    hoverPreview.includes(
      "const playbackAllowed = documentVisible && !reducedMotion"
    ) &&
    hoverPreview.includes("if (!playbackAllowed) return null;") &&
    clientSignals.includes("useSyncExternalStore") &&
    clientSignals.includes("function getMediaStore(query: string)") &&
    clientSignals.includes('entry.media.addEventListener("change", entry.notify)') &&
    clientSignals.includes('document.addEventListener("visibilitychange", notifyVisibility)') &&
    clientSignals.includes("function getDocumentVisibleServerSnapshot()") &&
    clientSignals.includes("return true"),
  "El video de Card debe permanecer desmontado hasta confirmar documento visible y ausencia de reduced-motion mediante señales compartidas y reactivas."
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
      "onCanPlay={(event) => ensurePlayback(event.currentTarget)}"
    ) &&
    !hoverPreview.includes("onCanPlay={unscaled ?") &&
    hoverPreview.includes("playing ? styles.videoReady") &&
    hoverPreview.includes("onPlaying={() => setPlaying(true)}") &&
    hoverPreview.includes("onWaiting={() => setPlaying(false)}") &&
    hoverPreview.includes("onStalled={() => setPlaying(false)}") &&
    hoverPreview.includes("onError={() => setPlaying(false)}"),
  "Toda Card Video debe dar margen al autoplay nativo y reintentar reproducción si el navegador queda pausado; la imagen sólo puede ceder cuando el WebM realmente está avanzando."
);

if (failures.length > 0) {
  console.error("\nCard preview runtime: ERROR\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Card preview runtime: OK (sin video antes de hidratación -> documento visible -> reduced-motion respetado -> retry de autoplay en toda Card Video -> videoReady sólo al reproducir)."
);
