import GameGalleryMediaManager from "@/components/admin/GameGalleryMediaManager";
import GameMediaAccessibilityEditor from "@/components/admin/GameMediaAccessibilityEditor";
import GameMediaAssignmentsWorkspace from "@/components/admin/GameMediaAssignmentsWorkspace";
import GameMultimediaUtilityRail from "@/components/admin/GameMultimediaUtilityRail";
import { GameMultimediaWorkspaceProvider } from "@/components/admin/GameMultimediaWorkspaceProvider";

import shellStyles from "./GameMultimediaShell.module.css";

type GameMultimediaEditorProps = {
  slug: string;
  revision: number;
};

export default function GameMultimediaEditor({
  slug,
  revision,
}: GameMultimediaEditorProps) {
  return (
    <GameMultimediaWorkspaceProvider key={`${slug}:${revision}`} slug={slug} revision={revision}>
      <div className={shellStyles.workspaceShell}>
        <div className={shellStyles.mainColumn}>
          <div
            className={shellStyles.assignmentHost}
          >
            <GameMediaAssignmentsWorkspace slug={slug} />
          </div>

          <GameGalleryMediaManager slug={slug} />

          <GameMediaAccessibilityEditor slug={slug} />
        </div>

        <GameMultimediaUtilityRail slug={slug} />
      </div>
    </GameMultimediaWorkspaceProvider>
  );
}
