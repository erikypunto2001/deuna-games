"use client";

import {
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import type {
  GameCollection,
} from "@/types/game-collection";

import adminStyles from "../../app/admin/admin.module.css";
import styles from "./GameCollectionEditor.module.css";

type GameOption = {
  slug: string;
  title: string;
};

type Props = {
  mode: "create" | "edit";
  collection?: GameCollection;
  revision?: number;
  games: GameOption[];
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 160);
}

export default function GameCollectionEditor({
  mode,
  collection,
  revision,
  games,
}: Props) {
  const [slug, setSlug] = useState(
    collection?.slug ?? ""
  );
  const [selected, setSelected] = useState<string[]>(
    collection?.gameSlugs ?? []
  );
  const [query, setQuery] = useState("");

  const bySlug = useMemo(
    () =>
      new Map(
        games.map((game) => [
          game.slug,
          game,
        ])
      ),
    [games]
  );

  const filtered = games.filter((game) => {
    const needle = query.trim().toLocaleLowerCase("es");
    return (
      !needle ||
      game.title.toLocaleLowerCase("es").includes(needle) ||
      game.slug.includes(needle)
    );
  });

  function toggle(gameSlug: string) {
    setSelected((current) =>
      current.includes(gameSlug)
        ? current.filter((item) => item !== gameSlug)
        : [...current, gameSlug]
    );
  }

  function move(index: number, direction: -1 | 1) {
    setSelected((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  return (
    <form
      method="post"
      action={
        mode === "create"
          ? "/api/admin/content/collections"
          : "/api/admin/content/collections/" +
            encodeURIComponent(collection!.slug)
      }
      className={adminStyles.editorForm}
    >
      {mode === "edit" && (
        <input
          type="hidden"
          name="expectedRevision"
          value={revision}
        />
      )}
      <input
        type="hidden"
        name="gameSlugsJson"
        value={JSON.stringify(selected)}
      />

      {mode === "create" && (
        <label>
          <span>Slug permanente</span>
          <input
            name="slug"
            value={slug}
            onChange={(event) =>
              setSlug(slugify(event.target.value))
            }
            minLength={1}
            maxLength={160}
            required
            placeholder="mortal-kombat"
          />
        </label>
      )}

      <label>
        <span>Título</span>
        <input
          name="title"
          defaultValue={collection?.title ?? ""}
          maxLength={140}
          required
          placeholder="Mortal Kombat"
        />
      </label>

      <label>
        <span>Destacada</span>
        <select
          name="featured"
          defaultValue={collection?.featured ? "true" : "false"}
        >
          <option value="false">No</option>
          <option value="true">Sí</option>
        </select>
      </label>

      <label className={adminStyles.fieldWide}>
        <span>Descripción</span>
        <textarea
          name="description"
          defaultValue={collection?.description ?? ""}
          rows={5}
          maxLength={2500}
          required
        />
      </label>

      <div className={adminStyles.fieldWide + " " + styles.root}>
        <div>
          <strong>Orden de la colección</strong>
          <p>
            Este orden se conserva en la página pública. Un juego puede
            pertenecer a varias colecciones sin duplicarse.
          </p>
        </div>

        {selected.length ? (
          <div className={styles.list}>
            {selected.map((gameSlug, index) => {
              const game = bySlug.get(gameSlug);
              return (
                <div key={gameSlug} className={styles.item}>
                  <label className={styles.removeToggle}>
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggle(gameSlug)}
                      aria-label={"Quitar " + (game?.title ?? gameSlug)}
                    />
                    <span aria-hidden="true" />
                  </label>
                  <div>
                    <strong>{game?.title ?? gameSlug}</strong>
                    <span>{gameSlug}</span>
                  </div>
                  <div className={styles.controls}>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Subir juego"
                    >
                      <ArrowUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={index === selected.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Bajar juego"
                    >
                      <ArrowDown size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            Selecciona los juegos que forman esta saga o franquicia.
          </div>
        )}

        <div className={styles.search}>
          <label>
            <span>Buscar juegos</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título..."
            />
          </label>
          <div className={styles.choices}>
            {filtered.map((game) => (
              <label key={game.slug} className={styles.choice}>
                <input
                  type="checkbox"
                  checked={selected.includes(game.slug)}
                  onChange={() => toggle(game.slug)}
                />
                {game.title}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className={adminStyles.formActions}>
        <p>
          Guardar conserva el borrador. Publicar la colección es una acción
          independiente.
        </p>
        <button type="submit">
          {mode === "create" ? "Crear colección" : "Guardar colección"}
        </button>
      </div>
    </form>
  );
}
