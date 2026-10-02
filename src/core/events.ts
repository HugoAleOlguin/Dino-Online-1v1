import { PRNG } from './prng';

export type EventType =
  | 'ECLIPSE'
  | 'METEOR_SHOWER'
  | 'SANDSTORM'
  | 'LOW_GRAVITY'
  | 'TURBO_SPRINT';

export interface MatchEvent {
  type: EventType;
  name: string;
  badge: string;
  description: string;
  startDistance: number;
  endDistance: number;
  gravityMultiplier: number;
  speedBonus: number;
}

const EVENT_POOL: Array<{
  type: EventType;
  name: string;
  badge: string;
  description: string;
  gravityMultiplier: number;
  speedBonus: number;
}> = [
  {
    type: 'ECLIPSE',
    name: 'ECLIPSE SOLAR TOTAL',
    badge: '🌘 ECLIPSE SOLAR 🌘',
    description: 'El cielo se sume en la oscuridad y una luna roja domina la noche.',
    gravityMultiplier: 1.0,
    speedBonus: 0,
  },
  {
    type: 'METEOR_SHOWER',
    name: 'LLUVIA DE METEORITOS',
    badge: '☄️ LLUVIA DE METEORITOS ☄️',
    description: '¡Meteoritos incandescentes surcan la atmósfera!',
    gravityMultiplier: 1.0,
    speedBonus: 0,
  },
  {
    type: 'SANDSTORM',
    name: 'TORMENTA DE ARENA',
    badge: '🌪️ TORMENTA DEL DESIERTO 🌪️',
    description: 'Ráfagas de viento y arena barren el terreno a gran velocidad.',
    gravityMultiplier: 1.0,
    speedBonus: 40,
  },
  {
    type: 'LOW_GRAVITY',
    name: 'GRAVEDAD LUNAR',
    badge: '🚀 SALTO LUNAR 🚀',
    description: '¡La gravedad cae un 30%! Saltos altos y flotantes.',
    gravityMultiplier: 0.70,
    speedBonus: 0,
  },
  {
    type: 'TURBO_SPRINT',
    name: 'ZONA HIPERVELOCIDAD',
    badge: '⚡ TURBO SPRINT ⚡',
    description: '¡Aceleración súbita! Reflejos al límite.',
    gravityMultiplier: 1.0,
    speedBonus: 100,
  },
];

export class EventManager {
  public readonly events: MatchEvent[] = [];

  constructor(seed: number) {
    const rng = new PRNG(seed + 777);
    const shuffledPool = [...EVENT_POOL].sort(() => rng.next() - 0.5);

    // Schedule 5 deterministic events throughout the run:
    // Event 1: 500m - 850m
    // Event 2: 1200m - 1600m
    // Event 3: 2000m - 2450m
    // Event 4: 2900m - 3400m
    // Event 5: 3900m - 4450m
    const intervals = [
      { start: 500, end: 850 },
      { start: 1200, end: 1600 },
      { start: 2000, end: 2450 },
      { start: 2900, end: 3400 },
      { start: 3900, end: 4450 },
    ];

    intervals.forEach((interval, i) => {
      const template = shuffledPool[i % shuffledPool.length];
      this.events.push({
        ...template,
        startDistance: interval.start,
        endDistance: interval.end,
      });
    });
  }

  getActiveEvent(currentDistance: number): MatchEvent | null {
    for (const ev of this.events) {
      if (currentDistance >= ev.startDistance && currentDistance <= ev.endDistance) {
        return ev;
      }
    }
    return null;
  }
}
