import { SpriteManager, SKINS } from './render/sprites';
import { GameEngine } from './core/game-engine';
import { DinoAction } from './core/physics';
import { DoubleTrackRenderer, PlayerVisualState } from './render/renderer';
import { P2PManager, PlayerProfile } from './net/p2p';

// Classic Retro Arcade Palette (No futuristic neon glows)
const COLORS = [
  '#ffffff', // Classic White (Default P1)
  '#acacac', // Classic Chrome Dino Gray (Default P2)
  '#f1c40f', // Retro Warm Gold
  '#2ecc71', // Classic Green
  '#e74c3c', // Retro Brick Red
  '#e67e22', // Retro Amber
];

const SKIN_KEYS = Object.keys(SKINS);

class DinoApp {
  private spriteManager: SpriteManager;
  private renderer!: DoubleTrackRenderer;
  private p2p!: P2PManager;

  // Local Profile
  private profile: PlayerProfile = {
    name: localStorage.getItem('dino_name') || 'Dino',
    color: localStorage.getItem('dino_color') || COLORS[0],
    skinId: localStorage.getItem('dino_skin') || 'classic',
  };

  private remoteProfile: PlayerProfile | null = null;
  private remoteState = {
    y: 0,
    vy: 0,
    isDucking: false,
    isGrounded: true,
    distance: 0,
    score: 0,
    isDead: false,
  };

  // Game Engine & State
  private localEngine!: GameEngine;
  private isMatchRunning = false;
  private currentSeed: number = 12345;
  private countdownEndTime: number | null = null;
  private winnerAnnouncement: string | null = null;

  // UI Elements
  private lobbyScreen = document.getElementById('lobby-screen')!;
  private gameScreen = document.getElementById('game-screen')!;
  private nameInput = document.getElementById('player-name') as HTMLInputElement;
  private colorPalette = document.getElementById('color-palette')!;
  private skinPreviewCanvas = document.getElementById('skin-preview-canvas') as HTMLCanvasElement;
  private skinNameLabel = document.getElementById('skin-name-label')!;
  private skinPrevBtn = document.getElementById('skin-prev-btn')!;
  private skinNextBtn = document.getElementById('skin-next-btn')!;

  private createRoomBtn = document.getElementById('create-room-btn')!;
  private joinRoomBtn = document.getElementById('join-room-btn')!;
  private roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;
  private waitingBox = document.getElementById('waiting-box')!;
  private displayRoomCode = document.getElementById('display-room-code')!;
  private roomLinkInput = document.getElementById('room-link-input') as HTMLInputElement;
  private copyLinkBtn = document.getElementById('copy-link-btn')!;
  private copyFeedback = document.getElementById('copy-feedback')!;
  private cancelRoomBtn = document.getElementById('cancel-room-btn')!;
  private errorBanner = document.getElementById('error-message')!;

  private pingText = document.getElementById('ping-text')!;
  private gameRoomCode = document.getElementById('game-room-code')!;
  private exitGameBtn = document.getElementById('exit-game-btn')!;
  private rematchBar = document.getElementById('rematch-bar')!;
  private rematchBtn = document.getElementById('rematch-btn')!;

  private touchJumpBtn = document.getElementById('touch-jump-btn')!;
  private touchDuckBtn = document.getElementById('touch-duck-btn')!;

  private previewAnimTimer = 0;
  private lastNetworkSendTime = 0;

  constructor() {
    this.spriteManager = new SpriteManager();
  }

  async init(): Promise<void> {
    // 1. Load Chrome dark mode sprite sheet
    try {
      await this.spriteManager.load('/dino-dark.png');
    } catch {
      await this.spriteManager.load('/dino-transparent.png');
    }

    // 2. Setup Canvas Renderer
    const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new DoubleTrackRenderer(gameCanvas, this.spriteManager);

    // 3. Initialize Engine
    this.localEngine = new GameEngine(this.currentSeed);
    this.setupEngineCallbacks();

    // 4. Setup P2P Manager
    this.setupP2P();

    // 5. Setup UI & Listeners
    this.setupUI();
    this.setupInputListeners();

    // 6. Check URL query param for automatic room joining (?room=ABCD)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      this.roomCodeInput.value = roomParam.trim().toUpperCase();
      this.joinRoom(roomParam.trim());
    }

