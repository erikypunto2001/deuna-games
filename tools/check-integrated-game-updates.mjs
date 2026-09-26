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
  gameReleasesRoute:
    "src/app/api/admin/content/games/[slug]/releases/route.ts",
  releasesEditor:
    "src/components/admin/GameReleasesEditor.tsx",
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
  accountNotificationsRunner:
    "tools/account-notifications-browser-e2e-runner.mjs",
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
  /Publicar\s+nueva\s+versión/.test(entries.workspace) &&
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
  entries.gameReleasesRoute.includes("saveGameReleasesSection") &&
    entries.gameReleasesRoute.includes("validateGameReleaseRelations") &&
    entries.releasesEditor.includes("Guardar plataformas y descargas") &&
    entries.releasesEditor.includes('"maintenance"') &&
    entries.releasesEditor.includes("Agregar mirror") &&
    entries.notices.includes("mantenimiento de mirrors"),
  "Plataformas y descargas debe permitir mantenimiento operativo de paquetes/mirrors como borrador, sin obligar a inventar una versión nueva."
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
    entries.service.includes("buildPackage") &&
    entries.service.includes("nextPackage") &&
    entries.service.includes("nextReleases") &&
    entries.service.includes("releaseId:") &&
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
      'const historicalUpdateId = "visual-historical-update"'
    ) &&
    entries.historicalFixture.includes("createVisualUpdateDraft") &&
    entries.historicalFixture.includes("public_visible") &&
    entries.historicalFixture.includes("false") &&
    entries.browserManifest.includes(
      'representativeUpdateId = "visual-historical-update"'
    ) &&
    entries.browserManifest.includes("historical-update-edit") &&
    entries.browserManifest.includes("historical-update-publication") &&
    !entries.browserManifest.includes("historical-update-history") &&
    entries.legacyEditor.includes('"editar"') &&
    entries.legacyEditor.includes('"publicacion"') &&
    !entries.legacyEditor.includes('"historial"') &&
    !entries.sitewideSmoke.includes("src/data/update-records.ts") &&
    !entries.sitewideSmoke.includes("fixture.updateIds"),
  "La compatibilidad con borradores antiguos debe probarse con un borrador privado efímero real en editar/publicación, sin reintroducir una sección de historial restaurable ni depender de fixtures demo retirados."
);
expect(
  entries.accountNotificationsRunner.includes(
    "createVisualUpdateDraft"
  ) &&
    entries.accountNotificationsRunner.includes(
      "/api/admin/content/updates/${encodeURIComponent(updateId)}/publish"
    ) &&
    entries.accountNotificationsRunner.includes(
      "/api/admin/content/updates/${encodeURIComponent(updateId)}/hide"
    ) &&
    !entries.accountNotificationsRunner.includes(
      '"/api/admin/content/updates"'
    ),
  "El E2E de avisos debe sembrar su borrador sólo en la DB efímera y probar publicación/ocultamiento reales sin reabrir el alta global legacy."
);
expect(
  entries.publicUpdates.includes("getPublicResolvedUpdates") &&
    entries.publicUpdates.includes("FROM deuna_admin.editorial_items") &&
    entries.publicUpdates.includes("WHERE item_type = 'game_update'") &&
    !entries.publicUpdates.includes("editorial_revisions") &&
    !entries.publicUpdates.includes("editorial_publications") &&
    entries.publicGame.includes("getPublicUpdatesForGame"),
  "Las actualizaciones públicas y las versiones por juego deben salir del estado editorial vigente sin depender de tablas de historial retiradas."
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
  "Actualizaciones integradas: OK (publicación atómica real, estado current-only sin historial restaurable, mantenimiento de mirrors separado y navegación administrativa coherente)."
);
