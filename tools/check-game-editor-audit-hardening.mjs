import { readFile } from "node:fs/promises";

const files = Object.fromEntries(
  await Promise.all(
    Object.entries({
      validation: "src/lib/admin/game-editor-section-validation.ts",
      compatibilityEditor: "src/components/admin/GameCompatibilityEditor.tsx",
      healthOverview: "src/components/admin/GameEditorHealthOverview.tsx",
      contextBar: "src/components/admin/AdminContextBar.tsx",
      valuationRoute: "src/app/api/admin/content/games/[slug]/valuation/route.ts",
      valuationEditor: "src/components/admin/GameValuationEditor.tsx",
      sectionService: "src/lib/admin/game-editor-sections-service.ts",
      insights: "src/lib/admin/game-insights.ts",
      notices: "src/components/admin/EditorStateNotice.tsx",
      history: "src/lib/admin/game-history.ts",
      historyPanel: "src/components/admin/GameHistoryPanel.tsx",
    }).map(async ([key, path]) => [key, await readFile(path, "utf8")])
  )
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  files.validation.includes("hasPcRequirements") &&
    files.validation.includes('platformsJson?.includes("PC")') &&
    files.validation.includes("Los requisitos de hardware son específicos de PC"),
  "Compatibilidad debe rechazar requisitos de hardware si PC no está declarada como plataforma."
);
expect(
  files.compatibilityEditor.includes("hasPcRequirements") &&
    files.compatibilityEditor.includes("legacyMismatch") &&
    files.compatibilityEditor.includes('game.platforms?.includes("PC")') &&
    files.compatibilityEditor.includes("borrador histórico") &&
    files.compatibilityEditor.includes("elimina los requisitos"),
  "Compatibilidad debe advertir y permitir corregir snapshots históricos con requisitos PC contradictorios."
);

expect(
  files.healthOverview.includes('href={`/admin/juegos/${encodeURIComponent(slug)}/publicacion`}') &&
    files.healthOverview.includes("readiness.essentialsReady") &&
    files.healthOverview.includes("Bloqueos antes de publicar") &&
    files.healthOverview.includes("Revisar publicación") &&
    files.contextBar.includes('key: "publicacion"') &&
    files.contextBar.includes('label: "Publicación"') &&
    files.contextBar.includes('directGameSection("historial", FileClock)'),
  "El estado global debe enlazar Publicación cuando corresponde y la navegación canónica debe conservar Historial como auditoría separada."
);

expect(
  files.validation.includes('valuationMode: z.enum(["manual", "insight"])'),
  "Valoración debe distinguir explícitamente el modo manual de la sugerencia del Índice."
);
expect(
  files.valuationRoute.includes("getGameInsights") &&
    files.valuationRoute.includes('valuationMode === "insight"') &&
    files.valuationRoute.includes('confidence === "low"') &&
    files.valuationRoute.includes("nextRating = insightRating(insights.index.score)") &&
    files.valuationRoute.includes("insightEvidenceCount") &&
    files.valuationRoute.includes("estado=valoracion-sugerencia"),
  "La sugerencia de Valoración debe recalcularse en servidor, bloquear confianza baja, explicar el rechazo y conservar evidencias en auditoría."
);
expect(
  files.notices.includes('"valoracion-sugerencia"') &&
    files.notices.includes("confianza media/alta") &&
    files.notices.includes("no fue modificada"),
  "Un intento de sugerencia sin confianza suficiente debe volver al editor con una explicación clara y sin afirmar que cambió la valoración."
);
expect(
  files.valuationEditor.includes('name="valuationMode" value="manual"') &&
    files.valuationEditor.includes('name="valuationMode" value="insight"') &&
    files.valuationEditor.includes('name="rating" value=""') &&
    files.valuationEditor.includes("disabled={!suggestionReady}") &&
    files.valuationEditor.includes("al menos 25 evidencias agregadas"),
  "La UI de Valoración no debe enviar una sugerencia confiable desde el navegador ni habilitarla con evidencia baja."
);
expect(
  files.sectionService.includes('valuationSource: "manual" | "insight"') &&
    files.sectionService.includes("insightScore") &&
    files.sectionService.includes("insightConfidence") &&
    files.sectionService.includes("insightEvidenceCount") &&
    files.sectionService.includes("auditDetails"),
  "La revisión de Valoración debe registrar el origen y la evidencia de una sugerencia automática."
);
expect(
  files.insights.includes("evidenceCount >= 250 && ratingCount >= 25") &&
    files.insights.includes("evidenceCount >= 25") &&
    files.insights.includes('return "medium"') &&
    files.insights.includes('return "low"'),
  "El umbral de confianza del Índice debe permanecer explícito y auditable."
);

for (const field of [
  "ageRating",
  "compatibilityMetadata",
  "performanceMetadata",
  "mediaAccessibility",
  "distributionMetadata",
]) {
  expect(
    files.history.includes(`["${field}"`),
    `Historial debe rastrear ${field}.`
  );
}
expect(
  files.history.includes("JSON.stringify(value)") &&
    files.history.includes("Configuración modificada"),
  "Historial debe intentar mostrar cambios complejos reales antes de degradar a un mensaje genérico."
);
expect(
  files.historyPanel.includes('timeZone: "Etc/GMT+3"') &&
    files.historyPanel.includes("UTC−3") &&
    !files.historyPanel.includes('timeZone: "UTC"') &&
    !files.historyPanel.includes("America/Argentina") &&
    !files.historyPanel.includes("Buenos_Aires"),
  "Historial administrativo debe mostrar la zona horaria operativa UTC−3 sin introducir identificadores geográficos prohibidos."
);

if (failures.length > 0) {
  console.error("Auditoría transversal del editor: REGRESIÓN\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  "Auditoría transversal del editor: OK (Compatibilidad coherente, Publicación visible, sugerencias servidor-autoritativas, Historial ampliado y zona horaria operativa protegida)."
);
