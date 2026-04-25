
const TAG_SPLIT_PATTERN = /[\n,]/;

function expandTagPipes(tag: string): string[] {
  // Split on pipes, but preserve surrounding text
  // E.g. "big|huge trees" => ["big trees", "huge trees"]
  if (!tag.includes("|")) return [tag];
  // Split by spaces to find pipe groups
  // We'll use a regex to match words or groups with pipes
  // Approach: split by spaces, expand pipe groups, then join all combinations
  const parts = tag.split(/\s+/).map(part => part.split("|"));
  // Cartesian product to generate all combinations
  function cartesian(arr: string[][]): string[] {
    return arr.reduce(
      (acc, curr) =>
        acc.flatMap(a => curr.map(b => a.concat([b]))),
      [[]] as string[][]
    ).map(words => words.join(" ").replace(/\s+/g, " ").trim());
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
