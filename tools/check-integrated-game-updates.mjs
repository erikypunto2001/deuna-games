import { access, readFile } from "node:fs/promises";

const files = {
  navigation: "src/components/admin/AdminNavigation.tsx",
  contextBar: "src/components/admin/AdminContextBar.tsx",
  catalog: "src/components/admin/AdminGamesCatalog.tsx",
  workspace:
    "src/app/admin/(protected)/juegos/[slug]/actualizacion/page.tsx",
  route:
    "src/app/api/admin/content/games/[slug]/publish-update/route.ts",
  gameInformationRoute:
    "src/app/api/admin/content/games/[slug]/information/route.ts",
  gameDownloadRoute:
    "src/app/api/admin/content/games/[slug]/download/route.ts",
  notices: "src/components/admin/EditorStateNotice.tsx",
  service:
    "src/lib/admin/game-update-publication-service.ts",
  legacyIndex:
    "src/app/admin/(protected)/actualizaciones/page.tsx",
  legacyCreate:
    "src/app/admin/(protected)/actualizaciones/nueva/page.tsx",
  legacyEditor:
    "src/app/admin/(protected)/actualizaciones/[id]/page.tsx",
  publicUpdates: "src/lib/updates/public-updates.ts",
  publicGame: "src/app/juegos/[slug]/page.tsx",
  sourceUpdates: "src/data/update-records.ts",
  demoRetirement:
    "database/migrations/014_retire_demo_game_updates.sql",
  historicalFixture:
    "tools/admin-historical-update-visual-fixture.ts",
  browserManifest:
    "tools/browser-page-manifest.mjs",
  sitewideSmoke:
    "tools/sitewide-browser-smoke.mjs",
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const legacyCreateApi =
  "src/app/api/admin/content/updates/route.ts";
const legacyCreateApiPresent = await exists(legacyCreateApi);

const entries = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(path, "utf8"),
    ])
  )
);

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(
  !entries.navigation.includes('href: "/admin/actualizaciones"'),
  "Actualizaciones no debe seguir como módulo principal del menú administrativo."
);
expect(
  entries.contextBar.includes('key: "distribucion"') &&
    entries.contextBar.includes('key: "actualizacion"') &&
    entries.contextBar.includes('label: "Nueva versión"') &&
    entries.contextBar.includes("/actualizacion") &&
    entries.contextBar.includes("publicacion|actualizacion"),
  "Nueva versión debe formar parte real de Distribución en la navegación contextual del juego."
);
expect(
  entries.catalog.includes("/actualizacion") &&
    entries.catalog.includes("Nueva versión"),
  "El catálogo de juegos debe ofrecer la acción Nueva versión por juego publicado."
);
expect(
  entries.workspace.includes("Publicar nueva versión") &&
    entries.workspace.includes("GameDownloadEditor") &&
    entries.workspace.includes("expectedRevision") &&
    entries.workspace.includes("getPublicGameBySlug") &&
    entries.workspace.includes('name="channel"') &&
    entries.workspace.includes('name="checksumSha256"') &&
    entries.workspace.includes("El checksum anterior nunca se hereda"),
  "El espacio de nueva versión debe integrar versión, descargas, integridad del paquete, control de revisión y mostrar la referencia realmente pública."
);
expect(
  entries.route.includes("publishIntegratedGameUpdate") &&
    entries.route.includes("revalidatePublicGameSurfaces") &&
    entries.route.includes("hasExactAdminFormFields") &&
    entries.route.includes("evaluateGamePublicationReadiness") &&
    entries.route.includes("inspectGameMediaIntegrity") &&
    entries.route.includes('"channel"') &&
    entries.route.includes('"checksumSha256"'),
  "La ruta unificada debe usar publicación atómica, revalidación, requisitos multimedia, integridad física/del paquete y protección exacta del formulario."
);
expect(
  entries.gameInformationRoute.includes("getGamePublicationIdentity") &&
    entries.gameInformationRoute.includes("publicationIdentity?.everPublished") &&
    entries.gameInformationRoute.includes("item.payload.version"),
  "Información debe preservar la versión de cualquier juego ya publicado para impedir cambios de versión fuera de Nueva versión."
);
expect(
  entries.gameDownloadRoute.includes("saveGameDownloadDraft") &&
    !entries.gameDownloadRoute.includes("descargas-por-actualizacion") &&
    entries.notices.includes("mantenimiento de mirrors"),
  "Descargas debe seguir disponible para mantenimiento operativo de mirrors sin obligar a inventar una versión nueva."
);
expect(
  entries.service.includes("withAdminTransaction") &&
    entries.service.includes("FOR UPDATE") &&
    entries.service.includes('outcome: "pending_changes"') &&
    entries.service.includes('outcome: "not_ready"') &&
    entries.service.includes("evaluateGamePublicationReadiness") &&
    entries.service.includes('outcome: "same_version"') &&
    entries.service.includes("resolveGameDownload") &&
    entries.service.includes("normalizeVersionToken") &&
    entries.service.includes("versionAlreadyRegistered") &&
    entries.service.includes("buildDistributionMetadata") &&
    entries.service.includes("distributionMetadata: nextDownload") &&
    entries.service.includes('"game_update"'),
  "La publicación integrada debe bloquear concurrencia, cambios pendientes, multimedia incompleta, versiones equivalentes/históricas y publicar juego + paquete íntegro + aviso en una transacción."
);
expect(
  entries.legacyIndex.includes('redirect("/admin/juegos")') &&
    entries.legacyCreate.includes('redirect("/admin/juegos")') &&
    !legacyCreateApiPresent,
  "Los flujos globales antiguos deben redirigir a Juegos y el servidor no debe conservar un endpoint paralelo para crear updates fuera de Nueva versión."
);
expect(
  entries.legacyEditor.includes("publicationState?.publicVisible") &&
    entries.legacyEditor.includes("!publicationState.hasUnpublishedChanges") &&
    entries.legacyEditor.includes("/actualizacion"),
  "El editor antiguo sólo debe quedar como compatibilidad para borradores históricos no resueltos."
);
expect(
  entries.historicalFixture.includes(
    "DEUNA_ADMIN_HISTORICAL_UPDATE_FIXTURE"
  ) &&
    entries.historicalFixture.includes(
      'const updateId = "visual-historical-update"'
    ) &&
    entries.historicalFixture.includes("public_visible") &&
    entries.historicalFixture.includes("false") &&
    entries.browserManifest.includes(
      'representativeUpdateId = "visual-historical-update"'
    ) &&
    entries.browserManifest.includes("historical-update-edit") &&
    entries.browserManifest.includes("historical-update-publication") &&
    entries.browserManifest.includes("historical-update-history") &&
    !entries.sitewideSmoke.includes("src/data/update-records.ts") &&
    !entries.sitewideSmoke.includes("fixture.updateIds"),
  "La compatibilidad histórica debe probarse con un borrador privado efímero real en editar/publicación/historial, sin depender de fixtures demo retirados."
);
expect(
  entries.publicUpdates.includes("getPublicResolvedUpdates") &&
    entries.publicGame.includes("getPublicUpdatesForGame"),
  "La página pública de Actualizaciones y el historial del juego deben conservarse."
);

