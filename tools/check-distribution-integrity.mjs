import { readFile } from "node:fs/promises";

const files = {
  types: "src/types/game.ts",
  validation:
    "src/lib/admin/content-validation-core.ts",
  managedForms:
    "src/lib/admin/managed-editorial-forms.ts",
  releasesRoute:
    "src/app/api/admin/content/games/[slug]/releases/route.ts",
  releasesEditor:
    "src/components/admin/GameReleasesEditor.tsx",
  updateService:
    "src/lib/admin/game-update-publication-service.ts",
  updateRoute:
    "src/app/api/admin/content/games/[slug]/publish-update/route.ts",
  updatePage:
    "src/app/admin/(protected)/juegos/[slug]/actualizacion/page.tsx",
  resolver:
    "src/lib/games/download.ts",
  publicPage:
    "src/app/juegos/[slug]/descargar/page.tsx",
  changes:
    "src/lib/admin/game-publication-changes.ts",
  readiness:
    "src/lib/admin/game-publication-readiness.ts",
};

const entries = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(
      async ([key, file]) => [
        key,
        await readFile(
          file,
          "utf8"
        ),
      ]
    )
  )
);

const failures = [];

function expect(
  condition,
  message
) {
  if (!condition) {
    failures.push(message);
  }
}

expect(
  entries.types.includes(
    "export type DistributionPackage"
  ) &&
    entries.types.includes(
      "channel?: GameDistributionChannel"
    ) &&
    entries.types.includes(
      "checksumSha256?: string"
    ) &&
    entries.types.includes(
      "packages?: DistributionPackage[]"
    ),
  "Canal y SHA-256 deben pertenecer al paquete de cada release."
);

expect(
  entries.validation.includes(
    "const downloadHrefSchema"
  ) &&
    entries.validation.includes(
      "const distributionPackageSchema"
    ) &&
    entries.validation.includes(
      "distributionChannelSchema"
    ) &&
    entries.validation.includes(
      "checksumSha256"
    ) &&
    entries.validation.includes(
      '/^[a-f0-9]{64}$/'
    ) &&
    entries.validation.includes(
      'url.protocol === "https:"'
    ) &&
    entries.validation.includes(
      "!url.username"
    ) &&
    entries.validation.includes(
      "!url.password"
    ),
  "El payload editorial debe validar formatos, canal, SHA-256 y URLs HTTPS sin credenciales."
);

expect(
  entries.managedForms.includes(
    "integratedReleasePackageFormSchema"
  ) &&
    entries.managedForms.includes(
      "releaseSourcesJson"
    ) &&
    entries.managedForms.includes(
      "Los identificadores de los mirrors deben ser únicos"
    ) &&
    entries.managedForms.includes(
      "Una misma dirección no puede repetirse"
    ),
  "Nueva versión debe validar su paquete y mirrors con un schema propio de releases."
);

expect(
  entries.releasesRoute.includes(
    "validateGameReleaseRelations"
  ) &&
    entries.releasesRoute.includes(
      "saveGameReleasesSection"
    ) &&
    entries.releasesRoute.includes(
      '"releasesJson"'
    ) &&
    entries.releasesEditor.includes(
      "PLATAFORMAS Y DESCARGAS"
    ) &&
    entries.releasesEditor.includes(
      "Agregar paquete"
    ) &&
    entries.releasesEditor.includes(
      "Agregar mirror"
    ) &&
    entries.releasesEditor.includes(
      '{ value: "iso", label: "ISO" }'
    ) &&
    entries.releasesEditor.includes(
      '<option value="maintenance">'
    ),
  "El mantenimiento editorial debe operar sobre releases/paquetes y conservar formatos de consola y estados de mirrors."
);

expect(
  entries.updateService.includes(
    "function buildPackage"
  ) &&
    entries.updateService.includes(
      "input.distributionMetadata"
    ) &&
    entries.updateService.includes(
      "distributionChannel:"
    ) &&
    entries.updateService.includes(
      "checksumConfigured:"
    ) &&
    entries.updateService.includes(
      "FOR UPDATE"
    ) &&
    entries.updateService.includes(
      "versionAlreadyRegistered"
    ) &&
    entries.updateRoute.includes(
      "integratedReleasePackageFormSchema"
    ) &&
    entries.updateRoute.includes(
      '"checksumSha256"'
    ),
  "Nueva versión debe reemplazar versión + paquete + integridad dentro de una transacción controlada."
);

expect(
  entries.updatePage.includes(
    'name="checksumSha256"'
  ) &&
    entries.updatePage.includes(
      'defaultValue=""'
    ) &&
    entries.updatePage.includes(
      "El checksum anterior nunca se hereda"
    ),
  "Una versión nueva no debe heredar silenciosamente el SHA-256 del paquete anterior."
);

expect(
  entries.resolver.includes(
    "resolvePackageDownload"
  ) &&
    entries.resolver.includes(
      "channel: item.channel"
    ) &&
    entries.resolver.includes(
      "item.checksumSha256"
    ) &&
    entries.resolver.includes(
      "game.distributionMetadata?.channel"
    ),
  "El resolver público debe leer integridad desde el paquete y mantener sólo fallback legacy compatible."
);

expect(
  entries.publicPage.includes(
    "distributionChannelLabels"
  ) &&
    entries.publicPage.includes(
      "SHA-256 del paquete publicado"
    ) &&
    entries.publicPage.includes(
      "download.checksumSha256"
    ) &&
    entries.publicPage.includes(
      "download.packageKind"
    ),
  "La página de descarga debe mostrar formato, canal y SHA-256 del paquete seleccionado."
);

expect(
  entries.changes.includes(
    "distributionState("
  ) &&
    entries.changes.includes(
      "resolveGameReleases"
    ) &&
    entries.readiness.includes(
      "downloadablePackages("
    ) &&
    entries.readiness.includes(
      "hasCompleteDistributionIntegrity("
    ) &&
    entries.readiness.includes(
      'section: "descargas"'
    ),
  "Publicación y readiness deben contemplar distribución e integridad desde releases."
);

expect(
  !entries.releasesRoute.includes(
    "fetch("
  ) &&
    !entries.updateRoute.includes(
      "fetch("
    ) &&
    !entries.updateService.includes(
      "fetch("
    ),
  "La integridad editorial no debe verificar mirrors arbitrarios desde el servidor ni abrir una superficie SSRF."
);

if (failures.length > 0) {
  console.error(
    "Distribución e integridad: REGRESIÓN\n"
  );
  failures.forEach(
    (failure) =>
      console.error(
        `- ${failure}`
      )
  );
  process.exit(1);
}

console.log(
  "Distribución e integridad: OK (releases/paquetes canónicos, canal + SHA-256 por paquete, actualización atómica, mirrors seguros y compatibilidad legacy acotada)."
);
