import { describe, it, expect } from 'vitest';

export interface SceneCue {
  id: string;
  startTime: number;
  endTime: number;
  caption: string;
}

export const TRAILER_SCENES: SceneCue[] = [
  {
    id: 'SOLO_HOOK_3D_LAPTOP',
    startTime: 0.0,
    endTime: 3.5,
    caption: '¿TE IMAGINAS JUGAR AL DINO DE GOOGLE...',
  },
  {
    id: 'MULTIPLAYER_REVEAL_3D',
    startTime: 3.5,
    endTime: 7.0,
    caption: '...¿DE A 2 JUGADORES? ⚡',
  },
  {
    id: 'CUSTOMIZE_SKINS_ZOOM',
    startTime: 7.0,
    endTime: 10.5,
    caption: 'ELIGE TU APODO Y TU SKIN FAVORITA',
  },
  {
    id: 'LOBBY_ROOM_SHARE',
    startTime: 10.5,
    endTime: 13.5,
    caption: 'CREA TU SALA Y COMPARTE EL CÓDIGO',
  },
  {
    id: 'MOBILE_CROSSPLAY_MOCKUP',
    startTime: 13.5,
    endTime: 16.5,
    caption: '¡TAMBIÉN JUEGA EN TU CELULAR!',
  },
  {
    id: 'GAMEPLAY_RACE_CLIMAX',
    startTime: 16.5,
    endTime: 19.5,
    caption: 'DUELOS 1v1 EN TIEMPO REAL SIN LATENCIA',
  },
  {
    id: 'REAL_BROWSER_OUTRO',
    startTime: 19.5,
    endTime: 23.0,
    caption: 'https://dino-1v1.vercel.app/',
  },
];

export function getActiveScene(timeSeconds: number): SceneCue | null {
  return TRAILER_SCENES.find(s => timeSeconds >= s.startTime && timeSeconds < s.endTime) || null;
}

export function getTotalTrailerDuration(): number {
  return TRAILER_SCENES[TRAILER_SCENES.length - 1].endTime;
}

describe('Trailer Timeline with 3D Mockups and Mobile Showcase', () => {
  it('covers exactly 23 seconds without timeline gaps', () => {
    expect(getTotalTrailerDuration()).toBe(23.0);
    for (let i = 0; i < TRAILER_SCENES.length - 1; i++) {
      expect(TRAILER_SCENES[i].endTime).toBe(TRAILER_SCENES[i + 1].startTime);
    }
  });

  it('correctly maps time markers to expected 3D scenes', () => {
    expect(getActiveScene(1.5)?.id).toBe('SOLO_HOOK_3D_LAPTOP');
    expect(getActiveScene(5.0)?.id).toBe('MULTIPLAYER_REVEAL_3D');
    expect(getActiveScene(8.5)?.id).toBe('CUSTOMIZE_SKINS_ZOOM');
    expect(getActiveScene(12.0)?.id).toBe('LOBBY_ROOM_SHARE');
    expect(getActiveScene(15.0)?.id).toBe('MOBILE_CROSSPLAY_MOCKUP');
    expect(getActiveScene(18.0)?.id).toBe('GAMEPLAY_RACE_CLIMAX');
    expect(getActiveScene(21.0)?.id).toBe('REAL_BROWSER_OUTRO');
  });

  it('contains the mobile crossplay scene and target URL', () => {
    const mobileScene = TRAILER_SCENES.find(s => s.id === 'MOBILE_CROSSPLAY_MOCKUP');
    expect(mobileScene).toBeDefined();
    expect(mobileScene?.caption).toContain('CELULAR');

    const finalScene = TRAILER_SCENES[TRAILER_SCENES.length - 1];
    expect(finalScene.caption).toContain('https://dino-1v1.vercel.app/');
  });
});
