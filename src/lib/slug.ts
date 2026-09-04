/**
 * Slug generation for event types (and anything else that wants a
 * lowercase-hyphenated identifier derived from free text).
 */

const MAX_SLUG_LENGTH = 60;

/**
 * Lowercases, strips diacritics, replaces anything that isn't `[a-z0-9]`
 * with a hyphen, collapses runs of hyphens, trims leading/trailing hyphens,
 * and truncates to `MAX_SLUG_LENGTH` (trimming a trailing hyphen left by
 * truncation).
 */
export function slugify(text: string): string {
  const ascii = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritical marks

  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const truncated = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, "");
  return truncated;
}

/**
 * Appends `-2`, `-3`, … to `base` until `exists` reports the candidate is
 * free. Re-checks `base` itself first. Each numbered candidate is
 * re-truncated to stay within `MAX_SLUG_LENGTH`.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = base || "untitled";

  if (!(await exists(root))) {
    return root;
  }

  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
}
