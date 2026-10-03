# 🦖 DINO 1v1 ONLINE — DUELO CLÁSICO DE SUPERVIVENCIA

<p align="center">
  <img src="public/favicon.svg" alt="Dino Logo" width="90" height="96">
</p>

<p align="center">
  <strong>El clásico juego del dinosaurio de Google Chrome transformado en un duelo competitivo online 1v1 en tiempo real.</strong><br>
  <em>0ms de input lag local • Arquitectura P2P WebRTC sin servidores • Fiel a la física original de Chromium • Eventos aleatorios dinámicos</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC">
  <img src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest">
  <img src="https://img.shields.io/badge/Vercel-Ready-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel Ready">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License">
</p>

---

## 🕹️ Experiencia y Filosofía de Juego

**DINO 1v1 ONLINE** no es un clon genérico: es una recreación quirúrgica del código fuente de `offline.js` de Chromium combinada con una arquitectura de red moderna. 

```
┌────────────────────────────────────────────────────────────────────────┐
│  ▶ TU PISTA (P1): DINO                           00482 m               │
│                                                                        │
│       ▼ TÚ (P1) ▼                                                      │
│        🦖            🌵                  🌵🌵               🦅         │
│  ════════════════════════════════════════════════════════════════════  │
│  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - │
│  ════════════════════════════════════════════════════════════════════  │
│    PISTA RIVAL (P2): HUGO                         00394 m              │
│                                                                        │
│        🦖                      🌵                                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Características Principales

### 🎯 0 ms de Input Latency (Local Authority)
A diferencia de los juegos multijugador con servidores lentos que generan retardo al presionar teclas, aquí **el motor de física corre al 100% de manera local e instantánea** en tu navegador. Tus saltos y agachadas responden en el microsegundo exacto. La sincronización con el rival ocurre vía **WebRTC DataChannels** punto a punto (Peer-to-Peer).

### 👥 Sala de Espera y Control de Inicio por el Host
- Al compartir tu enlace o código, el rival entra a la sala de espera sin iniciar la partida automáticamente.
- **Personalización Completa**: Ambos jugadores pueden ajustar su nombre, color y skin con tranquilidad.
- **Inicio Exclusivo del Host**: El anfitrión decide cuándo pulsar **▶ INICIAR PARTIDA**, activando una **cuenta regresiva de 5 segundos** sincronizada para que ambos jugadores se preparen.

### 🔄 Anti-Freeze en Pestañas en Segundo Plano (Web Worker Ticker)
- Se incluye un worker dedicado que mantiene el ciclo de física activo a 60 ticks/s incluso si uno de los jugadores tiene la pestaña en segundo plano o minimizada, evitando congelamientos al inicio de la carrera.

### 💀 Mecánica Asimétrica de Muerte y Modo Espectador
- Si **tú chocas primero**: Tu carrera termina y tu pantalla entra en **Modo Espectador** (`GAME OVER` únicamente en tu carril), permitiéndote ver en vivo y en directo cómo tu rival sigue esquivando obstáculos hasta que cometa un error.
- El **jugador que sobrevive**: ¡Sigue corriendo libremente sin interrupciones ni pantallas molestas! Puede romper su récord y estirar la ventaja. Al chocar finalmente, se le despliega su gloriosa **Pantalla de Victoria**.
- Tablero final comparativo con cálculo exacto de distancia y metros de diferencia.

### 🦖 Física y Hitboxes Auténticas de Google Chromium
- **Multi-Box Hitboxes**: Adiós a los rectángulos toscos. Se utiliza el modelo anatómico exacto de 6 cajas de colisión para el T-Rex corriendo (cabeza, torso, vientre, muslos, patas) y caja horizontal alargada para agachado.
- **Salto Variable (Short Hop)**: Toca rápido `Espacio` para un salto bajo y ágil; mantén presionado para alcanzar el arco completo del salto.
- **Caída Rápida (Fast Fall)**: Presiona `Flecha Abajo` en el aire para descender inmediatamente al suelo a máxima velocidad.
- **Fixed Timestep Accumulator (60 FPS)**: La simulación está desacoplada de la tasa de refresco de la pantalla. Ya no se acelera a 2x o 3x en monitores de 120Hz, 144Hz o 240Hz.

### 🎨 Personalización y Skins Oficiales de la Comunidad
- **7 Skins HD Sin Fondo**:
  1. `T-Rex Clásico Original` (con ojo blanco y pupila de choque fiel de Chromium).
  2. `T-Rex Fiesta 🥳` (Sombrero de fiesta y tarta de cumpleaños).
  3. `T-Rex Vallas 🏃` (Google Tokyo 2020 Olympics).
  4. `T-Rex Gimnasia 🤸` (Google Tokyo 2020 Olympics).
  5. `T-Rex Surfista 🏄` (Google Tokyo 2020 Olympics).
  6. `T-Rex Jinete 🐎` (Google Tokyo 2020 Olympics).
  7. `T-Rex Natación 🏊` (Google Tokyo 2020 Olympics).
- **Selector de Paleta Retro**: Color de apodo y aura personalizable.
- **Modo Práctica contra Bot Offline**: Para jugar en solitario sin conexión cuando no tengas un rival a mano.

---

## 🎮 Controles

| Acción | Teclado PC | Pantalla Táctil / Móvil |
| :--- | :--- | :--- |
| **Saltar** | <kbd>Espacio</kbd> / <kbd>↑</kbd> / <kbd>W</kbd> | Botón **SALTAR** o Toque en pantalla |
| **Salto Corto** | Soltar rápido <kbd>Espacio</kbd> | Toque breve |
| **Agacharse** | <kbd>↓</kbd> / <kbd>S</kbd> | Botón **AGANCHARSE** (mantener) |
| **Caída Rápida** | Presionar <kbd>↓</kbd> en el aire | Presionar botón en el aire |

---

## 🏗️ Arquitectura Técnica

```
                    ┌────────────────────────┐
                    │      PeerJS Cloud      │
                    │   (Solo Handshake ICE) │
                    └───────────┬────────────┘
                                │ SDP Offer/Answer
                     ┌──────────┴──────────┐
                     ▼                     ▼
             ┌───────────────┐     ┌───────────────┐
             │  JUGADOR 1    │◄───►│  JUGADOR 2    │
             │  (Pista Sup.) │ RTC │  (Pista Inf.) │
             │ Engine Local  │Data │ Engine Local  │
             └───────────────┘     └───────────────┘
                     │                     │
                     └──────────┬──────────┘
                                ▼
                   Misma Semilla PRNG (Mulberry32)
                   → Mismos Obstáculos
                   → Mismos Eventos Aleatorios
