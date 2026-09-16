import "server-only";

import {
  resolveHomeConfig,
  type HomeCopy,
  type HomeCurationMode,
  type HomeHeroPresentation,
  type HomeSectionConfig,
} from "@/data/home-config";
import {
  mergeHomeCardRevealModes,
} from "@/lib/home/card-row-reveal";

import {
  getEditorialItem,
  saveHomeConfigDraft,
  type EditorialMutationResult,
} from "./content-service";

export type HomeCurationDraftInput = {
  hero: { mode: HomeCurationMode; slugs: string[] };
  popular: { mode: HomeCurationMode; slugs: string[] };
  lowSpec: { mode: HomeCurationMode; slugs: string[] };
  recommended: { mode: HomeCurationMode; slugs: string[] };
};

type HomePresentationCopy = Omit<HomeCopy, "hero"> & {
  hero: Pick<HomeCopy["hero"], "accessibleTitle">;
};

export type HomePresentationDraftInput = {
  sections: HomeSectionConfig[];
  copy: HomePresentationCopy;
};

export type HomeHeroDraftInput = {
  mode: HomeCurationMode;
  slugs: string[];
  presentation: HomeHeroPresentation;
};

async function getResolvedHomeDraft() {
  const item = await getEditorialItem(
    "home_config",
    "home"
  );

  if (!item) return null;

  return {
    item,
    current: resolveHomeConfig(item.payload),
  };
}

function mergeHomePresentationCopy(
  current: HomeCopy,
  input: HomePresentationCopy
): HomeCopy {
  const { hero, ...rest } = input;

  return {
    ...rest,
    hero: {
      ...current.hero,
      accessibleTitle: hero.accessibleTitle,
    },
  };
}

/**
 * Legacy/specialized curation save. The "Resto de Inicio" workspace never
 * owns Hero, so preserve its selection and mode even if an older client sends
 * those fields in the curation payload.
 */
export async function saveHomeCurationDraft(
  expectedRevision: number,
  actorUserId: string,
  input: HomeCurationDraftInput
): Promise<EditorialMutationResult> {
  const resolved = await getResolvedHomeDraft();
  if (!resolved) return { outcome: "not_found" };

  const { current } = resolved;

  return saveHomeConfigDraft(
    expectedRevision,
    actorUserId,
    {
      heroSlugs: current.heroSlugs,
      popularSlugs: input.popular.slugs,
      lowSpecSlugs: input.lowSpec.slugs,
      recommendedSlugs: input.recommended.slugs,
      curation: {
        hero: current.curation.hero,
        popular: { mode: input.popular.mode },
        lowSpec: { mode: input.lowSpec.mode },
        recommended: { mode: input.recommended.mode },
      },
      heroPresentation: current.heroPresentation,
      sections: current.sections,
      copy: current.copy,
    }
  );
}

export async function saveHomePresentationDraft(
  expectedRevision: number,
  actorUserId: string,
  input: HomePresentationDraftInput
): Promise<EditorialMutationResult> {
  const resolved = await getResolvedHomeDraft();
  if (!resolved) return { outcome: "not_found" };

  const { current } = resolved;

  return saveHomeConfigDraft(
    expectedRevision,
    actorUserId,
    {
      heroSlugs: current.heroSlugs,
      popularSlugs: current.popularSlugs,
      lowSpecSlugs: current.lowSpecSlugs,
      recommendedSlugs: current.recommendedSlugs,
      curation: current.curation,
      heroPresentation: current.heroPresentation,
      sections: mergeHomeCardRevealModes(
        current.sections,
        input.sections
      ),
      copy: mergeHomePresentationCopy(
        current.copy,
        input.copy
      ),
    }
  );
}

/**
 * Atomic save for everything owned by "Resto de Inicio". Curated collections,
 * section order/visibility, Card row reveal and copy become one editorial
 * revision, so one local editor cannot invalidate or silently discard another
 * editor's pending state.
 */
export async function saveHomeContentDraft(
  expectedRevision: number,
  actorUserId: string,
  curation: HomeCurationDraftInput,
  presentation: HomePresentationDraftInput
): Promise<EditorialMutationResult> {
  const resolved = await getResolvedHomeDraft();
  if (!resolved) return { outcome: "not_found" };

  const { current } = resolved;

  return saveHomeConfigDraft(
    expectedRevision,
    actorUserId,
    {
      heroSlugs: current.heroSlugs,
      popularSlugs: curation.popular.slugs,
      lowSpecSlugs: curation.lowSpec.slugs,
      recommendedSlugs: curation.recommended.slugs,
      curation: {
        hero: current.curation.hero,
        popular: { mode: curation.popular.mode },
        lowSpec: { mode: curation.lowSpec.mode },
        recommended: { mode: curation.recommended.mode },
      },
      heroPresentation: current.heroPresentation,
      sections: mergeHomeCardRevealModes(
        current.sections,
        presentation.sections
      ),
      copy: mergeHomePresentationCopy(
        current.copy,
        presentation.copy
      ),
    }
  );
}

export async function saveHomeHeroDraft(
  expectedRevision: number,
  actorUserId: string,
  input: HomeHeroDraftInput
): Promise<EditorialMutationResult> {
  const resolved = await getResolvedHomeDraft();
  if (!resolved) return { outcome: "not_found" };

  const { current } = resolved;

  return saveHomeConfigDraft(
    expectedRevision,
    actorUserId,
    {
      heroSlugs: input.slugs,
      popularSlugs: current.popularSlugs,
      lowSpecSlugs: current.lowSpecSlugs,
      recommendedSlugs: current.recommendedSlugs,
      curation: {
        ...current.curation,
        hero: { mode: input.mode },
      },
      heroPresentation: input.presentation,
      sections: current.sections,
      copy: current.copy,
    }
  );
}
