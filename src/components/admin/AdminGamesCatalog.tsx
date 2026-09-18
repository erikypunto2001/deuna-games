"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  Eye,
  FileClock,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Rocket,
  Search,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ia from "./AdminInformationArchitecture.module.css";
import styles from "./AdminCatalog.module.css";

export type AdminGameCatalogItem = {
  key: string;
  title: string;
  category: string;
  version: string | null;
  revision: number;
  publicationNumber: number | null;
  status: "published" | "pending" | "hidden" | "unpublished";
  searchText: string;
};

type SortMode = "title" | "status" | "revision";

const MOBILE_GAMES_PER_PAGE = 8;

const statusLabels = {
  all: "Todos los estados",
  published: "Publicados",
  pending: "Cambios pendientes",
  hidden: "Ocultos",
  unpublished: "Sin publicar",
} as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function publicationActionLabel(
  status: AdminGameCatalogItem["status"]
) {
  if (status === "unpublished") return "Publicar";
  if (status === "pending") return "Publicar cambios";
  if (status === "hidden") return "Republicar";
  return "Publicación";
}

function GameStatus({
  status,
}: {
  status: AdminGameCatalogItem["status"];
}) {
  if (status === "published") {
    return (
      <span className={styles.statusOk}>
        <CheckCircle2 size={15} aria-hidden="true" />
        Publicado
      </span>
    );
  }

  return (
    <span className={styles.statusPending}>
      <CircleSlash2 size={15} aria-hidden="true" />
      {status === "hidden"
        ? "Oculto"
        : status === "unpublished"
          ? "Sin publicar"
          : "Cambios pendientes"}
    </span>
  );
}

function GameActions({
  item,
  gamePath,
  mobile = false,
}: {
  item: AdminGameCatalogItem;
  gamePath: string;
  mobile?: boolean;
}) {
  const published = item.status === "published";

  return (
    <div
      className={`${ia.rowActions} ${mobile ? styles.mobileActions : ""}`}
      data-mobile-actions={mobile ? "true" : undefined}
    >
      <Link
        href={gamePath}
        title={`Editar ${item.title}`}
      >
        <Pencil size={14} aria-hidden="true" />
        Editar
      </Link>

      {published ? (
        <Link
          href={`${gamePath}/actualizacion`}
          title={`Publicar una nueva versión de ${item.title}`}
        >
          <RefreshCcw size={14} aria-hidden="true" />
          Nueva versión
        </Link>
      ) : (
        <Link
          href={`${gamePath}/publicacion`}
          title={`Revisar publicación de ${item.title}`}
        >
          <Rocket size={14} aria-hidden="true" />
          {publicationActionLabel(item.status)}
        </Link>
      )}

      <details className={ia.rowMenu}>
        <summary aria-label={`Más acciones para ${item.title}`}>
          <MoreHorizontal size={16} aria-hidden="true" />
          <span className={ia.srOnly}>Más acciones</span>
        </summary>
        <div className={ia.rowMenuPanel}>
          <Link
            href={`${gamePath}/vista-previa`}
            title={`Ver borrador de ${item.title}`}
          >
            <Eye size={14} aria-hidden="true" />
            Vista previa
          </Link>
          {published && (
            <Link
              href={`${gamePath}/publicacion`}
              title={`Revisar publicación de ${item.title}`}
            >
              <Rocket size={14} aria-hidden="true" />
              Publicación
            </Link>
          )}
          <Link
            href={`${gamePath}?seccion=historial`}
            title={`Revisar historial de ${item.title}`}
          >
            <FileClock size={14} aria-hidden="true" />
            Historial
          </Link>
        </div>
      </details>
    </div>
  );
}

