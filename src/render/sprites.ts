import skinData from './skin-data.json';

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

export const SKINS: Record<string, SkinAnimationSet> = skinData as any;

export const CHROMIUM_SPRITES = {
  CACTUS_SMALL: { x: 228, y: 2, w: 17, h: 35 },
  CACTUS_DOUBLE: { x: 228, y: 2, w: 34, h: 35 },
  CACTUS_LARGE: { x: 332, y: 2, w: 25, h: 50 },
  PTERODACTYL: [
    { x: 134, y: 2, w: 46, h: 40 },
    { x: 180, y: 2, w: 46, h: 40 },
  ],
  CLOUD: { x: 86, y: 2, w: 46, h: 14 },
  STAR: { x: 645, y: 2, w: 9, h: 9 },
  MOON: { x: 484, y: 2, w: 40, h: 40 },
  HORIZON: { x: 2, y: 54, w: 600, h: 12 },
};

export class SpriteManager {
  private images: Map<string, HTMLImageElement> = new Map();

  async load(src: string = '/dino-skins.png'): Promise<HTMLImageElement> {
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

  getImage(src: string = '/dino-skins.png'): HTMLImageElement | null {
    return this.images.get(src) || null;
  }
}
