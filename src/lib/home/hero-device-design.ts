import type {
  HomeHeroBasePresentation,
  HomeHeroDevice,
  HomeHeroPresentation,
} from "@/data/home-config";

const HERO_DEVICES = ["desktop", "tablet", "mobile"] as const;
type HeroResponsivePatch = Partial<
  Record<HomeHeroDevice, Record<string, unknown>>
>;

function heroBasePresentation(
  presentation: HomeHeroPresentation
): HomeHeroBasePresentation {
  const { deviceOverrides: _overrides, ...base } = presentation;
  void _overrides;
  return base;
}

/**
 * A device override owns the visual design used by that device, but the other
 * responsive slots inside the stored snapshot are only historical copies from
 * the moment the override was created. Resolve those cross-device slots from
 * their effective owners so editor operations never read stale baseline data.
 *
 * `motionStyle` is intentionally global. A device snapshot may customize
 * geometry, but the movement language belongs to the Hero revision as a whole.
 */
export function resolveHeroDeviceDesign(
  presentation: HomeHeroPresentation,
  device: HomeHeroDevice
): HomeHeroBasePresentation {
  const base = heroBasePresentation(presentation);
  const selected = presentation.deviceOverrides?.[device] ?? base;

  return {
    ...selected,
    motionStyle: base.motionStyle,
    responsive: {
      desktop:
        presentation.deviceOverrides?.desktop?.responsive.desktop ??
        base.responsive.desktop,
      tablet:
        presentation.deviceOverrides?.tablet?.responsive.tablet ??
        base.responsive.tablet,
      mobile:
        presentation.deviceOverrides?.mobile?.responsive.mobile ??
        base.responsive.mobile,
    },
    navigation: {
      ...selected.navigation,
      responsive: {
        desktop:
          presentation.deviceOverrides?.desktop?.navigation.responsive.desktop ??
          base.navigation.responsive.desktop,
        tablet:
          presentation.deviceOverrides?.tablet?.navigation.responsive.tablet ??
          base.navigation.responsive.tablet,
        mobile:
          presentation.deviceOverrides?.mobile?.navigation.responsive.mobile ??
          base.navigation.responsive.mobile,
      },
    },
  };
}

export function updateHeroDeviceDesign(
  presentation: HomeHeroPresentation,
  scope: HomeHeroDevice | "all",
  update: (design: HomeHeroBasePresentation) => HomeHeroPresentation,
  sourceDevice: HomeHeroDevice = "desktop"
): HomeHeroPresentation {
  const base = resolveHeroDeviceDesign(
    { ...presentation, deviceOverrides: undefined },
    "desktop"
  );
  const sharedChanges: Partial<
    Record<"responsive" | "navigation", Record<string, unknown>>
  > = {};
  const sourceDeviceChanges: Partial<
    Record<"responsive" | "navigation", HeroResponsivePatch>
  > = {};

  if (scope === "all") {
    const source = resolveHeroDeviceDesign(presentation, sourceDevice);
    const updated = update(structuredClone(source));

    for (const key of ["responsive", "navigation"] as const) {
      const before =
        key === "responsive"
          ? source.responsive
          : source.navigation.responsive;
      const after =
        key === "responsive"
          ? updated.responsive
          : updated.navigation.responsive;
      const patches: HeroResponsivePatch = {};

      for (const device of HERO_DEVICES) {
        const patch = Object.fromEntries(
          Object.entries(after[device]).filter(
            ([field, value]) =>
              JSON.stringify(value) !==
              JSON.stringify(
                (before[device] as unknown as Record<string, unknown>)[field]
              )
          )
        );
        if (Object.keys(patch).length > 0) {
          patches[device] = patch;
        }
      }

      if (Object.keys(patches).length > 0) {
        sourceDeviceChanges[key] = patches;
      }

      const changed = HERO_DEVICES.filter((device) => patches[device]);
      if (changed.length === 1 && changed[0] === sourceDevice) {
        sharedChanges[key] = patches[sourceDevice];
      }
    }
  }

  const cleanUpdate = (design: HomeHeroBasePresentation) => {
    const result = update(structuredClone(design));
    const clean = resolveHeroDeviceDesign(
      { ...result, deviceOverrides: undefined },
      "desktop"
    );

    if (scope === "all") {
      for (const key of ["responsive", "navigation"] as const) {
        const after =
          key === "responsive"
            ? clean.responsive
            : clean.navigation.responsive;
        const patches = sourceDeviceChanges[key];

        if (patches) {
          for (const device of HERO_DEVICES) {
            const patch = patches[device];
            if (patch) {
              Object.assign(after[device], structuredClone(patch));
            }
          }
        }

        if (sharedChanges[key]) {
          for (const device of HERO_DEVICES) {
            Object.assign(
              after[device],
              structuredClone(sharedChanges[key])
            );
          }
        }
      }
    }

    return clean;
  };

  if (scope !== "all") {
    return {
      ...presentation,
      deviceOverrides: {
        ...presentation.deviceOverrides,
        [scope]: cleanUpdate(resolveHeroDeviceDesign(presentation, scope)),
      },
    };
  }

  const next: HomeHeroPresentation = cleanUpdate(base);
  if (presentation.deviceOverrides) {
    next.deviceOverrides = {};
    for (const device of HERO_DEVICES) {
      if (presentation.deviceOverrides[device]) {
        next.deviceOverrides[device] = cleanUpdate(
          resolveHeroDeviceDesign(presentation, device)
        );
      }
    }
  }
  return next;
}
