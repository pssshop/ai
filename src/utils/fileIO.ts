/** Utilities for reading/parsing files from input elements. */
export async function readJsonFile<T>(file: File): Promise<T | null> {
  try {
    const text = await file.text();
    return JSON.parse(text) as T;
  } catch (error) {
    console.error("readJsonFile: Failed to parse JSON", error);
    return null;
  }
}
