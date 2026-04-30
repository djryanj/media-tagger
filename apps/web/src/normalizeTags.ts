// Tag normalization and pipe expansion logic for frontend
// Mirrors backend logic in apps/api/src/tags.ts

const TAG_SPLIT_PATTERN = /[\n,]/;

function expandTagPipes(tag: string): string[] {
  if (!tag.includes("|")) return [tag];
  const parts: string[][] = tag.split(/\s+/).map((part: string) => part.split("|"));
  function cartesian(arr: string[][]): string[] {
    const combos = arr.reduce(
      (acc: string[][], curr: string[]) =>
        acc.flatMap((a: string[]) => curr.map((b: string) => a.concat([b]))),
      [[]] as string[][]
    );
    // Sort so that tags with more omitted (blank) segments come first
    return combos
      .map((words: string[]) => words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .sort((a, b) => a.split(" ").length - b.split(" ").length);
  }
  return cartesian(parts);
}

export function normalizeTags(input: string): string[] {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];
  for (const rawTag of input.split(TAG_SPLIT_PATTERN)) {
    const trimmedTag = rawTag.replace(/\s+/g, " ").trim();
    if (!trimmedTag) continue;
    for (const expanded of expandTagPipes(trimmedTag)) {
      const dedupeKey = expanded.toLocaleLowerCase();
      if (!expanded || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      normalizedTags.push(expanded);
    }
  }
  return normalizedTags;
}
