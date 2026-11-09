import { SpriteManager, SKINS } from './render/sprites';
import { GameEngine } from './core/game-engine';
import { DinoAction } from './core/physics';
import { DoubleTrackRenderer, PlayerVisualState, MatchOverlayState, TrackRenderData } from './render/renderer';
import { P2PManager, PlayerProfile } from './net/p2p';
import {
  formatMatchComparison,
  sanitizeTextNoEmojis,
  getLobbyPreviewSprite,
  calculateLobbyPreviewLayout,
  escapeHtml,
  markAllRemotePlayersDead,
  checkAllPlayersDead,
  processBackgroundTick,
  extrapolateKinematicTrajectory,
  getPingClass,
  createColorSwatchElement,
} from './render/ui-helpers';
import { SessionScoreTracker } from './core/session-score';
import {
  canJoinRoom,
  formatCleanRoomUrl,
  getHostLobbyButtonsState,
  planDisconnectHandling,
  formatP2PErrorMessage,
  formatSoloModalDisplay,
  extractRoomCode,
} from './core/lobby-helpers';
import {
  DailyChallengeState,
  getCurrentDateUtc,
  getDailySeed,
  loadDailyState,
  saveDailyState,
  recordDailyRun,
  formatDailyShareText,
  copyTextToClipboard,
  MAX_OFFICIAL_ATTEMPTS,
  DAILY_TARGET_SCORE,
} from './core/daily-challenge';

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
const COUNTDOWN_DURATION_MS = 3200;

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
  private remotePlayers: Map<string, {
    peerId: string;
    profile: PlayerProfile;
    state: {
      y: number;
      vy: number;
      isDucking: boolean;
      isGrounded: boolean;
      distance: number;
      score: number;
      isDead: boolean;
    };
    visualDistance: number;
    visualY: number;
    isSpectating?: boolean;
  }> = new Map();
  private isSpectating: boolean = false;
  private remoteState = {
    y: 0,
    vy: 0,
    isDucking: false,
    isGrounded: true,
    distance: 0,
    score: 0,
    isDead: false,
  };
  private remoteVisualDistance = 0;
  private remoteVisualY = 0;

  // Solo Mode
  private isSoloMode = false;
  private soloHighScore: number = (() => {
    const raw = localStorage.getItem('dino_solo_highscore');
    if (!raw) return 0;
    const val = parseInt(raw, 10);
    if (!localStorage.getItem('dino_highscore_is_points') && val > 0) {
      const migrated = Math.floor(val / 10);
      localStorage.setItem('dino_solo_highscore', migrated.toString());
      localStorage.setItem('dino_highscore_is_points', 'true');
      return migrated;
    }
    return isNaN(val) ? 0 : val;
  })();

  // Daily Challenge Mode
  private isDailyMode = false;
  private currentDailyDateUtc = '';
  private currentDailyState: DailyChallengeState | null = null;
  private playDailyBtn = document.getElementById('play-daily-btn') as HTMLButtonElement | null;
  private dailyBtnBadge = document.getElementById('daily-btn-badge');
  private modalShareBtn = document.getElementById('modal-share-btn') as HTMLButtonElement | null;
  private modalShareText = document.getElementById('modal-share-text');

  // Game Engine & State
  private localEngine!: GameEngine;
  private isMatchRunning = false;
  private currentSeed: number = 12345;
  private countdownEndTime: number | null = null;

  // Asymmetric match overlay state and distance tracking
  private matchOverlay: MatchOverlayState | null = null;
  private localDeathDistance: number | null = null;
  private remoteDeathDistance: number | null = null;

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
  private playSoloBtn = document.getElementById('play-solo-btn')!;
  private soloReturnGameBtn = document.getElementById('solo-return-game-btn');

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
    this.updateDailyButtonBadge();

    // 6. Check URL query param for automatic room joining (?room=ABCD)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      const code = roomParam.trim().toUpperCase();
      this.roomCodeInput.value = code;
      const isHostTab = sessionStorage.getItem('dino_host_tab') === code;

      if (isHostTab) {
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
        processBackgroundTick(
          {
            isMatchRunning: this.isMatchRunning,
            countdownEndTime: this.countdownEndTime,
            documentHidden: document.hidden,
            stepSimulation: (dt) => this.stepSimulation(dt),
            onMatchStarted: () => {
              this.isMatchRunning = true;
              this.countdownEndTime = null;
            },
          },
          performance.now(),
          1 / 60
        );
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
        if (this.countdownEndTime !== null && performance.now() >= this.countdownEndTime) {
          this.isMatchRunning = true;
          this.countdownEndTime = null;
        }
      }
    });
  }

  private stepSimulation(dt: number): void {
    if (!this.isMatchRunning) return;

    if (!this.localEngine.isGameOver) {
      this.localEngine.update(dt);
      if (!this.isSoloMode) {
        if (Date.now() - this.lastNetworkSendTime > 33) {
          this.sendStateNow();
        }
      }
    }

  }

  private setupEngineCallbacks(): void {
    this.localEngine.onCollision = (score, distance) => {
      this.localDeathDistance = Math.floor(distance);

      if (this.isSoloMode) {
        this.handleSoloGameOver();
        return;
      }

      // Multiplayer mode: notify peers that we died at this distance
      this.p2p.send({ type: 'DIED', score, distance: this.localDeathDistance });

      if (this.isAllPlayersDead()) {
        this.evaluateMatchWinner();
      } else {
        // Local crashed first! Others are still running!
        // Local gets Game Over & spectator mode. Rivals continue playing!
        this.matchOverlay = {
          type: 'LOCAL_CRASHED_SPECTATING',
          myDistance: this.localEngine.score,
        };
      }
    };
  }

  private isAllPlayersDead(): boolean {
    return checkAllPlayersDead(
      this.localEngine.isGameOver,
      this.isSpectating,
      this.remotePlayers,
      this.remoteState
    );
  }

  private handleSoloGameOver(): void {
    const myDist = this.localDeathDistance || 0;
    const currentScore = this.localEngine.score;

    if (this.isDailyMode) {
      if (!this.currentDailyState) {
        this.currentDailyState = loadDailyState(this.currentDailyDateUtc || getCurrentDateUtc());
      }

      const { newState, isOfficial } = recordDailyRun(this.currentDailyState, currentScore);
      this.currentDailyState = newState;
      if (isOfficial) {
        saveDailyState(newState);
      }
      this.updateDailyButtonBadge();

      this.matchOverlay = {
        type: 'SOLO_GAME_OVER',
        distance: myDist,
        highScore: newState.bestOfficialScore,
      };

      this.modalResultTitle.textContent = newState.completed ? '¡META SUPERADA!' : 'FIN DEL INTENTO';
      this.modalResultTitle.style.color = newState.completed ? '#2ecc71' : '#e74c3c';
      this.modalResultIcon.src = newState.completed ? '/icons/trophy.svg' : '/icons/flag.svg';

      this.modalResultSub.textContent = isOfficial
        ? `Intento ${newState.attempts.length} de 3 · Meta: 1.000 pts`
        : 'Práctica libre · Meta: 1.000 pts';

      this.modalScoresLine.textContent = `PUNTAJE: ${currentScore} PTS`;
      this.modalDiffBadge.textContent = `MEJOR DE HOY: ${newState.bestOfficialScore} PTS`;
      this.modalDiffBadge.style.color = newState.completed ? '#2ecc71' : '#acacac';

      this.modalRematchBtn.classList.remove('hidden');
      if (newState.attempts.length < MAX_OFFICIAL_ATTEMPTS) {
        this.modalRematchText.textContent = `INTENTO ${newState.attempts.length + 1} DE 3`;
      } else {
        this.modalRematchText.textContent = 'PRACTICAR';
      }
      this.modalRematchStatus.classList.add('hidden');

      if (this.modalShareBtn) {
        this.modalShareBtn.classList.remove('hidden');
        if (this.modalShareText) this.modalShareText.textContent = 'COMPARTIR RESULTADO';
      }

      const toLobbyBtn = this.modalToLobbyBtn as HTMLButtonElement;
      if (toLobbyBtn) {
        toLobbyBtn.disabled = false;
        toLobbyBtn.classList.remove('btn-disabled');
        toLobbyBtn.textContent = 'VOLVER AL MENÚ';
        toLobbyBtn.classList.remove('hidden');
      }

      this.updateScoreboardDisplays();
      this.modalSeriesBadge.classList.add('hidden');
      this.resultModal.classList.remove('hidden');
      return;
    }

    // Classic solo mode: hide share button
    if (this.modalShareBtn) {
      this.modalShareBtn.classList.add('hidden');
    }

    const prevHighScore = this.soloHighScore;
    const isNewRecord = currentScore > prevHighScore;
    if (isNewRecord) {
      this.soloHighScore = currentScore;
      localStorage.setItem('dino_solo_highscore', this.soloHighScore.toString());
      localStorage.setItem('dino_highscore_is_points', 'true');
    }

    this.matchOverlay = {
      type: 'SOLO_GAME_OVER',
      distance: currentScore,
      highScore: this.soloHighScore,
    };

    this.modalResultTitle.textContent = 'FIN DE LA PARTIDA';
    this.modalResultTitle.style.color = '#e74c3c';
    this.modalResultSub.textContent = 'MODO LIBRE';
    this.modalResultIcon.src = '/icons/close.svg';

    const soloDisplay = formatSoloModalDisplay(currentScore, prevHighScore);
    this.modalScoresLine.textContent = soloDisplay.distanceText;
    this.modalDiffBadge.textContent = soloDisplay.statusText;

    if (isNewRecord && currentScore > 0) {
      this.modalDiffBadge.style.color = '#f1c40f';
    } else {
      this.modalDiffBadge.style.color = '#acacac';
    }

    this.modalRematchBtn.classList.remove('hidden');
    this.modalRematchText.textContent = 'JUGAR DE NUEVO';
    this.modalRematchStatus.classList.add('hidden');

    const toLobbyBtn = this.modalToLobbyBtn as HTMLButtonElement;
    if (toLobbyBtn) {
      toLobbyBtn.disabled = false;
      toLobbyBtn.classList.remove('btn-disabled');
      toLobbyBtn.textContent = 'VOLVER AL MENÚ';
      toLobbyBtn.classList.remove('hidden');
    }

    this.updateScoreboardDisplays();
    this.modalSeriesBadge.classList.add('hidden');
    this.resultModal.classList.remove('hidden');
  }

  private evaluateMatchWinner(): void {
    if (this.remoteDisconnectedDuringMatch) {
      this.remoteDisconnectedDuringMatch = false;
      this.handleRivalAbandonment();
      return;
    }

    const myDist = this.localDeathDistance || 0;
    const myScore = this.localEngine.score;

    // Collect all players results
    const results: Array<{ name: string; color: string; score: number; distance: number; isLocal: boolean }> = [
      {
        name: sanitizeTextNoEmojis(this.profile.name) || 'Tú',
        color: this.profile.color,
        score: myScore,
        distance: myDist,
        isLocal: true,
      },
    ];

    if (this.remotePlayers.size > 0) {
      for (const rp of this.remotePlayers.values()) {
        const rpDist = Math.floor(rp.state.distance || 0);
        results.push({
          name: sanitizeTextNoEmojis(rp.profile.name) || 'Rival',
          color: rp.profile.color,
          score: rp.state.score ?? Math.floor(rpDist / 10),
          distance: rpDist,
          isLocal: false,
        });
      }
    } else if (this.remoteProfile) {
      const rpDist = this.remoteDeathDistance || 0;
      results.push({
        name: sanitizeTextNoEmojis(this.remoteProfile.name) || 'Rival',
        color: this.remoteProfile.color,
        score: Math.floor(rpDist / 10),
        distance: rpDist,
        isLocal: false,
      });
    }

    // Sort descending by score, tiebreak by physical distance
    results.sort((a, b) => b.score - a.score || b.distance - a.distance);
    const winner = results[0];
    const isLocalWinner = winner.isLocal;

    if (results.length > 2) {
      // 3 or 4 players mode leaderboard
      const rankingText = results
        .map((r, i) => `${i + 1}º ${r.name}: ${r.score} pts`)
        .join(' | ');
      this.modalScoresLine.textContent = rankingText;

      if (isLocalWinner) {
        this.sessionScore.recordWin('local');
        this.modalResultTitle.textContent = '¡ VICTORIA !';
        this.modalResultTitle.style.color = '#f1c40f';
        this.modalResultSub.textContent = '¡HAS GANADO LA CARRERA MULTIJUGADOR!';
        this.modalResultIcon.src = '/icons/trophy.svg';
        this.modalDiffBadge.textContent = `1º LUGAR CON ${myScore} PUNTOS`;
        this.modalDiffBadge.style.color = '#2ecc71';
        this.matchOverlay = {
          type: 'VICTORY',
          myDistance: myScore,
          rivalDistance: results[1]?.score || 0,
          rivalName: results[1]?.name || 'Rival',
        };
      } else {
        const myRank = results.findIndex(r => r.isLocal) + 1;
        this.modalResultTitle.textContent = 'G A M E   O V E R';
        this.modalResultTitle.style.color = '#e74c3c';
        this.modalResultSub.textContent = `GANADOR: ${winner.name.toUpperCase()} (${winner.score} pts)`;
        this.modalResultIcon.src = '/icons/close.svg';
        this.modalDiffBadge.textContent = `TERMINASTE EN ${myRank}º LUGAR`;
        this.modalDiffBadge.style.color = '#e74c3c';
        this.matchOverlay = {
          type: 'DEFEAT',
          myDistance: myScore,
          rivalDistance: winner.score,
          rivalName: winner.name,
        };
      }
    } else {
      // 2 players (1v1) mode - exact authentic format
      const rival = results.find(r => !r.isLocal) || { name: 'Rival', score: 0, distance: 0 };
      const comp = formatMatchComparison(myScore, rival.score, rival.name);
      this.modalScoresLine.textContent = comp.detailText;
      this.modalDiffBadge.textContent = comp.diffText;

      if (myScore > rival.score) {
        this.sessionScore.recordWin('local');
        this.matchOverlay = {
          type: 'VICTORY',
          myDistance: myScore,
          rivalDistance: rival.score,
          rivalName: rival.name,
        };
        this.modalResultTitle.textContent = 'VICTORIA';
        this.modalResultTitle.style.color = '#f1c40f';
        this.modalResultSub.textContent = '¡HAS GANADO EL DUELO!';
        this.modalResultIcon.src = '/icons/trophy.svg';
        this.modalDiffBadge.style.color = '#2ecc71';
      } else if (myScore < rival.score) {
        this.sessionScore.recordWin('remote');
        this.matchOverlay = {
          type: 'DEFEAT',
          myDistance: myScore,
          rivalDistance: rival.score,
          rivalName: rival.name,
        };
        this.modalResultTitle.textContent = 'G A M E   O V E R';
        this.modalResultTitle.style.color = '#e74c3c';
        this.modalResultSub.textContent = `${rival.name.toUpperCase()} SACÓ MÁS PUNTOS`;
        this.modalResultIcon.src = '/icons/close.svg';
        this.modalDiffBadge.style.color = '#e74c3c';
      } else {
        this.matchOverlay = { type: 'TIE', distance: myScore };
        this.modalResultTitle.textContent = '¡ EMPATE !';
        this.modalResultTitle.style.color = '#f1c40f';
        this.modalResultSub.textContent = `AMBOS EMPATARON CON ${myScore} PUNTOS`;
        this.modalResultIcon.src = '/icons/flag.svg';
        this.modalDiffBadge.style.color = '#acacac';
      }
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

      const myScore = this.localEngine.score;
      this.modalScoresLine.textContent = `PUNTAJE: ${myScore} PTS`;
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
      onConnected: (remoteProfile, peerId, isMatchInProgress, seed, existingPeers) => {
        this.remoteProfile = remoteProfile;
        const pid = peerId || 'host';
        const joinSpectating = this.isMatchRunning || Boolean(isMatchInProgress);
        this.remotePlayers.set(pid, {
          peerId: pid,
          profile: remoteProfile,
          isSpectating: joinSpectating,
          state: {
            y: 0,
            vy: 0,
            isDucking: false,
            isGrounded: true,
            distance: 0,
            score: 0,
            isDead: joinSpectating,
          },
          visualDistance: 0,
          visualY: 0,
        });

        if (existingPeers) {
          for (const slot of existingPeers) {
            this.remotePlayers.set(slot.peerId, {
              peerId: slot.peerId,
              profile: slot.profile,
              isSpectating: false,
              state: {
                y: 0,
                vy: 0,
                isDucking: false,
                isGrounded: true,
                distance: 0,
                score: 0,
                isDead: false,
              },
              visualDistance: 0,
              visualY: 0,
            });
          }
        }

        this.hasPlayedMatchWithCurrentRival = false;
        this.remoteDisconnectedDuringMatch = false;
        this.updateScoreboardDisplays();
        this.updateLobbyCards();

        if (this.p2p.isHost) {
          const count = 1 + this.remotePlayers.size;
          this.hostStatusBox.innerHTML = `¡Jugador conectado: <strong style="color: ${remoteProfile.color || '#fff'}">${escapeHtml(remoteProfile.name)}</strong>! (${count}/4)`;
          this.hostStartBtn.classList.remove('hidden');
          if (this.hostReturnGameBtn) this.hostReturnGameBtn.classList.add('hidden');
        } else {
          this.roomMenuView.classList.add('hidden');
          this.joinRoomView.classList.add('hidden');
          this.guestRoomView.classList.remove('hidden');
          this.guestDisplayRoomCode.textContent = this.p2p.roomId || this.roomCodeInput.value || 'SALA';
          const count = 1 + this.remotePlayers.size;
          this.guestStatusBox.innerHTML = `¡Conectado a la sala! (${count}/4 jugadores)`;

          if (isMatchInProgress) {
            this.isSpectating = true;
            this.currentSeed = seed || 12345;
            this.localEngine = new GameEngine(this.currentSeed);
            this.localEngine.dino.isDead = true;
            this.showGameScreen();
            this.matchOverlay = null;
          }
        }
      },

      onPeerJoined: (peerId, profile) => {
        const joinSpectating = this.isMatchRunning;
        this.remotePlayers.set(peerId, {
          peerId,
          profile,
          isSpectating: joinSpectating,
          state: {
            y: 0,
            vy: 0,
            isDucking: false,
            isGrounded: true,
            distance: 0,
            score: 0,
            isDead: joinSpectating,
          },
          visualDistance: 0,
          visualY: 0,
        });
        const count = 1 + this.remotePlayers.size;
        const msg = `¡<strong style="color: ${profile.color || '#fff'}">${escapeHtml(profile.name)}</strong> se unió! (${count}/4)`;
        if (this.p2p.isHost) {
          this.hostStatusBox.innerHTML = msg;
        } else {
          this.guestStatusBox.innerHTML = msg;
        }
        this.updateLobbyCards();
        this.updateScoreboardDisplays();
      },

      onPeerLeft: (peerId) => {
        this.remotePlayers.delete(peerId);
        if (this.remotePlayers.size === 0) {
          this.remoteProfile = null;
          this.handleRivalAbandonment();
        } else {
          const count = 1 + this.remotePlayers.size;
          const msg = `Un jugador abandonó (${count}/4 restantes).`;
          if (this.p2p.isHost) {
            this.hostStatusBox.innerHTML = msg;
          } else {
            this.guestStatusBox.innerHTML = msg;
          }
          this.updateLobbyCards();
          this.updateScoreboardDisplays();
        }
      },

      onProfileUpdated: (remoteProfile, peerId) => {
        if (peerId && this.remotePlayers.has(peerId)) {
          this.remotePlayers.get(peerId)!.profile = remoteProfile;
        } else {
          this.remoteProfile = remoteProfile;
        }
        this.updateScoreboardDisplays();
        this.updateLobbyCards();
      },

      onDisconnected: (peerId) => {
        if (peerId && this.remotePlayers.has(peerId)) {
          this.remotePlayers.delete(peerId);
          if (this.remotePlayers.size === 0) {
            this.handleRivalAbandonment();
          } else {
            this.updateLobbyCards();
          }
          return;
        }
        if (this.isMatchRunning) {
          this.remoteDisconnectedDuringMatch = true;
          this.remoteState.isDead = true;
          markAllRemotePlayersDead(this.remotePlayers);
          this.remoteDeathDistance = Math.floor(this.remoteState.distance);
          if (this.localEngine.isGameOver || this.isSpectating) {
            this.evaluateMatchWinner();
          }
          return;
        }
        this.handleRivalAbandonment();
      },

      onKicked: (reason) => {
        this.fullExitToMainMenu();
        this.showError(reason || 'Has sido expulsado de la sala por el anfitrión.');
      },

      onStartGame: (seed, startTimestamp, countdownDurationMs) => {
        this.hasPlayedMatchWithCurrentRival = true;
        this.remoteDisconnectedDuringMatch = false;
        this.showGameScreen();
        let deadline: number;
        if (countdownDurationMs !== undefined) {
          deadline = this.p2p.calculateCountdownDeadline(countdownDurationMs);
        } else {
          const oneWayLatency = this.p2p.getEstimatedOneWayLatency();
          const remainingMs = Math.max(0, startTimestamp - Date.now() - oneWayLatency);
          deadline = performance.now() + remainingMs;
        }
        this.startCountdown(seed, deadline);
      },

      onRemoteState: (state) => {
        if (state.peerId && this.remotePlayers.has(state.peerId)) {
          const rp = this.remotePlayers.get(state.peerId)!;
          Object.assign(rp.state, state);
          if (rp.visualDistance === 0) {
            rp.visualDistance = state.distance;
          }
        }
        this.remoteState = {
          ...this.remoteState,
          ...state,
        };
        if (this.remoteVisualDistance === 0) {
          this.remoteVisualDistance = state.distance;
        }
      },

      onRemoteDied: (score, distance, peerId) => {
        if (peerId && this.remotePlayers.has(peerId)) {
          const rp = this.remotePlayers.get(peerId)!;
          rp.state.isDead = true;
          rp.state.score = score;
          rp.state.distance = Math.floor(distance);
          rp.visualDistance = rp.state.distance;
        } else {
          this.remoteState.isDead = true;
          this.remoteState.score = score;
          this.remoteDeathDistance = Math.floor(distance);
          this.remoteState.distance = this.remoteDeathDistance;
          this.remoteVisualDistance = this.remoteDeathDistance;
        }

        if (this.isAllPlayersDead()) {
          this.evaluateMatchWinner();
        }
      },

      onRematchRequested: (seed) => {
        const countdownDurationMs = COUNTDOWN_DURATION_MS;
        const startTimestamp = Date.now() + countdownDurationMs;
        this.p2p.send({ type: 'START_GAME', seed, startTimestamp, countdownDurationMs });
        this.startCountdown(seed, performance.now() + countdownDurationMs);
      },

      onRematchReady: () => {
        this.remoteWantsRematch = true;
        this.updateRematchModalView();
        if (this.p2p.isHost && this.localWantsRematch) {
          const newSeed = Math.floor(Math.random() * 1000000);
          const countdownDurationMs = COUNTDOWN_DURATION_MS;
          const startTimestamp = Date.now() + countdownDurationMs;
          this.p2p.send({ type: 'START_GAME', seed: newSeed, startTimestamp, countdownDurationMs });
          this.startCountdown(newSeed, performance.now() + countdownDurationMs);
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
          this.hostStatusBox.innerHTML = `<span class="pulsing-dot"></span> <strong style="color: ${this.remoteProfile?.color || '#fff'}">${escapeHtml(this.remoteProfile?.name || 'Rival')}</strong> está en el lobby cambiando skin/color...`;
        }
      },

      onRemoteReadyInLobby: () => {
        this.remoteInLobby = false;
        this.updateRematchModalView();
        if (this.p2p.isHost) {
          this.hostStatusBox.innerHTML = `¡<strong style="color: ${this.remoteProfile?.color || '#fff'}">${escapeHtml(this.remoteProfile?.name || 'Rival')}</strong> ha vuelto a la partida!`;
        }
      },

      onPingUpdated: (pingMs) => {
        const pingClass = getPingClass(pingMs);
        this.pingText.classList.remove('ping-good', 'ping-fair', 'ping-poor');
        this.pingText.classList.add(pingClass);
        this.pingText.innerHTML = `<span class="ping-dot"></span> PING: ${pingMs}ms`;
      },

      onError: (err) => {
        const friendlyMsg = formatP2PErrorMessage(err);
        this.showError(friendlyMsg);
      },
    });
  }

  private startCountdown(seed: number, startTimestamp: number): void {
    this.currentSeed = seed;
    this.isSpectating = false;
    this.localEngine.reset(seed);

    if (!this.isSoloMode) {
      this.remoteState = {
        y: 0,
        vy: 0,
        isDucking: false,
        isGrounded: true,
        distance: 0,
        score: 0,
        isDead: false,
      };
      this.remoteVisualDistance = 0;
      this.remoteVisualY = 0;
      for (const rp of this.remotePlayers.values()) {
        rp.isSpectating = false;
        rp.state.y = 0;
        rp.state.vy = 0;
        rp.state.isDucking = false;
        rp.state.isGrounded = true;
        rp.state.distance = 0;
        rp.state.score = 0;
        rp.state.isDead = false;
        rp.visualDistance = 0;
        rp.visualY = 0;
      }
      this.hasPlayedMatchWithCurrentRival = true;
    }

    this.remoteDisconnectedDuringMatch = false;
    this.matchOverlay = null;
    this.localDeathDistance = null;
    this.remoteDeathDistance = null;
    this.localWantsRematch = false;
    this.remoteWantsRematch = false;
    this.remoteInLobby = false;
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
      const isSelected = hex === this.profile.color;
      const swatch = createColorSwatchElement(hex, isSelected, () => {
        this.colorPalette.querySelectorAll('.color-swatch').forEach((s) => {
          s.classList.remove('active');
          s.setAttribute('aria-pressed', 'false');
        });
        swatch.classList.add('active');
        swatch.setAttribute('aria-pressed', 'true');
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
      this.isSoloMode = false;
      this.isDailyMode = false;
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
      const countdownDurationMs = COUNTDOWN_DURATION_MS;
      const startTimestamp = Date.now() + countdownDurationMs;
      this.p2p.send({ type: 'START_GAME', seed, startTimestamp, countdownDurationMs });
      this.showGameScreen();
      this.startCountdown(seed, performance.now() + countdownDurationMs);
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

    // 10. Confirm Join Button & Room Code Sanitization
    const handleJoinSubmit = () => {
      const raw = this.roomCodeInput.value;
      const code = extractRoomCode(raw);
      if (!code || code.length < 4) {
        this.showError('Ingresa un código de 4 letras.');
        return;
      }
      this.roomCodeInput.value = code;
      const isActivelyHosting = Boolean(this.p2p && this.p2p.isHost && this.p2p.roomId === code);
      if (isActivelyHosting) {
        this.showError('Ya eres el anfitrión de esta sala en esta pestaña.');
        return;
      }
      this.joinRoom(code);
    };

    this.joinRoomConfirmBtn.addEventListener('click', handleJoinSubmit);

    this.roomCodeInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleJoinSubmit();
      }
    });

    this.roomCodeInput.addEventListener('input', () => {
      const raw = this.roomCodeInput.value;
      if (raw.includes('room=') || raw.includes('://')) {
        const extracted = extractRoomCode(raw);
        if (extracted) {
          this.roomCodeInput.value = extracted;
        }
      }
    });

    // 11. Solo Mode: Play Solo (Classic)
    this.playSoloBtn.addEventListener('click', () => {
      this.hideError();
      this.isSoloMode = true;
      this.isDailyMode = false;
      this.sessionScore.reset();

      this.gameModeTag.textContent = 'MODO: EN SOLITARIO (CLÁSICO)';
      this.pingText.textContent = 'LOCAL';
      this.updateScoreboardDisplays();

      const seed = Math.floor(Math.random() * 1000000);
      this.showGameScreen();
      this.startCountdown(seed, performance.now() + COUNTDOWN_DURATION_MS);
    });

    // 11b. Daily Challenge Mode Button
    if (this.playDailyBtn) {
      this.playDailyBtn.addEventListener('click', () => {
        this.startDailyChallenge();
      });
    }

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

    // 17b. Modal Share Button (Daily Challenge)
    if (this.modalShareBtn) {
      this.modalShareBtn.addEventListener('click', async () => {
        if (!this.currentDailyState) {
          this.currentDailyState = loadDailyState(this.currentDailyDateUtc || getCurrentDateUtc());
        }
        const text = formatDailyShareText(this.currentDailyState);
        const ok = await copyTextToClipboard(text);
        if (ok && this.modalShareText) {
          const prev = this.modalShareText.textContent;
          this.modalShareText.textContent = '¡COPIADO! ✔️';
          setTimeout(() => {
            if (this.modalShareText) this.modalShareText.textContent = prev || 'COMPARTIR RESULTADO';
          }, 2000);
        }
      });
    }

    // 18. Modal Go to Lobby (To change skin/color without leaving session)
    this.modalToLobbyBtn.addEventListener('click', () => {
      this.returnToLobbyFromGame();
    });

    // 19. Modal Exit Button (Full Exit)
    this.modalExitBtn.addEventListener('click', () => {
      this.fullExitToMainMenu();
    });

    // 20. Guest / Host / Solo Return to Game Buttons
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

    if (this.soloReturnGameBtn) {
      this.soloReturnGameBtn.addEventListener('click', () => {
        this.isSoloMode = true;
        this.isDailyMode = false;
        const seed = Math.floor(Math.random() * 1000000);
        this.showGameScreen();
        this.startCountdown(seed, performance.now() + COUNTDOWN_DURATION_MS);
      });
    }
  }

  private updateDailyButtonBadge(): void {
    if (!this.dailyBtnBadge) return;
    const todayUtc = getCurrentDateUtc();
    const state = loadDailyState(todayUtc);
    const count = state.attempts.length;

    if (count === 0) {
      this.dailyBtnBadge.textContent = 'META: 1.000 PTS';
    } else if (count < MAX_OFFICIAL_ATTEMPTS) {
      if (state.completed) {
        this.dailyBtnBadge.textContent = `⭐ ${state.bestOfficialScore} PTS`;
      } else {
        this.dailyBtnBadge.textContent = `INTENTO ${count + 1}/3`;
      }
    } else {
      if (state.completed) {
        this.dailyBtnBadge.textContent = `⭐ ${state.bestOfficialScore} PTS`;
      } else {
        this.dailyBtnBadge.textContent = 'PRÁCTICA';
      }
    }
  }

  private startDailyChallenge(): void {
    this.hideError();
    this.isSoloMode = true;
    this.isDailyMode = true;
    this.sessionScore.reset();

    this.currentDailyDateUtc = getCurrentDateUtc();
    this.currentDailyState = loadDailyState(this.currentDailyDateUtc);

    const attCount = this.currentDailyState.attempts.length;
    if (attCount < MAX_OFFICIAL_ATTEMPTS) {
      this.gameModeTag.textContent = 'RETO DEL DÍA (META: 1.000 PTS)';
    } else {
      this.gameModeTag.textContent = 'RETO DEL DÍA (PRÁCTICA)';
    }

    this.pingText.textContent = 'LOCAL';
    this.updateScoreboardDisplays();

    const seed = getDailySeed(this.currentDailyDateUtc);
    this.showGameScreen();
    this.startCountdown(seed, performance.now() + COUNTDOWN_DURATION_MS);
  }

  private updateScoreboardDisplays(): void {
    if (this.isSoloMode) {
      if (this.isDailyMode && this.currentDailyState) {
        const attCount = this.currentDailyState.attempts.length;
        const prefix = attCount < MAX_OFFICIAL_ATTEMPTS ? `INTENTO ${attCount + 1}/3` : 'PRÁCTICA';
        const bestStr =
          this.currentDailyState.bestOfficialScore > 0
            ? `MEJOR: ${this.currentDailyState.bestOfficialScore} PTS`
            : 'META: 1.000 PTS';
        this.sessionScoreTag.textContent = `${prefix} · ${bestStr}`;
      } else {
        const best = this.soloHighScore > 0 ? `RÉCORD: ${this.soloHighScore} PTS` : 'MODO LIBRE';
        this.sessionScoreTag.textContent = best;
      }
      this.modalSeriesBadge.textContent = '';
      this.modalSeriesBadge.classList.add('hidden');
      this.hostScoreBadge.classList.add('hidden');
      this.guestScoreBadge.classList.add('hidden');
      return;
    }

    const rawRivalName = this.remoteProfile?.name || 'RIVAL';
    const rivalName = sanitizeTextNoEmojis(rawRivalName) || 'RIVAL';
    const summary = this.sessionScore.formatBadge(this.profile.name, rivalName);
    this.sessionScoreTag.textContent = summary;
    this.modalSeriesBadge.textContent = summary;
    this.modalSeriesBadge.classList.remove('hidden');
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
    if (this.isSoloMode) {
      this.resultModal.classList.add('hidden');
      if (this.isDailyMode) {
        const seed = getDailySeed(this.currentDailyDateUtc || getCurrentDateUtc());
        if (this.currentDailyState) {
          const attCount = this.currentDailyState.attempts.length;
          if (attCount < MAX_OFFICIAL_ATTEMPTS) {
            this.gameModeTag.textContent = 'RETO DEL DÍA (META: 1.000 PTS)';
          } else {
            this.gameModeTag.textContent = 'RETO DEL DÍA (PRÁCTICA)';
          }
        }
        this.startCountdown(seed, performance.now() + COUNTDOWN_DURATION_MS);
      } else {
        const seed = Math.floor(Math.random() * 1000000);
        this.startCountdown(seed, performance.now() + COUNTDOWN_DURATION_MS);
      }
      return;
    }

    if (this.localWantsRematch) {
      // User is canceling their rematch request
      this.localWantsRematch = false;
      this.updateRematchModalView();
      this.p2p.send({ type: 'CANCEL_REMATCH' });
      return;
    }

    this.localWantsRematch = true;
    this.updateRematchModalView();

    // Multiplayer
    this.p2p.send({ type: 'REMATCH_READY' });

    if (this.remoteWantsRematch && this.p2p.isHost) {
      const newSeed = Math.floor(Math.random() * 1000000);
      const countdownDurationMs = COUNTDOWN_DURATION_MS;
      const startTimestamp = Date.now() + countdownDurationMs;
      this.p2p.send({ type: 'START_GAME', seed: newSeed, startTimestamp, countdownDurationMs });
      this.startCountdown(newSeed, performance.now() + countdownDurationMs);
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

    if (this.isSoloMode) {
      this.updateDailyButtonBadge();
      this.roomMenuView.classList.remove('hidden');
      this.hostRoomView.classList.add('hidden');
      this.joinRoomView.classList.add('hidden');
      this.guestRoomView.classList.add('hidden');
      if (this.soloReturnGameBtn) this.soloReturnGameBtn.classList.remove('hidden');
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
        const rivalName = escapeHtml(this.remoteProfile?.name || 'Rival');
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
      const rivalName = escapeHtml(this.remoteProfile?.name || 'Host');
      const rivalColor = this.remoteProfile?.color || '#fff';
      this.guestStatusBox.innerHTML = `En sala con <strong style="color: ${rivalColor}">${rivalName}</strong>. Cambia tu skin o color y pulsa VOLVER AL JUEGO cuando termines.`;
    }

    this.updateLobbyCards();
  }

  private fullExitToMainMenu(): void {
    this.p2p.cleanup();
    this.isSoloMode = false;
    this.isDailyMode = false;
    this.updateDailyButtonBadge();
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
    if (this.soloReturnGameBtn) this.soloReturnGameBtn.classList.add('hidden');
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

    const isActivelyHosting = Boolean(this.p2p && this.p2p.isHost && this.p2p.roomId === cleanCode);
    if (isActivelyHosting) {
      this.showError('Ya eres el anfitrión de esta sala en esta pestaña.');
      return;
    }

    this.isSoloMode = false;
    this.isDailyMode = false;
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
    const totalCount = 1 + this.remotePlayers.size;
    const listTitles = document.querySelectorAll('.list-title');
    listTitles.forEach((t) => {
      t.textContent = `JUGADORES EN LA SALA (${totalCount}/4)`;
    });

    // 1. Host View: Card 1 (Local Player)
    if (this.hostCardName) {
      this.hostCardName.textContent = this.profile.name || 'Dino';
      this.hostCardName.style.color = this.profile.color || '#fff';
    }
    if (this.hostCardSkin) {
      this.hostCardSkin.textContent = SKINS[this.profile.skinId]?.name || 'T-Rex Clásico Original';
    }

    // 2. Host View: Card 2 (First Remote Player or Empty Slot)
    const peersArray = Array.from(this.remotePlayers.values());
    const firstRemote = peersArray[0]?.profile || this.remoteProfile;

    if (firstRemote) {
      this.guestCard?.classList.remove('empty-slot');
      this.guestCardEmpty?.classList.add('hidden');
      this.guestCardContent?.classList.remove('hidden');
      if (this.guestCardName) {
        this.guestCardName.textContent = firstRemote.name || 'Rival';
        this.guestCardName.style.color = firstRemote.color || '#fff';
      }
      if (this.guestCardSkin) {
        this.guestCardSkin.textContent = SKINS[firstRemote.skinId]?.name || 'T-Rex Clásico Original';
      }
      if (this.guestCardStatus) {
        this.guestCardStatus.textContent = this.remoteInLobby ? 'EN EL LOBBY' : 'LISTO';
      }
    } else {
      this.guestCard?.classList.add('empty-slot');
      this.guestCardEmpty?.classList.remove('hidden');
      this.guestCardContent?.classList.add('hidden');
    }

    // 2b. Host View: Extra connected players (Players 3 and 4)
    const hostList = this.hostRoomView.querySelector('.lobby-player-list');
    if (hostList) {
      hostList.querySelectorAll('.extra-player-card').forEach((el) => el.remove());
      for (let i = 1; i < peersArray.length; i++) {
        const p = peersArray[i];
        const card = document.createElement('div');
        card.className = 'player-lobby-card guest-card extra-player-card';
        card.innerHTML = `
          <div class="card-avatar-box">
            <canvas class="card-avatar-canvas" width="40" height="40"></canvas>
          </div>
          <div class="card-info">
            <div class="card-role-row">
              <span class="role-badge guest-role">JUGADOR ${i + 2}</span>
              <span class="status-pill">CONECTADO</span>
            </div>
            <span class="card-player-name" style="color: ${p.profile.color || '#fff'}">${escapeHtml(p.profile.name)}</span>
            <span class="card-player-skin">${SKINS[p.profile.skinId]?.name || 'T-Rex Clásico'}</span>
          </div>
          <button class="kick-btn" title="Expulsar">
            <img src="/icons/close.svg" width="12" height="12" alt="" class="btn-icon">
            <span>EXPULSAR</span>
          </button>
        `;
        const kickBtn = card.querySelector('.kick-btn');
        kickBtn?.addEventListener('click', () => {
          this.p2p.kickPeer(p.peerId);
        });
        const cvs = card.querySelector('canvas');
        if (cvs) this.renderAvatarOnCanvas(cvs, p.profile.skinId, p.profile.color);
        hostList.appendChild(card);
      }
    }

    // 3. Guest View: Host Card (Remote) and My Card (Local)
    if (firstRemote) {
      if (this.guestViewHostName) {
        this.guestViewHostName.textContent = firstRemote.name || 'Host';
        this.guestViewHostName.style.color = firstRemote.color || '#fff';
      }
      if (this.guestViewHostSkin) {
        this.guestViewHostSkin.textContent = SKINS[firstRemote.skinId]?.name || 'T-Rex Clásico Original';
      }
    }
    if (this.guestViewMyName) {
      this.guestViewMyName.textContent = this.profile.name || 'Dino';
      this.guestViewMyName.style.color = this.profile.color || '#fff';
    }
    if (this.guestViewMySkin) {
      this.guestViewMySkin.textContent = SKINS[this.profile.skinId]?.name || 'T-Rex Clásico Original';
    }

    // 3b. Guest View: Extra peers (Players 3 and 4)
    const guestList = this.guestRoomView.querySelector('.lobby-player-list');
    if (guestList) {
      guestList.querySelectorAll('.extra-player-card').forEach((el) => el.remove());
      for (let i = 1; i < peersArray.length; i++) {
        const p = peersArray[i];
        const card = document.createElement('div');
        card.className = 'player-lobby-card guest-card extra-player-card';
        card.innerHTML = `
          <div class="card-avatar-box">
            <canvas class="card-avatar-canvas" width="40" height="40"></canvas>
          </div>
          <div class="card-info">
            <div class="card-role-row">
              <span class="role-badge guest-role">JUGADOR</span>
              <span class="status-pill">CONECTADO</span>
            </div>
            <span class="card-player-name" style="color: ${p.profile.color || '#fff'}">${escapeHtml(p.profile.name)}</span>
            <span class="card-player-skin">${SKINS[p.profile.skinId]?.name || 'T-Rex Clásico'}</span>
          </div>
        `;
        const cvs = card.querySelector('canvas');
        if (cvs) this.renderAvatarOnCanvas(cvs, p.profile.skinId, p.profile.color);
        guestList.appendChild(card);
      }
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
    if (!this.lobbyScreen.classList.contains('active')) return;
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

    // Touch Controls with Haptic Feedback & Visual Pressed States
    const triggerHaptic = () => {
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(12);
        }
      } catch {}
    };

    this.touchJumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchJumpBtn.classList.add('touch-pressed');
      triggerHaptic();
      this.localEngine.handleInput(DinoAction.JUMP);
      this.sendStateNow();
    });

    this.touchJumpBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.touchJumpBtn.classList.remove('touch-pressed');
      this.localEngine.handleInput(DinoAction.JUMP_END);
      this.sendStateNow();
    });

    this.touchJumpBtn.addEventListener('touchcancel', () => {
      this.touchJumpBtn.classList.remove('touch-pressed');
      this.localEngine.handleInput(DinoAction.JUMP_END);
      this.sendStateNow();
    });

    this.touchDuckBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchDuckBtn.classList.add('touch-pressed');
      triggerHaptic();
      this.localEngine.handleInput(DinoAction.DUCK_START);
      this.sendStateNow();
    });

    this.touchDuckBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.touchDuckBtn.classList.remove('touch-pressed');
      this.localEngine.handleInput(DinoAction.DUCK_END);
      this.sendStateNow();
    });

    this.touchDuckBtn.addEventListener('touchcancel', () => {
      this.touchDuckBtn.classList.remove('touch-pressed');
      this.localEngine.handleInput(DinoAction.DUCK_END);
      this.sendStateNow();
    });

    const canvas = document.getElementById('game-canvas')!;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      triggerHaptic();
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
    if (!this.isMatchRunning || this.isSoloMode) return;
    this.p2p.safeSendState({
      y: this.localEngine.dino.y,
      vy: this.localEngine.dino.vy,
      isDucking: this.localEngine.dino.isDucking,
      isGrounded: this.localEngine.dino.isGrounded,
      distance: this.localEngine.distance,
      score: this.localEngine.score,
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

      // 3-Second Countdown (3, 2, 1, ¡YA!)
      if (this.countdownEndTime !== null) {
        const remainingMs = this.countdownEndTime - performance.now();
        if (remainingMs > 2000) {
          countdownText = '3';
        } else if (remainingMs > 1000) {
          countdownText = '2';
        } else if (remainingMs > 0) {
          countdownText = '1';
        } else if (remainingMs > -500) {
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

      // Temporal visual interpolation (144Hz/120Hz micro-smoothing)
      const alpha = this.FIXED_DELTA > 0 ? this.physicsAccumulator / this.FIXED_DELTA : 0;
      const interpDistance = this.isMatchRunning
        ? this.localEngine.getInterpolatedDistance(alpha)
        : this.localEngine.distance;
      const interpY = this.isMatchRunning
        ? this.localEngine.getInterpolatedY(alpha)
        : this.localEngine.dino.y;

      const localVisual: PlayerVisualState = {
        name: this.profile.name,
        color: this.profile.color,
        skinId: this.profile.skinId,
        isLocal: true,
        score: this.localEngine.score,
        distance: interpDistance,
        y: interpY,
        isDucking: this.localEngine.dino.isDucking,
        isGrounded: this.localEngine.dino.isGrounded,
        isDead: this.localEngine.isGameOver,
      };

      const tracks: TrackRenderData[] = [
        {
          distance: interpDistance,
          player: localVisual,
          obstacles: this.localEngine.obstacles,
          label: 'TU PISTA (P1)',
          accentColor: this.profile.color || '#ffffff',
          isLocal: true,
          isSpectating: this.isSpectating,
        },
      ];

      if (!this.isSoloMode) {
        if (this.remotePlayers.size > 0) {
          let pIdx = 2;
          for (const rp of this.remotePlayers.values()) {
            if (this.isMatchRunning && !rp.state.isDead) {
              const currentSpeed = this.localEngine.speed;
              const extrapolated = extrapolateKinematicTrajectory(
                {
                  y: rp.visualY,
                  vy: rp.state.vy,
                  isDucking: rp.state.isDucking,
                  isGrounded: rp.state.isGrounded,
                  distance: rp.visualDistance,
                },
                dt,
                currentSpeed,
                -2100
              );
              rp.visualY = extrapolated.y;

              const distErr = rp.state.distance - rp.visualDistance;
              if (distErr > 0 && distErr < 180) {
                rp.visualDistance = Math.max(rp.visualDistance, extrapolated.distance + distErr * Math.min(1, 14 * dt));
              } else if (distErr >= 180) {
                rp.visualDistance = rp.state.distance;
              } else {
                // Ensure strictly non-decreasing distance to eliminate backward rubberbanding (lag-tug)
                rp.visualDistance = Math.max(rp.visualDistance, extrapolated.distance);
              }
            } else {
              rp.visualDistance = rp.state.distance;
              rp.visualY = rp.state.y;
            }

            tracks.push({
              distance: rp.visualDistance,
              player: {
                name: rp.profile.name,
                color: rp.profile.color,
                skinId: rp.profile.skinId || 'classic',
                isLocal: false,
                score: rp.state.score,
                distance: rp.visualDistance,
                y: rp.visualY,
                isDucking: rp.state.isDucking,
                isGrounded: rp.state.isGrounded,
                isDead: rp.state.isDead,
              },
              obstacles: this.localEngine.obstacles,
              label: `PISTA RIVAL (P${pIdx})`,
              accentColor: rp.profile.color || '#acacac',
              isLocal: false,
            });
            pIdx++;
          }
        } else if (this.remoteProfile) {
          if (this.isMatchRunning && !this.remoteState.isDead) {
            const currentSpeed = this.localEngine.speed;
            const extrapolated = extrapolateKinematicTrajectory(
              {
                y: this.remoteVisualY,
                vy: this.remoteState.vy,
                isDucking: this.remoteState.isDucking,
                isGrounded: this.remoteState.isGrounded,
                distance: this.remoteVisualDistance,
              },
              dt,
              currentSpeed,
              -2100
            );
            this.remoteVisualY = extrapolated.y;

            const distErr = this.remoteState.distance - this.remoteVisualDistance;
            if (distErr > 0 && distErr < 180) {
              this.remoteVisualDistance = Math.max(this.remoteVisualDistance, extrapolated.distance + distErr * Math.min(1, 14 * dt));
            } else if (distErr >= 180) {
              this.remoteVisualDistance = this.remoteState.distance;
            } else {
              this.remoteVisualDistance = Math.max(this.remoteVisualDistance, extrapolated.distance);
            }
          } else {
            this.remoteVisualDistance = this.remoteState.distance;
            this.remoteVisualY = this.remoteState.y;
          }

          tracks.push({
            distance: this.remoteVisualDistance,
            player: {
              name: this.remoteProfile.name,
              color: this.remoteProfile.color,
              skinId: this.remoteProfile.skinId || 'classic',
              isLocal: false,
              score: this.remoteState.score,
              distance: this.remoteVisualDistance,
              y: this.remoteVisualY,
              isDucking: this.remoteState.isDucking,
              isGrounded: this.remoteState.isGrounded,
              isDead: this.remoteState.isDead,
            },
            obstacles: this.localEngine.obstacles,
            label: 'PISTA RIVAL (P2)',
            accentColor: this.remoteProfile.color || '#acacac',
            isLocal: false,
          });
        }
      }

      const isRivalEliminated =
        !this.isSoloMode && tracks.length === 2 && !!(tracks[1]?.player.isDead && !localVisual.isDead);

      let currentOverlay: MatchOverlayState | null = this.matchOverlay;
      if (countdownText) {
        currentOverlay = { type: 'COUNTDOWN', text: countdownText };
      }

      this.renderer.renderTracks(
        tracks,
        currentOverlay,
        isRivalEliminated,
        this.isSoloMode
      );
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new DinoApp();
  app.init().catch(console.error);
});
