/**
 * The artist's job maps (public/harita/bolge<region>.webp): the picture's size, and where each of the
 * village's jobs sits on the road painted in it, in percent of the picture (x from the left, y from the
 * top), first job first. A village without one gets a plain green map with a road drawn on it.
 */
export interface SagaArt {
  w: number;
  h: number;
  spots: { x: number; y: number }[];
}

export const SAGA_MAPS: Record<number, SagaArt> = {
  1: {
    w: 802,
    h: 1962,
    spots: [
      { x: 76, y: 89 },
      { x: 38, y: 72 },
      { x: 76, y: 62 },
      { x: 67, y: 50 },
      { x: 37, y: 40 },
      { x: 70, y: 30 },
      { x: 40, y: 16 },
      { x: 66, y: 9 },
    ],
  },
  2: {
    w: 793,
    h: 1983,
    spots: [
      { x: 76, y: 84 },
      { x: 35, y: 68 },
      { x: 71, y: 55 },
      { x: 39, y: 43 },
      { x: 68, y: 21 },
    ],
  },
};
