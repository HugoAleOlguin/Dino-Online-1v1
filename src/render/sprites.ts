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
