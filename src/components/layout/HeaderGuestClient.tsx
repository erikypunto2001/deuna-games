"use client";

import Link from "next/link";
import {
  Gamepad2,
  Menu,
  Search,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import touchStyles from "@/components/ui/TouchTarget.module.css";

import accountStyles from "./HeaderAccountMenu.module.css";
import HeaderNavigation from "./HeaderNavigation";
import styles from "./Header.module.css";
import SiteBrand from "./SiteBrand";

export default function HeaderGuestClient({
  siteName,
}: {
  siteName: string;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  const closeMobileMenu = useCallback((restoreFocus = false) => {
    setMobileMenuOpen(false);

    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        menuButtonRef.current?.focus();
      });
    }
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const desktopMedia = window.matchMedia("(min-width: 1161px)");

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileMenu(true);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable =
        mobilePanelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );

      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleDesktop = () => {
      if (desktopMedia.matches) {
        closeMobileMenu(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    desktopMedia.addEventListener("change", handleDesktop);

    const focusFrame = window.requestAnimationFrame(() => {
      mobilePanelRef.current
        ?.querySelector<HTMLInputElement>('input[type="search"]')
        ?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      desktopMedia.removeEventListener("change", handleDesktop);
    };
  }, [closeMobileMenu, mobileMenuOpen]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <SiteBrand siteName={siteName} />
          <HeaderNavigation variant="desktop" />

          <div className={styles.actions}>
            <form className={styles.search} action="/juegos" role="search">
              <Search size={18} strokeWidth={2} aria-hidden="true" />
              <input
                type="search"
                name="q"
                placeholder="Buscar juegos..."
                aria-label="Buscar juegos"
                autoComplete="off"
              />
            </form>

            <Link
              href="/requisitos"
              className={`${styles.gameFinder} ${touchStyles.minimum}`}
              data-brand-action="true"
            >
              <Gamepad2 size={18} strokeWidth={2} aria-hidden="true" />
              <span>Por requisitos</span>
            </Link>

            <div className={accountStyles.personalActions}>
              <Link
                href="/cuenta?modo=entrar"
                className={`${accountStyles.signInButton} ${touchStyles.minimum}`}
                aria-label="Iniciar sesión en Mi DeUna"
              >
                <UserRound size={18} aria-hidden="true" />
                <span className={accountStyles.signInLabelFull}>Iniciar sesión</span>
                <span className={accountStyles.signInLabelCompact}>Entrar</span>
              </Link>
            </div>

            <button
              ref={menuButtonRef}
              type="button"
              className={`${styles.menuButton} ${touchStyles.minimum} ${mobileMenuOpen ? styles.menuButtonOpen : ""}`}
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
              title={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              onClick={() => {
                if (mobileMenuOpen) {
                  closeMobileMenu(false);
                } else {
                  setMobileMenuOpen(true);
                }
              }}
            >
              <Menu size={23} className={styles.menuOpenIcon} aria-hidden="true" />
              <X size={23} className={styles.menuCloseIcon} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div
        id="mobile-navigation"
        ref={mobilePanelRef}
        className={`${styles.mobileNativePanel} ${mobileMenuOpen ? styles.mobileNativePanelOpen : ""}`}
        aria-hidden={!mobileMenuOpen}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) {
            closeMobileMenu(false);
          }
        }}
      >
        <div className={styles.mobileMenuGlow} aria-hidden="true" />

        <div className={styles.mobileInner}>
          <form
            className={styles.mobileSearch}
            action="/juegos"
            role="search"
            onSubmit={() => closeMobileMenu(false)}
          >
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              name="q"
              placeholder="Buscar juegos..."
              aria-label="Buscar juegos"
              autoComplete="off"
            />
          </form>

          <HeaderNavigation variant="mobile" />

          <Link
            href="/requisitos"
            className={styles.mobileFinder}
            data-brand-action="true"
          >
            <Gamepad2 size={19} aria-hidden="true" />
            Por requisitos
          </Link>

          <Link
            href="/cuenta?modo=entrar"
            className={accountStyles.mobileSignIn}
          >
            <UserRound size={19} aria-hidden="true" />
            Iniciar sesión en Mi DeUna
          </Link>
        </div>
      </div>
    </>
  );
}
