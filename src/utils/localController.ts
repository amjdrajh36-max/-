import {
  InternalRoomState,
  addChatMessage,
  addHumanPlayer,
  castVote,
  closeVotingPhase,
  continueAfterElimination,
  createId,
  createInitialRoom,
  finalizeDefenseToVoteOrEliminate,
  getRequiredNightRolePlayers,
  markRoleReady,
  maybePostBotChat,
  resetToLobby,
  resolveNightPhase,
  runBotDayActions,
  runBotNightActions,
  runBotRevengeIfNeeded,
  sanitizeStateForPlayer,
  startGame,
  submitDefense,
  submitNightAction,
  submitRevenge,
  useSheikhAbility,
  withdrawVote,
} from '../shared/gameEngine';
import { ClientMessage, PublicGameState } from '../shared/types';

const OFFLINE_SESSION_KEY = 'mafia_offline_session_v1';

interface OfflineSnapshot {
  mode: 'OFFLINE_SOLO' | 'OFFLINE_PASS_PLAY';
  activeHumanId: string;
  room: InternalRoomState;
  savedAt: number;
}

export function clearOfflineSnapshot(): void {
  try {
    sessionStorage.removeItem(OFFLINE_SESSION_KEY);
    localStorage.removeItem(OFFLINE_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

export function hasSavedOfflineSnapshot(): boolean {
  try {
    const raw =
      sessionStorage.getItem(OFFLINE_SESSION_KEY) ||
      localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<OfflineSnapshot>;
    return Boolean(
      parsed.room &&
        parsed.activeHumanId &&
        parsed.savedAt &&
        Date.now() - parsed.savedAt < 6 * 60 * 60 * 1000
    );
  } catch {
    return false;
  }
}

function saveOfflineSnapshot(snapshot: OfflineSnapshot): void {
  try {
    const raw = JSON.stringify(snapshot);
    sessionStorage.setItem(OFFLINE_SESSION_KEY, raw);
    localStorage.setItem(OFFLINE_SESSION_KEY, raw);
  } catch {
    // ignore storage quota errors
  }
}

function loadOfflineSnapshot(): OfflineSnapshot | null {
  try {
    const raw =
      sessionStorage.getItem(OFFLINE_SESSION_KEY) ||
      localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineSnapshot;
    if (
      !parsed?.room ||
      !parsed?.activeHumanId ||
      !parsed?.mode ||
      !parsed.savedAt ||
      Date.now() - parsed.savedAt > 6 * 60 * 60 * 1000
    ) {
      clearOfflineSnapshot();
      return null;
    }
    return parsed;
  } catch {
    clearOfflineSnapshot();
    return null;
  }
}

export class LocalOfflineController {
  private room: InternalRoomState;
  private activeHumanId: string;
  private isPassAndPlay: boolean;
  private onStateChange: (state: PublicGameState) => void;
  private onError: (msg: string) => void;
  private timerHandle: number | null = null;
  private lastBotTick = 0;

  constructor(
    hostName: string,
    mode: 'OFFLINE_SOLO' | 'OFFLINE_PASS_PLAY',
    extraHumanNames: string[],
    dayDurationSec: number,
    onStateChange: (state: PublicGameState) => void,
    onError: (msg: string) => void,
    restored?: { room: InternalRoomState; activeHumanId: string }
  ) {
    this.isPassAndPlay = mode === 'OFFLINE_PASS_PLAY';
    this.onStateChange = onStateChange;
    this.onError = onError;

    if (restored) {
      this.room = restored.room;
      this.activeHumanId = restored.activeHumanId;
    } else {
      const hostId = createId('local');
      this.activeHumanId = hostId;
      this.room = createInitialRoom('LOCAL', hostId, hostName, dayDurationSec);

      if (this.isPassAndPlay) {
        for (const name of extraHumanNames) {
          if (name.trim()) {
            addHumanPlayer(this.room, createId('local'), name.trim());
          }
        }
      }
    }

    this.startLoop();
    this.emit();
  }

  public static restoreFromSnapshot(
    onStateChange: (state: PublicGameState) => void,
    onError: (msg: string) => void
  ): { controller: LocalOfflineController; mode: 'OFFLINE_SOLO' | 'OFFLINE_PASS_PLAY' } | null {
    const snap = loadOfflineSnapshot();
    if (!snap) return null;
    const controller = new LocalOfflineController(
      '',
      snap.mode,
      [],
      snap.room.dayDurationSec,
      onStateChange,
      onError,
      { room: snap.room, activeHumanId: snap.activeHumanId }
    );
    return { controller, mode: snap.mode };
  }

  public getActiveHumanId(): string {
    return this.activeHumanId;
  }

  public getHumanPlayers() {
    return this.room.players.filter((p) => !p.isBot);
  }

  public switchActiveHuman(playerId: string): void {
    const exists = this.room.players.some((p) => p.id === playerId && !p.isBot);
    if (exists) {
      this.activeHumanId = playerId;
      this.emit();
    }
  }

  public addPassPlayPlayer(name: string): boolean {
    const res = addHumanPlayer(this.room, createId('local'), name);
    if (!res.ok) {
      this.onError(res.error || 'تعذر إضافة اللاعب.');
      return false;
    }
    this.emit();
    return true;
  }

  public removePassPlayPlayer(playerId: string): void {
    if (this.room.phase !== 'LOBBY') return;
    const target = this.room.players.find((p) => p.id === playerId);
    if (!target || target.isHost) return;
    this.room.players = this.room.players
      .filter((p) => p.id !== playerId)
      .map((p, idx) => ({ ...p, seatNumber: idx + 1 }));
    if (this.activeHumanId === playerId) {
      this.activeHumanId = this.room.players[0].id;
    }
    this.emit();
  }

  public dispatch(msg: ClientMessage): void {
    const actorId = this.activeHumanId;

    switch (msg.type) {
      case 'UPDATE_SETTINGS': {
        if (this.room.phase === 'LOBBY') {
          this.room.dayDurationSec = Math.max(45, Math.min(180, msg.dayDurationSec));
          this.emit();
        }
        break;
      }
      case 'START_GAME': {
        const res = startGame(this.room);
        if (!res.ok) {
          this.onError(res.error || 'تعذر بدء اللعبة.');
          return;
        }
        this.activeHumanId = this.room.players.find((p) => !p.isBot)?.id || this.activeHumanId;
        this.emit();
        break;
      }
      case 'MARK_ROLE_READY': {
        markRoleReady(this.room, actorId);
        // In pass & play, automatically advance activeHumanId to next unready human if still in ROLE_REVEAL
        if (this.room.phase === 'ROLE_REVEAL') {
          const nextHuman = this.room.players.find(
            (p) => !p.isBot && !this.room.readyPlayerIds.includes(p.id)
          );
          if (nextHuman) this.activeHumanId = nextHuman.id;
        } else if (this.room.phase === 'NIGHT') {
          this.selectNextNightHuman();
        }
        this.emit();
        break;
      }
      case 'SUBMIT_NIGHT_ACTION': {
        const res = submitNightAction(this.room, actorId, msg.targetId);
        if (!res.ok) {
          this.onError(res.error || 'تعذر تنفيذ القدرة.');
          return;
        }
        if (this.room.phase === 'NIGHT') {
          this.selectNextNightHuman();
        }
        this.emit();
        break;
      }
      case 'CAST_VOTE': {
        const res = castVote(this.room, actorId, msg.targetId);
        if (!res.ok) {
          this.onError(res.error || 'تعذر التصويت.');
          return;
        }
        this.emit();
        break;
      }
      case 'WITHDRAW_VOTE': {
        const res = withdrawVote(this.room, actorId);
        if (!res.ok) {
          this.onError(res.error || 'تعذر سحب الصوت.');
          return;
        }
        this.emit();
        break;
      }
      case 'CLOSE_VOTING': {
        closeVotingPhase(this.room);
        this.emit();
        break;
      }
      case 'SUBMIT_DEFENSE': {
        const res = submitDefense(this.room, actorId, msg.text);
        if (!res.ok) {
          this.onError(res.error || 'تعذر إرسال التبرير.');
          return;
        }
        this.emit();
        break;
      }
      case 'USE_SHEIKH_ABILITY': {
        const res = useSheikhAbility(this.room, actorId);
        if (!res.ok) {
          this.onError(res.error || 'لا يمكن استخدام القدرة الآن.');
          return;
        }
        this.emit();
        break;
      }
      case 'FINALIZE_DEFENSE': {
        finalizeDefenseToVoteOrEliminate(this.room);
        this.emit();
        break;
      }
      case 'CONTINUE_AFTER_ELIMINATION': {
        continueAfterElimination(this.room);
        this.emit();
        break;
      }
      case 'SUBMIT_REVENGE': {
        const res = submitRevenge(this.room, actorId, msg.targetId);
        if (!res.ok) {
          this.onError(res.error || 'تعذر تنفيذ الاختيار.');
          return;
        }
        if (this.room.phase === 'NIGHT') {
          this.selectNextNightHuman();
        }
        this.emit();
        break;
      }
      case 'SEND_CHAT': {
        const res = addChatMessage(this.room, actorId, msg.text);
        if (!res.ok) {
          this.onError(res.error || 'تعذر إرسال الرسالة.');
          return;
        }
        this.emit();
        break;
      }
      case 'PLAY_AGAIN': {
        resetToLobby(this.room);
        this.activeHumanId = this.room.players.find((p) => p.isHost)?.id || this.activeHumanId;
        this.emit();
        break;
      }
    }
  }

  private selectNextNightHuman(): void {
    const req = getRequiredNightRolePlayers(this.room).filter(
      (p) => !p.isBot && !this.room.nightSubmittedPlayerIds.includes(p.id)
    );
    if (req.length > 0) {
      this.activeHumanId = req[0].id;
    } else {
      const host = this.room.players.find((p) => p.isHost);
      if (host) this.activeHumanId = host.id;
    }
  }

  private startLoop(): void {
    this.timerHandle = window.setInterval(() => {
      const now = Date.now();
      let changed = false;

      if (
        this.room.phase !== 'LOBBY' &&
        this.room.phase !== 'GAME_OVER' &&
        this.room.phase !== 'ROLE_REVEAL' &&
        now - this.lastBotTick >= 1500
      ) {
        this.lastBotTick = now;
        if (this.room.phase === 'NIGHT') {
          changed = runBotNightActions(this.room);
        } else if (
          this.room.phase === 'NIGHT_REVENGE' ||
          this.room.phase === 'DAY_REVENGE'
        ) {
          changed = runBotRevengeIfNeeded(this.room);
        } else if (
          this.room.phase === 'DAY_VOTING' ||
          this.room.phase === 'DAY_DEFENSE' ||
          this.room.phase === 'DAY_TIE_RUNOFF'
        ) {
          changed = runBotDayActions(this.room);
          if (this.room.phase === 'DAY_VOTING' && Math.random() < 0.28) {
            const botChatCount = this.room.chat.filter(
              (m) => m.type === 'CHAT' && m.senderId.startsWith('bot_')
            ).length;
            if (botChatCount < this.room.round * 4) {
              if (maybePostBotChat(this.room)) changed = true;
            }
          }
        }
      }

      if (this.room.phaseEndsAt && now >= this.room.phaseEndsAt) {
        if (this.room.phase === 'NIGHT') {
          runBotNightActions(this.room);
          if (this.room.phase === 'NIGHT') {
            resolveNightPhase(this.room);
          }
          changed = true;
        } else if (
          this.room.phase === 'NIGHT_REVENGE' ||
          this.room.phase === 'DAY_REVENGE'
        ) {
          const boy = this.room.players.find((p) => p.id === this.room.revengePlayerId);
          const living = this.room.players.filter((p) => p.isAlive);
          if (boy && living.length > 0) {
            const pick = living[Math.floor(Math.random() * living.length)];
            submitRevenge(this.room, boy.id, pick.id);
            changed = true;
          }
        } else if (
          this.room.phase === 'DAY_VOTING' ||
          this.room.phase === 'DAY_TIE_RUNOFF'
        ) {
          closeVotingPhase(this.room);
          changed = true;
        } else if (
          this.room.phase === 'DAY_DEFENSE' ||
          this.room.phase === 'DAY_FINAL_VOTE'
        ) {
          finalizeDefenseToVoteOrEliminate(this.room);
          changed = true;
        } else if (this.room.phase === 'DAY_ELIMINATION') {
          continueAfterElimination(this.room);
          changed = true;
        }
      }

      if (changed) {
        if (this.room.phase === 'NIGHT') {
          this.selectNextNightHuman();
        }
        this.emit();
      }
    }, 800);
  }

  private emit(): void {
    saveOfflineSnapshot({
      mode: this.isPassAndPlay ? 'OFFLINE_PASS_PLAY' : 'OFFLINE_SOLO',
      activeHumanId: this.activeHumanId,
      room: this.room,
      savedAt: Date.now(),
    });
    this.onStateChange(sanitizeStateForPlayer(this.room, this.activeHumanId));
  }

  public destroy(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
