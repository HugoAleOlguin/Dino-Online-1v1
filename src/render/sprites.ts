export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkinAnimationSet {
  id: string;
  name: string;
  idle: SpriteRect;
  run: [SpriteRect, SpriteRect];
  duck: [SpriteRect, SpriteRect];
  dead: SpriteRect;
  targetHeight: number;
  duckHeight: number;
}

export const SKINS: Record<string, SkinAnimationSet> = {
  classic: {
    id: 'classic',
    name: 'T-Rex Clásico',
    idle: { x: 6, y: 58, w: 88, h: 90 },
    run: [
      { x: 102, y: 54, w: 88, h: 94 },
      { x: 198, y: 54, w: 88, h: 94 },
    ],
    duck: [
      { x: 678, y: 88, w: 118, h: 60 },
      { x: 804, y: 88, w: 118, h: 60 },
    ],
    dead: { x: 486, y: 54, w: 88, h: 94 },
    targetHeight: 48,
    duckHeight: 30,
  },
  party: {
    id: 'party',
    name: 'T-Rex Fiesta 🥳',
    idle: { x: 6, y: 245, w: 88, h: 118 },
    run: [
      { x: 102, y: 241, w: 88, h: 122 },
      { x: 196, y: 237, w: 88, h: 126 },
    ],
    duck: [
      { x: 468, y: 277, w: 118, h: 86 },
      { x: 592, y: 277, w: 118, h: 86 },
    ],
    dead: { x: 290, y: 237, w: 88, h: 126 },
    targetHeight: 58,
    duckHeight: 40,
  },
  surf: {
    id: 'surf',
    name: 'T-Rex Surfista 🏄',
    idle: { x: 6, y: 462, w: 50, h: 55 },
    run: [
      { x: 61, y: 462, w: 50, h: 51 },
      { x: 115, y: 462, w: 50, h: 55 },
    ],
    duck: [
      { x: 169, y: 462, w: 50, h: 55 },
      { x: 223, y: 464, w: 46, h: 51 },
    ],
    dead: { x: 223, y: 464, w: 46, h: 51 },
    targetHeight: 52,
    duckHeight: 34,
  },
  horse: {
    id: 'horse',
    name: 'T-Rex Jinete 🐎',
    idle: { x: 6, y: 381, w: 50, h: 67 },
    run: [
      { x: 61, y: 381, w: 50, h: 67 },
      { x: 123, y: 381, w: 54, h: 71 },
    ],
    duck: [
      { x: 61, y: 381, w: 50, h: 67 },
      { x: 123, y: 381, w: 54, h: 71 },
    ],
    dead: { x: 188, y: 383, w: 46, h: 62 },
    targetHeight: 56,
    duckHeight: 38,
  },
  athlete: {
    id: 'athlete',
    name: 'T-Rex Atleta 🏃',
    idle: { x: 253, y: 398, w: 44, h: 47 },
    run: [
      { x: 300, y: 398, w: 44, h: 47 },
      { x: 350, y: 398, w: 42, h: 54 },
    ],
    duck: [
      { x: 803, y: 411, w: 65, h: 30 },
      { x: 871, y: 411, w: 65, h: 30 },
    ],
    dead: { x: 397, y: 398, w: 40, h: 40 },
    targetHeight: 48,
    duckHeight: 30,
  },
};

export class SpriteManager {
  private image: HTMLImageElement | null = null;
  private isLoaded = false;

  async load(src: string = '/dino-transparent.png'): Promise<void> {
    if (this.isLoaded && this.image) return;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        this.image = img;
        this.isLoaded = true;
        resolve();
      };
      img.onerror = (e) => reject(new Error(`Failed to load sprite sheet: ${src}`));
    });
  }

  getImage(): HTMLImageElement | null {
    return this.image;
  }
}
