const TAG_SPLIT_PATTERN = /[\n,]/;

export function normalizeTags(input: string): string[] {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];

  for (const rawTag of input.split(TAG_SPLIT_PATTERN)) {
    const trimmedTag = rawTag.replace(/\s+/g, " ").trim();

    if (!trimmedTag) {
      continue;
    }

    const dedupeKey = trimmedTag.toLocaleLowerCase();

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalizedTags.push(trimmedTag);
  }

  return normalizedTags;
}

export function renderPayload(tags: string[]): string {
  return `tags:${tags.join(",")}`;
}
