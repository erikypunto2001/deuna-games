"use client";

import Link from "next/link";
import {
  AppWindow,
  Boxes,
  ChevronDown,
  ExternalLink,
  FileText,
  Gamepad2,
  Home,
  LayoutDashboard,
  Menu,
  Palette,
  ShieldCheck,
  Tags,
  Waypoints,
  UsersRound,
  Wrench,
} from "lucide-react";
import { usePathname } from "next/navigation";

import type { AdminRole } from "@/lib/admin/roles";

import ia from "./AdminInformationArchitecture.module.css";
import selection from "./AdminNavigationSelection.module.css";

const navigationGroups = [
  {
    label: "GENERAL",
    items: [
      {
        href: "/admin",
        label: "Resumen",
        icon: LayoutDashboard,
        ownerOnly: false,
      },
    ],
  },
  {
    label: "CONTENIDO",
    items: [
      {
        href: "/admin/juegos",
        label: "Juegos",
        icon: Gamepad2,
        ownerOnly: false,
      },
      {
        href: "/admin/colecciones",
        label: "Colecciones",
        icon: Boxes,
        ownerOnly: false,
      },
      {
        href: "/admin/programas",
        label: "Programas",
        icon: AppWindow,
        ownerOnly: false,
      },
      {
        href: "/admin/portada",
        label: "Inicio",
        icon: Home,
        ownerOnly: false,
      },
      {
        href: "/admin/paginas",
        label: "Páginas públicas",
        icon: FileText,
        ownerOnly: false,
      },
      {
        href: "/admin/catalogos",
        label: "Clasificaciones y etiquetas",
        icon: Tags,
        ownerOnly: false,
      },
      {
        href: "/admin/plataformas",
        label: "Plataformas",
        icon: Waypoints,
        ownerOnly: false,
      },
    ],
  },
  {
    label: "SITIO",
    items: [
      {
        href: "/admin/configuracion",
        label: "Marca y apariencia",
        icon: Palette,
        ownerOnly: false,
      },
    ],
  },
  {
    label: "ADMINISTRACIÓN",
    items: [
      {
        href: "/admin/cuentas",
        label: "Cuentas",
        icon: UsersRound,
        ownerOnly: true,
      },
      {
        href: "/admin/seguridad",
        label: "Acceso y seguridad",
        icon: ShieldCheck,
        ownerOnly: false,
      },
      {
        href: "/admin/mantenimiento",
        label: "Mantenimiento",
        icon: Wrench,
        ownerOnly: true,
      },
    ],
  },
] as const;

function isLegacyGameUpdatePath(pathname: string) {
  return pathname === "/admin/actualizaciones" ||
    pathname.startsWith("/admin/actualizaciones/");
}

function isActive(pathname: string, href: string) {
  if (
    href === "/admin/juegos" &&
    isLegacyGameUpdatePath(pathname)
  ) {
    return true;
  }

  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNavigation({
  role,
}: {
  role: AdminRole;
}) {
  const pathname = usePathname();
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.ownerOnly || role === "owner"
      ),
    }))
    .filter((group) => group.items.length > 0);
  const activeItem = visibleGroups
    .flatMap((group) => group.items)
    .find((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        className={ia.navDesktop}
        aria-label="Navegación administrativa"
      >
        {visibleGroups.map((group) => (
          <div className={ia.navGroup} key={group.label}>
            <span className={ia.navGroupTitle}>{group.label}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${ia.navLink} ${selection.interactive} ${active ? selection.active : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        <Link
          href="/"
          target="_blank"
          rel="noreferrer"
          className={ia.navUtility}
        >
          <ExternalLink size={16} aria-hidden="true" />
          <span>Ver sitio público</span>
        </Link>
      </nav>

      <details key={pathname} className={ia.mobileNav}>
        <summary>
          <Menu size={18} aria-hidden="true" />
          <span>{activeItem?.label ?? "Menú del panel"}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>

        <div className={ia.mobileNavPanel}>
          {visibleGroups.map((group) => (
            <div className={ia.mobileNavGroup} key={group.label}>
              <span>{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${selection.interactive} ${active ? selection.active : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}

          <div className={ia.mobileNavGroup}>
            <span>SITIO PÚBLICO</span>
            <Link href="/" target="_blank" rel="noreferrer">
              <ExternalLink size={16} aria-hidden="true" />
              Ver sitio público
            </Link>
          </div>
        </div>
      </details>
    </>
  );
}
