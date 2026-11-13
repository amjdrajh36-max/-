import {
  Unsubscribe,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
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
  generateRoomCode,
  getRequiredNightRolePlayers,
  markRoleReady,
  maybePostBotChat,
  resetToLobby,
  resolveNightPhase,
  runBotDayActions,
  runBotNightActions,
  runBotRevengeIfNeeded,
  startGame,
  submitDefense,
  submitNightAction,
  submitRevenge,
  useSheikhAbility,
  withdrawVote,
} from '../shared/gameEngine';
import { MAX_PLAYERS, ROLES } from '../shared/roles';
import { normalizeRoomCode } from '../shared/normalize';
import type {
  ChatMessage,
  ClientMessage,
  Player,
  PublicGameState,
  RoleId,
  Team,
} from '../shared/types';
import { OperationType, auth, db, handleFirestoreError } from './config';

interface FirestoreRoomDoc {
  roomCode: string;
  hostUid: string;
  phase: PublicGameState['phase'];
  round: number;
  dayDurationSec: number;
  nightDurationSec: number;
  phaseEndsAt: number;
  memberUids: string[];
  players: Player[];
  readyPlayerIds: string[];
  votes: Record<string, string>;
  accusedPlayerId: string;
  defenseText: string;
  defenseSubmitted: boolean;
  tiedCandidateIds: string[];
  tieRound: number;
  revengePlayerId: string;
  revengeTriggerSource: string;
  winner: string;
  winReason: string;
  lastDaySummary: PublicGameState['lastDaySummary'];
  lastVoteElimination: PublicGameState['lastVoteElimination'];
  chat: ChatMessage[];
  nightPendingRolesCount: number;
}

interface FirestoreSecretDoc {
  uid: string;
  hostUid: string;
  role: string;
  team: string;
  mafiaTeammates: { id: string; name: string; role: string }[];
  mafiaChat: ChatMessage[];
  sniperHasBullet: boolean;
  sheikhAbilityUsed: boolean;
  myNightSubmitted: boolean;
  myNightChoice: string;
}

