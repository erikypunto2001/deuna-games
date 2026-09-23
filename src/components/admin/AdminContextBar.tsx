"use client";

import Link from "next/link";
import {
  ChevronDown,
  Download,
  FileClock,
  Gauge,
  History,
  ImageIcon,
  ListTree,
  MonitorCog,
  Palette,
  PanelTop,
  RefreshCcw,
  Rocket,
  SquarePen,
  Star,
  Tags,
  UserRound,
} from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  getGameEditorSection,
} from "@/lib/admin/game-editor-sections";
import {
  homeAdminSections as homeAdminSectionContract,
  resolveHomeAdminSection,
} from "@/lib/admin/home-admin-sections";

import ia from "./AdminInformationArchitecture.module.css";
import ux from "./AdminShellUx.module.css";

const updateSections = [
  { id: "editar", label: "Editar", icon: SquarePen },
  { id: "publicacion", label: "Publicación", icon: Rocket },
  { id: "historial", label: "Historial", icon: FileClock },
] as const;

const catalogSections = [
  { id: "clasificaciones", label: "Clasificaciones", icon: ListTree },
  { id: "etiquetas", label: "Etiquetas", icon: Tags },
  { id: "publicacion", label: "Publicación", icon: Rocket },
  { id: "historial", label: "Historial", icon: FileClock },
] as const;

const homeSections = homeAdminSectionContract.map((section) => ({
  ...section,
  icon:
    section.id === "hero"
      ? PanelTop
      : section.id === "contenido"
        ? SquarePen
        : section.id === "publicacion"
          ? Rocket
          : FileClock,
}));

const publicPageSections = [
  { id: "juegos", label: "Juegos", icon: PanelTop },
  { id: "actualizaciones", label: "Actualizaciones", icon: SquarePen },
  { id: "compatibilidad", label: "¿Qué puedo jugar?", icon: MonitorCog },
  { id: "publicacion", label: "Publicación", icon: Rocket },
  { id: "historial", label: "Historial", icon: FileClock },
] as const;

const configurationSections = [
  { id: "identidad", label: "Identidad", icon: UserRound },
  { id: "apariencia", label: "Apariencia", icon: Palette },
  { id: "publicacion", label: "Publicación", icon: Rocket },
  { id: "historial", label: "Historial", icon: History },
] as const;

const aboutSections = [
  { id: "encabezado", label: "Encabezado", icon: PanelTop },
  { id: "principios", label: "Principios", icon: ListTree },
  { id: "proposito", label: "Propósito", icon: SquarePen },
  { id: "cierre", label: "Cierre", icon: FileClock },
  { id: "publicacion", label: "Publicación", icon: Rocket },
  { id: "historial", label: "Historial", icon: History },
] as const;

type ContextIcon = typeof PanelTop;

type ContextChild = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  icon?: ContextIcon;
};

type ContextItem = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  icon: ContextIcon;
  children?: ContextChild[];
};

