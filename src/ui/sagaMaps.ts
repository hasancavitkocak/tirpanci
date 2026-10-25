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
  // (Held sideways: wide pictures, the road from the bottom left up to the right, ten stops each.)
  1: {
    w: 1870,
    h: 841,
    spots: [
      { x: 20.0, y: 76.7 },
      { x: 29.6, y: 69.3 },
      { x: 39.9, y: 64.9 },
      { x: 44.1, y: 53.7 },
      { x: 51.9, y: 45.5 },
      { x: 62.8, y: 49.0 },
      { x: 74.4, y: 46.5 },
      { x: 81.4, y: 38.4 },
      { x: 87.0, y: 28.5 },
      { x: 93.0, y: 17.3 },
    ],
  },
  2: {
    w: 1870,
    h: 841,
    spots: [
      { x: 20.9, y: 76.0 },
      { x: 31.7, y: 66.3 },
      { x: 39.8, y: 57.7 },
      { x: 47.9, y: 47.8 },
      { x: 59.1, y: 51.5 },
      { x: 70.8, y: 49.5 },
      { x: 79.0, y: 42.6 },
      { x: 86.1, y: 34.7 },
      { x: 89.8, y: 24.5 },
      { x: 94.0, y: 14.9 },
    ],
  },
};