export default function AdminGamesCatalog({
  items,
}: {
  items: AdminGameCatalogItem[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<SortMode>("title");
  const [mobilePage, setMobilePage] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);

  const categories = useMemo(
    () =>
      [...new Set(items.map((item) => item.category))].sort((a, b) =>
        a.localeCompare(b, "es")
      ),
    [items]
  );

  const filtered = useMemo(() => {
    const needle = normalize(deferredQuery.trim());

    return items
      .filter((item) => {
        if (status !== "all" && item.status !== status) return false;
        if (category !== "all" && item.category !== category) return false;
        if (!needle) return true;
        return normalize(item.searchText).includes(needle);
      })
      .sort((a, b) => {
        if (sort === "revision") {
          return b.revision - a.revision || a.title.localeCompare(b.title, "es");
        }
        if (sort === "status") {
          return a.status.localeCompare(b.status) || a.title.localeCompare(b.title, "es");
        }
        return a.title.localeCompare(b.title, "es");
      });
  }, [category, deferredQuery, items, sort, status]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchRef.current?.focus();
      }

      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        setMobilePage(0);
        searchRef.current?.blur();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const mobilePageCount = Math.max(
    1,
    Math.ceil(filtered.length / MOBILE_GAMES_PER_PAGE)
  );
  const currentMobilePage = Math.min(
    mobilePage,
    mobilePageCount - 1
  );
  const mobileItems = filtered.slice(
    currentMobilePage * MOBILE_GAMES_PER_PAGE,
    (currentMobilePage + 1) * MOBILE_GAMES_PER_PAGE
  );

  const hasFilters =
    query !== "" || status !== "all" || category !== "all" || sort !== "title";

  return (
    <section className={styles.panel} aria-labelledby="admin-games-catalog-title">
      <h2 id="admin-games-catalog-title" className={styles.srOnly}>
        Catálogo editorial de juegos
      </h2>

      <div
        className={styles.toolbar}
        role="search"
        aria-label="Buscar, filtrar y ordenar juegos"
      >
        <div className={styles.searchBox}>
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMobilePage(0);
            }}
            placeholder="Buscar juego, slug, versión, etiqueta..."
            aria-label="Buscar juegos"
          />
          <kbd aria-hidden="true">/</kbd>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setMobilePage(0);
              }}
              aria-label="Limpiar búsqueda"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className={styles.filters}>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setMobilePage(0);
            }}
            aria-label="Filtrar por estado"
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setMobilePage(0);
            }}
            aria-label="Filtrar por clasificación"
          >
            <option value="all">Todas las clasificaciones</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as SortMode);
              setMobilePage(0);
            }}
            aria-label="Ordenar juegos"
          >
            <option value="title">Orden: nombre</option>
            <option value="status">Orden: estado</option>
            <option value="revision">Orden: revisión</option>
          </select>

          {hasFilters && (
            <button
              type="button"
              className={styles.resetButton}
              onClick={() => {
                setQuery("");
                setStatus("all");
                setCategory("all");
                setSort("title");
                setMobilePage(0);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div
        className={styles.resultBar}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>{filtered.length}</strong>
        <span>de {items.length} juegos</span>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          No hay juegos que coincidan con los filtros actuales.
        </div>
      ) : (
        <>
        <div className={styles.tableViewport} data-admin-games-table="true">
          <table className={styles.table}>
            <caption className={styles.srOnly}>
              Juegos editoriales, clasificación, estado de publicación, revisión y acciones
            </caption>
            <thead>
              <tr>
                <th scope="col">Juego</th>
                <th scope="col">Clasificación</th>
                <th scope="col">Estado</th>
                <th scope="col">Pub.</th>
                <th scope="col">Rev.</th>
                <th scope="col" className={styles.actionsColumn}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const gamePath = `/admin/juegos/${encodeURIComponent(item.key)}`;
                return (
                  <tr key={item.key}>
                    <th scope="row">
                      <Link href={gamePath} title={`Editar ${item.title}`}>
                        <strong>{item.title}</strong>
                        <span>
                          {item.key}
                          {item.version ? ` · ${item.version}` : ""}
                        </span>
                      </Link>
                    </th>
                    <td>{item.category}</td>
                    <td>
                      <GameStatus status={item.status} />
                    </td>
                    <td>
                      {item.publicationNumber
                        ? `#${item.publicationNumber}`
                        : "—"}
                    </td>
                    <td>{item.revision}</td>
                    <td>
                      <GameActions item={item} gamePath={gamePath} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div
          className={styles.mobileList}
          aria-label="Juegos editoriales"
          data-admin-games-mobile-list="true"
        >
          {mobileItems.map((item) => {
            const gamePath = `/admin/juegos/${encodeURIComponent(item.key)}`;

            return (
              <article
                className={styles.mobileCard}
                key={item.key}
                data-admin-games-mobile-card="true"
              >
                <div className={styles.mobileCardHeading}>
                  <Link href={gamePath} title={`Editar ${item.title}`}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.key}
                      {item.version ? ` · ${item.version}` : ""}
                    </span>
                  </Link>
                  <GameStatus status={item.status} />
                </div>

                <dl className={styles.mobileMeta}>
                  <div>
                    <dt>Clasificación</dt>
                    <dd>{item.category}</dd>
                  </div>
                  <div>
                    <dt>Publicación</dt>
                    <dd>{item.publicationNumber ? `#${item.publicationNumber}` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Revisión</dt>
                    <dd>{item.revision}</dd>
                  </div>
                </dl>

                <GameActions item={item} gamePath={gamePath} mobile />
              </article>
            );
          })}
        </div>

        {mobilePageCount > 1 && (
          <nav
            className={styles.mobilePagination}
            aria-label="Paginación de juegos en móvil"
            data-admin-games-mobile-pagination="true"
          >
            <button
              type="button"
              aria-label="Página anterior de juegos"
              disabled={currentMobilePage === 0}
              onClick={() =>
                setMobilePage((value) => Math.max(0, value - 1))
              }
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <span>
              Página <strong>{currentMobilePage + 1}</strong> de {mobilePageCount}
            </span>
            <button
              type="button"
              aria-label="Página siguiente de juegos"
              disabled={currentMobilePage >= mobilePageCount - 1}
              onClick={() =>
                setMobilePage((value) =>
                  Math.min(mobilePageCount - 1, value + 1)
                )
              }
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </nav>
        )}
        </>
      )}
    </section>
  );
}
