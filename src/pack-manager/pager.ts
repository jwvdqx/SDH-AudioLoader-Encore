// Page numbers for Find Music results, like a search engine's: 1 2 3 4 ...
// When the selection moves down onto the numbers, the page that is most likely wanted next is
// already selected: the next one while going forward, the previous one after going back. The
// direction only changes when you pick a page in the other direction.
// At the end of the road (the last page going forward, page 1 going back) the current page itself
// is selected. On the last page that number shows a little easter egg (a λ).

export type Direction = "forward" | "back";

export const MAX_PAGES = 10;

/** The direction after moving from page `from` to page `to` (the same page keeps it). */
export function directionAfter(from: number, to: number, before: Direction): Direction {
  if (to > from) return "forward";
  if (to < from) return "back";
  return before;
}

/** How many page numbers to show: every page seen, plus one more while there may be more results. */
export function pagesToShow(current: number, highestSeen: number, lastPage: number | null): number {
  if (lastPage !== null) return Math.min(MAX_PAGES, lastPage);
  return Math.min(MAX_PAGES, Math.max(current, highestSeen) + 1);
}

/** The page number selected when the selection enters the numbers. */
export function preselected(current: number, shown: number, direction: Direction): number {
  if (direction === "forward") return Math.min(current + 1, shown);
  return Math.max(current - 1, 1);
}

/** The easter egg: going forward on the last page, the current (last) number is selected. */
export function showsEasterEgg(page: number, current: number, shown: number, lastPage: number | null, direction: Direction): boolean {
  const isLast = lastPage !== null ? current >= lastPage : current >= MAX_PAGES;
  return isLast && direction === "forward" && page === current && current === shown;
}
