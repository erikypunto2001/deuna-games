import Link from "next/link";

import SiteLogoMark from "@/components/brand/SiteLogoMark";

import {
  getCatalogCapabilities,
} from "@/lib/games/catalog-capabilities";
import {
  getPublicGames,
} from "@/lib/games/public-catalog";
import {
  getPublicSiteConfig,
} from "@/lib/site/public-site-config";

import styles from "./Footer.module.css";

export default async function Footer() {
  const [config, games] = await Promise.all([
    getPublicSiteConfig(),
    getPublicGames(),
  ]);
  const capabilities = getCatalogCapabilities(games);
  const year = new Date().getUTCFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <Link
            href="/"
            className={styles.brand}
            aria-label={`${config.name} - Inicio`}
          >
            <SiteLogoMark size={25} />

            <strong>{config.name}</strong>
          </Link>

          <p>{config.description}</p>
        </div>

        <div className={styles.column}>
          <h3>Juegos</h3>

          <Link href="/juegos">Todos los juegos</Link>
          {capabilities.reviews && (
            <Link href="/juegos/populares">Populares</Link>
          )}
          {capabilities.releaseDates && (
            <Link href="/juegos/nuevos">Lanzamientos recientes</Link>
          )}
          <Link href="/juegos/bajos-recursos">Bajos recursos</Link>
        </div>

        <div className={styles.column}>
          <h3>Explorar</h3>

          <Link href="/colecciones">
            Colecciones
          </Link>
          <Link href="/programas">
            Programas
          </Link>
          <Link href="/requisitos">
            Por requisitos
          </Link>
          {capabilities.ratings && (
            <Link href="/juegos?orden=rating">
              Mejor puntuados
            </Link>
          )}
          <Link href="/actualizaciones">Actualizaciones</Link>
        </div>

        <div className={styles.column}>
          <h3>{config.shortName}</h3>

          <Link href="/quienes-somos">Quiénes somos</Link>
          <Link href="/privacidad">Privacidad</Link>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>© {year} {config.name}</span>

        <span>{config.footerTagline}</span>
      </div>
    </footer>
  );
}
