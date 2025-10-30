// Build a map of available asset URLs for quick lookup by friendly name.
// Uses Vite's import.meta.glob to eagerly load asset URLs from src/assets.

// use the newer `query` + `import` options to get raw URLs from Vite
const modules = import.meta.glob("../assets/*.{png,jpg,jpeg,svg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const assetByName: Record<string, string> = {};

Object.keys(modules).forEach((path) => {
  // path looks like '../assets/Stasis Shield.png'
  const file = path.split("/").pop() || path;
  const name = file.replace(/\.[^.]+$/, "");
  assetByName[name] = modules[path];
});

export function getAssetForName(name?: string | null): string | null {
  if (!name) return null;
  // Try direct match first
  if (assetByName[name]) return assetByName[name];
  // Try case-insensitive match
  const key = Object.keys(assetByName).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? assetByName[key] : null;
}

export default getAssetForName;
