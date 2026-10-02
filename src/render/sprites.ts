export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SkinAnimationSet {
  id: string;
  name: string;
  file: string;
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
    file: '/dino-classic.png',
    idle: { x: 2, y: 2, w: 44, h: 47 },
    run: [
      { x: 50, y: 2, w: 44, h: 47 },
      { x: 98, y: 2, w: 44, h: 47 },
    ],
    dead: { x: 146, y: 2, w: 44, h: 47 },
    duck: [
      { x: 194, y: 19, w: 59, h: 30 },
      { x: 257, y: 19, w: 59, h: 30 },
    ],
    targetHeight: 47,
    duckHeight: 30,
  },
};

export class SpriteManager {
  private images: Map<string, HTMLImageElement> = new Map();

  async load(src: string): Promise<HTMLImageElement> {
    if (this.images.has(src)) return this.images.get(src)!;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        this.images.set(src, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    });
  }

  getImage(src: string = '/dino-classic.png'): HTMLImageElement | null {
    return this.images.get(src) || null;
  }
}
