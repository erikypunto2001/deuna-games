"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  CircleHelp,
  Gamepad2,
  House,
  RefreshCcw,
  Wrench,
} from "lucide-react";

import styles from "./Header.module.css";

type HeaderNavigationProps = {
  variant: "desktop" | "mobile";
};

const navigation = [
  {
    label: "Inicio",
    href: "/",
    icon: House,
  },
  {
    label: "Juegos",
    href: "/juegos",
    icon: Gamepad2,
  },
  {
    label: "Colecciones",
    href: "/colecciones",
    icon: Boxes,
  },
  {
    label: "Programas",
    href: "/programas",
    icon: Wrench,
  },
  {
    label: "Actualizaciones",
    href: "/actualizaciones",
    icon: RefreshCcw,
  },
  {
    label: "Quiénes somos",
    href: "/quienes-somos",
    icon: CircleHelp,
  },
] as const;

function isCurrentPath(
  pathname: string,
  href: string
) {
  if (href === "/") {
    return pathname === "/";
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

export default function HeaderNavigation({
  variant,
}: HeaderNavigationProps) {
  const pathname = usePathname();
  const mobile = variant === "mobile";

  return (
    <nav
      className={
        mobile
          ? styles.mobileNavigation
          : styles.navigation
      }
      aria-label={
        mobile
          ? "Navegación móvil"
          : "Navegación principal"
      }
    >
      {navigation.map((item) => {
        const Icon = item.icon;
        const active = isCurrentPath(
          pathname,
          item.href
        );

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              mobile
                ? `${styles.mobileNavItem} ${
                    active
                      ? styles.mobileActive
                      : ""
                  }`
                : `${styles.navItem} ${
                    active
                      ? styles.active
                      : ""
                  }`
            }
            aria-current={
              active ? "page" : undefined
            }
          >
            <Icon
              size={mobile ? 20 : 19}
              strokeWidth={1.9}
              aria-hidden="true"
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
