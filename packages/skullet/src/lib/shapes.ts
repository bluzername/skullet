import {
  measureSkeleton,
  surfacesOf,
  type SkeletonRect,
  type SkeletonSurface,
} from "./measure";
import { hash, serialize } from "./snapshot";

const STORAGE_KEY = "skullet:shapes";
const VERSION = 3; // Bumped whenever the stored markup changes meaning
const MAX_SHAPES = 50;
const MAX_LENGTH = 20_000;

/** All that outlives a visit: where the bones go and the boxes under them, at the one width they fit. */
export type StoredShape = {
  width: number;
  height: number;
  rects: SkeletonRect[];
  surfaces: SkeletonSurface[];
};

type Stored = Record<string, StoredShape>; // Oldest first

// Real text, kept in memory only — exact for a reload within the same visit
const session = new Map<string, string>();
const shown = new Map<string, Set<() => void>>();

let era = 0;

/** Content from an earlier era was on screen when shapes were forgotten: it's whoever just left's, so it never saves again. */
export const shapeEra = () => era;

let listening = false;

// Shapes are shared with every tab, so a forget in one is a forget in all
function followOtherTabs() {
  if (listening) return;
  listening = true;
  addEventListener("storage", ({ key, newValue }) => {
    if (key === null || (key === STORAGE_KEY && newValue === null)) {
      forgetShapes({ persisted: false });
      era++;
    }
  });
}

/** Registers a save for content on screen under `key`; returns its unregister. */
export function trackShape(key: string, save: () => void) {
  followOtherTabs();
  if (!shown.has(key)) shown.set(key, new Set());
  shown.get(key)!.add(save);
  return () => shown.get(key)?.delete(save);
}

/** Saves every shown copy of `key` now, so a skeleton about to recall it gets the latest. */
export function flushShapes(key: string) {
  for (const save of shown.get(key) ?? []) save();
}

function read(): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return parsed?.v === VERSION ? parsed.shapes : {};
  } catch {
    return {};
  }
}

function write(shapes: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, shapes }));
  } catch {
    // Storage full or blocked; the session copy still covers this visit
  }
}

const px = (value: number) => Math.round(value * 100) / 100;

const rounded = <T extends SkeletonRect | SkeletonSurface>(box: T): T => ({
  ...box,
  x: px(box.x),
  y: px(box.y),
  width: px(box.width),
  height: px(box.height),
});

export function rememberShape(key: string, element: HTMLElement) {
  session.set(key, serialize(element));

  // Computed, not a rect, which a scaled ancestor would shrink and restoring would shrink again
  const { width, height } = getComputedStyle(element);
  let covered = new Set<Element>();
  const rects = measureSkeleton(element, element, {
    mark: false,
    onCovered: (set) => (covered = set),
  }).map(rounded);
  const surfaces = surfacesOf(element, covered).map(rounded);
  const shape = {
    width: px(parseFloat(width)),
    height: px(parseFloat(height)),
    rects,
    surfaces,
  };
  if (JSON.stringify(shape).length > MAX_LENGTH) return;

  const shapes = read();
  const stored = hash(key); // A key can be a path or an id naming someone
  // Re-inserted so it moves to the end: key order is recency
  delete shapes[stored];
  shapes[stored] = shape;
  const keys = Object.keys(shapes);
  for (const stale of keys.slice(0, keys.length - MAX_SHAPES)) {
    delete shapes[stale];
  }
  write(shapes);
}

/** The real markup, from earlier this visit. */
export function recallShape(key: string): string | null {
  return session.get(key) ?? null;
}

/** The bones stored on an earlier visit. */
export const recallStored = (key: string): StoredShape | null =>
  read()[hash(key)] ?? null;

/** Forgets remembered shapes — call it on sign-out. */
export function forgetShapes({ persisted = true } = {}) {
  session.clear();
  if (!persisted) return;
  era++;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to forget
  }
}
