import type {
  PlatformCatalog,
} from "@/types/platform";

export const PLATFORM_CATALOG_EDITORIAL_KEY =
  "platforms";

export const sourcePlatformCatalog: PlatformCatalog = {
  families: [
    { id: "pc", name: "PC", order: 10, active: true },
    { id: "playstation", name: "PlayStation", order: 20, active: true },
    { id: "xbox", name: "Xbox", order: 30, active: true },
    { id: "nintendo", name: "Nintendo", order: 40, active: true },
    { id: "sega", name: "Sega", order: 50, active: true },
  ],
  platforms: [
    { id: "pc-windows", familyId: "pc", name: "PC / Windows", shortName: "PC", kind: "pc", order: 10, active: true },
    { id: "ps1", familyId: "playstation", name: "PlayStation", shortName: "PS1", kind: "console", order: 10, active: true },
    { id: "ps2", familyId: "playstation", name: "PlayStation 2", shortName: "PS2", kind: "console", order: 20, active: true },
    { id: "ps3", familyId: "playstation", name: "PlayStation 3", shortName: "PS3", kind: "console", order: 30, active: true },
    { id: "ps4", familyId: "playstation", name: "PlayStation 4", shortName: "PS4", kind: "console", order: 40, active: true },
    { id: "ps5", familyId: "playstation", name: "PlayStation 5", shortName: "PS5", kind: "console", order: 50, active: true },
    { id: "psp", familyId: "playstation", name: "PlayStation Portable", shortName: "PSP", kind: "handheld", order: 60, active: true },
    { id: "ps-vita", familyId: "playstation", name: "PlayStation Vita", shortName: "PS Vita", kind: "handheld", order: 70, active: true },
    { id: "xbox", familyId: "xbox", name: "Xbox", kind: "console", order: 10, active: true },
    { id: "xbox-360", familyId: "xbox", name: "Xbox 360", kind: "console", order: 20, active: true },
    { id: "xbox-one", familyId: "xbox", name: "Xbox One", kind: "console", order: 30, active: true },
    { id: "xbox-series", familyId: "xbox", name: "Xbox Series X|S", shortName: "Xbox Series", kind: "console", order: 40, active: true },
    { id: "gamecube", familyId: "nintendo", name: "Nintendo GameCube", shortName: "GameCube", kind: "console", order: 10, active: true },
    { id: "wii", familyId: "nintendo", name: "Nintendo Wii", shortName: "Wii", kind: "console", order: 20, active: true },
    { id: "wii-u", familyId: "nintendo", name: "Nintendo Wii U", shortName: "Wii U", kind: "console", order: 30, active: true },
    { id: "switch", familyId: "nintendo", name: "Nintendo Switch", shortName: "Switch", kind: "handheld", order: 40, active: true },
    { id: "dreamcast", familyId: "sega", name: "Sega Dreamcast", shortName: "Dreamcast", kind: "console", order: 10, active: true },
  ],
};
