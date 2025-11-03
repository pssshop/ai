import type { Entity } from "@/types";
import { DetailView, type EntityEditPayload } from "@/components/DetailView";

interface WorkspaceProps {
  entities: Entity[];
  onRemove: (id: string) => void;
  onUpdate: (entity: Entity, payload: EntityEditPayload) => void;
  showSummaries: boolean;
}

export function Workspace({ entities, onRemove, onUpdate, showSummaries }: WorkspaceProps) {
  return (
    <section id="workspaceOuter">
      <div id="columnsWrapper">
        {entities.length ? (
          entities.map(entity => (
            <DetailView
              key={entity.id}
              entity={entity}
              onRemove={() => onRemove(entity.id)}
              onUpdate={(payload) => onUpdate(entity, payload)}
              showSummaries={showSummaries}
            />
          ))
        ) : (
          <div className="workspaceEmptyCard">
            <div className="workspaceEmptyTitle">No AI selected</div>
            <div className="workspaceEmptySubtitle">Open a crew or room from the list, or create a new draft.</div>
          </div>
        )}
      </div>
    </section>
  );
}
