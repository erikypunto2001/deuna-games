import {
  getAccountAvatarMetadata,
} from "@/lib/accounts/avatar-service";
import {
  getAccountGamePreferences,
} from "@/lib/accounts/personalization-service";
import {
  readAccountSession,
} from "@/lib/accounts/session";
import {
  resolveAccountUpdateNotifications,
  type AccountUpdateNotification,
} from "@/lib/accounts/update-notifications";
import {
  getPublicSiteConfig,
} from "@/lib/site/public-site-config";
import {
  getPublicResolvedUpdates,
} from "@/lib/updates/public-updates";

import HeaderClient from "./HeaderClient";
import HeaderGuestClient from "./HeaderGuestClient";

export default async function Header() {
  const [config, session] = await Promise.all([
    getPublicSiteConfig(),
    readAccountSession(),
  ]);
  if (!session) {
    return <HeaderGuestClient siteName={config.name} />;
  }

  const [notifications, avatarMetadata] = await Promise.all([
    Promise.all([
      getAccountGamePreferences(session.userId),
      getPublicResolvedUpdates(),
    ])
      .then(([preferences, updates]) =>
        resolveAccountUpdateNotifications(preferences, updates)
      )
      .catch(() => null as AccountUpdateNotification[] | null),
    getAccountAvatarMetadata(session.userId).catch(() => null),
  ]);
  const accountAvatarVersion = avatarMetadata
    ? avatarMetadata.updatedAt.getTime().toString(36)
    : null;

  return (
    <HeaderClient
      siteName={config.name}
      accountIdentity={{
        username: session.username,
        displayName: session.displayName,
      }}
      accountNotifications={notifications}
      accountAvatarVersion={accountAvatarVersion}
    />
  );
}
