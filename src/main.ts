import { SpriteManager, SKINS } from './render/sprites';
import { GameEngine } from './core/game-engine';
import { DinoAction } from './core/physics';
import { DinoBot } from './core/bot';
import { DoubleTrackRenderer, PlayerVisualState, MatchOverlayState } from './render/renderer';
import { P2PManager, PlayerProfile } from './net/p2p';
import {
  formatMatchComparison,
  sanitizeTextNoEmojis,
  getLobbyPreviewSprite,
  calculateLobbyPreviewLayout,
} from './render/ui-helpers';
import { SessionScoreTracker } from './core/session-score';
import {
  canJoinRoom,
  formatCleanRoomUrl,
  getHostLobbyButtonsState,
  planDisconnectHandling,
  formatP2PErrorMessage,
} from './core/lobby-helpers';

// Authentic Chrome Dino Palette
const COLORS = [
  '#ffffff', // Classic White (P1)
  '#acacac', // Classic Chrome Dino Gray (P2)
  '#f1c40f', // Retro Gold
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

  // Bot Mode
  private isBotMode = false;
  private bot: DinoBot | null = null;

  // Game Engine & State
  private localEngine!: GameEngine;
  private isMatchRunning = false;
  private currentSeed: number = 12345;
  private countdownEndTime: number | null = null;

  // Asymmetric match overlay state and distance tracking
  private matchOverlay: MatchOverlayState | null = null;
  private localDeathDistance: number | null = null;
  private remoteDeathDistance: number | null = null;
  private botDeathDistance: number | null = null;

  // UI Elements
  private lobbyScreen = document.getElementById('lobby-screen')!;
  private gameScreen = document.getElementById('game-screen')!;
  private nameInput = document.getElementById('player-name') as HTMLInputElement;
  private colorPalette = document.getElementById('color-palette')!;
  private skinPreviewCanvas = document.getElementById('skin-preview-canvas') as HTMLCanvasElement;
  private skinPrevBtn = document.getElementById('skin-prev-btn') as HTMLButtonElement;
  private skinNextBtn = document.getElementById('skin-next-btn') as HTMLButtonElement;
  private skinNameLabel = document.getElementById('skin-name-label') as HTMLElement;

  // Section 2 UI Panels (State Machine)
  private roomMenuView = document.getElementById('room-menu-view')!;
  private hostRoomView = document.getElementById('host-room-view')!;
  private joinRoomView = document.getElementById('join-room-view')!;
  private guestRoomView = document.getElementById('guest-room-view')!;

  private createRoomBtn = document.getElementById('create-room-btn')!;
  private showJoinBtn = document.getElementById('show-join-btn')!;
  private playBotBtn = document.getElementById('play-bot-btn')!;
  private botReturnGameBtn = document.getElementById('bot-return-game-btn');

  private displayRoomCode = document.getElementById('display-room-code')!;
  private displayRoomChip = document.getElementById('display-room-chip');
  private roomLinkInput = document.getElementById('room-link-input') as HTMLInputElement;
  private copyCodeBtn = document.getElementById('copy-code-btn');
  private copyLinkBtn = document.getElementById('copy-link-btn')!;
  private copyFeedback = document.getElementById('copy-feedback')!;
  private copyFeedbackText = document.getElementById('copy-feedback-text');
  private hostStatusBox = document.getElementById('host-status-box')!;
  private hostReturnGameBtn = document.getElementById('host-return-game-btn');
  private hostStartBtn = document.getElementById('host-start-btn') as HTMLButtonElement;
  private cancelRoomBtn = document.getElementById('cancel-room-btn')!;

  // Player cards in host room view
  private hostCardName = document.getElementById('host-card-name');
  private hostCardSkin = document.getElementById('host-card-skin');
  private hostAvatarCanvas = document.getElementById('host-avatar-canvas') as HTMLCanvasElement | null;

  private guestCard = document.getElementById('guest-card');
  private guestCardEmpty = document.getElementById('guest-card-empty');
  private guestCardContent = document.getElementById('guest-card-content');
  private guestCardName = document.getElementById('guest-card-name');
  private guestCardSkin = document.getElementById('guest-card-skin');
  private guestCardStatus = document.getElementById('guest-card-status');
  private guestAvatarCanvas = document.getElementById('guest-avatar-canvas') as HTMLCanvasElement | null;
  private kickRivalBtn = document.getElementById('kick-rival-btn');

  // Player cards in guest room view
  private guestViewHostName = document.getElementById('guest-view-host-name');
  private guestViewHostSkin = document.getElementById('guest-view-host-skin');
  private guestViewHostAvatar = document.getElementById('guest-view-host-avatar') as HTMLCanvasElement | null;

  private guestViewMyName = document.getElementById('guest-view-my-name');
  private guestViewMySkin = document.getElementById('guest-view-my-skin');
  private guestViewMyAvatar = document.getElementById('guest-view-my-avatar') as HTMLCanvasElement | null;

  private roomCodeInput = document.getElementById('room-code-input') as HTMLInputElement;
  private joinRoomConfirmBtn = document.getElementById('join-room-confirm-btn')!;
  private cancelJoinBtn = document.getElementById('cancel-join-btn')!;

  private guestDisplayRoomCode = document.getElementById('guest-display-room-code')!;
  private guestStatusBox = document.getElementById('guest-status-box')!;
  private cancelGuestBtn = document.getElementById('cancel-guest-btn')!;

  private errorBanner = document.getElementById('error-message')!;

  private pingText = document.getElementById('ping-text')!;
  private gameModeTag = document.getElementById('game-mode-tag')!;
  private sessionScore = new SessionScoreTracker();
  private localWantsRematch = false;
  private remoteWantsRematch = false;
  private remoteInLobby = false;
  private botRematchTimer: number | null = null;
  private hasPlayedMatchWithCurrentRival = false;
  private remoteDisconnectedDuringMatch = false;

  private exitGameBtn = document.getElementById('exit-game-btn')!;
  private lobbyGameBtn = document.getElementById('lobby-game-btn')!;
  private sessionScoreTag = document.getElementById('session-score-tag')!;

  private resultModal = document.getElementById('game-result-modal')!;
  private modalResultIcon = document.getElementById('modal-result-icon') as HTMLImageElement;
  private modalResultTitle = document.getElementById('modal-result-title')!;
  private modalResultSub = document.getElementById('modal-result-sub')!;
  private modalScoresLine = document.getElementById('modal-scores-line')!;
  private modalDiffBadge = document.getElementById('modal-diff-badge')!;
  private modalSeriesBadge = document.getElementById('modal-series-badge')!;
  private modalRematchStatus = document.getElementById('modal-rematch-status')!;
  private modalRematchText = document.getElementById('modal-rematch-text')!;
  private modalRematchBtn = document.getElementById('modal-rematch-btn')!;
  private modalToLobbyBtn = document.getElementById('modal-to-lobby-btn')!;
  private modalExitBtn = document.getElementById('modal-exit-btn')!;

  private hostScoreBadge = document.getElementById('host-score-badge')!;
  private guestScoreBadge = document.getElementById('guest-score-badge')!;
  private guestReadyBtn = document.getElementById('guest-ready-btn')!;

  private touchJumpBtn = document.getElementById('touch-jump-btn')!;
  private touchDuckBtn = document.getElementById('touch-duck-btn')!;

  private previewAnimTimer = 0;
  private isLobbyDucking = false;
  private lastNetworkSendTime = 0;

  // Fixed timestep physics accumulator for screen parity (144Hz/120Hz/60Hz)
  private lastFrameTime = 0;
  private physicsAccumulator = 0;
  private readonly FIXED_DELTA = 1 / 60;

  // Background Web Worker ticker to keep physics running when tab is in background
  private tickerWorker: Worker | null = null;

  constructor() {
    this.spriteManager = new SpriteManager();
  }

  async init(): Promise<void> {
    // 1. Load authentic Chromium sprites and community skins
    try {
      await Promise.all([
        this.spriteManager.load('/offline-sprite-dark.png'),
        this.spriteManager.load('/dino-skins.png'),
        this.spriteManager.load('/dino-classic.png').catch(() => {}),
      ]);
    } catch (e) {
      console.error('Failed to load sprite sheets', e);
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
    this.setupBackgroundWorker();

    // 6. Check URL query param for automatic room joining (?room=ABCD)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      const code = roomParam.trim().toUpperCase();
      this.roomCodeInput.value = code;
      const hostRoom = localStorage.getItem('dino_active_host_room');
      const isHostTab = sessionStorage.getItem('dino_host_tab') === code;

      if (hostRoom && hostRoom === code && !isHostTab) {
        this.showError('No puedes unirte a tu propia sala desde el mismo navegador.');
        window.history.replaceState({}, '', window.location.pathname);
      } else if (isHostTab) {
        // Tab was refreshed by host: peer connection was dropped by reload
        window.history.replaceState({}, '', window.location.pathname);
        sessionStorage.removeItem('dino_host_tab');
        localStorage.removeItem('dino_active_host_room');
      } else {
        this.joinRoom(code);
      }
    }

    // Clear host lock if host closes the window/tab
    window.addEventListener('beforeunload', () => {
      if (this.p2p && this.p2p.isHost) {
        localStorage.removeItem('dino_active_host_room');
        localStorage.removeItem('dino_host_timestamp');
      }
    });

    // 7. Start Main Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupBackgroundWorker(): void {
    // Background Web Worker ticker: Chrome never throttles Web Workers even in background tabs
    try {
      const workerBlob = new Blob(
        [
          `
          let timer = null;
          self.onmessage = function(e) {
            if (e.data === 'start') {
              if (!timer) timer = setInterval(() => self.postMessage('tick'), 1000 / 60);
            } else if (e.data === 'stop') {
              if (timer) { clearInterval(timer); timer = null; }
            }
          };
          `,
        ],
        { type: 'application/javascript' }
      );
      this.tickerWorker = new Worker(URL.createObjectURL(workerBlob));
      this.tickerWorker.onmessage = () => {
        // Only step via worker if the tab is hidden (when requestAnimationFrame pauses)
        if (document.hidden && this.isMatchRunning) {
          this.stepSimulation(1 / 60);
        }
      };
      this.tickerWorker.postMessage('start');
    } catch (e) {
      console.warn('Background worker ticker unavailable, falling back to window timers', e);
    }

    // Handle tab visibility change
    document.addEventListener('visibilitychange', () => {
      this.lastFrameTime = performance.now();
      this.physicsAccumulator = 0;

      if (!document.hidden) {
        // Tab gained focus: check if countdown completed while backgrounded
        if (this.countdownEndTime !== null && Date.now() >= this.countdownEndTime) {
          this.isMatchRunning = true;
          this.countdownEndTime = null;
        }
      }
    });
  }

  private stepSimulation(dt: number): void {
    if (!this.isMatchRunning || this.localEngine.isGameOver) return;
    this.localEngine.update(dt);

    if (this.isBotMode && this.bot) {
      this.bot.update(dt);
      if (this.bot.engine.isGameOver && this.botDeathDistance === null) {
        this.botDeathDistance = Math.floor(this.bot.engine.distance);
        if (this.localEngine.isGameOver && this.localDeathDistance !== null) {
          this.evaluateMatchWinner();
        }
      }
    } else {
      if (Date.now() - this.lastNetworkSendTime > 33) {
        this.sendStateNow();
      }
    }
  }

  private setupEngineCallbacks(): void {
    this.localEngine.onCollision = (score, distance) => {
      this.localDeathDistance = Math.floor(distance);

      if (this.isBotMode && this.bot) {
        if (this.bot.engine.isGameOver && this.botDeathDistance !== null) {
          this.evaluateMatchWinner();
        } else {
          // Local crashed, but bot is still running -> spectator mode!
          this.matchOverlay = {
            type: 'LOCAL_CRASHED_SPECTATING',
            myDistance: this.localDeathDistance,
          };
        }
        return;
      }

      // Multiplayer mode: notify peer that we died at this distance
      this.p2p.send({ type: 'DIED', score, distance: this.localDeathDistance });

      if (this.remoteDisconnectedDuringMatch || (this.remoteState.isDead && this.remoteDeathDistance !== null)) {
        this.evaluateMatchWinner();
      } else {
        // Local crashed first! Remote is still running!
        // Local gets Game Over & spectator mode. Remote continues playing!
        this.matchOverlay = {
          type: 'LOCAL_CRASHED_SPECTATING',
          myDistance: this.localDeathDistance,
        };
      }
    };
  }

  private evaluateMatchWinner(): void {
    if (this.remoteDisconnectedDuringMatch) {
      this.remoteDisconnectedDuringMatch = false;
      this.handleRivalAbandonment();
      return;
    }

    const isBot = this.isBotMode;
    const rawRivalName = isBot ? 'BOT' : this.remoteProfile?.name || 'Rival';
    const rivalName = sanitizeTextNoEmojis(rawRivalName) || 'Rival';
    const rivalDist = isBot ? this.botDeathDistance || 0 : this.remoteDeathDistance || 0;
    const myDist = this.localDeathDistance || 0;

    const comp = formatMatchComparison(myDist, rivalDist, rivalName);
    this.modalScoresLine.textContent = comp.detailText;
    this.modalDiffBadge.textContent = comp.diffText;

    if (myDist > rivalDist) {
      this.sessionScore.recordWin('local');
      this.matchOverlay = {
        type: 'VICTORY',
        myDistance: myDist,
        rivalDistance: rivalDist,
        rivalName,
      };
      this.modalResultTitle.textContent = 'VICTORIA';
      this.modalResultTitle.style.color = '#f1c40f';
      this.modalResultSub.textContent = '¡HAS GANADO EL DUELO!';
      this.modalResultIcon.src = '/icons/trophy.svg';
      this.modalDiffBadge.style.color = '#2ecc71';
    } else if (myDist < rivalDist) {
      this.sessionScore.recordWin('remote');
      this.matchOverlay = {
        type: 'DEFEAT',
        myDistance: myDist,
        rivalDistance: rivalDist,
        rivalName,
      };
      this.modalResultTitle.textContent = 'G A M E   O V E R';
      this.modalResultTitle.style.color = '#e74c3c';
      this.modalResultSub.textContent = `${rivalName.toUpperCase()} LLEGÓ MÁS LEJOS`;
      this.modalResultIcon.src = '/icons/close.svg';
      this.modalDiffBadge.style.color = '#e74c3c';
    } else {
      this.matchOverlay = { type: 'TIE', distance: myDist };
      this.modalResultTitle.textContent = '¡ EMPATE !';
      this.modalResultTitle.style.color = '#f1c40f';
      this.modalResultSub.textContent = `AMBOS CHOCARON A LOS ${myDist} METROS`;
      this.modalResultIcon.src = '/icons/flag.svg';
      this.modalDiffBadge.style.color = '#acacac';
    }

    this.updateScoreboardDisplays();

    // Reset rematch readiness for next match
    this.localWantsRematch = false;
    this.remoteWantsRematch = false;
    this.modalRematchBtn.classList.remove('hidden');
    this.modalToLobbyBtn.textContent = 'IR AL LOBBY';
    this.updateRematchModalView();

    this.resultModal.classList.remove('hidden');
  }

  private handleRivalAbandonment(): void {
    this.remoteProfile = null;
    this.remoteWantsRematch = false;
    this.remoteInLobby = false;
    this.hasPlayedMatchWithCurrentRival = false;

    if (this.gameScreen.classList.contains('active')) {
      // Local is in game screen / modal / spectator
      this.modalResultTitle.textContent = 'PARTIDA FINALIZADA';
      this.modalResultTitle.style.color = '#f1c40f';
      this.modalResultSub.textContent = 'EL RIVAL ABANDONÓ LA PARTIDA';
      this.modalResultIcon.src = '/icons/flag.svg';

      const myDist = this.localDeathDistance !== null ? this.localDeathDistance : Math.floor(this.localEngine.distance);
      this.modalScoresLine.textContent = `CORRISTE ${myDist} METROS`;
      this.modalDiffBadge.textContent = 'RIVAL DESCONECTADO';
      this.modalDiffBadge.style.color = '#e74c3c';

      this.modalRematchBtn.classList.add('hidden');
      this.modalRematchStatus.textContent = 'El rival abandonó la partida.';
      this.modalRematchStatus.classList.remove('hidden');

      const toLobbyBtn = this.modalToLobbyBtn as HTMLButtonElement;
      if (toLobbyBtn) {
        toLobbyBtn.disabled = false;
        toLobbyBtn.classList.remove('btn-disabled');
        toLobbyBtn.textContent = 'VOLVER AL LOBBY';
        toLobbyBtn.classList.remove('hidden');
      }

      this.resultModal.classList.remove('hidden');
      this.isMatchRunning = false;
      this.countdownEndTime = null;
      this.matchOverlay = null;
      return;
    }

    if (this.p2p.isHost) {
      this.hostStartBtn.classList.add('hidden');
      if (this.hostReturnGameBtn) this.hostReturnGameBtn.classList.add('hidden');
      this.hostStatusBox.innerHTML = '<span class="pulsing-dot"></span> Rival desconectado. Esperando a un nuevo rival...';
      this.updateLobbyCards();
      this.updateScoreboardDisplays();
    } else {
      this.showError('El anfitrión ha cerrado o abandonado la sala.');
      this.fullExitToMainMenu();
    }
  }

  private setupP2P(): void {
    this.p2p = new P2PManager(this.profile, {
      onConnected: (remoteProfile) => {
        this.remoteProfile = remoteProfile;
        this.hasPlayedMatchWithCurrentRival = false;
        this.remoteDisconnectedDuringMatch = false;
        this.updateScoreboardDisplays();
        this.updateLobbyCards();

        if (this.p2p.isHost) {
          if (this.gameScreen.classList.contains('active')) {
            this.gameScreen.classList.remove('active');
            this.lobbyScreen.classList.add('active');
            this.resultModal.classList.add('hidden');
            this.roomMenuView.classList.add('hidden');
            this.joinRoomView.classList.add('hidden');
            this.guestRoomView.classList.add('hidden');
            this.hostRoomView.classList.remove('hidden');
          }
          // Host remains in lobby waiting room and can start when ready!
          this.hostStatusBox.innerHTML = `¡Rival conectado: <strong style="color: ${remoteProfile.color || '#fff'}">${remoteProfile.name}</strong>!`;
          this.hostStartBtn.classList.remove('hidden');
          if (this.hostReturnGameBtn) this.hostReturnGameBtn.classList.add('hidden');
        } else {
          // Guest is in waiting room panel customizing profile
          this.roomMenuView.classList.add('hidden');
          this.joinRoomView.classList.add('hidden');
          this.guestRoomView.classList.remove('hidden');
          this.guestDisplayRoomCode.textContent = this.p2p.roomId || this.roomCodeInput.value || 'SALA';
          this.guestStatusBox.innerHTML = `¡Conectado al Host: <strong style="color: ${remoteProfile.color || '#fff'}">${remoteProfile.name}</strong>!`;
        }
      },

      onProfileUpdated: (remoteProfile) => {
        this.remoteProfile = remoteProfile;
        if (this.p2p.isHost) {
          this.hostStatusBox.innerHTML = `¡Rival conectado: <strong style="color: ${remoteProfile.color || '#fff'}">${remoteProfile.name}</strong>!`;
        } else {
          this.guestStatusBox.innerHTML = `¡Conectado al Host: <strong style="color: ${remoteProfile.color || '#fff'}">${remoteProfile.name}</strong>!`;
        }
        this.updateScoreboardDisplays();
        this.updateLobbyCards();
      },

      onDisconnected: () => {
        // If local player is actively running mid-match:
        if (this.isMatchRunning && !this.localEngine.isGameOver) {
          // Let local player continue running until they crash!
          this.remoteDisconnectedDuringMatch = true;
          this.remoteState.isDead = true;
          this.remoteDeathDistance = Math.floor(this.remoteState.distance);
          return;
        }

        // If local is not currently running or already crashed/in modal:
        this.handleRivalAbandonment();
      },

      onKicked: (reason) => {
        this.fullExitToMainMenu();
        this.showError(reason || 'Has sido expulsado de la sala por el anfitrión.');
      },

      onStartGame: (seed, startTimestamp) => {
        this.hasPlayedMatchWithCurrentRival = true;
        this.remoteDisconnectedDuringMatch = false;
        this.showGameScreen();
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
        this.remoteDeathDistance = Math.floor(distance);
        this.remoteState.distance = this.remoteDeathDistance;

        if (this.localEngine.isGameOver && this.localDeathDistance !== null) {
          // Both are finished!
          this.evaluateMatchWinner();
        }
      },

      onRematchRequested: (seed) => {
        const startTimestamp = Date.now() + 5200; // 5-second countdown!
        this.p2p.send({ type: 'START_GAME', seed, startTimestamp });
        this.startCountdown(seed, startTimestamp);
      },

      onRematchReady: () => {
        this.remoteWantsRematch = true;
        this.updateRematchModalView();
        if (this.p2p.isHost && this.localWantsRematch) {
          const newSeed = Math.floor(Math.random() * 1000000);
          const startTimestamp = Date.now() + 5200; // 5-second countdown!
          this.p2p.send({ type: 'START_GAME', seed: newSeed, startTimestamp });
          this.startCountdown(newSeed, startTimestamp);
        }
      },

      onCancelRematch: () => {
        this.remoteWantsRematch = false;
        this.updateRematchModalView();
      },

      onRemoteInLobby: () => {
        this.remoteInLobby = true;
        this.remoteWantsRematch = false;
        this.updateRematchModalView();
        if (this.p2p.isHost) {
          this.hostStatusBox.innerHTML = `<span class="pulsing-dot"></span> <strong style="color: ${this.remoteProfile?.color || '#fff'}">${this.remoteProfile?.name || 'Rival'}</strong> está en el lobby cambiando skin/color...`;
        }
      },

      onRemoteReadyInLobby: () => {
        this.remoteInLobby = false;
        this.updateRematchModalView();
        if (this.p2p.isHost) {
          this.hostStatusBox.innerHTML = `¡<strong style="color: ${this.remoteProfile?.color || '#fff'}">${this.remoteProfile?.name || 'Rival'}</strong> ha vuelto a la partida!`;
        }
      },

      onPingUpdated: (pingMs) => {
        this.pingText.textContent = `PING: ${pingMs}ms`;
      },

      onError: (err) => {
        const friendlyMsg = formatP2PErrorMessage(err);
        this.showError(friendlyMsg);
      },
    });
  }

  private startCountdown(seed: number, startTimestamp: number): void {
    this.currentSeed = seed;
    this.localEngine.reset(seed);

    if (this.isBotMode && this.bot) {
      this.bot.reset(seed);
    } else {
      this.remoteState = {
        y: 0,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 0,
        score: 0,
        isDead: false,
      };
    }

    this.hasPlayedMatchWithCurrentRival = true;
    this.remoteDisconnectedDuringMatch = false;
    this.matchOverlay = null;
    this.localDeathDistance = null;
    this.remoteDeathDistance = null;
    this.botDeathDistance = null;
    this.localWantsRematch = false;
    this.remoteWantsRematch = false;
    this.remoteInLobby = false;
    if (this.botRematchTimer) {
      clearTimeout(this.botRematchTimer);
      this.botRematchTimer = null;
    }
    const toLobbyBtn = this.modalToLobbyBtn as HTMLButtonElement;
    if (toLobbyBtn) {
      toLobbyBtn.disabled = false;
      toLobbyBtn.classList.remove('btn-disabled');
    }
    this.resultModal.classList.add('hidden');
    this.countdownEndTime = startTimestamp;
    this.isMatchRunning = false;
    this.physicsAccumulator = 0;
    this.lastFrameTime = performance.now();
  }

  private setupUI(): void {
    // 1. Name input
    this.nameInput.value = this.profile.name;
    this.nameInput.addEventListener('input', () => {
      this.profile.name = this.nameInput.value.trim() || 'Dino';
      localStorage.setItem('dino_name', this.profile.name);
      this.p2p.setLocalProfile(this.profile);
      this.updateLobbyCards();
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
        this.updateLobbyCards();
      });
      this.colorPalette.appendChild(swatch);
    });

    // 3. Skin Selection Carousel
    if (!SKINS[this.profile.skinId]) {
      this.profile.skinId = 'classic';
    }
    this.skinNameLabel.textContent = SKINS[this.profile.skinId]?.name || 'T-Rex Clásico Original';

    this.skinPrevBtn.addEventListener('click', () => {
      this.stepSkin(-1);
    });

    this.skinNextBtn.addEventListener('click', () => {
      this.stepSkin(1);
    });


    // 4. Panel Navigation: Show Create Room View
    this.createRoomBtn.addEventListener('click', async () => {
      this.hideError();
      this.isBotMode = false;
      this.hasPlayedMatchWithCurrentRival = false;
      this.remoteDisconnectedDuringMatch = false;
      this.sessionScore.reset();
      this.updateScoreboardDisplays();
      try {
        const code = await this.p2p.createRoom();
        sessionStorage.setItem('active_host_room', code);
        sessionStorage.setItem('dino_host_tab', code);
        localStorage.setItem('dino_active_host_room', code);
        localStorage.setItem('dino_host_timestamp', Date.now().toString());
        window.history.pushState({ room: code }, '', `?room=${code}`);

        this.displayRoomCode.textContent = code;
        if (this.displayRoomChip) this.displayRoomChip.textContent = code;
        this.gameModeTag.textContent = `SALA: ${code}`;
        const shareUrl = formatCleanRoomUrl(window.location.origin, window.location.pathname, code);
        this.roomLinkInput.value = shareUrl;

        // Switch panel cleanly
        this.roomMenuView.classList.add('hidden');
        this.hostRoomView.classList.remove('hidden');
        this.hostStartBtn.classList.add('hidden');
        if (this.hostReturnGameBtn) this.hostReturnGameBtn.classList.add('hidden');
        this.hostStatusBox.innerHTML = '<span class="pulsing-dot"></span> Esperando a que el rival entre con el enlace...';
        this.updateLobbyCards();
      } catch {
        this.showError('No se pudo crear la sala. Verifica la conexión.');
      }
    });

    // 5. Host clicks Start Game button
    this.hostStartBtn.addEventListener('click', () => {
      if (!this.p2p.isHost) return;
      this.hasPlayedMatchWithCurrentRival = true;
      this.remoteDisconnectedDuringMatch = false;
      this.remoteInLobby = false;
      const seed = Math.floor(Math.random() * 1000000);
      const startTimestamp = Date.now() + 5200; // 5-second countdown!
      this.p2p.send({ type: 'START_GAME', seed, startTimestamp });
      this.showGameScreen();
      this.startCountdown(seed, startTimestamp);
    });

    // 6. Panel Navigation: Show Join Room View
    this.showJoinBtn.addEventListener('click', () => {
      this.hideError();
      this.roomMenuView.classList.add('hidden');
      this.joinRoomView.classList.remove('hidden');
      this.roomCodeInput.focus();
    });

    // 7. Back Button (from Host view)
    this.cancelRoomBtn.addEventListener('click', () => {
      this.fullExitToMainMenu();
    });

    // 8. Back Button (from Join view)
    this.cancelJoinBtn.addEventListener('click', () => {
      this.joinRoomView.classList.add('hidden');
      this.roomMenuView.classList.remove('hidden');
      this.hideError();
    });

    // 9. Cancel/Leave from Guest waiting view
    this.cancelGuestBtn.addEventListener('click', () => {
      this.fullExitToMainMenu();
    });

    // 10. Confirm Join Button
    this.joinRoomConfirmBtn.addEventListener('click', () => {
      const code = this.roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        this.showError('Ingresa un código de 4 letras.');
        return;
      }
      const hostRoom = localStorage.getItem('dino_active_host_room') || sessionStorage.getItem('active_host_room');
      if (!canJoinRoom(code, hostRoom)) {
        this.showError('No puedes unirte a tu propia sala desde el mismo navegador.');
        return;
      }
      this.joinRoom(code);
    });

    // 11. Bot Mode: Play Against Bot
    this.playBotBtn.addEventListener('click', () => {
      this.hideError();
      if (!this.isBotMode) {
        this.sessionScore.reset();
      }
      this.isBotMode = true;
      const seed = Math.floor(Math.random() * 1000000);
      const botEngine = new GameEngine(seed);
      this.bot = new DinoBot(botEngine);

      this.gameModeTag.textContent = 'MODO: BOT';
      this.pingText.textContent = 'LOCAL: 0ms';
      this.updateScoreboardDisplays();

      this.showGameScreen();
      this.startCountdown(seed, Date.now() + 5200); // 5-second countdown!
    });

    // 12. Copy Code Button
    if (this.copyCodeBtn) {
      this.copyCodeBtn.addEventListener('click', () => {
        const code = this.displayRoomCode.textContent || '';
        navigator.clipboard.writeText(code);
        this.showCopyFeedback('¡Código copiado!');
      });
    }

    // 13. Copy Link Button
    this.copyLinkBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(this.roomLinkInput.value);
      this.showCopyFeedback('¡Enlace copiado!');
    });

    // 14. Kick Rival Button (Host Only)
    if (this.kickRivalBtn) {
      this.kickRivalBtn.addEventListener('click', () => {
        if (!this.p2p.isHost) return;
        this.p2p.kickPeer('Has sido expulsado de la sala por el anfitrión.');
        this.remoteProfile = null;
        this.remoteWantsRematch = false;
        this.remoteInLobby = false;
        this.hostStartBtn.classList.add('hidden');
        this.hostStatusBox.innerHTML = '<span class="pulsing-dot"></span> Rival expulsado. Esperando a un nuevo jugador...';
        this.updateLobbyCards();
        this.updateScoreboardDisplays();
      });
    }

    // 15. Exit Game Button (Header)
    this.exitGameBtn.addEventListener('click', () => {
      this.fullExitToMainMenu();
    });

    // 16. Lobby Game Button (Header)
    this.lobbyGameBtn.addEventListener('click', () => {
      this.returnToLobbyFromGame();
    });

    // 17. Modal Rematch Button (Double Confirmation)
    this.modalRematchBtn.addEventListener('click', () => {
      this.handleRematchClick();
    });

    // 18. Modal Go to Lobby (To change skin/color without leaving session)
    this.modalToLobbyBtn.addEventListener('click', () => {
      this.returnToLobbyFromGame();
    });

    // 19. Modal Exit Button (Full Exit)
    this.modalExitBtn.addEventListener('click', () => {
      this.fullExitToMainMenu();
    });

    // 20. Guest / Host / Bot Return to Game Buttons
    if (this.hostReturnGameBtn) {
      this.hostReturnGameBtn.addEventListener('click', () => {
        this.p2p.send({ type: 'PLAYER_READY_IN_LOBBY' });
        this.showGameScreen();
        this.resultModal.classList.remove('hidden');
        this.updateRematchModalView();
        this.updateScoreboardDisplays();
      });
    }

    this.guestReadyBtn.addEventListener('click', () => {
      this.p2p.send({ type: 'PLAYER_READY_IN_LOBBY' });
      this.showGameScreen();
      this.resultModal.classList.remove('hidden');
      this.updateRematchModalView();
      this.updateScoreboardDisplays();
    });

    if (this.botReturnGameBtn) {
      this.botReturnGameBtn.addEventListener('click', () => {
        if (!this.bot) {
          const seed = Math.floor(Math.random() * 1000000);
          const botEngine = new GameEngine(seed);
          this.bot = new DinoBot(botEngine);
        }
        const seed = Math.floor(Math.random() * 1000000);
        this.showGameScreen();
        this.startCountdown(seed, Date.now() + 5200);
      });
    }
  }

  private updateScoreboardDisplays(): void {
    const rawRivalName = this.isBotMode ? 'BOT' : this.remoteProfile?.name || 'RIVAL';
    const rivalName = sanitizeTextNoEmojis(rawRivalName) || 'RIVAL';
    const summary = this.sessionScore.formatBadge(this.profile.name, rivalName);
    this.sessionScoreTag.textContent = summary;
    this.modalSeriesBadge.textContent = summary;
    this.hostScoreBadge.textContent = summary;
    this.guestScoreBadge.textContent = summary;
    this.hostScoreBadge.classList.remove('hidden');
    this.guestScoreBadge.classList.remove('hidden');
  }

  private updateRematchModalView(): void {
    const state = this.sessionScore.formatRematchState(
      this.localWantsRematch,
      this.remoteWantsRematch,
      this.remoteInLobby
    );
    this.modalRematchText.textContent = state.buttonText;
    if (state.statusText) {
      this.modalRematchStatus.textContent = state.statusText;
      this.modalRematchStatus.classList.remove('hidden');
    } else {
      this.modalRematchStatus.classList.add('hidden');
    }

    const toLobbyBtn = this.modalToLobbyBtn as HTMLButtonElement;
    if (toLobbyBtn) {
      toLobbyBtn.disabled = !state.canGoToLobby;
      if (!state.canGoToLobby) {
        toLobbyBtn.classList.add('btn-disabled');
      } else {
        toLobbyBtn.classList.remove('btn-disabled');
      }
    }
  }

  private handleRematchClick(): void {
    if (this.localWantsRematch) {
      // User is canceling their rematch request
      this.localWantsRematch = false;
      this.updateRematchModalView();

      if (this.isBotMode) {
        if (this.botRematchTimer) {
          clearTimeout(this.botRematchTimer);
          this.botRematchTimer = null;
        }
        return;
      }

      this.p2p.send({ type: 'CANCEL_REMATCH' });
      return;
    }

    this.localWantsRematch = true;
    this.updateRematchModalView();

    if (this.isBotMode) {
      this.botRematchTimer = window.setTimeout(() => {
        if (!this.localWantsRematch) return;
        this.remoteWantsRematch = true;
        this.updateRematchModalView();
        setTimeout(() => {
          if (!this.localWantsRematch) return;
          const newSeed = Math.floor(Math.random() * 1000000);
          this.startCountdown(newSeed, Date.now() + 5200);
        }, 300);
      }, 500);
      return;
    }

    // Multiplayer
    this.p2p.send({ type: 'REMATCH_READY' });

    if (this.remoteWantsRematch && this.p2p.isHost) {
      const newSeed = Math.floor(Math.random() * 1000000);
      const startTimestamp = Date.now() + 5200; // 5-second countdown!
      this.p2p.send({ type: 'START_GAME', seed: newSeed, startTimestamp });
      this.startCountdown(newSeed, startTimestamp);
    }
  }

  private returnToLobbyFromGame(): void {
    if (this.localWantsRematch) return; // Blocked if rematch was clicked!

    this.localWantsRematch = false;
    this.remoteWantsRematch = false;
    this.isMatchRunning = false;
    this.countdownEndTime = null;
    this.matchOverlay = null;

    this.resultModal.classList.add('hidden');
    this.gameScreen.classList.remove('active');
    this.lobbyScreen.classList.add('active');

    this.updateScoreboardDisplays();

    if (this.isBotMode) {
      this.roomMenuView.classList.remove('hidden');
      this.hostRoomView.classList.add('hidden');
      this.joinRoomView.classList.add('hidden');
      this.guestRoomView.classList.add('hidden');
      if (this.botReturnGameBtn) this.botReturnGameBtn.classList.remove('hidden');
      return;
    }

    // Multiplayer: maintain P2P connection alive!
    this.p2p.send({ type: 'PLAYER_IN_LOBBY' });

    if (this.p2p.isHost) {
      this.roomMenuView.classList.add('hidden');
      this.joinRoomView.classList.add('hidden');
      this.guestRoomView.classList.add('hidden');
      this.hostRoomView.classList.remove('hidden');

      if (!this.remoteProfile) {
        // Rival had abandoned
        this.hostStartBtn.classList.add('hidden');
        if (this.hostReturnGameBtn) this.hostReturnGameBtn.classList.add('hidden');
        this.hostStatusBox.innerHTML = '<span class="pulsing-dot"></span> Esperando a que el rival entre con el enlace...';
      } else {
        const btnState = getHostLobbyButtonsState(true, this.hasPlayedMatchWithCurrentRival);
        if (btnState.showStartBtn) {
          this.hostStartBtn.classList.remove('hidden');
        } else {
          this.hostStartBtn.classList.add('hidden');
        }
        if (this.hostReturnGameBtn) {
          if (btnState.showReturnGameBtn) {
            this.hostReturnGameBtn.classList.remove('hidden');
          } else {
            this.hostReturnGameBtn.classList.add('hidden');
          }
        }
        const rivalName = this.remoteProfile?.name || 'Rival';
        const rivalColor = this.remoteProfile?.color || '#fff';
        if (this.hasPlayedMatchWithCurrentRival) {
          this.hostStatusBox.innerHTML = `En sala con <strong style="color: ${rivalColor}">${rivalName}</strong>. Cambia tu skin o color y pulsa VOLVER AL JUEGO para dar revancha.`;
        } else {
          this.hostStatusBox.innerHTML = `¡Rival conectado: <strong style="color: ${rivalColor}">${rivalName}</strong>! Pulsa INICIAR PARTIDA cuando ambos estén listos.`;
        }
      }
    } else {
      if (!this.remoteProfile) {
        this.fullExitToMainMenu();
        return;
      }
      this.roomMenuView.classList.add('hidden');
      this.joinRoomView.classList.add('hidden');
      this.hostRoomView.classList.add('hidden');
      this.guestRoomView.classList.remove('hidden');
      this.guestReadyBtn.classList.remove('hidden');
      const rivalName = this.remoteProfile?.name || 'Host';
      const rivalColor = this.remoteProfile?.color || '#fff';
      this.guestStatusBox.innerHTML = `En sala con <strong style="color: ${rivalColor}">${rivalName}</strong>. Cambia tu skin o color y pulsa VOLVER AL JUEGO cuando termines.`;
    }

    this.updateLobbyCards();
  }

  private fullExitToMainMenu(): void {
    this.p2p.cleanup();
    this.isBotMode = false;
    this.bot = null;
    this.remoteProfile = null;
    this.sessionScore.reset();
    this.localWantsRematch = false;
    this.remoteWantsRematch = false;
    this.remoteInLobby = false;
    this.hasPlayedMatchWithCurrentRival = false;
    this.remoteDisconnectedDuringMatch = false;

    sessionStorage.removeItem('active_host_room');
    sessionStorage.removeItem('dino_host_tab');
    if (this.p2p && this.p2p.isHost) {
      localStorage.removeItem('dino_active_host_room');
      localStorage.removeItem('dino_host_timestamp');
    }

    this.gameScreen.classList.remove('active');
    this.lobbyScreen.classList.add('active');

    // Return to main menu panel
    this.hostRoomView.classList.add('hidden');
    this.joinRoomView.classList.add('hidden');
    this.guestRoomView.classList.add('hidden');
    this.roomMenuView.classList.remove('hidden');

    this.hostScoreBadge.classList.add('hidden');
    this.guestScoreBadge.classList.add('hidden');
    this.hostStartBtn.classList.add('hidden');
    if (this.hostReturnGameBtn) this.hostReturnGameBtn.classList.add('hidden');
    if (this.botReturnGameBtn) this.botReturnGameBtn.classList.add('hidden');
    this.guestReadyBtn.classList.add('hidden');
    const toLobbyBtn = this.modalToLobbyBtn as HTMLButtonElement;
    if (toLobbyBtn) {
      toLobbyBtn.disabled = false;
      toLobbyBtn.classList.remove('btn-disabled');
    }
    this.hostStatusBox.innerHTML = '<span class="pulsing-dot"></span> Esperando a que el rival entre con el enlace...';

    this.resultModal.classList.add('hidden');
    this.isMatchRunning = false;
    this.countdownEndTime = null;
    this.matchOverlay = null;
    this.localDeathDistance = null;
    this.remoteDeathDistance = null;
    this.botDeathDistance = null;
    this.physicsAccumulator = 0;
    this.lastFrameTime = 0;

    this.updateLobbyCards();

    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  private async joinRoom(code: string): Promise<void> {
    this.hideError();
    const cleanCode = (code || '').trim().toUpperCase();

    const hostRoom = localStorage.getItem('dino_active_host_room') || sessionStorage.getItem('active_host_room');
    if (!canJoinRoom(cleanCode, hostRoom)) {
      this.showError('No puedes unirte a tu propia sala desde el mismo navegador.');
      return;
    }

    this.isBotMode = false;
    this.sessionScore.reset();
    this.updateScoreboardDisplays();
    this.gameModeTag.textContent = `SALA: ${cleanCode}`;

    // Show guest waiting room panel immediately
    this.roomMenuView.classList.add('hidden');
    this.joinRoomView.classList.add('hidden');
    this.guestRoomView.classList.remove('hidden');
    this.guestDisplayRoomCode.textContent = cleanCode;
    this.guestStatusBox.innerHTML = '<span class="pulsing-dot"></span> Conectando a la sala...';
    this.updateLobbyCards();

    try {
      await this.p2p.joinRoom(cleanCode);
    } catch (err: unknown) {
      this.fullExitToMainMenu();
      const msg = formatP2PErrorMessage(err);
      this.showError(msg);
    }
  }

  private showCopyFeedback(msg: string): void {
    if (this.copyFeedbackText) this.copyFeedbackText.textContent = msg;
    this.copyFeedback.classList.remove('hidden');
    setTimeout(() => this.copyFeedback.classList.add('hidden'), 2500);
  }

  private renderAvatarOnCanvas(
    canvas: HTMLCanvasElement | null,
    skinId: string,
    color: string
  ): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 40, 40);
    ctx.imageSmoothingEnabled = false;

    const img =
      this.spriteManager.getImage('/dino-skins.png') ||
      this.spriteManager.getImage('/dino-classic.png');
    if (!img) return;

    const frame = Math.floor(this.previewAnimTimer * 2.5) % 2;
    const skin = SKINS[skinId] || SKINS.classic || Object.values(SKINS)[0];
    if (!skin || !skin.run || !skin.run[frame]) return;
    const spriteRect = skin.run[frame];
    if (!spriteRect) return;

    // Draw centered 28x30 sprite on 40x40 canvas
    const targetW = 28;
    const targetH = 30;
    const x = Math.round((40 - targetW) / 2);
    const y = Math.round((40 - targetH) / 2);

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

  private updateLobbyAvatars(): void {
    if (!this.lobbyScreen.classList.contains('active')) return;

    if (!this.hostRoomView.classList.contains('hidden')) {
      this.renderAvatarOnCanvas(this.hostAvatarCanvas, this.profile.skinId, this.profile.color);
      if (this.remoteProfile) {
        this.renderAvatarOnCanvas(this.guestAvatarCanvas, this.remoteProfile.skinId, this.remoteProfile.color);
      }
    } else if (!this.guestRoomView.classList.contains('hidden')) {
      if (this.remoteProfile) {
        this.renderAvatarOnCanvas(this.guestViewHostAvatar, this.remoteProfile.skinId, this.remoteProfile.color);
      }
      this.renderAvatarOnCanvas(this.guestViewMyAvatar, this.profile.skinId, this.profile.color);
    }
  }

  private updateLobbyCards(): void {
    // 1. Host View: Card 1 (Local Player)
    if (this.hostCardName) {
      this.hostCardName.textContent = this.profile.name || 'Dino';
      this.hostCardName.style.color = this.profile.color || '#fff';
    }
    if (this.hostCardSkin) {
      this.hostCardSkin.textContent = SKINS[this.profile.skinId]?.name || 'T-Rex Clásico Original';
    }

    // 2. Host View: Card 2 (Remote Player or Empty Slot)
    if (this.remoteProfile) {
      this.guestCard?.classList.remove('empty-slot');
      this.guestCardEmpty?.classList.add('hidden');
      this.guestCardContent?.classList.remove('hidden');
      if (this.guestCardName) {
        this.guestCardName.textContent = this.remoteProfile.name || 'Rival';
        this.guestCardName.style.color = this.remoteProfile.color || '#fff';
      }
      if (this.guestCardSkin) {
        this.guestCardSkin.textContent = SKINS[this.remoteProfile.skinId]?.name || 'T-Rex Clásico Original';
      }
      if (this.guestCardStatus) {
        this.guestCardStatus.textContent = this.remoteInLobby ? 'EN EL LOBBY' : 'LISTO';
      }
    } else {
      this.guestCard?.classList.add('empty-slot');
      this.guestCardEmpty?.classList.remove('hidden');
      this.guestCardContent?.classList.add('hidden');
    }

    // 3. Guest View: Host Card (Remote) and My Card (Local)
    if (this.remoteProfile) {
      if (this.guestViewHostName) {
        this.guestViewHostName.textContent = this.remoteProfile.name || 'Host';
        this.guestViewHostName.style.color = this.remoteProfile.color || '#fff';
      }
      if (this.guestViewHostSkin) {
        this.guestViewHostSkin.textContent = SKINS[this.remoteProfile.skinId]?.name || 'T-Rex Clásico Original';
      }
    }
    if (this.guestViewMyName) {
      this.guestViewMyName.textContent = this.profile.name || 'Dino';
      this.guestViewMyName.style.color = this.profile.color || '#fff';
    }
    if (this.guestViewMySkin) {
      this.guestViewMySkin.textContent = SKINS[this.profile.skinId]?.name || 'T-Rex Clásico Original';
    }

    this.updateLobbyAvatars();
  }

  private stepSkin(direction: number): void {
    const skinKeys = Object.keys(SKINS);
    if (skinKeys.length === 0) return;
    const currentIndex = skinKeys.indexOf(this.profile.skinId);
    const nextIndex = (currentIndex + direction + skinKeys.length) % skinKeys.length;
    this.setSkin(skinKeys[nextIndex]);
  }

  private setSkin(newSkinId: string): void {
    if (!SKINS[newSkinId]) {
      newSkinId = 'classic';
    }
    this.profile.skinId = newSkinId;
    localStorage.setItem('dino_skin', newSkinId);
    if (this.skinNameLabel) {
      this.skinNameLabel.textContent = SKINS[newSkinId]?.name || newSkinId;
    }
    this.p2p.setLocalProfile(this.profile);
    this.updateLobbyCards();
  }

  private renderSkinPreview(): void {
    const ctx = this.skinPreviewCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 96, 96);
    ctx.imageSmoothingEnabled = false;

    const img = this.spriteManager.getImage('/dino-skins.png') || this.spriteManager.getImage('/dino-classic.png');
    if (!img) return;

    // Calm preview animation cadence: 2.5 steps per second
    const frame = Math.floor(this.previewAnimTimer * 2.5) % 2;
    const skin = SKINS[this.profile.skinId] || SKINS.classic || Object.values(SKINS)[0];
    if (!skin) return;

    // If holding down arrow in lobby, display the ducking preview in real time!
    const spriteRect = getLobbyPreviewSprite(skin, this.isLobbyDucking, frame);
    if (!spriteRect) return;

    // Calculate layout with feet grounded on fixed baseline without clipping
    const layout = calculateLobbyPreviewLayout(spriteRect, 96, 96, 1.25, 86);

    ctx.drawImage(
      img,
      spriteRect.x,
      spriteRect.y,
      spriteRect.w,
      spriteRect.h,
      layout.x,
      layout.y,
      layout.width,
      layout.height
    );
  }

  private setupInputListeners(): void {
    // Interactive mouse and touch duck preview on canvas
    this.skinPreviewCanvas.addEventListener('mousedown', () => {
      this.isLobbyDucking = true;
    });
    this.skinPreviewCanvas.addEventListener('mouseup', () => {
      this.isLobbyDucking = false;
    });
    this.skinPreviewCanvas.addEventListener('mouseleave', () => {
      this.isLobbyDucking = false;
    });
    this.skinPreviewCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.isLobbyDucking = true;
    }, { passive: false });
    this.skinPreviewCanvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.isLobbyDucking = false;
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      // If end-game modal is open, Enter/Space triggers rematch, Escape exits
      if (!this.resultModal.classList.contains('hidden')) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.handleRematchClick();
          return;
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.returnToLobbyFromGame();
          return;
        }
      }

      const isTyping = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        if (this.gameScreen.classList.contains('active')) {
          e.preventDefault();
          this.localEngine.handleInput(DinoAction.JUMP);
          this.sendStateNow();
        }
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        if (!isTyping) {
          e.preventDefault();
          if (this.lobbyScreen.classList.contains('active')) {
            this.isLobbyDucking = true;
          }
          if (this.gameScreen.classList.contains('active')) {
            this.localEngine.handleInput(DinoAction.DUCK_START);
            this.sendStateNow();
          }
        }
      } else if (['ArrowLeft', 'ArrowRight'].includes(e.code)) {
        if (!isTyping && this.lobbyScreen.classList.contains('active')) {
          e.preventDefault();
          this.stepSkin(e.code === 'ArrowRight' ? 1 : -1);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
        if (this.gameScreen.classList.contains('active')) {
          e.preventDefault();
          this.localEngine.handleInput(DinoAction.JUMP_END);
          this.sendStateNow();
        }
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        this.isLobbyDucking = false;
        if (this.gameScreen.classList.contains('active')) {
          e.preventDefault();
          this.localEngine.handleInput(DinoAction.DUCK_END);
          this.sendStateNow();
        }
      }
    });

    // Touch Controls
    this.touchJumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.localEngine.handleInput(DinoAction.JUMP);
      this.sendStateNow();
    });

    this.touchJumpBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.localEngine.handleInput(DinoAction.JUMP_END);
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

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.localEngine.handleInput(DinoAction.JUMP_END);
      this.sendStateNow();
    });
  }

  private sendStateNow(): void {
    if (!this.isMatchRunning || this.isBotMode) return;
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
    this.fullExitToMainMenu();
  }

  private showError(msg: string): void {
    this.errorBanner.textContent = msg;
    this.errorBanner.classList.remove('hidden');
  }

  private hideError(): void {
    this.errorBanner.classList.add('hidden');
  }

  private loop(currentTime: number): void {
    if (!this.lastFrameTime) this.lastFrameTime = currentTime;
    let dt = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;
    if (dt > 0.2) dt = 0.2; // Guard against tab background throttling spikes

    this.previewAnimTimer += dt;
    this.renderSkinPreview();
    this.updateLobbyAvatars();

    if (this.gameScreen.classList.contains('active')) {
      let countdownText: string | null = null;

      // 5-Second Countdown (5, 4, 3, 2, 1, ¡YA!)
      if (this.countdownEndTime !== null) {
        const remainingMs = this.countdownEndTime - Date.now();
        if (remainingMs > 4000) {
          countdownText = '5';
        } else if (remainingMs > 3000) {
          countdownText = '4';
        } else if (remainingMs > 2000) {
          countdownText = '3';
        } else if (remainingMs > 1000) {
          countdownText = '2';
        } else if (remainingMs > 0) {
          countdownText = '1';
        } else if (remainingMs > -600) {
          countdownText = '¡YA!';
          this.isMatchRunning = true;
        } else {
          this.countdownEndTime = null;
          this.isMatchRunning = true;
        }
      }

      if (this.isMatchRunning && !document.hidden) {
        this.physicsAccumulator += dt;
        while (this.physicsAccumulator >= this.FIXED_DELTA) {
          this.stepSimulation(this.FIXED_DELTA);
          this.physicsAccumulator -= this.FIXED_DELTA;
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

      let remoteVisual: PlayerVisualState | null = null;

      if (this.isBotMode && this.bot) {
        remoteVisual = {
          name: 'BOT T-Rex',
          color: '#acacac',
          skinId: 'hurdles',
          isLocal: false,
          score: this.bot.engine.score,
          distance: this.bot.engine.distance,
          y: this.bot.engine.dino.y,
          isDucking: this.bot.engine.dino.isDucking,
          isGrounded: this.bot.engine.dino.isGrounded,
          isDead: this.bot.engine.isGameOver,
        };
      } else if (this.remoteProfile) {
        remoteVisual = {
          name: this.remoteProfile.name,
          color: this.remoteProfile.color,
          skinId: this.remoteProfile.skinId || 'classic',
          isLocal: false,
          score: this.remoteState.score,
          distance: this.remoteState.distance,
          y: this.remoteState.y,
          isDucking: this.remoteState.isDucking,
          isGrounded: this.remoteState.isGrounded,
          isDead: this.remoteState.isDead,
        };
      }

      const isRivalEliminated = this.isBotMode
        ? !!(this.bot?.engine.isGameOver && !this.localEngine.isGameOver)
        : !!(this.remoteState.isDead && !this.localEngine.isGameOver);

      let currentOverlay: MatchOverlayState | null = this.matchOverlay;
      if (countdownText) {
        currentOverlay = { type: 'COUNTDOWN', text: countdownText };
      }

      this.renderer.render(
        this.localEngine,
        localVisual,
        remoteVisual,
        currentOverlay,
        isRivalEliminated
      );
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new DinoApp();
  app.init().catch(console.error);
});
