import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const fontBase64 = fs.readFileSync(path.join(rootDir, 'public/PressStart2P.ttf')).toString('base64');
const offlineSpriteBase64 = fs.readFileSync(path.join(rootDir, 'public/offline-sprite-dark.png')).toString('base64');
const dinoSkinsBase64 = fs.readFileSync(path.join(rootDir, 'public/dino-skins.png')).toString('base64');

const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Dino 1v1 Trailer Renderer</title>
  <style>
    @font-face {
      font-family: 'Press Start 2P';
      src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: #000;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1920px;
      height: 1080px;
    }

    #trailer-canvas {
      width: 1920px;
      height: 1080px;
      background-color: #202124;
      image-rendering: pixelated;
    }
  </style>
</head>
<body>
  <canvas id="trailer-canvas" width="1920" height="1080"></canvas>

  <script>
    const canvas = document.getElementById('trailer-canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = false;

    // Load Sprite Images from Data URLs
    const offlineImg = new Image();
    offlineImg.src = 'data:image/png;base64,${offlineSpriteBase64}';

    const skinsImg = new Image();
    skinsImg.src = 'data:image/png;base64,${dinoSkinsBase64}';

    let assetsReady = false;
    Promise.all([
      new Promise(r => offlineImg.onload = r),
      new Promise(r => skinsImg.onload = r),
      document.fonts.load('16px "Press Start 2P"')
    ]).then(() => {
      assetsReady = true;
      window.assetsLoaded = true;
      renderFrame(0);
    });

    // Sprite rects definition
    const SPRITES = {
      CACTUS_SMALL: { x: 228, y: 2, w: 17, h: 35 },
      CACTUS_DOUBLE: { x: 228, y: 2, w: 34, h: 35 },
      CACTUS_LARGE: { x: 332, y: 2, w: 25, h: 50 },
      PTERODACTYL: [
        { x: 134, y: 2, w: 46, h: 40 },
        { x: 180, y: 2, w: 46, h: 40 }
      ],
      CLOUD: { x: 86, y: 2, w: 46, h: 14 },
      HORIZON: { x: 2, y: 54, w: 600, h: 12 }
    };

    const SKINS_LIST = [
      { id: 'classic', name: 'T-Rex Clásico Original', run: [{ x: 54, y: 27, w: 44, h: 47 }, { x: 104, y: 27, w: 44, h: 47 }], dead: { x: 154, y: 27, w: 44, h: 47 }, duck: [{ x: 204, y: 44, w: 59, h: 30 }, { x: 269, y: 44, w: 59, h: 30 }] },
      { id: 'party', name: 'T-Rex Cumpleaños 🥳', run: [{ x: 54, y: 89, w: 44, h: 63 }, { x: 104, y: 89, w: 44, h: 63 }], dead: { x: 154, y: 92, w: 40, h: 60 }, duck: [{ x: 200, y: 109, w: 59, h: 43 }, { x: 265, y: 109, w: 59, h: 43 }] },
      { id: 'hurdles', name: 'T-Rex Atleta 🏃', run: [{ x: 54, y: 183, w: 44, h: 47 }, { x: 104, y: 183, w: 44, h: 47 }], dead: { x: 154, y: 187, w: 40, h: 43 }, duck: [{ x: 200, y: 192, w: 60, h: 38 }, { x: 266, y: 192, w: 60, h: 38 }] },
      { id: 'gymnastics', name: 'T-Rex Gimnasta 🤸', run: [{ x: 54, y: 261, w: 44, h: 47 }, { x: 104, y: 261, w: 44, h: 47 }], dead: { x: 154, y: 265, w: 40, h: 43 }, duck: [{ x: 200, y: 268, w: 40, h: 40 }, { x: 246, y: 254, w: 42, h: 54 }] },
      { id: 'surfing', name: 'T-Rex Surfista 🏄', run: [{ x: 60, y: 335, w: 50, h: 51 }, { x: 116, y: 331, w: 50, h: 55 }], dead: { x: 172, y: 331, w: 50, h: 55 }, duck: [{ x: 228, y: 335, w: 50, h: 51 }, { x: 284, y: 331, w: 50, h: 55 }] },
      { id: 'equestrian', name: 'T-Rex Ecuestre 🐎', run: [{ x: 60, y: 397, w: 50, h: 67 }, { x: 116, y: 397, w: 50, h: 67 }], dead: { x: 172, y: 402, w: 46, h: 62 }, duck: [{ x: 224, y: 393, w: 54, h: 71 }, { x: 284, y: 393, w: 54, h: 71 }] },
      { id: 'swimming', name: 'T-Rex Natación 🏊', run: [{ x: 75, y: 512, w: 65, h: 30 }, { x: 146, y: 512, w: 65, h: 30 }], dead: { x: 217, y: 510, w: 63, h: 32 }, duck: [{ x: 286, y: 516, w: 61, h: 26 }, { x: 353, y: 516, w: 61, h: 26 }] }
    ];

    function drawHorizon(groundY, distance, scale = 2) {
      const horizonW = 600 * scale;
      const hH = 12 * scale;
      const offset = Math.floor(distance * scale) % horizonW;
      for (let x = -offset; x < 1920 + horizonW; x += horizonW) {
        ctx.drawImage(offlineImg, SPRITES.HORIZON.x, SPRITES.HORIZON.y, 600, 12, x, groundY - 6 * scale, horizonW, hH);
      }
    }

    function drawCloud(cx, cy, scale = 2) {
      ctx.drawImage(offlineImg, SPRITES.CLOUD.x, SPRITES.CLOUD.y, 46, 14, cx, cy, 46 * scale, 14 * scale);
    }

    function drawCactus(type, x, groundY, scale = 2) {
      const s = SPRITES[type];
      const w = s.w * scale;
      const h = s.h * scale;
      ctx.drawImage(offlineImg, s.x, s.y, s.w, s.h, x, groundY - h, w, h);
    }

    function drawDinoSprite(skin, state, x, groundY, frameIndex = 0, scale = 2) {
      let rect = skin.run[frameIndex % 2];
      if (state === 'dead') rect = skin.dead;
      else if (state === 'duck') rect = skin.duck[frameIndex % 2];
      else if (state === 'idle') rect = skin.run[0];

      const w = rect.w * scale;
      const h = rect.h * scale;
      ctx.drawImage(skinsImg, rect.x, rect.y, rect.w, rect.h, x, groundY - h, w, h);
    }

    function drawPixelBox(x, y, w, h, bg = '#202124', border = '#535353', borderWidth = 4) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = border;
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(x, y, w, h);
    }

    function drawHeaderBanner(titleLine1, titleLine2 = null, y = 130, accent = '#ffffff') {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const boxW = 1660;
      const boxH = titleLine2 ? 140 : 96;
      drawPixelBox(130, y - boxH / 2, boxW, boxH, 'rgba(32, 33, 36, 0.95)', '#535353', 4);

      ctx.font = 'bold 26px "Press Start 2P", monospace';
      ctx.fillStyle = accent;
      ctx.fillText(titleLine1, 960, titleLine2 ? y - 26 : y);

      if (titleLine2) {
        ctx.font = 'bold 22px "Press Start 2P", monospace';
        ctx.fillStyle = '#f1c40f';
        ctx.fillText(titleLine2, 960, y + 26);
      }
    }

    // MAIN RENDER FUNCTION (Time in seconds: 0.0 to 22.0)
    window.renderFrame = function(t) {
      if (!assetsReady) return;

      // 1. Dark background
      ctx.fillStyle = '#202124';
      ctx.fillRect(0, 0, 1920, 1080);

      // ==========================================
      // SCENE 1: SOLO HOOK (0.0s - 3.5s)
      // ==========================================
      if (t < 3.5) {
        const groundY = 740;
        const scale = 2.4;
        const speed = 400; // px/sec
        const distance = t * speed;

        // Clouds
        drawCloud(1300 - (t * 40) % 2100, 290, scale);
        drawCloud(600 - (t * 30) % 2100, 350, scale);

        // Ground
        drawHorizon(groundY, distance, scale);

        // Jump physics for solo dino at 1.4s
        let dinoY = groundY;
        let isJumping = false;
        if (t >= 1.4 && t <= 2.1) {
          const jumpT = (t - 1.4) / 0.7; // 0 to 1
          const jumpH = Math.sin(jumpT * Math.PI) * 170;
          dinoY = groundY - jumpH;
          isJumping = true;
        }

        // Cactus obstacle placed at distance corresponding to jump
        const cactusDist = 1.75 * speed;
        const cactusX = 220 + (cactusDist - distance) * scale;
        if (cactusX > -150 && cactusX < 2100) {
          drawCactus('CACTUS_DOUBLE', cactusX, groundY, scale);
        }

        // Running Dino
        const runFrame = isJumping ? 0 : Math.floor(t * 12) % 2;
        drawDinoSprite(SKINS_LIST[0], isJumping ? 'idle' : 'run', 220, dinoY, runFrame, scale);

        // Score Counter
        ctx.textAlign = 'right';
        ctx.font = 'bold 26px "Press Start 2P", monospace';
        ctx.fillStyle = '#acacac';
        const score = Math.floor(distance / 5).toString().padStart(5, '0');
        ctx.fillText('HI 00999  ' + score + ' m', 1800, 270);

        // Captions with typewriter animation
        if (t < 2.3) {
          const fullText = '¿TE IMAGINAS JUGAR AL DINO DE GOOGLE...';
          const chars = Math.min(fullText.length, Math.floor((t - 0.2) * 20));
          const subText = fullText.substring(0, Math.max(0, chars));
          drawHeaderBanner(subText, null, 130, '#ffffff');
        } else {
          drawHeaderBanner('¿TE IMAGINAS JUGAR AL DINO DE GOOGLE...', '...PERO...', 130, '#ffffff');
        }
      }

      // ==========================================
      // SCENE 2: MULTIPLAYER REVEAL (3.5s - 7.0s)
      // ==========================================
      else if (t < 7.0) {
        const localT = t - 3.5;
        const scale = 2.0;
        const track1Ground = 450;
        const track2Ground = 880;
        const speed = 460;
        const dist1 = 1400 + localT * speed;
        const dist2 = 1380 + localT * (speed * 0.98);

        // Header Title
        drawHeaderBanner('...¿DE A 2 JUGADORES? ⚡', 'DUELO 1v1 EN TIEMPO REAL CON 0 LATENCIA', 130, '#f1c40f');

        // Middle Divider
        ctx.strokeStyle = '#3c4043';
        ctx.lineWidth = 4;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(60, 530);
        ctx.lineTo(1860, 530);
        ctx.stroke();
        ctx.setLineDash([]);

        // Clouds for both tracks
        drawCloud(1400 - (localT * 35) % 2100, track1Ground - 220, scale);
        drawCloud(800 - (localT * 35) % 2100, track2Ground - 220, scale);

        // Ground 1 & Ground 2
        drawHorizon(track1Ground, dist1, scale);
        drawHorizon(track2Ground, dist2, scale);

        // Track 1 Header
        ctx.textAlign = 'left';
        ctx.font = 'bold 22px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('▶ TU PISTA (P1): DINO', 80, track1Ground - 160);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#acacac';
        ctx.fillText(Math.floor(dist1 / 10).toString().padStart(5, '0') + ' m', 1840, track1Ground - 160);

        // Track 2 Header
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.fillText('  PISTA RIVAL (P2): DINO_RIVAL', 80, track2Ground - 160);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#acacac';
        ctx.fillText(Math.floor(dist2 / 10).toString().padStart(5, '0') + ' m', 1840, track2Ground - 160);

        // Track 1 Dino (Jump at localT = 1.1s)
        let dino1Y = track1Ground;
        let jumping1 = false;
        if (localT >= 1.1 && localT <= 1.8) {
          const jt = (localT - 1.1) / 0.7;
          dino1Y = track1Ground - Math.sin(jt * Math.PI) * 150;
          jumping1 = true;
        }
        drawDinoSprite(SKINS_LIST[0], jumping1 ? 'idle' : 'run', 140, dino1Y, Math.floor(localT * 12) % 2, scale);

        // Obstacles on Track 1
        const obs1X = 140 + (1400 + 1.45 * speed - dist1) * scale;
        if (obs1X > -100 && obs1X < 2000) drawCactus('CACTUS_DOUBLE', obs1X, track1Ground, scale);

        // Track 2 Dino (Jump at localT = 2.0s)
        let dino2Y = track2Ground;
        let jumping2 = false;
        if (localT >= 2.0 && localT <= 2.7) {
          const jt = (localT - 2.0) / 0.7;
          dino2Y = track2Ground - Math.sin(jt * Math.PI) * 150;
          jumping2 = true;
        }
        drawDinoSprite(SKINS_LIST[0], jumping2 ? 'idle' : 'run', 140, dino2Y, Math.floor(localT * 12) % 2, scale);

        // Obstacles on Track 2
        const obs2X = 140 + (1380 + 2.35 * speed - dist2) * scale;
        if (obs2X > -100 && obs2X < 2000) drawCactus('CACTUS_LARGE', obs2X, track2Ground, scale);
      }

      // ==========================================
      // SCENE 3: CUSTOMIZE SKINS & COLORS (7.0s - 11.5s)
      // ==========================================
      else if (t < 11.5) {
        const localT = t - 7.0;

        // Big Header
        drawHeaderBanner('1. PON TU APODO Y ELIGE TU SKIN', 'PERSONALIZACIÓN COMPLETA CON SKINS EXCLUSIVAS', 120, '#2ecc71');

        // Main Lobby Box (Replicating index.html styling faithfully)
        const cardX = 360;
        const cardY = 220;
        const cardW = 1200;
        const cardH = 760;
        drawPixelBox(cardX, cardY, cardW, cardH, '#202124', '#535353', 4);

        // Column 1 Title
        ctx.textAlign = 'left';
        ctx.font = 'bold 26px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('1. PERSONALIZACIÓN', cardX + 60, cardY + 70);

        // Field 1: Nickname
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillStyle = '#acacac';
        ctx.fillText('Tu Apodo:', cardX + 60, cardY + 140);

        // Nickname Input Box
        drawPixelBox(cardX + 60, cardY + 165, 480, 60, '#111214', '#2ecc71', 3);
        ctx.font = '22px "Press Start 2P", monospace';
        ctx.fillStyle = '#2ecc71';
        ctx.fillText('DinoCampeon', cardX + 85, cardY + 203);

        // Field 2: Colors
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillStyle = '#acacac';
        ctx.fillText('Color de Nombre:', cardX + 60, cardY + 285);

        const colors = ['#ffffff', '#2ecc71', '#f1c40f', '#e74c3c', '#3498db', '#9b59b6'];
        const activeColorIdx = Math.floor(localT * 1.5) % colors.length;
        colors.forEach((col, idx) => {
          const cx = cardX + 80 + idx * 75;
          const cy = cardY + 340;
          ctx.beginPath();
          ctx.arc(cx, cy, 24, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
          if (idx === activeColorIdx) {
            ctx.lineWidth = 5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          } else {
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#535353';
            ctx.stroke();
          }
        });

        // Field 3: Skin Selector Stage
        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillStyle = '#acacac';
        ctx.fillText('Aspecto del Dino (Skin):', cardX + 60, cardY + 430);

        // Cycling through skins every 0.65s
        const currentSkinIdx = Math.floor(localT / 0.65) % SKINS_LIST.length;
        const currentSkin = SKINS_LIST[currentSkinIdx];

        // Skin Stage Box
        const stageX = cardX + 600;
        const stageY = cardY + 120;
        const stageW = 540;
        const stageH = 560;
        drawPixelBox(stageX, stageY, stageW, stageH, '#18191c', '#3c4043', 4);

        // Navigation Arrows
        drawPixelBox(stageX + 30, stageY + 240, 50, 70, '#2b2b2b', '#535353', 3);
        ctx.font = '24px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('<', stageX + 45, stageY + 285);

        drawPixelBox(stageX + stageW - 80, stageY + 240, 50, 70, '#2b2b2b', '#535353', 3);
        ctx.fillText('>', stageX + stageW - 65, stageY + 285);

        // Ground line inside skin box
        ctx.strokeStyle = '#535353';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(stageX + 40, stageY + 390);
        ctx.lineTo(stageX + stageW - 40, stageY + 390);
        ctx.stroke();

        // Animated Skin Sprite inside Stage (Scale 3.8)
        const skinAnimFrame = Math.floor(localT * 10) % 2;
        drawDinoSprite(currentSkin, 'run', stageX + 200, stageY + 390, skinAnimFrame, 3.8);

        // Skin Name Badge
        ctx.textAlign = 'center';
        ctx.font = 'bold 22px "Press Start 2P", monospace';
        ctx.fillStyle = '#f1c40f';
        ctx.fillText(currentSkin.name, stageX + stageW / 2, stageY + 480);
      }

      // ==========================================
      // SCENE 4: LOBBY ROOM & SHARE (11.5s - 15.0s)
      // ==========================================
      else if (t < 15.0) {
        const localT = t - 11.5;

        // Big Header
        drawHeaderBanner('2. CREA UNA SALA Y COMPARTE EL CÓDIGO', 'SISTEMA P2P DIRECTO: 0 ESPERAS, 0 SERVIDORES LENTOS', 120, '#3498db');

        // Main Lobby Box
        const cardX = 360;
        const cardY = 220;
        const cardW = 1200;
        const cardH = 760;
        drawPixelBox(cardX, cardY, cardW, cardH, '#202124', '#535353', 4);

        if (localT < 1.0) {
          // Pre-click View: Main Menu
          ctx.textAlign = 'center';
          ctx.font = 'bold 26px "Press Start 2P", monospace';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('MODO DE JUEGO', 960, cardY + 80);

          // Big Create Button
          drawPixelBox(cardX + 150, cardY + 160, 900, 100, '#2ecc71', '#27ae60', 4);
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 24px "Press Start 2P", monospace';
          ctx.fillText('⚡ CREAR SALA MULTIJUGADOR', 960, cardY + 220);

          // Join button
          drawPixelBox(cardX + 150, cardY + 300, 900, 90, '#2b2b2b', '#535353', 3);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px "Press Start 2P", monospace';
          ctx.fillText('🔑 UNIRSE CON CÓDIGO', 960, cardY + 355);

          // Bot button
          drawPixelBox(cardX + 150, cardY + 430, 900, 90, '#2b2b2b', '#535353', 3);
          ctx.fillStyle = '#acacac';
          ctx.font = 'bold 20px "Press Start 2P", monospace';
          ctx.fillText('🤖 JUGAR CONTRA BOT (SOLITARIO)', 960, cardY + 485);
        } else {
          // Room Created View (Active room)
          ctx.textAlign = 'center';
          ctx.font = 'bold 26px "Press Start 2P", monospace';
          ctx.fillStyle = '#2ecc71';
          ctx.fillText('¡SALA PRIVADA CREADA!', 960, cardY + 80);

          // Room Code Badge
          ctx.font = '20px "Press Start 2P", monospace';
          ctx.fillStyle = '#acacac';
          ctx.fillText('CÓDIGO DE SALA:', 960, cardY + 160);

          drawPixelBox(cardX + 420, cardY + 190, 360, 90, '#111214', '#f1c40f', 4);
          ctx.font = 'bold 44px "Press Start 2P", monospace';
          ctx.fillStyle = '#f1c40f';
          ctx.fillText('7X89', 960, cardY + 252);

          // Link box
          ctx.font = '18px "Press Start 2P", monospace';
          ctx.fillStyle = '#acacac';
          ctx.fillText('Enlace directo para tu rival:', 960, cardY + 330);

          drawPixelBox(cardX + 100, cardY + 360, 1000, 70, '#111214', '#535353', 3);
          ctx.font = '16px "Press Start 2P", monospace';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('https://dino-1v1.vercel.app/?room=7X89', 960, cardY + 402);

          // Copy Link Button
          const copied = localT > 2.0;
          drawPixelBox(cardX + 350, cardY + 470, 500, 80, copied ? '#27ae60' : '#2ecc71', '#ffffff', 3);
          ctx.fillStyle = copied ? '#ffffff' : '#000000';
          ctx.font = 'bold 20px "Press Start 2P", monospace';
          ctx.fillText(copied ? '✓ ENLACE COPIADO' : 'COPIAR ENLACE', 960, cardY + 518);

          if (copied) {
            ctx.font = 'bold 18px "Press Start 2P", monospace';
            ctx.fillStyle = '#2ecc71';
            ctx.fillText('✓ ¡Listo para enviar por Discord o WhatsApp!', 960, cardY + 595);
          }

          // Waiting pulse
          const pulse = (Math.sin(localT * 8) + 1) / 2;
          ctx.fillStyle = pulse > 0.5 ? '#f1c40f' : '#888888';
          ctx.font = '16px "Press Start 2P", monospace';
          ctx.fillText('● Esperando a que el rival entre a la sala...', 960, cardY + 660);
        }
      }

      // ==========================================
      // SCENE 5: HIGH SPEED 1v1 RACE & CRASH (15.0s - 18.5s)
      // ==========================================
      else if (t < 18.5) {
        const localT = t - 15.0;
        const scale = 2.0;
        const track1Ground = 450;
        const track2Ground = 880;
        const speed = 650; // Ultra high speed
        const dist1 = 2800 + localT * speed;
        const isRivalDead = localT >= 2.2;
        const dist2 = 2780 + (isRivalDead ? 2.2 * speed : localT * speed);

        // Divider
        ctx.strokeStyle = '#3c4043';
        ctx.lineWidth = 4;
        ctx.setLineDash([20, 20]);
        ctx.beginPath();
        ctx.moveTo(60, 530);
        ctx.lineTo(1860, 530);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ground lines
        drawHorizon(track1Ground, dist1, scale);
        drawHorizon(track2Ground, dist2, scale);

        // Header Track 1
        ctx.textAlign = 'left';
        ctx.font = 'bold 22px "Press Start 2P", monospace';
        ctx.fillStyle = '#f1c40f';
        ctx.fillText('▶ TU PISTA: DINO (CUMPLEAÑOS 🥳)', 80, track1Ground - 160);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#acacac';
        ctx.fillText(Math.floor(dist1 / 10).toString().padStart(5, '0') + ' m', 1840, track1Ground - 160);

        // Header Track 2
        ctx.textAlign = 'left';
        ctx.fillStyle = '#3498db';
        ctx.fillText('  RIVAL: SURFISTA_BOY 🏄', 80, track2Ground - 160);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#acacac';
        ctx.fillText(Math.floor(dist2 / 10).toString().padStart(5, '0') + ' m', 1840, track2Ground - 160);

        // Track 1 Player (Party Skin, jumping double cactus at 0.7s)
        let dino1Y = track1Ground;
        let jumping1 = false;
        if (localT >= 0.6 && localT <= 1.25) {
          const jt = (localT - 0.6) / 0.65;
          dino1Y = track1Ground - Math.sin(jt * Math.PI) * 160;
          jumping1 = true;
        }
        drawDinoSprite(SKINS_LIST[1], jumping1 ? 'idle' : 'run', 140, dino1Y, Math.floor(localT * 15) % 2, scale);

        // Obstacle 1
        const obs1X = 140 + (2800 + 0.9 * speed - dist1) * scale;
        if (obs1X > -100 && obs1X < 2000) drawCactus('CACTUS_DOUBLE', obs1X, track1Ground, scale);

        // Track 2 Player (Surfing Skin, CRASHES at 2.2s into cactus)
        let dino2Y = track2Ground;
        if (isRivalDead) {
          drawDinoSprite(SKINS_LIST[4], 'dead', 140, track2Ground, 0, scale);

          // Red Crash Label
          ctx.textAlign = 'center';
          ctx.font = 'bold 36px "Press Start 2P", monospace';
          ctx.fillStyle = '#e74c3c';
          ctx.fillText('💥 ¡CRASH!', 340, track2Ground - 80);
        } else {
          drawDinoSprite(SKINS_LIST[4], 'run', 140, track2Ground, Math.floor(localT * 15) % 2, scale);
        }

        // Obstacle 2
        const obs2X = 140 + (2780 + 2.2 * speed - dist2) * scale;
        if (obs2X > -100 && obs2X < 2000) drawCactus('CACTUS_LARGE', obs2X, track2Ground, scale);

        // Banner
        if (isRivalDead) {
          drawHeaderBanner('🏆 ¡RIVAL ELIMINADO! CORRE POR EL RÉCORD 🏆', '¡VICTORIA ROYALE EN DINO 1v1!', 130, '#f1c40f');
        } else {
          drawHeaderBanner('¡DUELO A MÁXIMA VELOCIDAD!', 'SUPERA AL RIVAL O MIRA CÓMO CAE', 130, '#ffffff');
        }
      }

      // ==========================================
      // SCENE 6: OUTRO - BROWSER TYPING & CTA (18.5s - 22.0s)
      // ==========================================
      else {
        const localT = t - 18.5;

        // Chrome Browser Window Outline
        const winX = 260;
        const winY = 160;
        const winW = 1400;
        const winH = 780;
        drawPixelBox(winX, winY, winW, winH, '#202124', '#535353', 4);

        // Top Chrome Window Bar
        ctx.fillStyle = '#18191c';
        ctx.fillRect(winX, winY, winW, 60);

        // Window controls (dots)
        ctx.beginPath();
        ctx.arc(winX + 40, winY + 30, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(winX + 70, winY + 30, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#f1c40f';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(winX + 100, winY + 30, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#2ecc71';
        ctx.fill();

        // Browser Address URL Bar
        const barX = winX + 180;
        const barY = winY + 12;
        const barW = 1000;
        const barH = 38;
        drawPixelBox(barX, barY, barW, barH, '#111214', '#3c4043', 2);

        // Lock icon
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = '#2ecc71';
        ctx.fillText('🔒', barX + 15, barY + 24);

        // URL Typing Animation
        const targetUrl = 'https://dino-1v1.vercel.app/';
        const charCount = Math.min(targetUrl.length, Math.floor(localT * 22));
        const typedUrl = targetUrl.substring(0, charCount);

        ctx.textAlign = 'left';
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(typedUrl, barX + 50, barY + 24);

        // Cursor
        if (Math.floor(localT * 4) % 2 === 0 && localT < 2.0) {
          ctx.fillStyle = '#f1c40f';
          ctx.fillRect(barX + 55 + charCount * 14, barY + 10, 10, 18);
        }

        // Inside Browser Page: Home Screen of Dino 1v1!
        const innerY = winY + 100;
        ctx.textAlign = 'center';

        // Title
        ctx.font = 'bold 50px "Press Start 2P", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('DINO 1v1', 960, innerY + 100);

        // Running Dino animated mascot
        drawDinoSprite(SKINS_LIST[0], 'run', 960 - 45, innerY + 240, Math.floor(localT * 8) % 2, 2.5);

        // Subtitles
        ctx.font = 'bold 24px "Press Start 2P", monospace';
        ctx.fillStyle = '#2ecc71';
        ctx.fillText('¡JUEGA GRATIS AHORA EN TU NAVEGADOR!', 960, innerY + 320);

        ctx.font = '18px "Press Start 2P", monospace';
        ctx.fillStyle = '#acacac';
        ctx.fillText('Sin descargas • Sin registro • 100% Gratis', 960, innerY + 380);

        // Big CTA Button Box
        drawPixelBox(960 - 350, innerY + 440, 700, 90, '#2ecc71', '#ffffff', 4);
        ctx.font = 'bold 24px "Press Start 2P", monospace';
        ctx.fillStyle = '#000000';
        ctx.fillText('dino-1v1.vercel.app', 960, innerY + 495);
      }
    };
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(rootDir, 'public/trailer.html'), htmlContent);
console.log('✓ public/trailer.html actualizado.');