interface PlayerRequestDoc {
  authorUid: string;
  hostUid: string;
  actionType: string;
  playerName: string;
  targetId: string;
  text: string;
  processed: boolean;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function buildPublicRoomPayload(room: InternalRoomState, hostUid: string): FirestoreRoomDoc {
  const revealAll = room.phase === 'GAME_OVER';
  const publicPlayers: Player[] = room.players.map((p) => {
    const base: Player = {
      id: p.id,
      name: p.name.slice(0, 32),
      isBot: p.isBot,
      isHost: p.isHost,
      isAlive: p.isAlive,
      connected: p.connected,
      seatNumber: p.seatNumber,
      isSilenced: p.isSilenced,
      sheikhRevealed: Boolean(p.sheikhRevealed),
      roleRevealedPublicly: Boolean(p.roleRevealedPublicly),
    };
    if (p.eliminatedRound !== undefined) base.eliminatedRound = p.eliminatedRound;
    if (p.eliminatedReason !== undefined) base.eliminatedReason = p.eliminatedReason;
    if (revealAll || p.sheikhRevealed || p.roleRevealedPublicly) {
      if (p.role) base.role = p.role;
      if (p.team) base.team = p.team;
    }
    if (revealAll) {
      if (p.sheikhAbilityUsed !== undefined) base.sheikhAbilityUsed = p.sheikhAbilityUsed;
      if (p.sniperHasBullet !== undefined) base.sniperHasBullet = p.sniperHasBullet;
    }
    return base;
  });

  const memberUids = Array.from(
    new Set([hostUid, ...room.players.filter((p) => !p.isBot).map((p) => p.id)])
  ).slice(0, MAX_PLAYERS);

  const publicChat = room.chat
    .filter((m) => m.type !== 'MAFIA_WHISPER')
    .slice(-80);

  const requiredNight = getRequiredNightRolePlayers(room);
  const pendingCount = requiredNight.filter(
    (p) => !room.nightSubmittedPlayerIds.includes(p.id)
  ).length;

  return stripUndefined({
    roomCode: room.roomCode,
    hostUid,
    phase: room.phase,
    round: room.round,
    dayDurationSec: room.dayDurationSec,
    nightDurationSec: room.nightDurationSec,
    phaseEndsAt: room.phaseEndsAt ?? 0,
    memberUids,
    players: publicPlayers,
    readyPlayerIds: room.readyPlayerIds.slice(0, MAX_PLAYERS),
    votes: room.votes,
    accusedPlayerId: (room.accusedPlayerId || '').slice(0, 128),
    defenseText: (room.defenseText || '').slice(0, 300),
    defenseSubmitted: room.defenseSubmitted,
    tiedCandidateIds: room.tiedCandidateIds.slice(0, MAX_PLAYERS),
    tieRound: room.tieRound,
    revengePlayerId: (room.revengePlayerId || '').slice(0, 128),
    revengeTriggerSource: (room.revengeTriggerSource || '').slice(0, 32),
    winner: (room.winner || '').slice(0, 32),
    winReason: (room.winReason || '').slice(0, 300),
    lastDaySummary: room.lastDaySummary ?? null,
    lastVoteElimination: room.lastVoteElimination ?? null,
    chat: publicChat,
    nightPendingRolesCount: pendingCount,
  });
}

function buildSecretPayload(
  room: InternalRoomState,
  player: Player,
  hostUid: string
): FirestoreSecretDoc {
  const isMafia = player.team === 'MAFIA';
  const mafiaTeammates = isMafia
    ? room.players
        .filter((p) => p.id !== player.id && p.team === 'MAFIA')
        .slice(0, 3)
        .map((m) => ({
          id: m.id,
          name: m.name,
          role: m.role || 'MAFIA_MEMBER',
        }))
    : [];

  const mafiaChat = isMafia
    ? room.chat.filter((m) => m.type === 'MAFIA_WHISPER').slice(-40)
    : [];

  let myNightChoice = '';
  if (player.role === 'MAFIA_BOSS') myNightChoice = room.nightActions.mafiaKillTargetId || '';
  if (player.role === 'MAFIA_SILENCER') myNightChoice = room.nightActions.silencerTargetId || '';
  if (player.role === 'RIGHTEOUS_MEDIC') myNightChoice = room.nightActions.medicHealTargetId || '';
  if (player.role === 'RIGHTEOUS_SNIPER') myNightChoice = room.nightActions.sniperTargetId || '';

  return stripUndefined({
    uid: player.id,
    hostUid,
    role: player.role || '',
    team: player.team || '',
    mafiaTeammates,
    mafiaChat,
    sniperHasBullet: Boolean(player.sniperHasBullet),
    sheikhAbilityUsed: Boolean(player.sheikhAbilityUsed),
    myNightSubmitted: room.nightSubmittedPlayerIds.includes(player.id),
    myNightChoice,
  });
}

export class FirestoreRoomController {
  private roomCode: string;
  private hostUid: string;
  private myUid: string;
  private isHost: boolean;
  private internalRoom: InternalRoomState | null = null;
  private latestPublicRoom: FirestoreRoomDoc | null = null;
  private latestSecret: FirestoreSecretDoc | null = null;
  private unsubscribes: Unsubscribe[] = [];
  private timerHandle: number | null = null;
  private joinTimeoutHandle: number | null = null;
  private hasEmittedState = false;
  private lastBotTick = 0;
  private syncingHost = false;
  private processedReqIds = new Set<string>();
  private onStateChange: (state: PublicGameState) => void;
  private onError: (msg: string) => void;

  private constructor(
    roomCode: string,
    hostUid: string,
    myUid: string,
    onStateChange: (state: PublicGameState) => void,
    onError: (msg: string) => void
  ) {
    this.roomCode = roomCode;
    this.hostUid = hostUid;
    this.myUid = myUid;
    this.isHost = hostUid === myUid;
    this.onStateChange = onStateChange;
    this.onError = onError;
  }