```

1. **Client-Side Simulation**: Cada cliente corre su propio bucle de física con paso fijo de `dt = 1/60s`.
2. **P2P Telemetry**: Envío de estados a 30Hz solo para sincronizar la posición visible del rival en el carril secundario.
3. **Despliegue Serverless**: No hay servidores Node.js ni WebSocket corriendo 24/7. Cero costos de infraestructura.

---

## 🚀 Instalación y Desarrollo Local

### Prerrequisitos
- [Node.js](https://nodejs.org/) v18 o superior
- `npm` o `pnpm`

### Pasos
```bash
# 1. Clonar el repositorio
git clone https://github.com/HugoAleOlguin/Dino-Online-1v1.git
cd Dino-Online-1v1

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor local
npm run dev
```

Abre dos pestañas en `http://localhost:5199/`:
- En la Pestaña A: Pulsa **⚡ CREAR SALA** y copia el enlace.
- En la Pestaña B: Pega el enlace y ¡a correr!

---

## 🧪 Pruebas Automatizadas (TDD)

El proyecto cuenta con suite completa de pruebas unitarias que validan hitboxes, determinismo y eventos:

```bash
npm test
```

- `tests/core.test.ts`: Validación de PRNG y física básica.
- `tests/hitboxes.test.ts`: Siluetas multicaja de Chromium vs obstáculos.
- `tests/events-physics.test.ts`: Eventos aleatorios, saltos cortos y caídas rápidas.
- `tests/game-engine.test.ts`: Aceleración y colisiones deterministas.
- `tests/solo.test.ts`: Flujo de juego en solitario y fin de partida inmediato.

---

## ☁️ Despliegue en Vercel

Este proyecto está 100% optimizado para Vercel:

1. Importa tu repositorio en [Vercel Dashboard](https://vercel.com/new).
2. Framework Preset: **Vite**.
3. Build Command: `npm run build`.
4. Output Directory: `dist`.
5. ¡Listo! Vercel desplegará automáticamente la aplicación con SSL y red global CDN.

---

## 👏 Créditos y Agradecimientos

- **Google Chromium Team**: Por crear el juego original de `offline.js` del dinosaurio de Chrome (Sebastien Gabriel, Alan Bettes y Edward Jung).
- **Comunidad de Sprites y Tokyo 2020**: Por la preservación de las skins olímpicas del evento original de Google.
- **Desarrollador**: Hugo Ale Olguin ([@HugoAleOlguin](https://github.com/HugoAleOlguin)).

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.
