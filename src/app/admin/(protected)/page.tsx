import Link from "next/link";
import {
  ArrowRight,
  Database,
  ExternalLink,
  FileText,
  Gamepad2,
  House,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

import ia from "@/components/admin/AdminInformationArchitecture.module.css";
import {
  getAdminSecurityOverview,
} from "@/lib/admin/security-overview";
import {
  getPublicationOverview,
  type PendingPublication,
} from "@/lib/admin/publication-overview";
import {
  verifyAdminSession,
} from "@/lib/admin/session";

import styles from "../admin.module.css";

export const dynamic = "force-dynamic";

function publicationPath(
  type: PendingPublication["type"],
  key: string
) {
  if (type === "game") {
    return `/admin/juegos/${encodeURIComponent(key)}/vista-previa`;
  }

  if (type === "game_update") {
    return `/admin/actualizaciones/${encodeURIComponent(key)}`;
  }

  if (type === "home_config") {
    return "/admin/portada?seccion=publicacion";
  }

  if (type === "about_config") {
    return "/admin/paginas/quienes-somos";
  }

  if (type === "game_taxonomy") {
    return "/admin/catalogos?seccion=publicacion";
  }

  if (type === "public_pages_config") {
    return "/admin/paginas/presentacion?seccion=publicacion";
  }

  if (type === "software") {
    return `/admin/programas/${encodeURIComponent(key)}`;
  }

  if (type === "game_collection") {
    return `/admin/colecciones/${encodeURIComponent(key)}`;
  }

  if (type === "platform_catalog") {
    return "/admin/plataformas";
  }

  return "/admin/configuracion?seccion=publicacion";
}

function attentionPath(item: PendingPublication) {
  if (item.type === "game") {
    return `/admin/juegos/${encodeURIComponent(item.key)}/publicacion`;
  }

  return publicationPath(item.type, item.key);
}

function publicationTypeLabel(
  type: PendingPublication["type"]
) {
  if (type === "game") return "Juego";
  if (type === "game_update") return "Versión de juego";
  if (type === "home_config") return "Inicio";
  if (type === "about_config") return "Quiénes somos";
  if (type === "game_taxonomy") return "Clasificaciones y etiquetas";
  if (type === "public_pages_config") return "Páginas públicas";
  if (type === "software") return "Programa";
  if (type === "game_collection") return "Colección";
  if (type === "platform_catalog") return "Plataformas";
  return "Marca y apariencia";
}

function pendingStatusLabel(
  status: PendingPublication["status"]
) {
  if (status === "hidden") return "Oculto";
  if (status === "unpublished") return "Sin publicar";
  return "Cambios pendientes";
}


export default async function AdminDashboardPage() {
  await verifyAdminSession();
  const [security, publication] =
    await Promise.all([
      getAdminSecurityOverview(),
      getPublicationOverview(),
    ]);
  const publicGames = publication.available
    ? publication.games
    : null;
  const publicUpdates = publication.available
    ? publication.updates
    : null;
  const pending = publication.available
    ? publication.pending
    : null;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <span>PANEL PRIVADO</span>
          <h1>Resumen</h1>
          <p>
            Tu centro de operaciones: primero lo que requiere atención, después las acciones frecuentes y el estado general del sitio.
          </p>
        </div>

        <div className={ia.dashboardHeaderActions}>
          <Link href="/admin/juegos/nuevo">
            <Plus size={16} aria-hidden="true" />
            Crear juego
          </Link>
          <Link href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" />
            Ver sitio
          </Link>
        </div>
      </header>

      {publication.available && publication.pendingItems.length > 0 && (
        <section className={styles.tablePanel} aria-labelledby="attention-title">
          <div className={styles.tableSummary}>
            <strong id="attention-title">Requiere atención</strong>
            <span>
              {publication.pending} {publication.pending === 1 ? "pendiente" : "pendientes"}
            </span>
          </div>

          <div className={styles.tableWrap}>
            <table className="admin-data-table" aria-label="Contenido editorial que requiere atención">
              <thead>
                <tr>
                  <th scope="col">Contenido</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Pub.</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {publication.pendingItems.map((item) => (
                  <tr key={`${item.type}:${item.key}`}>
                    <th scope="row">
                      <strong>{item.label}</strong>
                      <span>{item.key}</span>
                    </th>
                    <td>{publicationTypeLabel(item.type)}</td>
                    <td>
                      <span className={styles.statusPending}>
                        {pendingStatusLabel(item.status)}
                      </span>
                    </td>
                    <td>#{item.publicationNumber}</td>
                    <td>
                      <Link
                        href={attentionPath(item)}
                        className={`${styles.tableAction} admin-table-action admin-table-action--attention`}
                      >
                        Resolver
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={`${styles.adminSection} ${ia.quickActionsPanel}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span>ACCIONES RÁPIDAS</span>
            <h2>Trabajo frecuente</h2>
          </div>
          <p>
            Atajos a las tareas que más se repiten. La navegación completa permanece en el menú lateral.
          </p>
        </div>

        <div className={ia.quickActionsGrid}>
          <Link href="/admin/juegos/nuevo" className={ia.quickAction}>
            <Gamepad2 size={21} aria-hidden="true" />
            <div>
              <strong>Nuevo juego</strong>
              <span>Crear un borrador y completar su ficha antes de publicarlo.</span>
            </div>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>

          <Link href="/admin/juegos" className={ia.quickAction}>
            <RefreshCcw size={21} aria-hidden="true" />
            <div>
              <strong>Publicar nueva versión</strong>
              <span>Elegir un juego publicado y abrir su flujo de Distribución.</span>
            </div>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>

          <Link href="/admin/portada" className={ia.quickAction}>
            <House size={21} aria-hidden="true" />
            <div>
              <strong>Editar Inicio</strong>
              <span>Curaduría, presentación y publicación de la página principal.</span>
            </div>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>

          <Link href="/admin/paginas" className={ia.quickAction}>
            <FileText size={21} aria-hidden="true" />
            <div>
              <strong>Páginas públicas</strong>
              <span>Entrar directamente a Juegos, Actualizaciones, compatibilidad o Quiénes somos.</span>
            </div>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section
        className={styles.metricGrid}
        aria-label="Estado general del sitio"
      >
        <article>
          <span><Gamepad2 size={20} aria-hidden="true" /></span>
          <strong>{publicGames ?? "—"}</strong>
          <p>Juegos publicados</p>
          {publicGames === null && <small>Estado de publicación no disponible</small>}
        </article>
        <article>
          <span><Database size={20} aria-hidden="true" /></span>
          <strong>{pending ?? "—"}</strong>
          <p>Cambios sin publicar</p>
          {pending === null && <small>Estado de publicación no disponible</small>}
        </article>
        <article>
          <span><ShieldCheck size={20} aria-hidden="true" /></span>
          <strong>{security.activeSessions}</strong>
          <p>Tus sesiones administrativas activas</p>
        </article>
        <article>
          <span><RefreshCcw size={20} aria-hidden="true" /></span>
          <strong>{publicUpdates ?? "—"}</strong>
          <p>Versiones y avisos publicados</p>
          {publicUpdates === null && <small>Estado de publicación no disponible</small>}
        </article>
      </section>

    </>
  );
}
