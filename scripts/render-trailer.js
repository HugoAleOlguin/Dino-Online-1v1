import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const audioWavPath = path.join(rootDir, 'public/trailer-audio.wav');
const outputMp4Path = path.join(rootDir, 'dino-1v1-trailer.mp4');

const FPS = 60;
const DURATION = 23.0;
const TOTAL_FRAMES = Math.floor(FPS * DURATION);

async function renderRealTrailer() {
  console.log('====================================================');
  console.log('🦖 INICIANDO RENDERIZADO DEL TRAILER 100% REAL DINO 1v1');
  console.log(`Resolución: 1920x1080 (16:9) | FPS: ${FPS} | Duración: ${DURATION}s`);
  console.log(`Fuente: demo.html con DOM real y Renderer real`);
  console.log('====================================================\n');

  if (!fs.existsSync(audioWavPath)) {
    throw new Error(`No se encontró el audio en ${audioWavPath}`);
  }

  console.log('→ Conectando a Chrome Headless a 1920x1080...');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--hide-scrollbars',
      '--disable-gpu',
      '--mute-audio'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  // Connect to the local server running demo.html
  await page.goto('http://localhost:5173/demo.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.assetsLoaded === true, { timeout: 15000 });
  await page.evaluate(() => document.body.classList.add('recording-mode'));

  console.log('✓ Demo real cargada con assets y estilos auténticos.');

  // Initialize FFmpeg pipe
  console.log('→ Inicializando codificador FFmpeg x264...');
  const ffmpegArgs = [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-framerate', `${FPS}`,
    '-i', '-',
    '-i', audioWavPath,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '17',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    outputMp4Path
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

  ffmpeg.on('error', (err) => {
    console.error('Error en proceso FFmpeg:', err);
  });

  const startTime = Date.now();

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const t = frame / FPS;

    // Render precise state in demo.html
    await page.evaluate((time) => window.renderFrame(time), t);

    // Grab frame buffer
    const buf = await page.screenshot({ type: 'jpeg', quality: 94 });

    const canContinue = ffmpeg.stdin.write(buf);
    if (!canContinue) {
      await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
    }

    if (frame % 120 === 0 || frame === TOTAL_FRAMES - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = Math.floor((frame / TOTAL_FRAMES) * 100);
      console.log(`[Fotograma ${frame}/${TOTAL_FRAMES}] ${pct}% | t=${t.toFixed(2)}s | Tiempo: ${elapsed}s`);
    }
  }

  console.log('\n→ Todos los fotogramas grabados. Cerrando stream y multiplexando...');
  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg finalizó con código ${code}`));
    });
  });

  await browser.close();

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const stats = fs.statSync(outputMp4Path);
  const mb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('\n====================================================');
  console.log('🎉 ¡TRAILER REAL RENDERIZADO CON ÉXITO!');
  console.log(`Archivo final: ${outputMp4Path}`);
  console.log(`Tamaño: ${mb} MB`);
  console.log(`Duración: ${DURATION}s | Resolución: 1920x1080 (16:9) | 60 FPS`);
  console.log(`Tiempo de renderizado: ${totalTime}s`);
  console.log('====================================================\n');
}

renderRealTrailer().catch((err) => {
  console.error('Error renderizando trailer real:', err);
  process.exit(1);
});