const retiredDemoIds = [
  "elden-ring-v1-10-1",
  "palworld-v0-3-2",
  "stellar-blade-v1-3-1",
  "enshrouded-v0-8-5",
  "helldivers-2-v1-000-302",
  "talos-principle-2-v1-2-0",
  "god-of-war-ragnarok-v1-5-3",
];

expect(
  /export const gameUpdates: GameUpdate\[\] = \[\s*\];/.test(
    entries.sourceUpdates
  ),
  "El fixture bundled no debe volver a publicar actualizaciones de demostración como si fueran datos reales."
);
expect(
  retiredDemoIds.every((id) =>
    entries.demoRetirement.includes(`'${id}'`)
  ) &&
    entries.demoRetirement.includes("public_visible = false") &&
    entries.demoRetirement.includes("published_checksum = source_checksum") &&
    entries.demoRetirement.includes("published_payload = source_payload") &&
    !/\bDELETE\s+FROM\b/i.test(entries.demoRetirement),
  "La migración debe retirar las siete publicaciones demo sólo cuando siguen idénticas a su fuente original, sin borrar historial ni tocar versiones editoriales modificadas."
);

if (failures.length > 0) {
  console.error("Actualizaciones integradas: REGRESIÓN\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "Actualizaciones integradas: OK (publicación atómica real, fixtures demo retirados sin borrar historial, mantenimiento de mirrors separado y navegación administrativa coherente)."
);
