// Find Music page numbers: which number is selected next, and the easter egg on the last page.
const test = require("node:test");
const assert = require("node:assert/strict");
const p = require("../../src/pack-manager/pager.ts");

test("going forward, the next page is selected; at the last page, the last page itself", () => {
  assert.equal(p.preselected(1, 2, "forward"), 2);
  assert.equal(p.preselected(3, 4, "forward"), 4);
  assert.equal(p.preselected(5, 5, "forward"), 5);
});

test("after going back, the previous page is selected; at page 1, page 1", () => {
  assert.equal(p.preselected(4, 5, "back"), 3);
  assert.equal(p.preselected(1, 5, "back"), 1);
});

test("the direction only changes when a page in the other direction is picked", () => {
  let dir = "forward";
  dir = p.directionAfter(1, 2, dir); // forward
  dir = p.directionAfter(2, 4, dir); // forward
  assert.equal(dir, "forward");
  dir = p.directionAfter(4, 2, dir); // picked a lower page
  assert.equal(dir, "back");
  dir = p.directionAfter(2, 2, dir); // the same page keeps it
  assert.equal(dir, "back");
  assert.equal(p.preselected(2, 5, dir), 1);
  dir = p.directionAfter(2, 3, dir);
  assert.equal(dir, "forward");
});

test("one more page number is shown while there may be more results, never more than 10", () => {
  assert.equal(p.pagesToShow(1, 1, null), 2);
  assert.equal(p.pagesToShow(3, 5, null), 6);
  assert.equal(p.pagesToShow(4, 4, 4), 4);
  assert.equal(p.pagesToShow(10, 10, null), 10);
});

test("the easter egg is only on the last page, going forward, on its own number", () => {
  assert.equal(p.showsEasterEgg(4, 4, 4, 4, "forward"), true);
  assert.equal(p.showsEasterEgg(3, 4, 4, 4, "forward"), false, "another number");
  assert.equal(p.showsEasterEgg(4, 4, 4, 4, "back"), false, "going back");
  assert.equal(p.showsEasterEgg(3, 3, 4, null, "forward"), false, "not the last page");
  assert.equal(p.showsEasterEgg(10, 10, 10, null, "forward"), true, "page 10 is always the last");
});

test("with 20 results a page there are 5 pages, so page 5 is the last one", () => {
  assert.equal(p.pagesToShow(4, 4, null, 5), 5);
  assert.equal(p.showsEasterEgg(5, 5, 5, null, "forward", 5), true);
  assert.equal(p.showsEasterEgg(5, 5, 6, null, "forward", 10), false);
});

const fo = require("../../src/pack-manager/findOptions.ts");
const tr = (id, duration, extra = {}) => ({ site: "soundcloud", id, url: "", title: "T" + id, uploader: "U" + id, duration, thumbnail: "", long: false, preview_only: false, installed: "", fill: {}, ...extra });

test("Find Music: sorting by length puts unknown lengths last", () => {
  const list = [tr("a", 300), tr("b", 0), tr("c", 120)];
  assert.deepEqual(fo.arrange(list, "shortest", "any", "all").map((t) => t.id), ["c", "a", "b"]);
  assert.deepEqual(fo.arrange(list, "longest", "any", "all").map((t) => t.id), ["a", "c", "b"]);
});

test("Find Music: the length and show filters", () => {
  const list = [tr("a", 200), tr("b", 400), tr("c", 900, { installed: "X" }), tr("d", 100, { preview_only: true })];
  assert.deepEqual(fo.arrange(list, "relevance", "short", "all").map((t) => t.id), ["a", "d"]);
  assert.deepEqual(fo.arrange(list, "relevance", "medium", "all").map((t) => t.id), ["b"]);
  assert.deepEqual(fo.arrange(list, "relevance", "any", "new").map((t) => t.id), ["a", "b", "d"]);
  assert.deepEqual(fo.arrange(list, "relevance", "any", "downloadable").map((t) => t.id), ["a", "b"]);
});
