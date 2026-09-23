import AdminPageHeader from "@/components/admin/AdminPageHeader";
import EditorialMaintenancePanel from "@/components/admin/EditorialMaintenancePanel";
import EditorStateNotice from "@/components/admin/EditorStateNotice";
import SiteMaintenancePanel from "@/components/admin/SiteMaintenancePanel";
import {
  getEditorialHistoryMaintenanceOverview,
} from "@/lib/admin/editorial-maintenance-service";
import {
  inspectSiteMaintenance,
} from "@/lib/admin/site-maintenance-service";
import {
  verifyAdminOwnerSession,
} from "@/lib/admin/session";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    estado?: string | string[];
  }>;
};

export default async function AdminMaintenancePage({
  searchParams,
}: PageProps) {
  await verifyAdminOwnerSession();
  const [
    overview,
    siteOverview,
    parameters,
  ] = await Promise.all([
    getEditorialHistoryMaintenanceOverview(),
    inspectSiteMaintenance(),
    searchParams,
  ]);
  const state = Array.isArray(parameters.estado)
    ? parameters.estado[0]
    : parameters.estado;

  return (
    <>
      <AdminPageHeader
        eyebrow={<>ADMINISTRACIÓN · PROPIETARIO</>}
        title="Mantenimiento"
        description="Diagnóstico y limpieza segura de PostgreSQL, multimedia e historial editorial. Las operaciones destructivas son Owner-only, auditadas y nunca confunden contenido vigente con basura."
      />

      <EditorStateNotice state={state} />

      <SiteMaintenancePanel
        overview={siteOverview}
      />

      <EditorialMaintenancePanel
        overview={overview}
      />
    </>
  );
}
