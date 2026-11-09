# Contexto del Proyecto: Jueguito Online (Dino Chrome P2P Multiplayer)

## 1. Estado Actual del Sistema
- **Modo Multijugador Expandido (Hasta 4 Jugadores):**
  - Soporte dinámico para 1, 2, 3 y 4 jugadores simultáneos en pistas horizontales paralelas apiladas.
  - Límite estricto de sala: `MAX_PLAYERS = 4` con rechazo inmediato para el 5º jugador (`ROOM_FULL`).
- **Seguridad y Blindaje Anti-Exploits (Ticket 1):**
  - Sanitización XSS estricta mediante `escapeHtml()` en todos los apodos y textos inyectados en el DOM (`innerHTML`).
  - Blindaje anti-suplantación en paquetes `DIED`: el Host ignora `msg.peerId` entrante y fuerza `deathPeerId = senderId`.
  - Inmunidad del anfitrión ante paquetes `KICKED` (anti-escalada de privilegios).
  - Eliminación de soft-lock al caer el Host: `markAllRemotePlayersDead()` garantiza que el jugador local continúe su carrera y obtenga su pantalla de fin de partida.
- **Sincronización WebRTC y Red Robusta (Ticket 2):**
  - Secuenciación monotónica `seq` con descarte de paquetes fuera de orden (`seq <= lastSeq`), erradicando el *rubberbanding* hacia atrás.
  - Cuenta regresiva relativa (`countdownDurationMs = 5200`) desacoplada del reloj del sistema operativo (`performance.now()`) con compensación de latencia unidireccional ($RTT/2$).
  - Backpressure control con `safeSendState()`: descarte de paquetes efímeros si `bufferedAmount > 64KB` en el RTCDataChannel.
  - Medición de ping y RTT bidireccional en el anfitrión con suavizado EWMA ($\alpha = 0.2$).
- **Motor Canvas 2D de Alta Fluidez (Ticket 3):**
  - Factor $\alpha$ de interpolación temporal (`alpha = physicsAccumulator / FIXED_DELTA`) eliminando el judder y micro-stutter en monitores gaming de 120Hz/144Hz/240Hz.
  - Extrapolación cinemática balística del rival con gravedad Chromium ($-2100\text{ px/s}^2$) y *fast-fall* ($\times 2.8$).
  - Arquitectura *zero-allocation* con pre-cálculo y caché de layout multi-pista en `DoubleTrackRenderer`.
  - Culling indexado $O(\log N)$ con búsqueda binaria de obstáculos en pantalla en el bucle de render y en la fase amplia de colisiones.
  - Sincronización continua del Web Worker ticker (`processBackgroundTick`) cuando la pestaña está en segundo plano durante la cuenta regresiva.
- **Ergonomía Móvil y Accesibilidad WCAG (Ticket 4):**
  - Cajas de estado del lobby (`#host-status-box`, `#guest-status-box`) visibles con `.room-status-banner` y dot pulsante.
  - Safe areas móviles con `viewport-fit=cover` y `env(safe-area-inset-*)` en controles táctiles.
  - Extracción y saneamiento automático de códigos (`extractRoomCode`) si se pega una URL completa (`?room=ABCD`), y soporte para tecla `Enter`.
  - Swatches de paleta de colores convertidos a `<button>` con atributos `aria-pressed`, `aria-label` descriptivos y dimensiones táctiles de mínimo 44x44px.
  - Clases semánticas dinámicas para latencia (`.ping-good`, `.ping-fair`, `.ping-poor`) con micro-indicador `.ping-dot`.
  - Soporte para orientación horizontal móvil (landscape) sin desbordes ni scroll accidental.
  - Micro-vibración háptica `navigator.vibrate?.(12)` en controles táctiles.

---

## 2. Decisiones Arquitectónicas Clave (ADRs)
1. **Layout Dinámico por Track Height vs Canvas Extendido:**
   - Canvas virtual en $960 \times 540\text{ px}$ con división proporcional y factor de escala dinámico ($1.0\times$, $0.72\times$, $0.58\times$) con margen garantizado contra techos.
2. **Rechazo Inmediato P2P para Sala Llena:**
   - Host valida `connections.size >= MAX_PLAYERS - 1` en el evento `peer.on('connection')`.
3. **Desacoplamiento Temporal para Frecuencias Altas:**
   - Físicas fijas deterministas a 60Hz combinadas con interpolación $\alpha$ para tasa de refresco arbitraria en el bucle `requestAnimationFrame`.
4. **Sincronización de Salida por Offset de RTT:**
   - Sustitución de `Date.now()` absoluto por duración relativa transmitida y descuento de un viaje de ida ($RTT/2$).
5. **Backpressure Preventivo:**
   - Descarte local de paquetes efímeros de alta frecuencia (30Hz) si el socket WebRTC está congestionado.

---

## 3. Pruebas y Cobertura (TDD)
- **Suites de Pruebas:** 17 suites con **114 tests pasando al 100%** en Vitest.
  - `tests/security-resilience.test.ts` (11 tests): Saneamiento XSS, protección contra suplantación en `DIED`, inmunidad de Host y prevención de soft-locks.
  - `tests/p2p-sync.test.ts` (18 tests): Secuenciación de paquetes, descarte fuera de orden, countdown relativo, backpressure y ping EWMA.
  - `tests/fluidity-interpolation.test.ts` (16 tests): Interpolación $\alpha$, balística parabólica, culling $O(\log N)$ y sincronización de Web Worker.
  - `tests/ux-accessibility.test.ts` (12 tests): Banners de estado, safe areas, parsing de URLs, swatches accesibles y clases de ping.
  - Suites existentes (57 tests): `tests/solo-modal.test.ts`, `tests/multi-track-layout.test.ts`, etc.
- **Build de Producción:** Vite + TypeScript compilan con **0 errores** (1.68s, 168 kB JS).

---

## 4. Estado de Producción y Limpieza Reciente
- **UI Flat Retro Chromium:** Eliminación completa de brillos (`box-shadow`), efectos de latido/pulso CSS y desenfoques innecesarios, logrando una estética minimalista, limpia y directa idéntica al Chromium Dino original.
- **Erradicación del Modo Debug y Bots:** Se eliminó de raíz el modal de debug, simulación de bots (`bot-simulator.ts`), atajos de teclado (`KeyB`) y parámetros URL (`?debug`). Código 100% de producción limpio.
- **Producción:** Rama `master` sincronizada en GitHub (`https://github.com/HugoAleOlguin/Dino-Online-1v1.git`) con despliegue automático en Vercel. Build limpio (1.68s, 0 errores).
