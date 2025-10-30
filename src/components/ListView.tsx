import { type ChangeEvent, type KeyboardEvent, useMemo } from "react";
import type { Entity } from "@/types";

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
        {(() => {
          // group versions by baseId (fallback to id)
          const groups = new Map<string, Entity[]>();
          for (const entity of list) {
            const key = entity.baseId ?? entity.id;
            const arr = groups.get(key) ?? [];
            arr.push(entity);
            groups.set(key, arr);
          }

          return Array.from(groups.values()).map(group => {
            const primary = group[0];
            // support both crew `profile_sprite_id` and room `image_sprite_id`
            const rawSource = primary.source as any;
            const spriteId = rawSource?.profile_sprite_id ?? rawSource?.image_sprite_id;
            const profileUrl = spriteId
              ? `https://api.pixelstarships.com/FileService/DownloadSprite?spriteId=${spriteId}`
              : null;

            return (
              <div
                key={primary.baseId ?? primary.id}
                className="entityRow"
                role="button"
                tabIndex={0}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => handleRowKeyDown(event, primary)}
              >
                <div className="entityRowInner">
                  {/* left column: avatar and meta stacked */}
                  <div className="entityLeftCol">
                    {profileUrl ? (
                      <img src={profileUrl} alt={`${primary.name} sprite`} className="entityAvatar" />
                    ) : null}
                    <div className="entityMeta">{primary.type}</div>
                  </div>

                  {/* right column: name and available versions */}
                  <div className="entityRightCol">
                    <div className="entityName">{primary.name}</div>
                    <div className="entityVersions">
                      {group.map(version => {
                        const fileName = (version.source as any)?.__sourceFile?.fileName ?? String((version.source as any)?.__sourceFile?.fileId ?? "unknown");
                        return (
                          <button
                            key={version.id}
                            type="button"
                            className="versionBtn"
                            onClick={e => {
                              e.stopPropagation();
                              onSelect(version);
                            }}
                            title={`Add ${primary.name} — ${fileName}`}
                          >
                            {fileName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          });
        })()}
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
