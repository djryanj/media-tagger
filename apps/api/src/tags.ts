
const TAG_SPLIT_PATTERN = /[\n,]/;

function expandTagPipes(tag: string): string[] {
  // Split on pipes, but preserve surrounding text
  // E.g. "big|huge trees" => ["big trees", "huge trees"]
  // E.g. "large trees|" => ["large", "large trees"]
  // E.g. "large |trees" => ["large", "large trees"]
  if (!tag.includes("|")) return [tag];
  const parts = tag.split(/\s+/).map(part => part.split("|"));
  function cartesian(arr: string[][]): string[] {
    const combos = arr.reduce(
      (acc, curr) =>
        acc.flatMap(a => curr.map(b => a.concat([b]))),
      [[]] as string[][]
    );
    // Sort so that tags with more omitted (blank) segments come first
    return combos
      .map(words => words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim())
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

    if (!trimmedTag) {
      continue;
    }

    for (const expanded of expandTagPipes(trimmedTag)) {
      const dedupeKey = expanded.toLocaleLowerCase();
      if (!expanded || seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      normalizedTags.push(expanded);
    }
  }

  return normalizedTags;
}

export function renderPayload(tags: string[]): string {
  return `tags:${tags.join(",")}`;
}
