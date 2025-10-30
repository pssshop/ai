import { useEffect, useMemo, useState } from "react";
import type { Entity } from "@/types";

export function useWorkspace(entityList: Entity[]) {
  const [ids, setIds] = useState<string[]>([]);

  const entityMap = useMemo(() => new Map(entityList.map(e => [e.id, e] as const)), [entityList]);

  useEffect(() => {
    setIds(prev => prev.filter(id => entityMap.has(id)));
  }, [entityMap]);

  const add = (entity: Entity) => {
    setIds(prev => (prev.includes(entity.id) ? prev : [...prev, entity.id]));
  };

  const remove = (id: string) => {
    setIds(prev => prev.filter(x => x !== id));
  };

  const workspaceEntities = useMemo(() => ids.map(id => entityMap.get(id)).filter(Boolean) as Entity[], [ids, entityMap]);

  return { ids, add, remove, workspaceEntities, setIds };
}
