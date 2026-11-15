// Find Music options: results per page, sort and filters. Sorting and filters work on the page that
// is shown (the sites decide the order of the whole search).
import type { FoundTrack } from "../python";

export type SortKey = "relevance" | "shortest" | "longest" | "title" | "uploader" | "views";
export type LengthKey = "any" | "short" | "medium" | "long";
export type ShowKey = "all" | "new" | "downloadable";

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50].map((n) => ({ data: n, label: `${n}` }));
export const SORT_OPTIONS: { data: SortKey; label: string }[] = [
  { data: "relevance", label: "Best match" },
  { data: "shortest", label: "Shortest" },
  { data: "longest", label: "Longest" },
  { data: "title", label: "Title A-Z" },
  { data: "uploader", label: "Uploader A-Z" },
  { data: "views", label: "Most viewed" },
];
export const LENGTH_OPTIONS: { data: LengthKey; label: string }[] = [
  { data: "any", label: "Any length" },
  { data: "short", label: "Under 4 min" },
  { data: "medium", label: "4 to 10 min" },
  { data: "long", label: "Over 10 min" },
];
export const SHOW_OPTIONS: { data: ShowKey; label: string }[] = [
  { data: "all", label: "Everything" },
  { data: "new", label: "Not added yet" },
  { data: "downloadable", label: "Can be added" },
];

export function arrange(list: FoundTrack[], sort: SortKey, length: LengthKey, show: ShowKey): FoundTrack[] {
  const fits = (t: FoundTrack) => {
    const d = t.duration || 0;
    if (length === "short" && !(d > 0 && d < 240)) return false;
    if (length === "medium" && !(d >= 240 && d <= 600)) return false;
    if (length === "long" && !(d > 600)) return false;
    if (show === "new" && t.installed) return false;
    if (show === "downloadable" && (t.installed || t.preview_only)) return false;
    return true;
  };
  const out = list.filter(fits);
  const unknownLast = (d: number, up: boolean) => (d > 0 ? d : up ? Infinity : -1);
  if (sort === "shortest") out.sort((a, b) => unknownLast(a.duration, true) - unknownLast(b.duration, true));
  else if (sort === "longest") out.sort((a, b) => unknownLast(b.duration, false) - unknownLast(a.duration, false));
  else if (sort === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "uploader") out.sort((a, b) => a.uploader.localeCompare(b.uploader) || a.title.localeCompare(b.title));
  else if (sort === "views") out.sort((a, b) => (b.views || 0) - (a.views || 0));
  return out;
}

