import { type ChangeEvent, type KeyboardEvent, useMemo } from "react";
import type { Entity } from "@/types";
import { humanizeSpecial, getAssetForName } from "@/utils";

interface ListViewProps {
  entities: Entity[];
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect: (entity: Entity) => void;
}

export function ListView({ entities, filter, onFilterChange, onSelect }: ListViewProps) {
  const { crews, rooms, count } = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    const matches = (entity: Entity) => (!lower ? true : entity.name.toLowerCase().includes(lower));
    const crews = entities
      .filter(entity => entity.type === "crew" && matches(entity))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    const rooms = entities
      .filter(entity => entity.type === "room" && matches(entity))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return { crews, rooms, count: crews.length + rooms.length };
  }, [entities, filter]);

  const handleFilterChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFilterChange(event.target.value);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, entity: Entity) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(entity);
    }
  };

  const renderSection = (label: string, list: Entity[]) => {
    if (!list.length) return null;
    return (
      <div key={label}>
        <div className="entitySectionLabel">{label}</div>
        {list.map(entity => {
          // support both crew `profile_sprite_id` and room `image_sprite_id`
          const rawSource = entity.source as any;
          const spriteId = rawSource?.profile_sprite_id ?? rawSource?.image_sprite_id;
          const profileUrl = spriteId
            ? `https://api.pixelstarships.com/FileService/DownloadSprite?spriteId=${spriteId}`
            : null;

          return (
            <div
              key={entity.id}
              className="entityRow"
              role="button"
              tabIndex={0}
              onClick={() => onSelect(entity)}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => handleRowKeyDown(event, entity)}
            >
              <div className="entityRowInner">
                {/* left column: avatar and meta stacked */}
                <div className="entityLeftCol">
                  {profileUrl ? (
                    <img src={profileUrl} alt={`${entity.name} sprite`} className="entityAvatar" />
                  ) : null}
                  <div className="entityMeta">{entity.type}</div>
                </div>

                {/* right column: name and optional small special icon */}
                <div className="entityRightCol">
                  <div className="entityName">{entity.name}</div>
                  {entity.type === "crew" && entity.source && (entity.source as any).special ? (
                    (() => {
                      const human = humanizeSpecial(String((entity.source as any).special));
                      const url = getAssetForName(human ?? "");
                      return url ? (
                        <img src={url} alt={human ?? "special"} className="specialIconSmall" />
                      ) : null;
                    })()
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div id="entityBrowserHeader">
        <div>Entities</div>
        <div id="entityCount">{count}</div>
      </div>
      <input id="entitySearch" placeholder="Filter by name..." value={filter} onChange={handleFilterChange} />
      <div id="entityList">
        {renderSection("Crew", crews)}
        {renderSection("Rooms", rooms)}
      </div>
    </>
  );
}
