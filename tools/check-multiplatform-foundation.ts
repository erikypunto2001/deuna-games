import {
  sourcePlatformCatalog,
} from "../src/data/platform-catalog.ts";
import {
  groupCollectionPlatforms,
  orderCollectionGames,
} from "../src/lib/collections/collection-presentation.ts";
import { games } from "../src/data/games.ts";
import {
  parseEditorialPayload,
} from "../src/lib/admin/content-validation.ts";
import {
  gamePlatformIds,
  resolveGameReleases,
  resolvePcRelease,
} from "../src/lib/games/releases.ts";
import {
  orderPublicSoftware,
} from "../src/lib/software/software-presentation.ts";

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const catalog =
  parseEditorialPayload(
    "platform_catalog",
    sourcePlatformCatalog
  );

assert(
  catalog.platforms.some(
    (platform) =>
      platform.id ===
      "pc-windows"
  ),
  "El catálogo debe conservar PC / Windows."
);

for (const game of games) {
  const releases =
    resolveGameReleases(
      game
    );
  const pc =
    resolvePcRelease(game);

  assert(
    releases.length >= 1,
    game.slug +
      ": el contenido legacy debe resolver al menos un release."
  );
  assert(
    pc?.platformId ===
      "pc-windows",
    game.slug +
      ": el juego PC fuente debe migrar en lectura a pc-windows."
  );
  assert(
    gamePlatformIds(
      game
    ).includes(
      "pc-windows"
    ),
    game.slug +
      ": la plataforma resuelta debe incluir PC."
  );
  assert(
    pc.requirements !==
      undefined,
    game.slug +
      ": los requisitos PC deben conservarse dentro del release resuelto."
  );
}

const sampleGame =
  parseEditorialPayload(
    "game",
    {
      id:
        "sample-multiplatform",
      slug:
        "sample-multiplatform",
      title:
        "Sample Multiplatform",
      description:
        "Fixture de validación.",
      category:
        "Acción",
      imageAlt:
        "Portada de ejemplo",
      releases: [
        {
          id: "pc",
          platformId:
            "pc-windows",
          version: "1.0",
          requirements: {
            minimum: {
              system:
                "Windows",
            },
          },
          packages: [
            {
              id:
                "pc-main",
              kind:
                "installer",
              sources: [
                {
                  id:
                    "mirror",
                  name:
                    "Mirror",
                  href:
                    "https://example.com/pc",
                },
              ],
            },
          ],
        },
        {
          id: "ps2",
          platformId: "ps2",
          packages: [
            {
              id: "disc",
              kind: "iso",
              sources: [
                {
                  id:
                    "mirror",
                  name:
                    "Mirror",
                  href:
                    "https://example.com/ps2",
                },
              ],
            },
          ],
          recommendedSoftwareSlugs: [
            "pcsx2",
          ],
        },
      ],
    }
  );

assert(
  sampleGame.releases?.[1]
    ?.packages?.[0]
    ?.kind === "iso",
  "El schema debe conservar paquetes ISO por release."
);

const software =
  parseEditorialPayload(
    "software",
    {
      id: "pcsx2",
      slug: "pcsx2",
      name: "PCSX2",
      description:
        "Fixture de emulador.",
      kind: "emulator",
      runsOnPlatformIds: [
        "pc-windows",
      ],
      emulatesPlatformIds: [
        "ps2",
      ],
    }
  );

assert(
  software
    .emulatesPlatformIds
    ?.includes("ps2"),
  "Software debe poder declarar plataformas emuladas."
);

const collection =
  parseEditorialPayload(
    "game_collection",
    {
      id:
        "mortal-kombat",
      slug:
        "mortal-kombat",
      title:
        "Mortal Kombat",
      description:
        "Fixture de colección.",
      gameSlugs: [
        "sample-multiplatform",
      ],
    }
  );

assert(
  collection.gameSlugs
    .length === 1,
  "Las colecciones deben conservar sus juegos."
);

console.log(
  "Fundación multiplataforma: OK (" +
    games.length +
    " juegos legacy -> PC, " +
    catalog.platforms.length +
    " plataformas base, releases/ISO/software/colecciones validados)."
);

const orderedCollectionGames =
  orderCollectionGames(
    [
      games[0],
      games[1],
      games[2],
    ],
    [
      games[2].slug,
      games[0].slug,
      "missing-game",
      games[1].slug,
    ]
  );

assert(
  orderedCollectionGames
    .map((game) => game.slug)
    .join("|") ===
    [
      games[2].slug,
      games[0].slug,
      games[1].slug,
    ].join("|"),
  "Las colecciones editoriales deben respetar gameSlugs y omitir referencias no públicas sin reordenar."
);

const platformGroups =
  groupCollectionPlatforms(
    catalog,
    new Map([
      ["pc-windows", 3],
      ["ps4", 2],
      ["ps5", 1],
    ])
  );

assert(
  platformGroups.some(
    (group) =>
      group.family.id ===
        "pc" &&
      group.platforms.some(
        (platform) =>
          platform.id ===
          "pc-windows"
      )
  ) &&
    platformGroups.some(
      (group) =>
        group.family.id ===
          "playstation" &&
        group.platforms
          .map(
            (platform) =>
              platform.id
          )
          .join("|") ===
          "ps4|ps5"
    ),
  "Las colecciones automáticas deben agruparse por familias activas y respetar el orden del catálogo."
);

const orderedSoftware =
  orderPublicSoftware([
    {
      ...software,
      id: "alpha",
      slug: "alpha",
      name: "Alpha",
      featured: false,
    },
    {
      ...software,
      id: "zeta",
      slug: "zeta",
      name: "Zeta",
      featured: true,
    },
    {
      ...software,
      id: "beta",
      slug: "beta",
      name: "Beta",
      featured: false,
    },
  ]);

assert(
  orderedSoftware
    .map((item) => item.slug)
    .join("|") ===
    "zeta|alpha|beta",
  "Programas destacados deben aparecer primero y el resto conservar orden alfabético."
);
