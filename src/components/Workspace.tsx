import type { Entity } from "@/types";
import { DetailView } from "@/components/DetailView";

interface WorkspaceProps {
  entities: Entity[];
  onRemove: (id: string) => void;
}

export function Workspace({ entities, onRemove }: WorkspaceProps) {
  return (
    <section id="workspaceOuter">
      <div id="columnsWrapper">
        {entities.map(entity => (
          <DetailView key={entity.id} entity={entity} onRemove={() => onRemove(entity.id)} />
        ))}
      </div>
    </section>
  );
}