function ContextNavigator({
  label,
  items,
}: {
  label: string;
  items: ContextItem[];
}) {
  const activeItem = items.find((item) => item.active) ?? items[0];
  const activeChild = activeItem?.children?.find((item) => item.active);
  const mobileLabel = activeChild
    ? `${activeItem.label} · ${activeChild.label}`
    : activeItem?.label ?? "Secciones";
  const ActiveIcon = activeItem?.icon ?? PanelTop;

  return (
    <div className={ia.contextShell}>
      <div className={ia.contextDesktop}>
        <nav
          className={`${ux.contextBar} ${ia.contextPrimary}`}
          aria-label={label}
        >
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.key}
                href={item.href}
                className={item.active ? ux.contextActive : undefined}
                aria-current={item.active ? "page" : undefined}
              >
                <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {activeItem?.children && activeItem.children.length > 1 && (
          <nav
            className={ia.contextSecondary}
            aria-label={`Opciones de ${activeItem.label}`}
          >
            {activeItem.children.map((child) => {
              const Icon = child.icon;

              return (
                <Link
                  key={child.key}
                  href={child.href}
                  className={child.active ? ia.contextSecondaryActive : undefined}
                  aria-current={child.active ? "page" : undefined}
                >
                  {Icon && <Icon size={14} aria-hidden="true" />}
                  {child.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      <details className={ia.contextMobile} key={mobileLabel}>
        <summary>
          <ActiveIcon size={17} aria-hidden="true" />
          <span>{mobileLabel}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>

        <div className={ia.contextMobilePanel}>
          {items.map((item) => {
            const Icon = item.icon;

            if (item.children && item.children.length > 1) {
              return (
                <div className={ia.contextMobileGroup} key={item.key}>
                  <span>{item.label.toUpperCase()}</span>
                  <div className={ia.contextMobileSub}>
                    {item.children.map((child) => {
                      const ChildIcon = child.icon;

                      return (
                        <Link
                          key={child.key}
                          href={child.href}
                          data-active={child.active ? "true" : "false"}
                          aria-current={child.active ? "page" : undefined}
                        >
                          {ChildIcon && <ChildIcon size={15} aria-hidden="true" />}
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                data-active={item.active ? "true" : "false"}
                aria-current={item.active ? "page" : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function simpleItems(
  pathname: string,
  selected: string,
  sections: readonly {
    id: string;
    label: string;
    icon: ContextIcon;
  }[]
): ContextItem[] {
  return sections.map((section) => ({
    key: section.id,
    label: section.label,
    href: `${pathname}?seccion=${section.id}`,
    active: selected === section.id,
    icon: section.icon,
  }));
}

export default function AdminContextBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gameMatch =
    /^\/admin\/juegos\/([^/]+)(?:\/(publicacion|actualizacion))?$/.exec(
      pathname
    );
  const updateMatch = /^\/admin\/actualizaciones\/([^/]+)$/.exec(pathname);

  if (gameMatch && gameMatch[1] !== "nuevo") {
    const gamePath = `/admin/juegos/${gameMatch[1]}`;
    const routeSection = gameMatch[2];
    const selected = routeSection
      ? routeSection
      : searchParams.get("seccion") ?? "ficha";
    const directGameSection = (
      id: "ficha" | "datos" | "multimedia" | "valoracion",
      icon: ContextIcon
    ): ContextItem => {
      const definition = getGameEditorSection(id);

      return {
        key: id,
        label: definition.label,
        href: `${gamePath}?seccion=${id}`,
        active: selected === id,
        icon,
      };
    };
    const requirements = getGameEditorSection("requisitos");
    const performance = getGameEditorSection("rendimiento");
    const distribution = getGameEditorSection("descargas");
    const gameItems: ContextItem[] = [
      directGameSection("ficha", PanelTop),
      directGameSection("datos", Tags),
      {
        key: "compatibilidad",
        label: "Compatibilidad",
        href: `${gamePath}?seccion=requisitos`,
        active: selected === "requisitos" || selected === "rendimiento",
        icon: MonitorCog,
        children: [
          {
            key: requirements.id,
            label: requirements.label,
            href: `${gamePath}?seccion=${requirements.id}`,
            active: selected === requirements.id,
            icon: MonitorCog,
          },
          {
            key: performance.id,
            label: performance.label,
            href: `${gamePath}?seccion=${performance.id}`,
            active: selected === performance.id,
            icon: Gauge,
          },
        ],
      },
      directGameSection("multimedia", ImageIcon),
      directGameSection("valoracion", Star),
      {
        key: "distribucion",
        label: distribution.label,
        href: `${gamePath}?seccion=${distribution.id}`,
        active: selected === distribution.id || selected === "actualizacion",
        icon: Download,
        children: [
          {
            key: distribution.id,
            label: "Descargas y mirrors",
            href: `${gamePath}?seccion=${distribution.id}`,
            active: selected === distribution.id,
            icon: Download,
          },
          {
            key: "actualizacion",
            label: "Nueva versión",
            href: `${gamePath}/actualizacion`,
            active: selected === "actualizacion",
            icon: RefreshCcw,
          },
        ],
      },
      {
        key: "publicacion",
        label: "Publicación",
        href: `${gamePath}/publicacion`,
        active: selected === "publicacion",
        icon: Rocket,
      },
    ];

    return (
      <ContextNavigator
        label="Secciones del editor de juego"
        items={gameItems}
      />
    );
  }

  if (updateMatch && updateMatch[1] !== "nueva") {
    return (
      <ContextNavigator
        label="Secciones del borrador histórico"
        items={simpleItems(
          pathname,
          searchParams.get("seccion") ?? "editar",
          updateSections
        )}
      />
    );
  }

  if (pathname === "/admin/catalogos") {
    return (
      <ContextNavigator
        label="Secciones de Clasificaciones y etiquetas"
        items={simpleItems(
          pathname,
          searchParams.get("seccion") ?? "clasificaciones",
          catalogSections
        )}
      />
    );
  }

  if (pathname === "/admin/portada") {
    return (
      <ContextNavigator
        label="Secciones del editor de Inicio"
        items={simpleItems(
          pathname,
          resolveHomeAdminSection(
            searchParams.get("seccion") ?? undefined
          ),
          homeSections
        )}
      />
    );
  }

  if (pathname === "/admin/paginas/presentacion") {
    return (
      <ContextNavigator
        label="Páginas públicas"
        items={simpleItems(
          pathname,
          searchParams.get("seccion") ?? "juegos",
          publicPageSections
        )}
      />
    );
  }

  if (pathname === "/admin/paginas/quienes-somos") {
    return (
      <ContextNavigator
        label="Secciones de Quiénes somos"
        items={simpleItems(
          pathname,
          searchParams.get("seccion") ?? "encabezado",
          aboutSections
        )}
      />
    );
  }

  if (pathname === "/admin/configuracion") {
    return (
      <ContextNavigator
        label="Secciones de Marca y apariencia"
        items={simpleItems(
          pathname,
          searchParams.get("seccion") ?? "identidad",
          configurationSections
        )}
      />
    );
  }

  return null;
}
