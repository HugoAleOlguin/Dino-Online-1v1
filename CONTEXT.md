# Contexto del Proyecto: Jueguito Online (Dino Chrome P2P Multiplayer)

## 1. Estado Actual del Sistema
- **Modo Multijugador Expandido (Hasta 4 Jugadores):**
  - Soporte dinámico para 1, 2, 3 y 4 jugadores simultáneos en pistas horizontales paralelas apiladas.
  - Límite estricto de sala: `MAX_PLAYERS = 4`. Si un quinto jugador intenta unirse por enlace o código, el Host rechaza la conexión con el mensaje literal:
    `"La sala está llena. Ya se ha alcanzado el límite máximo de 4 jugadores."`
- **Protección de Techo y Física de Salto:**
  - El dinosaurio de Chromium salta a una velocidad de $720\text{ px/s}$ con gravedad de $-2100\text{ px/s}^2$, alcanzando un ápice de $\approx 123.4\text{ px}$ más su altura de cuerpo ($47\text{ px}$ en carrera), sumando $\approx 171\text{ px}$ de espacio vertical necesario.
  - Para evitar que atraviese el techo al dividir la pantalla entre 3 o 4 pistas, se implementó el factor de escala visual uniforme dinámico en `calculateMultiTrackLayout()`:
    - 1 o 2 pistas: escala $1.0\times$.
    - 3 pistas: escala $0.72\times$ (margen libre superior $\approx 22\text{ px}$).
    - 4 pistas: escala $0.58\times$ (margen libre superior $\approx 28\text{ px}$).
  - Garantía verificada por tests: el dino nunca toca ni perfora el divisor horizontal en la cúspide de su salto.
- **Flujo de Espectador y Transición a Siguiente Ronda:**
  - Si un 3º o 4º jugador se une mientras una carrera está en curso (`isMatchInProgress`), ingresa al lobby para personalizar su skin y color, y puede visualizar la partida en curso en vivo con el overlay `'ESPECTANDO PARTIDA EN CURSO'`.
  - El espectador no bloquea la detección de finalización de carrera (`isAllPlayersDead`).
  - Al terminar la carrera y comenzar la siguiente ronda mediante revancha o nuevo inicio, el espectador pasa automáticamente a corredor activo con su dino vivo.
- **Sistema de Debug y Bots Autónomos (`Tecla B` o `/debug`):**
  - Panel interactivo de depuración que permite:
    - `+ Añadir 1 Bot`: Añade un bot con IA reactiva que salta y se agacha ante obstáculos reales de la pista.
    - `Llenar Sala (4/4)`: Completa los 4 slots instantáneamente para probar las 4 pantallas y la escala $0.58\times$ en vivo.
    - `Unir Bot en Modo Espectador`: Simula un jugador uniéndose a mitad de partida.
    - `Simular Intento de Entrada (Sala Llena)`: Dispara la verificación de rechazo del 5º jugador con el mensaje oficial.
    - `Limpiar / Expulsar Bots`: Resetea la sala al estado normal.
- **Corrección de Récord Duplicado en Modo Solitario:**
  - Se eliminó la doble impresión del récord en el modal de fin de partida. En solitario se oculta el badge de serie y se muestra únicamente una línea limpia de distancia y estatus (`¡NUEVO RECORD PERSONAL!` o `RECORD: X METROS`).

---

## 2. Decisiones Arquitectónicas Clave (ADRs)
1. **Layout Dinámico por Track Height vs Canvas Extendido:**
   - Se mantiene el canvas virtual en $960 \times 540\text{ px}$ y se dividen proporcionalmente las pistas aplicando un factor de escala uniforme a dinos, obstáculos, suelo y nubes.
2. **Rechazo Inmediato P2P para Sala Llena:**
   - El Host valida `connections.size >= MAX_PLAYERS - 1` en el evento `peer.on('connection')`. Si la sala está llena, envía un paquete `{ type: 'ROOM_FULL', message: '...' }` y cierra la conexión tras una ráfaga corta (150ms).
3. **BotSimulator como Virtual Peer Local:**
   - Los bots ejecutan la misma física de `Dino` y detección multi-box que los jugadores reales, sin requerir sockets WebRTC ni backend, permitiendo tests integrales con 4 pistas desde una sola pestaña.

---

## 3. Pruebas y Cobertura (TDD)
- **Suites de Pruebas:** 14 suites con **61 tests pasando al 100%** en Vitest.
  - `tests/solo-modal.test.ts`: Validación de no-duplicación de récord en modo solo.
  - `tests/bot-simulator.test.ts`: Físicas de salto, IA reactiva y ciclo de vida de bots.
  - `tests/multi-track-layout.test.ts`: Layout, escalas y headroom de techo.
  - `tests/lobby-full.test.ts`: Límite de 4 jugadores y mensajes de error.
  - `tests/p2p-multiplayer.test.ts`: Retransmisión de paquetes y topología en estrella.
  - `tests/jump-physics.test.ts`, `tests/hitboxes.test.ts`, `tests/core.test.ts`, etc.
- **Build de Producción:** Vite + TypeScript compilan con **0 errores**.
