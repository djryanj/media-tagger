// Tag normalization and pipe expansion logic for frontend
// Mirrors backend logic in apps/api/src/tags.ts

const TAG_SPLIT_PATTERN = /[\n,]/;

function expandTagPipes(tag: string): string[] {
  if (!tag.includes("|")) return [tag];
  const parts = tag.split(/\s+/).map((part) => part.split("|"));
  function cartesian(arr) {
    return arr.reduce(
      (acc, curr) =>
        acc.flatMap((a) => curr.map((b) => a.concat([b]))),
      [[]]
    ).map((words) => words.join(" ").replace(/\s+/g, " ").trim());
  }
  return cartesian(parts);
}

export function normalizeTags(input) {
  const seen = new Set();
  const normalizedTags = [];
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
