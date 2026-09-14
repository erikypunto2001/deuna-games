import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [editor, livePreview, adminPage, rankingReference] = await Promise.all([
  readFile(
    new URL("../src/components/admin/HomeHeroEditor.tsx", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/components/admin/HomeHeroLivePreview.tsx", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/app/admin/(protected)/portada/page.tsx", import.meta.url),
    "utf8"
  ),
  readFile(
    new URL("../src/lib/home/server-ranking-reference.ts", import.meta.url),
    "utf8"
  ),
]);

assert.match(
  adminPage,
  /const rankingReferenceTime = getHomeRankingReferenceTime\(\);/,
  "The Hero Admin server boundary must capture one ranking reference time outside React render purity."
);
assert.doesNotMatch(
  adminPage,
  /Date\.now\(\)/,
  "The React Server Component itself must stay free of wall-clock reads."
);
assert.match(
  adminPage,
  /rankingReferenceTime=\{rankingReferenceTime\}/,
  "The server-captured ranking reference must be serialized into HomeHeroEditor."
);
assert.match(
  rankingReference,
  /import "server-only";/,
  "The ranking clock boundary must remain server-only."
);
assert.match(
  rankingReference,
  /return homeRankingDay\(Date\.now\(\)\);/,
  "The server reference must match the UTC-day granularity used by Home ranking."
);
assert.match(
  editor,
  /rankingReferenceTime:\s*number;/,
  "HomeHeroEditor must model the server ranking reference as an explicit prop."
);
assert.match(
  editor,
  /const rankingNow = rankingReferenceTime;/,
  "Hero ranking must reuse the serialized server reference on the first client render."
);
assert.doesNotMatch(
  editor,
  /useState\(\(\) => Date\.now\(\)\)/,
  "Hero Admin ranking must not recompute wall-clock time during client hydration."
);

assert.match(
  editor,
  /const updateAspectControls = \(nextControl: AspectControl\) => \{\s*if \(comparing\) \{\s*setCompare\(false\);\s*return;\s*\}[\s\S]*?setAspectControls\(/,
  "Compare mode must reject aspect helper mutations before aspectControls can change."
);

assert.doesNotMatch(
  livePreview,
  /const wasPlaying = useRef\(false\);/,
  "Hero preview must not gate all future demonstrations behind one session-wide boolean."
);
assert.match(
  livePreview,
  /const lastPlaybackKey = useRef<string \| null>\(null\);/,
  "Hero preview must track the last demonstrated playback context explicitly."
);
assert.match(
  livePreview,
  /const playbackKey = `\$\{device\}:\$\{presentation\.motionStyle\}:\$\{games\.map\(\(game\) => game\.id\)\.join\(","\)\}`;/,
  "Hero preview playback context must change with device, movement profile and visible games."
);
assert.match(
  livePreview,
  /if \(!previewEnd \|\| lastPlaybackKey\.current === playbackKey\) return;/,
  "Hero preview must replay when the active playback context changes while test mode stays open."
);
assert.match(
  livePreview,
  /lastPlaybackKey\.current = null;/,
  "Leaving test mode must rearm the next Hero demonstration."
);

console.log(
  "Hero Admin state: OK (compare mode read-only, stable ranking hydration and context-aware preview replay)."
);