  public static async createRoom(
    playerName: string,
    dayDurationSec: number,
    onStateChange: (state: PublicGameState) => void,
    onError: (msg: string) => void
  ): Promise<FirestoreRoomController> {
    const user = auth.currentUser;
    if (!user) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

    let code = generateRoomCode();
    for (let attempt = 0; attempt < 8; attempt++) {
      const snap = await getDoc(doc(db, 'rooms', code)).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `rooms/${code}`)
      );
      if (!snap.exists()) break;
      code = generateRoomCode();
    }

    const cleanName = playerName.trim().slice(0, 24) || 'صاحب الغرفة';
    const room = createInitialRoom(code, user.uid, cleanName, dayDurationSec);
    const ctrl = new FirestoreRoomController(code, user.uid, user.uid, onStateChange, onError);
    ctrl.internalRoom = room;

    const publicPayload = buildPublicRoomPayload(room, user.uid);
    const roomPath = `rooms/${code}`;
    try {
      await setDoc(doc(db, 'rooms', code), {
        ...publicPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, roomPath);
    }

    const hostStatePath = `rooms/${code}/hostState/private`;
    try {
      await setDoc(doc(db, 'rooms', code, 'hostState', 'private'), {
        hostUid: user.uid,
        internalRoom: stripUndefined(room),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, hostStatePath);
    }

    const secretPayload = buildSecretPayload(room, room.players[0], user.uid);
    const secretPath = `rooms/${code}/secrets/${user.uid}`;
    try {
      await setDoc(doc(db, 'rooms', code, 'secrets', user.uid), {
        ...secretPayload,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, secretPath);
    }

    ctrl.latestPublicRoom = publicPayload;
    ctrl.latestSecret = secretPayload;
    ctrl.attachListeners();
    ctrl.emitMergedState();
    return ctrl;
  }

  public static async joinRoom(
    rawRoomCode: string,
    playerName: string,
    onStateChange: (state: PublicGameState) => void,
    onError: (msg: string) => void
  ): Promise<FirestoreRoomController | null> {
    const user = auth.currentUser;
    if (!user) throw new Error('يرجى تسجيل الدخول بحساب Google أولاً.');

    const code = normalizeRoomCode(rawRoomCode);
    if (!/^[0-9]{4,6}$/.test(code)) {
      onError('رمز الغرفة يجب أن يتكون من 4 إلى 6 أرقام.');
      return null;
    }

    const roomRef = doc(db, 'rooms', code);
    let roomSnap;
    try {
      roomSnap = await getDoc(roomRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `rooms/${code}`);
    }

    if (!roomSnap.exists()) {
      onError('رمز الغرفة غير موجود. تأكد من الرمز وحاول مجدداً.');
      return null;
    }

    const data = roomSnap.data() as FirestoreRoomDoc;
    const ctrl = new FirestoreRoomController(code, data.hostUid, user.uid, onStateChange, onError);
    ctrl.latestPublicRoom = data;

    if (data.hostUid === user.uid) {
      // Host reconnecting after refresh or disconnect
      try {
        const hsSnap = await getDoc(doc(db, 'rooms', code, 'hostState', 'private'));
        if (hsSnap.exists()) {
          ctrl.internalRoom = (hsSnap.data() as { internalRoom: InternalRoomState }).internalRoom;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `rooms/${code}/hostState/private`);
      }
      try {
        const mySecretSnap = await getDoc(doc(db, 'rooms', code, 'secrets', user.uid));
        if (mySecretSnap.exists()) {
          ctrl.latestSecret = mySecretSnap.data() as FirestoreSecretDoc;
        }
      } catch {
        // listener will sync secret if needed
      }
      ctrl.attachListeners();
      ctrl.emitMergedState();
      return ctrl;
    }

    const alreadyJoined = data.players.some((p) => p.id === user.uid);
    if (!alreadyJoined) {
      if (data.phase !== 'LOBBY') {
        onError('اللعبة قد بدأت بالفعل في هذه الغرفة.');
        return null;
      }
      if (data.players.length >= MAX_PLAYERS) {
        onError('اكتمل عدد اللاعبين في الغرفة.');
        return null;
      }
      const cleanName = playerName.trim().slice(0, 24) || 'لاعب';
      const duplicateName = data.players.some(
        (p) => p.name.toLowerCase() === cleanName.toLowerCase() && p.id !== user.uid
      );
      if (duplicateName) {
        onError('يوجد لاعب بهذا الاسم في الغرفة بالفعل. اختر اسماً آخر.');
        return null;
      }

      const reqId = createId('req');
      const reqPath = `rooms/${code}/playerRequests/${reqId}`;
      try {
        await setDoc(doc(db, 'rooms', code, 'playerRequests', reqId), {
          authorUid: user.uid,
          hostUid: data.hostUid,
          actionType: 'JOIN_ROOM',
          playerName: cleanName,
          targetId: '',
          text: '',
          processed: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, reqPath);
      }

      ctrl.joinTimeoutHandle = window.setTimeout(() => {
        if (!ctrl.hasEmittedState) {
          ctrl.onError('لم يستجب صاحب الغرفة بعد. تأكد أن صاحب الغرفة متصل حالياً في الغرفة ثم أعد المحاولة.');
          ctrl.destroy();
        }
      }, 12000);
    }

    if (alreadyJoined) {
      try {
        const mySecretSnap = await getDoc(doc(db, 'rooms', code, 'secrets', user.uid));
        if (mySecretSnap.exists()) {
          ctrl.latestSecret = mySecretSnap.data() as FirestoreSecretDoc;
        }
      } catch {
        // listener will sync secret if needed
      }
    }

    ctrl.attachListeners();
    if (alreadyJoined) {
      ctrl.emitMergedState();
    }
    return ctrl;
  }

  public getRoomCode(): string {
    return this.roomCode;
  }

  private attachListeners(): void {
    // 1. Listen to public room document
    const roomPath = `rooms/${this.roomCode}`;
    const unsubRoom = onSnapshot(
      doc(db, 'rooms', this.roomCode),
      (snap) => {
        if (!snap.exists()) {
          this.onError('تم إغلاق الغرفة من قِبل صاحب الغرفة.');
          return;
        }
        this.latestPublicRoom = snap.data() as FirestoreRoomDoc;
        this.emitMergedState();
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, roomPath);
      }
    );
    this.unsubscribes.push(unsubRoom);

    // 2. Listen to my private secret document
    const secretPath = `rooms/${this.roomCode}/secrets/${this.myUid}`;
    const unsubSecret = onSnapshot(
      doc(db, 'rooms', this.roomCode, 'secrets', this.myUid),
      (snap) => {
        if (snap.exists()) {
          this.latestSecret = snap.data() as FirestoreSecretDoc;
          this.emitMergedState();
        }
      },
      (err) => {
        // Secret doc may be created shortly after joining
        if (!String(err).includes('permission-denied')) {
          handleFirestoreError(err, OperationType.GET, secretPath);
        }
      }
    );
    this.unsubscribes.push(unsubSecret);

    // 3. If Host, listen to incoming playerRequests and run timer/AI loop
    if (this.isHost) {
      const reqPath = `rooms/${this.roomCode}/playerRequests`;
      const q = query(
        collection(db, 'rooms', this.roomCode, 'playerRequests'),
        where('hostUid', '==', this.hostUid),
        where('processed', '==', false)
      );
      const unsubReqs = onSnapshot(
        q,
        (snapshot) => {
          if (!this.internalRoom) return;
          let changed = false;
          const toMarkProcessed: string[] = [];

          for (const docSnap of snapshot.docs) {
            if (this.processedReqIds.has(docSnap.id)) continue;
            this.processedReqIds.add(docSnap.id);
            toMarkProcessed.push(docSnap.id);
            const req = docSnap.data() as PlayerRequestDoc;
            if (this.applyPlayerRequest(req)) {
              changed = true;
            }
          }

          if (toMarkProcessed.length > 0) {
            this.markRequestsProcessed(toMarkProcessed).catch(() => {});
          }
          if (changed) {
            this.persistHostRoom().catch(() => {});
          }
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, reqPath);
        }
      );
      this.unsubscribes.push(unsubReqs);

      this.timerHandle = window.setInterval(() => {
        this.hostTick().catch(() => {});
      }, 1000);
    }
  }

  private async markRequestsProcessed(reqIds: string[]): Promise<void> {
    for (const id of reqIds) {
      try {
        await updateDoc(doc(db, 'rooms', this.roomCode, 'playerRequests', id), {
          processed: true,
        });
      } catch {
        // ignore if already deleted/updated
      }
    }
  }

  private applyPlayerRequest(req: PlayerRequestDoc): boolean {
    const room = this.internalRoom;
    if (!room) return false;

    switch (req.actionType) {
      case 'JOIN_ROOM':
        return addHumanPlayer(room, req.authorUid, req.playerName).ok;
      case 'MARK_ROLE_READY':
        return markRoleReady(room, req.authorUid) || true;
      case 'SUBMIT_NIGHT_ACTION':
        return submitNightAction(room, req.authorUid, req.targetId).ok;
      case 'CAST_VOTE':
        return castVote(room, req.authorUid, req.targetId).ok;
      case 'WITHDRAW_VOTE':
        return withdrawVote(room, req.authorUid).ok;
      case 'SUBMIT_DEFENSE':
        return submitDefense(room, req.authorUid, req.text).ok;
      case 'USE_SHEIKH_ABILITY':
        return useSheikhAbility(room, req.authorUid).ok;
      case 'FINALIZE_DEFENSE':
        if (room.accusedPlayerId === req.authorUid) {
          finalizeDefenseToVoteOrEliminate(room);
          return true;
        }
        return false;
      case 'SUBMIT_REVENGE':
        return submitRevenge(room, req.authorUid, req.targetId).ok;
      case 'SEND_CHAT':
        return addChatMessage(room, req.authorUid, req.text).ok;
      default:
        return false;
    }
  }

  private async hostTick(): Promise<void> {
    const room = this.internalRoom;
    if (!room || this.syncingHost) return;
    const now = Date.now();
    let changed = false;

    if (room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER' && room.phase !== 'ROLE_REVEAL') {
      if (now - this.lastBotTick >= 1500) {
        this.lastBotTick = now;
        if (room.phase === 'NIGHT') {
          changed = runBotNightActions(room);
        } else if (room.phase === 'NIGHT_REVENGE' || room.phase === 'DAY_REVENGE') {
          changed = runBotRevengeIfNeeded(room);
        } else if (
          room.phase === 'DAY_VOTING' ||
          room.phase === 'DAY_DEFENSE' ||
          room.phase === 'DAY_TIE_RUNOFF'
        ) {
          changed = runBotDayActions(room);
          if (room.phase === 'DAY_VOTING' && Math.random() < 0.25) {
            const botChatCount = room.chat.filter(
              (m) => m.type === 'CHAT' && m.senderId.startsWith('bot_')
            ).length;
            if (botChatCount < room.round * 4 && maybePostBotChat(room)) {
              changed = true;
            }
          }
        }
      }
    }

    if (room.phaseEndsAt && now >= room.phaseEndsAt) {
      if (room.phase === 'NIGHT') {
        runBotNightActions(room);
        if (room.phase === 'NIGHT') {
          resolveNightPhase(room);
        }
        changed = true;
      } else if (room.phase === 'NIGHT_REVENGE' || room.phase === 'DAY_REVENGE') {
        const boy = room.players.find((p) => p.id === room.revengePlayerId);
        const living = room.players.filter((p) => p.isAlive);
        if (boy && living.length > 0) {
          const pick = living[Math.floor(Math.random() * living.length)];
          submitRevenge(room, boy.id, pick.id);
          changed = true;
        }
      } else if (room.phase === 'DAY_VOTING' || room.phase === 'DAY_TIE_RUNOFF') {
        closeVotingPhase(room);
        changed = true;
      } else if (room.phase === 'DAY_DEFENSE' || room.phase === 'DAY_FINAL_VOTE') {
        finalizeDefenseToVoteOrEliminate(room);
        changed = true;
      } else if (room.phase === 'DAY_ELIMINATION') {
        continueAfterElimination(room);
        changed = true;
      }
    }

    if (changed) {
      await this.persistHostRoom();
    }
  }

  private async persistHostRoom(): Promise<void> {
    const room = this.internalRoom;
    if (!room || !this.isHost) return;
    this.syncingHost = true;

    try {
      const batch = writeBatch(db);
      const publicPayload = buildPublicRoomPayload(room, this.hostUid);
      batch.update(doc(db, 'rooms', this.roomCode), {
        ...publicPayload,
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'rooms', this.roomCode, 'hostState', 'private'), {
        hostUid: this.hostUid,
        internalRoom: stripUndefined(room),
        updatedAt: serverTimestamp(),
      });

      for (const p of room.players) {
        if (!p.isBot) {
          batch.set(doc(db, 'rooms', this.roomCode, 'secrets', p.id), {
            ...buildSecretPayload(room, p, this.hostUid),
            updatedAt: serverTimestamp(),
          });
        }
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rooms/${this.roomCode}`);
    } finally {
      this.syncingHost = false;
    }
  }

  public async dispatch(msg: ClientMessage): Promise<void> {
    if (this.isHost && this.internalRoom) {
      const room = this.internalRoom;
      let changed = false;

      switch (msg.type) {
        case 'UPDATE_SETTINGS':
          if (room.phase === 'LOBBY') {
            room.dayDurationSec = Math.max(45, Math.min(180, msg.dayDurationSec));
            changed = true;
          }
          break;
        case 'START_GAME': {
          const res = startGame(room);
          if (!res.ok) {
            this.onError(res.error || 'تعذر بدء اللعبة.');
            return;
          }
          changed = true;
          break;
        }
        case 'MARK_ROLE_READY':
          markRoleReady(room, this.myUid);
          changed = true;
          break;
        case 'SUBMIT_NIGHT_ACTION': {
          const res = submitNightAction(room, this.myUid, msg.targetId);
          if (!res.ok) {
            this.onError(res.error || 'فشل تنفيذ القدرة.');
            return;
          }
          changed = true;
          break;
        }
        case 'CAST_VOTE': {
          const res = castVote(room, this.myUid, msg.targetId);
          if (!res.ok) {
            this.onError(res.error || 'فشل التصويت.');
            return;
          }
          changed = true;
          break;
        }
        case 'WITHDRAW_VOTE': {
          const res = withdrawVote(room, this.myUid);
          if (!res.ok) {
            this.onError(res.error || 'تعذر سحب الصوت.');
            return;
          }
          changed = true;
          break;
        }
        case 'CLOSE_VOTING':
          closeVotingPhase(room);
          changed = true;
          break;
        case 'SUBMIT_DEFENSE': {
          const res = submitDefense(room, this.myUid, msg.text);
          if (!res.ok) {
            this.onError(res.error || 'تعذر إرسال التبرير.');
            return;
          }
          changed = true;
          break;
        }
        case 'USE_SHEIKH_ABILITY': {
          const res = useSheikhAbility(room, this.myUid);
          if (!res.ok) {
            this.onError(res.error || 'لا يمكن استخدام القدرة الآن.');
            return;
          }
          changed = true;
          break;
        }
        case 'FINALIZE_DEFENSE':
          finalizeDefenseToVoteOrEliminate(room);
          changed = true;
          break;
        case 'CONTINUE_AFTER_ELIMINATION':
          continueAfterElimination(room);
          changed = true;
          break;
        case 'SUBMIT_REVENGE': {
          const res = submitRevenge(room, this.myUid, msg.targetId);
          if (!res.ok) {
            this.onError(res.error || 'تعذر تنفيذ الاختيار.');
            return;
          }
          changed = true;
          break;
        }
        case 'SEND_CHAT': {
          const res = addChatMessage(room, this.myUid, msg.text);
          if (!res.ok) {
            this.onError(res.error || 'تعذر إرسال الرسالة.');
            return;
          }
          changed = true;
          break;
        }
        case 'PLAY_AGAIN':
          resetToLobby(room);
          changed = true;
          break;
      }

      if (changed) {
        await this.persistHostRoom();
      }
      return;
    }

    // Non-host participant sends PlayerRequest to Firestore
    const allowedActionTypes = [
      'MARK_ROLE_READY',
      'SUBMIT_NIGHT_ACTION',
      'CAST_VOTE',
      'WITHDRAW_VOTE',
      'SUBMIT_DEFENSE',
      'USE_SHEIKH_ABILITY',
      'FINALIZE_DEFENSE',
      'SUBMIT_REVENGE',
      'SEND_CHAT',
    ];
    if (!allowedActionTypes.includes(msg.type)) return;

    const reqId = createId('req');
    const reqPath = `rooms/${this.roomCode}/playerRequests/${reqId}`;
    try {
      await setDoc(doc(db, 'rooms', this.roomCode, 'playerRequests', reqId), {
        authorUid: this.myUid,
        hostUid: this.hostUid,
        actionType: msg.type,
        playerName: '',
        targetId: 'targetId' in msg ? String(msg.targetId).slice(0, 128) : '',
        text: 'text' in msg ? String(msg.text).slice(0, 240) : '',
        processed: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, reqPath);
    }
  }

  private emitMergedState(): void {
    const pub = this.latestPublicRoom;
    if (!pub) return;

    const secret = this.latestSecret;
    const myRole = (secret?.role || undefined) as RoleId | undefined;
    const myTeam = (secret?.team || undefined) as Team | undefined;

    const players: Player[] = pub.players.map((p) => {
      if (p.id === this.myUid && myRole && myTeam) {
        return {
          ...p,
          role: myRole,
          team: myTeam,
          sniperHasBullet: secret?.sniperHasBullet,
          sheikhAbilityUsed: secret?.sheikhAbilityUsed,
        };
      }
      const mate = secret?.mafiaTeammates?.find((m) => m.id === p.id);
      if (mate) {
        return {
          ...p,
          role: mate.role as RoleId,
          team: 'MAFIA',
        };
      }
      return p;
    });

    const combinedChat = [...pub.chat, ...(secret?.mafiaChat || [])].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    const state: PublicGameState = {
      roomCode: pub.roomCode,
      phase: pub.phase,
      round: pub.round,
      phaseEndsAt: pub.phaseEndsAt > 0 ? pub.phaseEndsAt : null,
      dayDurationSec: pub.dayDurationSec,
      nightDurationSec: pub.nightDurationSec,
      players,
      readyPlayerIds: pub.readyPlayerIds,
      votes: pub.votes,
      accusedPlayerId: pub.accusedPlayerId || null,
      defenseText: pub.defenseText || null,
      defenseSubmitted: pub.defenseSubmitted,
      tiedCandidateIds: pub.tiedCandidateIds,
      tieRound: pub.tieRound,
      revengePlayerId: pub.revengePlayerId || null,
      revengeTriggerSource: (pub.revengeTriggerSource || null) as PublicGameState['revengeTriggerSource'],
      winner: (pub.winner || null) as PublicGameState['winner'],
      winReason: pub.winReason || null,
      lastDaySummary: pub.lastDaySummary,
      lastVoteElimination: pub.lastVoteElimination ?? null,
      chat: combinedChat,
      myPlayerId: this.myUid,
      myNightSubmitted: Boolean(secret?.myNightSubmitted),
      myNightChoice: secret?.myNightChoice || undefined,
      nightPendingRolesCount: pub.nightPendingRolesCount,
    };

    // Ensure `me` always exists while waiting for initial JOIN_ROOM processing
    if (!state.players.some((p) => p.id === this.myUid)) {
      return;
    }

    this.hasEmittedState = true;
    if (this.joinTimeoutHandle !== null) {
      clearTimeout(this.joinTimeoutHandle);
      this.joinTimeoutHandle = null;
    }

    this.onStateChange(state);
  }

  public destroy(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.joinTimeoutHandle !== null) {
      clearTimeout(this.joinTimeoutHandle);
      this.joinTimeoutHandle = null;
    }
    this.unsubscribes.forEach((u) => u());
    this.unsubscribes = [];
  }
}

export { ROLES };