    // 7. Start Main Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupEngineCallbacks(): void {
    this.localEngine.onCollision = (score, distance) => {
      this.p2p.send({ type: 'DIED', score, distance });

      if (this.remoteState.isDead) {
        if (distance > this.remoteState.distance) {
          this.winnerAnnouncement = '¡VICTORIA! Sobreviviste más';
        } else if (distance < this.remoteState.distance) {
          this.winnerAnnouncement = 'DERROTA: El rival llegó más lejos';
        } else {
          this.winnerAnnouncement = 'EMPATE EXACTO';
        }
      } else {
        this.winnerAnnouncement = 'HAS CHOCADO... Esperando al rival';
      }
      this.rematchBar.classList.remove('hidden');
    };
  }

  private setupP2P(): void {
    this.p2p = new P2PManager(this.profile, {
      onConnected: (remoteProfile) => {
        this.remoteProfile = remoteProfile;
        this.waitingBox.classList.add('hidden');
        this.showGameScreen();

        if (this.p2p.isHost) {
          const seed = Math.floor(Math.random() * 1000000);
          const startTimestamp = Date.now() + 3200;
          this.p2p.send({ type: 'START_GAME', seed, startTimestamp });
          this.startCountdown(seed, startTimestamp);
        }
      },

      onDisconnected: () => {
        this.showError('El rival se ha desconectado de la sala.');
        this.exitToLobby();
      },

      onStartGame: (seed, startTimestamp) => {
        this.startCountdown(seed, startTimestamp);
      },

      onRemoteState: (state) => {
        this.remoteState = {
          ...this.remoteState,
          ...state,
        };
      },

      onRemoteDied: (score, distance) => {
        this.remoteState.isDead = true;
        this.remoteState.score = score;
        this.remoteState.distance = distance;

        if (!this.localEngine.isGameOver) {
          this.winnerAnnouncement = '¡VICTORIA! El rival ha chocado';
        } else {
          if (this.localEngine.distance > distance) {
            this.winnerAnnouncement = '¡VICTORIA! Sobreviviste más';
          } else if (this.localEngine.distance < distance) {
            this.winnerAnnouncement = 'DERROTA: El rival llegó más lejos';
          } else {
            this.winnerAnnouncement = 'EMPATE EXACTO';
          }
        }
        this.rematchBar.classList.remove('hidden');
      },

      onRematchRequested: (seed) => {
        const startTimestamp = Date.now() + 3000;
        this.p2p.send({ type: 'START_GAME', seed, startTimestamp });
        this.startCountdown(seed, startTimestamp);
      },

      onPingUpdated: (pingMs) => {
        this.pingText.textContent = `PING: ${pingMs}ms`;
      },

      onError: (err) => {
        this.showError(err);
      },
    });
  }

  private startCountdown(seed: number, startTimestamp: number): void {
    this.currentSeed = seed;
    this.localEngine.reset(seed);
    this.remoteState = {
      y: 0,
      vy: 0,
      isDucking: false,
      isGrounded: true,
      distance: 0,
      score: 0,
      isDead: false,
    };
    this.winnerAnnouncement = null;
    this.rematchBar.classList.add('hidden');
    this.countdownEndTime = startTimestamp;
    this.isMatchRunning = false;
  }

  private setupUI(): void {
    // 1. Name input
    this.nameInput.value = this.profile.name;
    this.nameInput.addEventListener('input', () => {
      this.profile.name = this.nameInput.value.trim() || 'Dino';
      localStorage.setItem('dino_name', this.profile.name);
      this.p2p.setLocalProfile(this.profile);
    });

    // 2. Color Palette
    this.colorPalette.innerHTML = '';
    COLORS.forEach((hex) => {
      const swatch = document.createElement('div');
      swatch.className = `color-swatch ${hex === this.profile.color ? 'active' : ''}`;
      swatch.style.backgroundColor = hex;
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        this.profile.color = hex;
        localStorage.setItem('dino_color', hex);
        this.p2p.setLocalProfile(this.profile);
        this.renderSkinPreview();
      });
      this.colorPalette.appendChild(swatch);
    });

    // 3. Skin Carousel
    this.updateSkinLabel();
    this.skinPrevBtn.addEventListener('click', () => {
      let idx = SKIN_KEYS.indexOf(this.profile.skinId);
      idx = (idx - 1 + SKIN_KEYS.length) % SKIN_KEYS.length;
      this.profile.skinId = SKIN_KEYS[idx];
      this.onSkinChanged();
    });
    this.skinNextBtn.addEventListener('click', () => {
      let idx = SKIN_KEYS.indexOf(this.profile.skinId);
      idx = (idx + 1) % SKIN_KEYS.length;
      this.profile.skinId = SKIN_KEYS[idx];
      this.onSkinChanged();
    });

    // 4. Create Room Button
    this.createRoomBtn.addEventListener('click', async () => {
      this.hideError();
      try {
        const code = await this.p2p.createRoom();
        this.displayRoomCode.textContent = code;
        this.gameRoomCode.textContent = code;
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
        this.roomLinkInput.value = shareUrl;
        this.waitingBox.classList.remove('hidden');
      } catch (err: any) {
        this.showError('No se pudo crear la sala. Comprueba la conexión.');
      }
    });

    // 5. Copy Link Button
    this.copyLinkBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.roomLinkInput.value);
      this.copyFeedback.classList.remove('hidden');
      setTimeout(() => this.copyFeedback.classList.add('hidden'), 2500);
    });

    // 6. Join Room Button
    this.joinRoomBtn.addEventListener('click', () => {
      const code = this.roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        this.showError('Ingresa un código de 4 letras.');
        return;
      }
      this.joinRoom(code);
    });

    // 7. Cancel Room Button
    this.cancelRoomBtn.addEventListener('click', () => {
      this.p2p.cleanup();
      this.waitingBox.classList.add('hidden');
    });

    // 8. Exit Game Button
    this.exitGameBtn.addEventListener('click', () => {
      this.exitToLobby();
    });

    // 9. Rematch Button
    this.rematchBtn.addEventListener('click', () => {
      const newSeed = Math.floor(Math.random() * 1000000);
      this.p2p.send({ type: 'REMATCH_REQUEST', seed: newSeed });
      const startTimestamp = Date.now() + 3000;
      this.p2p.send({ type: 'START_GAME', seed: newSeed, startTimestamp });
      this.startCountdown(newSeed, startTimestamp);
    });
  }

  private async joinRoom(code: string): Promise<void> {
    this.hideError();
    this.gameRoomCode.textContent = code;
    try {
      await this.p2p.joinRoom(code);
    } catch (e: any) {
      this.showError('No se pudo conectar a la sala.');
    }
  }

  private onSkinChanged(): void {
    localStorage.setItem('dino_skin', this.profile.skinId);
    this.p2p.setLocalProfile(this.profile);
    this.updateSkinLabel();
    this.renderSkinPreview();
  }

  private updateSkinLabel(): void {
    const skin = SKINS[this.profile.skinId] || SKINS.classic;
    this.skinNameLabel.textContent = skin.name;
  }

  private renderSkinPreview(): void {
    const ctx = this.skinPreviewCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 120, 120);
    ctx.imageSmoothingEnabled = false;

    const skin = SKINS[this.profile.skinId] || SKINS.classic;
    const img = this.spriteManager.getImage();
    if (!img) return;

    const frame = Math.floor(this.previewAnimTimer * 8) % 2;
    const spriteRect = skin.run[frame];

    const targetH = 75;
    const targetW = Math.round((spriteRect.w / spriteRect.h) * targetH);
    const x = Math.round((120 - targetW) / 2);
    const y = Math.round((120 - targetH) / 2);

    ctx.drawImage(
      img,
      spriteRect.x,
      spriteRect.y,
      spriteRect.w,
      spriteRect.h,
      x,
      y,
      targetW,
      targetH
    );
  }

  private setupInputListeners(): void {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        this.localEngine.handleInput(DinoAction.JUMP);
        this.sendStateNow();
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        this.localEngine.handleInput(DinoAction.DUCK_START);
        this.sendStateNow();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        this.localEngine.handleInput(DinoAction.DUCK_END);
        this.sendStateNow();
      }
    });

    // Touch Controls
    this.touchJumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.localEngine.handleInput(DinoAction.JUMP);
      this.sendStateNow();
    });

    this.touchDuckBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.localEngine.handleInput(DinoAction.DUCK_START);
      this.sendStateNow();
    });

    this.touchDuckBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.localEngine.handleInput(DinoAction.DUCK_END);
      this.sendStateNow();
    });

    const canvas = document.getElementById('game-canvas')!;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.localEngine.handleInput(DinoAction.JUMP);
      this.sendStateNow();
    });
  }

  private sendStateNow(): void {
    if (!this.isMatchRunning) return;
    this.p2p.send({
      type: 'STATE',
      y: this.localEngine.dino.y,
      vy: this.localEngine.dino.vy,
      isDucking: this.localEngine.dino.isDucking,
      isGrounded: this.localEngine.dino.isGrounded,
      distance: this.localEngine.distance,
      score: this.localEngine.score,
      t: Date.now(),
    });
    this.lastNetworkSendTime = Date.now();
  }

  private showGameScreen(): void {
    this.lobbyScreen.classList.remove('active');
    this.gameScreen.classList.add('active');
  }

  private exitToLobby(): void {
    this.p2p.cleanup();
    this.gameScreen.classList.remove('active');
    this.lobbyScreen.classList.add('active');
    this.rematchBar.classList.add('hidden');
    this.isMatchRunning = false;
    this.countdownEndTime = null;
    this.winnerAnnouncement = null;
  }

  private showError(msg: string): void {
    this.errorBanner.textContent = msg;
    this.errorBanner.classList.remove('hidden');
  }

  private hideError(): void {
    this.errorBanner.classList.add('hidden');
  }

  private loop(currentTime: number): void {
    this.previewAnimTimer += 1 / 60;
    this.renderSkinPreview();

    if (this.gameScreen.classList.contains('active')) {
      let countdownText: string | null = null;

      if (this.countdownEndTime !== null) {
        const remainingMs = this.countdownEndTime - Date.now();
        if (remainingMs > 2000) {
          countdownText = '3';
        } else if (remainingMs > 1000) {
          countdownText = '2';
        } else if (remainingMs > 0) {
          countdownText = '1';
        } else if (remainingMs > -600) {
          countdownText = 'GO';
          this.isMatchRunning = true;
        } else {
          this.countdownEndTime = null;
          this.isMatchRunning = true;
        }
      }

      if (this.isMatchRunning) {
        this.localEngine.update(1 / 60);

        if (Date.now() - this.lastNetworkSendTime > 33) {
          this.sendStateNow();
        }
      }

      const localVisual: PlayerVisualState = {
        name: this.profile.name,
        color: this.profile.color,
        skinId: this.profile.skinId,
        isLocal: true,
        score: this.localEngine.score,
        distance: this.localEngine.distance,
        y: this.localEngine.dino.y,
        isDucking: this.localEngine.dino.isDucking,
        isGrounded: this.localEngine.dino.isGrounded,
        isDead: this.localEngine.isGameOver,
      };

      const remoteVisual: PlayerVisualState | null = this.remoteProfile
        ? {
            name: this.remoteProfile.name,
            color: this.remoteProfile.color,
            skinId: this.remoteProfile.skinId,
            isLocal: false,
            score: this.remoteState.score,
            distance: this.remoteState.distance,
            y: this.remoteState.y,
            isDucking: this.remoteState.isDucking,
            isGrounded: this.remoteState.isGrounded,
            isDead: this.remoteState.isDead,
          }
        : null;

      this.renderer.render(
        this.localEngine,
        localVisual,
        remoteVisual,
        countdownText,
        this.winnerAnnouncement
      );
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new DinoApp();
  app.init().catch(console.error);
});
