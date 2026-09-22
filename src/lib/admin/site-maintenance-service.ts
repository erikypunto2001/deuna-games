import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  adminQuery,
} from "@/lib/admin/database";
import {
  retryPendingGameMediaCleanup,
} from "@/lib/admin/editorial-maintenance-service";
import {
  purgeSiteMediaJunk,
  scanSiteMediaJunk,
  type SiteMediaJunkScan,
} from "@/lib/admin/site-maintenance-media";
import {
  readAdminSessionToken,
  verifyAdminSession,
} from "@/lib/admin/session";

type RuntimeJunkSummary = {
  adminSessions: number;
  accountSessions: number;
  usedRecoveryCodes: number;
  oldAdminEvents: number;
  orphanPreferences: number;
  orphanRatings: number;
  orphanInsights: number;
  orphanGameUpdates: number;
  pendingMediaCleanups: number;
};

export type SiteMaintenancePendingCleanup = {
  slug: string;
  createdAt: Date;
  lastAttemptAt: Date | null;
  attempts: number;
};

export type SiteMaintenanceOverview = {
  runtime: RuntimeJunkSummary;
  media: SiteMediaJunkScan;
  pendingMediaCleanups:
    SiteMaintenancePendingCleanup[];
  safeRecords: number;
  safeFiles: number;
  safeBytes: number;
  safeMarkers: number;
  safeDirectories: number;
  manualIssues: number;
  fingerprint: string;
};

export type SiteMaintenancePurgeResult =
  | {
      outcome: "conflict";
      current: SiteMaintenanceOverview;
    }
  | {
      outcome: "purged" | "partial";
      recordsDeleted: number;
      mediaFilesDeleted: number;
      mediaBytesDeleted: number;
      markersDeleted: number;
      directoriesDeleted: number;
      pendingCompleted: number;
      pendingRemaining: number;
      skipped: number;
      final: SiteMaintenanceOverview;
    };

function asRecord(value: unknown) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : {};
}

function numberField(
  value: Record<string, unknown>,
  key: string
) {
  const parsed = Number(value[key] ?? 0);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.trunc(parsed))
    : 0;
}

async function requireOwnerContext() {
  const session = await verifyAdminSession();

  if (session.role !== "owner") {
    throw new Error(
      "Sólo la cuenta propietaria puede ejecutar mantenimiento general."
    );
  }

  const sessionToken =
    await readAdminSessionToken();

  if (!sessionToken) {
    throw new Error(
      "La sesión administrativa no está disponible."
    );
  }

  return {
    session,
    sessionToken,
  };
}

async function inspectRuntimeJunk(
  actorUserId: string,
  sessionToken: string
): Promise<RuntimeJunkSummary> {
  const result = await adminQuery<{
    result: unknown;
  }>(
    `SELECT deuna_admin.inspect_site_runtime_junk(
       $1,
       $2
     ) AS result`,
    [
      actorUserId,
      sessionToken,
    ]
  );
  const raw = asRecord(
    result.rows[0]?.result
  );

  if (raw.outcome !== "ok") {
    throw new Error(
      "El diagnóstico general fue rechazado por la base."
    );
  }

  return {
    adminSessions: numberField(
      raw,
      "adminSessions"
    ),
    accountSessions: numberField(
      raw,
      "accountSessions"
    ),
    usedRecoveryCodes: numberField(
      raw,
      "usedRecoveryCodes"
    ),
    oldAdminEvents: numberField(
      raw,
      "oldAdminEvents"
    ),
    orphanPreferences: numberField(
      raw,
      "orphanPreferences"
    ),
    orphanRatings: numberField(
      raw,
      "orphanRatings"
    ),
    orphanInsights: numberField(
      raw,
      "orphanInsights"
    ),
    orphanGameUpdates: numberField(
      raw,
      "orphanGameUpdates"
    ),
    pendingMediaCleanups: numberField(
      raw,
      "pendingMediaCleanups"
    ),
  };
}

async function listPendingMediaCleanups(
  actorUserId: string,
  sessionToken: string
) {
  const result = await adminQuery<{
    game_slug: string;
    created_at: Date;
    last_attempt_at: Date | null;
    attempts: number;
  }>(
    `SELECT *
       FROM deuna_admin.list_game_media_cleanup_queue(
         $1,
         $2
       )`,
    [
      actorUserId,
      sessionToken,
    ]
  );

  return result.rows.map((row) => ({
    slug: row.game_slug,
    createdAt: row.created_at,
    lastAttemptAt: row.last_attempt_at,
    attempts: row.attempts,
  }));
}

function overviewFingerprint(
  runtime: RuntimeJunkSummary,
  media: SiteMediaJunkScan,
  pending:
    readonly SiteMaintenancePendingCleanup[]
) {
  return createHash("sha256")
    .update(JSON.stringify({
      runtime,
      media: media.fingerprint,
      pending: pending.map((entry) => [
        entry.slug,
        entry.createdAt.toISOString(),
        entry.lastAttemptAt
          ?.toISOString() ?? null,
        entry.attempts,
      ]),
    }))
    .digest("hex");
}

