export const homeAdminSections = [
  { id: "hero", label: "Editor del Hero" },
  { id: "contenido", label: "Resto de Inicio" },
  { id: "publicacion", label: "Publicación" },
] as const;

export type HomeAdminSection =
  (typeof homeAdminSections)[number]["id"];

export function resolveHomeAdminSection(
  value: string | string[] | undefined
): HomeAdminSection {
  const candidate = Array.isArray(value)
    ? value[0]
    : value;

  return homeAdminSections.some(
    (section) => section.id === candidate
  )
    ? (candidate as HomeAdminSection)
    : "hero";
}
