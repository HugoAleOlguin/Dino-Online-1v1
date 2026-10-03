export interface SessionScore {
  localWins: number;
  remoteWins: number;
}

export interface RematchStateView {
  buttonText: string;
  statusText: string;
  isAllReady: boolean;
  canGoToLobby: boolean;
}

export class SessionScoreTracker {
  private localWins: number = 0;
  private remoteWins: number = 0;

  recordWin(winner: 'local' | 'remote'): void {
    if (winner === 'local') {
      this.localWins++;
    } else {
      this.remoteWins++;
    }
  }

  getScore(): SessionScore {
    return {
      localWins: this.localWins,
      remoteWins: this.remoteWins,
    };
  }

  formatBadge(localName: string, remoteName: string): string {
    const cleanLocal = (localName || 'TÚ').trim().toUpperCase().substring(0, 8);
    const cleanRemote = (remoteName || 'RIVAL').trim().toUpperCase().substring(0, 8);
    return `TÚ: ${this.localWins}  |  ${cleanRemote}: ${this.remoteWins}`;
  }

  reset(): void {
    this.localWins = 0;
    this.remoteWins = 0;
  }

  formatRematchState(
    localReady: boolean,
    remoteReady: boolean,
    remoteInLobby: boolean
  ): RematchStateView {
    if (localReady && remoteReady) {
      return {
        buttonText: '¡LISTOS! (2/2)',
        statusText: 'Iniciando partida sincronizada...',
        isAllReady: true,
        canGoToLobby: false,
      };
    }

    if (localReady && !remoteReady) {
      if (remoteInLobby) {
        return {
          buttonText: 'CANCELAR REVANCHA',
          statusText: 'El rival está en el lobby personalizando...',
          isAllReady: false,
          canGoToLobby: false,
        };
      }
      return {
        buttonText: 'CANCELAR REVANCHA',
        statusText: 'Esperando a que el rival confirme revancha...',
        isAllReady: false,
        canGoToLobby: false,
      };
    }

    if (!localReady && remoteReady) {
      return {
        buttonText: 'ACEPTAR REVANCHA (1/2)',
        statusText: '¡El rival quiere la revancha! Pulsa para aceptar (1/2)',
        isAllReady: false,
        canGoToLobby: true,
      };
    }

    // Neither ready
    return {
      buttonText: 'REVANCHA',
      statusText: remoteInLobby ? 'El rival está en el lobby personalizando.' : '',
      isAllReady: false,
      canGoToLobby: true,
    };
  }
}