export async function inspectSiteMaintenance():
  Promise<SiteMaintenanceOverview> {
  const {
    session,
    sessionToken,
  } = await requireOwnerContext();

  const [
    runtime,
    pendingMediaCleanups,
  ] = await Promise.all([
    inspectRuntimeJunk(
      session.userId,
      sessionToken
    ),
    listPendingMediaCleanups(
      session.userId,
      sessionToken
    ),
  ]);
  const media = await scanSiteMediaJunk(
    pendingMediaCleanups.map(
      (entry) => entry.slug
    )
  );
  const safeRecords =
    runtime.adminSessions +
    runtime.accountSessions +
    runtime.usedRecoveryCodes +
    runtime.oldAdminEvents +
    runtime.orphanPreferences +
    runtime.orphanRatings +
    runtime.orphanInsights;
  const safeBytes =
    media.orphaned.reduce(
      (total, candidate) =>
        total + candidate.bytes,
      0
    );
  const manualIssues =
    runtime.orphanGameUpdates +
    media.unknownNamespaces.length +
    media.unexpectedEntries.length;

  return {
    runtime,
    media,
    pendingMediaCleanups,
    safeRecords,
    safeFiles: media.orphaned.length,
    safeBytes,
    safeMarkers: media.staleMarkers.length,
    safeDirectories:
      media.emptyNamespaces.length,
    manualIssues,
    fingerprint: overviewFingerprint(
      runtime,
      media,
      pendingMediaCleanups
    ),
  };
}

async function purgeRuntimeJunk(
  actorUserId: string,
  sessionToken: string,
  expected: RuntimeJunkSummary
) {
  const result = await adminQuery<{
    result: unknown;
  }>(
    `SELECT deuna_admin.purge_site_runtime_junk(
       $1, $2, $3, $4, $5, $6, $7, $8, $9
     ) AS result`,
    [
      actorUserId,
      sessionToken,
      expected.adminSessions,
      expected.accountSessions,
      expected.usedRecoveryCodes,
      expected.oldAdminEvents,
      expected.orphanPreferences,
      expected.orphanRatings,
      expected.orphanInsights,
    ]
  );
  const raw = asRecord(
    result.rows[0]?.result
  );

  if (raw.outcome === "conflict") {
    return {
      outcome: "conflict" as const,
      recordsDeleted: 0,
    };
  }

  if (raw.outcome !== "purged") {
    throw new Error(
      "La purga general fue rechazada por la base."
    );
  }

  return {
    outcome: "purged" as const,
    recordsDeleted:
      numberField(raw, "adminSessions") +
      numberField(raw, "accountSessions") +
      numberField(raw, "usedRecoveryCodes") +
      numberField(raw, "oldAdminEvents") +
      numberField(raw, "orphanPreferences") +
      numberField(raw, "orphanRatings") +
      numberField(raw, "orphanInsights"),
  };
}

export async function purgeSiteMaintenance(
  actorUserId: string,
  expectedFingerprint: string
): Promise<SiteMaintenancePurgeResult> {
  const {
    session,
    sessionToken,
  } = await requireOwnerContext();

  if (
    session.userId !== actorUserId
  ) {
    throw new Error(
      "La sesión administrativa no coincide con el actor."
    );
  }

  const current =
    await inspectSiteMaintenance();

  if (
    current.fingerprint !==
    expectedFingerprint
  ) {
    return {
      outcome: "conflict",
      current,
    };
  }

  const runtime = await purgeRuntimeJunk(
    actorUserId,
    sessionToken,
    current.runtime
  );

  if (runtime.outcome === "conflict") {
    return {
      outcome: "conflict",
      current:
        await inspectSiteMaintenance(),
    };
  }

  const media = await purgeSiteMediaJunk(
    current.media.fingerprint,
    current.pendingMediaCleanups.map(
      (entry) => entry.slug
    )
  );

  if (media.outcome === "conflict") {
    const final =
      await inspectSiteMaintenance();

    return {
      outcome: "partial",
      recordsDeleted:
        runtime.recordsDeleted,
      mediaFilesDeleted: 0,
      mediaBytesDeleted: 0,
      markersDeleted: 0,
      directoriesDeleted: 0,
      pendingCompleted: 0,
      pendingRemaining:
        final.pendingMediaCleanups.length,
      skipped: 0,
      final,
    };
  }

  let pendingCompleted = 0;

  for (
    const pending of
    current.pendingMediaCleanups
  ) {
    const result =
      await retryPendingGameMediaCleanup(
        pending.slug,
        actorUserId
      );

    if (
      result.outcome === "completed" ||
      result.outcome === "not_found"
    ) {
      pendingCompleted += 1;
    }
  }

  await adminQuery(
    `INSERT INTO deuna_admin.admin_audit_log (
       user_id,
       action,
       entity_type,
       entity_id,
       details
     )
     VALUES ($1, 'site_media_junk_purged', 'maintenance', 'site', $2::jsonb)`,
    [
      actorUserId,
      JSON.stringify({
        files: media.files,
        bytes: media.bytes,
        markers: media.markers,
        directories: media.directories,
        skipped: media.skipped,
        pendingCompleted,
      }),
    ]
  );

  const final =
    await inspectSiteMaintenance();
  const stillHasSafeJunk =
    final.safeRecords > 0 ||
    final.safeFiles > 0 ||
    final.safeMarkers > 0 ||
    final.safeDirectories > 0 ||
    final.pendingMediaCleanups.length > 0;

  return {
    outcome: stillHasSafeJunk
      ? "partial"
      : "purged",
    recordsDeleted:
      runtime.recordsDeleted,
    mediaFilesDeleted: media.files,
    mediaBytesDeleted: media.bytes,
    markersDeleted: media.markers,
    directoriesDeleted:
      media.directories,
    pendingCompleted,
    pendingRemaining:
      final.pendingMediaCleanups.length,
    skipped: media.skipped,
    final,
  };
}
