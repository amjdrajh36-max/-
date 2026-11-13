import {
  AI_BOT_NAMES,
  MAX_PLAYERS,
  ROLE_DECK,
  ROLES,
  checkWinner,
  shuffleArray,
} from './roles.ts';
import type {
  ChatMessage,
  DaySummary,
  GamePhase,
  NightActions,
  Player,
  PublicGameState,
  RoleId,
  Team,
  VoteEliminationSummary,
} from './types.ts';

export interface InternalRoomState {
  roomCode: string;
  phase: GamePhase;
  round: number;
  phaseEndsAt: number | null;
  dayDurationSec: number;
  nightDurationSec: number;
  players: Player[];
  readyPlayerIds: string[];
  votes: Record<string, string>;
  accusedPlayerId: string | null;
  defenseText: string | null;
  defenseSubmitted: boolean;
  tiedCandidateIds: string[];
  tieRound: number;
  revengePlayerId: string | null;
  revengeTriggerSource: 'NIGHT_MAFIA' | 'DAY_VOTE' | null;
  winner: Team | null;
  winReason: string | null;
  lastDaySummary: DaySummary | null;
  lastVoteElimination: VoteEliminationSummary | null;
  chat: ChatMessage[];
  nightActions: NightActions;
  nightSubmittedPlayerIds: string[];
  createdAt: number;
}

export function generateRoomCode(): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += digits[Math.floor(Math.random() * digits.length)];
  }
  return code;
}

export function createId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function createSystemMessage(text: string): ChatMessage {
  return {
    id: createId('sys'),
    senderId: 'SYSTEM',
    senderName: 'الراوي',
    text,
    timestamp: Date.now(),
    type: 'SYSTEM',
  };
}

export function createInitialRoom(
  roomCode: string,
  hostId: string,
  hostName: string,
  dayDurationSec = 90
): InternalRoomState {
  const host: Player = {
    id: hostId,
    name: hostName.trim() || 'صاحب الغرفة',
    isBot: false,
    isHost: true,
    isAlive: true,
    connected: true,
    seatNumber: 1,
    isSilenced: false,
  };

  return {
    roomCode,
    phase: 'LOBBY',
    round: 0,
    phaseEndsAt: null,
    dayDurationSec,
    nightDurationSec: 35,
    players: [host],
    readyPlayerIds: [],
    votes: {},
    accusedPlayerId: null,
    defenseText: null,
    defenseSubmitted: false,
    tiedCandidateIds: [],
    tieRound: 0,
    revengePlayerId: null,
    revengeTriggerSource: null,
    winner: null,
    winReason: null,
    lastDaySummary: null,
    lastVoteElimination: null,
    chat: [createSystemMessage(`تم إنشاء الغرفة ${roomCode}. صاحب الغرفة ${host.name} مشارك في اللعب.`)],
    nightActions: {},
    nightSubmittedPlayerIds: [],
    createdAt: Date.now(),
  };
}

export function addHumanPlayer(
  room: InternalRoomState,
  playerId: string,
  playerName: string
): { ok: boolean; error?: string } {
  if (room.phase !== 'LOBBY') {
    return { ok: false, error: 'اللعبة قد بدأت بالفعل في هذه الغرفة.' };
  }
  if (room.players.length >= MAX_PLAYERS) {
    return { ok: false, error: `اكتمل عدد اللاعبين (${MAX_PLAYERS} لاعباً كحد أقصى).` };
  }
  const cleanName = playerName.trim();
  if (!cleanName) {
    return { ok: false, error: 'يرجى كتابة اسم صالح.' };
  }
  const duplicate = room.players.some(
    (p) => p.name.toLowerCase() === cleanName.toLowerCase() && p.id !== playerId
  );
  if (duplicate) {
    return { ok: false, error: 'يوجد لاعب بهذا الاسم في الغرفة بالفعل.' };
  }

  const existing = room.players.find((p) => p.id === playerId);
  if (existing) {
    existing.connected = true;
    existing.name = cleanName;
    return { ok: true };
  }

  room.players.push({
    id: playerId,
    name: cleanName,
    isBot: false,
    isHost: false,
    isAlive: true,
    connected: true,
    seatNumber: room.players.length + 1,
    isSilenced: false,
  });

  room.chat.push(createSystemMessage(`انضم اللاعب ${cleanName} إلى الغرفة.`));
  return { ok: true };
}

export function startGame(room: InternalRoomState): { ok: boolean; error?: string } {
  if (room.phase !== 'LOBBY') {
    return { ok: false, error: 'اللعبة قيد التشغيل بالفعل.' };
  }

  // Remove any previously generated bots before filling
  const humans = room.players.filter((p) => !p.isBot);
  const usedNames = new Set(humans.map((p) => p.name));
  const availableBotNames = shuffleArray(AI_BOT_NAMES).filter((n) => !usedNames.has(n));

  const fullPlayers: Player[] = humans.map((p, idx) => ({
    ...p,
    seatNumber: idx + 1,
    isAlive: true,
    isSilenced: false,
    sheikhRevealed: false,
    sheikhAbilityUsed: false,
    roleRevealedPublicly: false,
    sniperHasBullet: false,
    eliminatedRound: undefined,
    eliminatedReason: undefined,
  }));

  let botCounter = 0;
  while (fullPlayers.length < MAX_PLAYERS) {
    const baseName = availableBotNames[botCounter] || `لاعب ذكي ${botCounter + 1}`;
    botCounter++;
    fullPlayers.push({
      id: createId('bot'),
      name: baseName,
      isBot: true,
      isHost: false,
      isAlive: true,
      connected: true,
      seatNumber: fullPlayers.length + 1,
      isSilenced: false,
      sheikhRevealed: false,
      sheikhAbilityUsed: false,
      sniperHasBullet: false,
    });
  }

  // Shuffle 15 roles and deal secretly
  const shuffledRoles = shuffleArray(ROLE_DECK);
  fullPlayers.forEach((player, index) => {
    const roleId = shuffledRoles[index];
    player.role = roleId;
    player.team = ROLES[roleId].team;
    if (roleId === 'RIGHTEOUS_SNIPER') {
      player.sniperHasBullet = true;
    }
    if (roleId === 'RIGHTEOUS_SHEIKH') {
      player.sheikhAbilityUsed = false;
      player.sheikhRevealed = false;
    }
  });

  room.players = fullPlayers;
  room.phase = 'ROLE_REVEAL';
  room.round = 1;
  room.phaseEndsAt = null;
  room.readyPlayerIds = fullPlayers.filter((p) => p.isBot).map((p) => p.id);
  room.votes = {};
  room.accusedPlayerId = null;
  room.defenseText = null;
  room.defenseSubmitted = false;
  room.tiedCandidateIds = [];
  room.tieRound = 0;
  room.revengePlayerId = null;
  room.revengeTriggerSource = null;
  room.winner = null;
  room.winReason = null;
  room.lastDaySummary = null;
  room.lastVoteElimination = null;
  room.nightActions = {};
  room.nightSubmittedPlayerIds = [];

  const botsAdded = fullPlayers.filter((p) => p.isBot).length;
  room.chat = [
    createSystemMessage(
      botsAdded > 0
        ? `بدأت اللعبة! تم إكمال الغرفة بـ ${botsAdded} لاعبين بالذكاء الاصطناعي، وتوزيع البطاقات الخمس عشرة سراً.`
        : `بدأت اللعبة بحضور ${MAX_PLAYERS} لاعباً حقيقياً! تفقدوا بطاقاتكم السرية.`
    ),
  ];

  return { ok: true };
}

export function resetToLobby(room: InternalRoomState): void {
  room.players = room.players
    .filter((p) => !p.isBot)
    .map((p, idx) => ({
      ...p,
      seatNumber: idx + 1,
      isAlive: true,
      isSilenced: false,
      role: undefined,
      team: undefined,
      sheikhRevealed: false,
      sheikhAbilityUsed: false,
      roleRevealedPublicly: false,
      sniperHasBullet: false,
      eliminatedRound: undefined,
      eliminatedReason: undefined,
    }));

  room.phase = 'LOBBY';
  room.round = 0;
  room.phaseEndsAt = null;
  room.readyPlayerIds = [];
  room.votes = {};
  room.accusedPlayerId = null;
  room.defenseText = null;
  room.defenseSubmitted = false;
  room.tiedCandidateIds = [];
  room.tieRound = 0;
  room.revengePlayerId = null;
  room.revengeTriggerSource = null;
  room.winner = null;
  room.winReason = null;
  room.lastDaySummary = null;
  room.lastVoteElimination = null;
  room.nightActions = {};
  room.nightSubmittedPlayerIds = [];
  room.chat.push(createSystemMessage('تمت إعادة فتح الغرفة لجولة جديدة.'));
}

export function getRequiredNightRolePlayers(room: InternalRoomState): Player[] {
  return room.players.filter((p) => {
    if (!p.isAlive || !p.role) return false;
    if (p.role === 'MAFIA_BOSS') return true;
    if (p.role === 'MAFIA_SILENCER') return true;
    if (p.role === 'RIGHTEOUS_MEDIC') return true;
    if (p.role === 'RIGHTEOUS_SNIPER' && p.sniperHasBullet) return true;
    return false;
  });
}

export function enterNightPhase(room: InternalRoomState, nextRound?: number): void {
  if (typeof nextRound === 'number') {
    room.round = nextRound;
  }
  room.phase = 'NIGHT';
  room.phaseEndsAt = Date.now() + room.nightDurationSec * 1000;
  room.votes = {};
  room.accusedPlayerId = null;
  room.defenseText = null;
  room.defenseSubmitted = false;
  room.tiedCandidateIds = [];
  room.tieRound = 0;
  room.revengePlayerId = null;
  room.revengeTriggerSource = null;
  room.nightActions = {};
  room.nightSubmittedPlayerIds = [];
  room.chat.push(createSystemMessage(`حلّ الليل في الجولة ${room.round}. ينفذ أصحاب القدرات مهامهم سراً.`));
}

export function markRoleReady(room: InternalRoomState, playerId: string): boolean {
  if (room.phase !== 'ROLE_REVEAL') return false;
  if (!room.readyPlayerIds.includes(playerId)) {
    room.readyPlayerIds.push(playerId);
  }
  const allHumansReady = room.players
    .filter((p) => !p.isBot)
    .every((p) => room.readyPlayerIds.includes(p.id));

  if (allHumansReady) {
    enterNightPhase(room, 1);
    return true;
  }
  return false;
}

export function submitNightAction(
  room: InternalRoomState,
  playerId: string,
  targetId: string
): { ok: boolean; error?: string; nightCompleted?: boolean } {
  if (room.phase !== 'NIGHT') {
    return { ok: false, error: 'لسنا في مرحلة الليل.' };
  }
  const actor = room.players.find((p) => p.id === playerId && p.isAlive);
  if (!actor || !actor.role) {
    return { ok: false, error: 'اللاعب غير نشط.' };
  }

  if (actor.role === 'MAFIA_BOSS') {
    const target = room.players.find((p) => p.id === targetId && p.isAlive);
    if (!target || target.team === 'MAFIA') {
      return { ok: false, error: 'يجب على شيخ المافيا اختيار لاعب من فريق الصالحين.' };
    }
    room.nightActions.mafiaKillTargetId = targetId;
  } else if (actor.role === 'MAFIA_SILENCER') {
    const target = room.players.find((p) => p.id === targetId && p.isAlive);
    if (!target) {
      return { ok: false, error: 'الهدف المختار غير موجود أو خرج من اللعب.' };
    }
    room.nightActions.silencerTargetId = targetId;
  } else if (actor.role === 'RIGHTEOUS_MEDIC') {
    const target = room.players.find((p) => p.id === targetId && p.isAlive);
    if (!target) {
      return { ok: false, error: 'الهدف المختار غير صالح للعلاج.' };
    }
    room.nightActions.medicHealTargetId = targetId;
  } else if (actor.role === 'RIGHTEOUS_SNIPER') {
    if (!actor.sniperHasBullet) {
      return { ok: false, error: 'لقد استنفدت طلقتك الوحيدة بالفعل.' };
    }
    if (targetId !== 'SKIP') {
      const target = room.players.find((p) => p.id === targetId && p.isAlive && p.id !== actor.id);
      if (!target) {
        return { ok: false, error: 'هدف القناص غير صالح.' };
      }
    }
    room.nightActions.sniperTargetId = targetId;
  } else {
    return { ok: false, error: 'دورك لا يمتلك قدرة ليلية.' };
  }

  if (!room.nightSubmittedPlayerIds.includes(playerId)) {
    room.nightSubmittedPlayerIds.push(playerId);
  }

  const required = getRequiredNightRolePlayers(room);
  const allDone = required.every((p) => room.nightSubmittedPlayerIds.includes(p.id));
  if (allDone) {
    resolveNightPhase(room);
    return { ok: true, nightCompleted: true };
  }
  return { ok: true, nightCompleted: false };
}

export function runBotNightActions(room: InternalRoomState): boolean {
  if (room.phase !== 'NIGHT') return false;
  const required = getRequiredNightRolePlayers(room);

  for (const bot of required) {
    if (!bot.isBot || room.nightSubmittedPlayerIds.includes(bot.id)) continue;

    const livingPlayers = room.players.filter((p) => p.isAlive);

    if (bot.role === 'MAFIA_BOSS') {
      const candidates = livingPlayers.filter((p) => p.team !== 'MAFIA');
      if (candidates.length > 0) {
        // Prefer targets not obviously protected or pick strategically
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        room.nightActions.mafiaKillTargetId = pick.id;
      }
    } else if (bot.role === 'MAFIA_SILENCER') {
      const righteousCandidates = livingPlayers.filter((p) => p.team !== 'MAFIA');
      const pool = righteousCandidates.length > 0 ? righteousCandidates : livingPlayers;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      room.nightActions.silencerTargetId = pick.id;
    } else if (bot.role === 'RIGHTEOUS_MEDIC') {
      const revealedSheikh = livingPlayers.find((p) => p.sheikhRevealed);
      if (revealedSheikh && Math.random() < 0.75) {
        room.nightActions.medicHealTargetId = revealedSheikh.id;
      } else if (Math.random() < 0.35) {
        room.nightActions.medicHealTargetId = bot.id;
      } else {
        const pick = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
        room.nightActions.medicHealTargetId = pick.id;
      }
    } else if (bot.role === 'RIGHTEOUS_SNIPER' && bot.sniperHasBullet) {
      const others = livingPlayers.filter((p) => p.id !== bot.id && !p.sheikhRevealed);
      const shouldShoot = room.round >= 2 && others.length > 0 && Math.random() < 0.45;
      if (shouldShoot) {
        const pick = others[Math.floor(Math.random() * others.length)];
        room.nightActions.sniperTargetId = pick.id;
      } else {
        room.nightActions.sniperTargetId = 'SKIP';
      }
    }

    room.nightSubmittedPlayerIds.push(bot.id);
  }

  const allDone = required.every((p) => room.nightSubmittedPlayerIds.includes(p.id));
  if (allDone) {
    resolveNightPhase(room);
    return true;
  }
  return false;
}

export function resolveNightPhase(room: InternalRoomState): void {
  if (room.phase !== 'NIGHT') return;

  // Clear previous silencing
  room.players.forEach((p) => {
    p.isSilenced = false;
  });

  const events: string[] = [];
  const killedNames: string[] = [];
  let savedByMedic = false;
  let sniperFired = false;
  let sniperHitMafia: boolean | undefined;
  let silencedPlayerId: string | undefined;
  let silencedPlayerName: string | undefined;
  let boyKilledByMafia: Player | null = null;

  // 1. Apply Silencer
  const silencer = room.players.find((p) => p.isAlive && p.role === 'MAFIA_SILENCER');
  if (silencer && room.nightActions.silencerTargetId) {
    const silencedTarget = room.players.find(
      (p) => p.id === room.nightActions.silencerTargetId && p.isAlive
    );
    if (silencedTarget) {
      silencedTarget.isSilenced = true;
      silencedPlayerId = silencedTarget.id;
      silencedPlayerName = silencedTarget.name;
      events.push(`تم إسكات ${silencedTarget.name} طوال هذا اليوم بأمر من مافيا التسكيت.`);
    }
  }

  // 2. Apply Sniper Shot
  const sniper = room.players.find((p) => p.isAlive && p.role === 'RIGHTEOUS_SNIPER');
  if (
    sniper &&
    sniper.sniperHasBullet &&
    room.nightActions.sniperTargetId &&
    room.nightActions.sniperTargetId !== 'SKIP'
  ) {
    const target = room.players.find(
      (p) => p.id === room.nightActions.sniperTargetId && p.isAlive
    );
    if (target) {
      sniper.sniperHasBullet = false;
      sniperFired = true;
      if (target.team === 'MAFIA') {
        sniperHitMafia = true;
        target.isAlive = false;
        target.eliminatedRound = room.round;
        target.eliminatedReason = 'قُتل برصاصة قناص الصالحين';
        killedNames.push(target.name);
        events.push(`أطلق قناص الصالحين طلقته الوحيدة وأصاب رجل المافيا ${target.name} فأخرجه من اللعبة!`);
      } else {
        sniperHitMafia = false;
        target.isAlive = false;
        target.eliminatedRound = room.round;
        target.eliminatedReason = 'خرج برصاصة قناص الصالحين عن طريق الخطأ';
        sniper.isAlive = false;
        sniper.eliminatedRound = room.round;
        sniper.eliminatedReason = 'خرج بعد إصابته لاعباً صالحاً';
        killedNames.push(target.name, sniper.name);
        events.push(
          `أخطأ قناص الصالحين هدفه وأطلق النار على الصالح ${target.name}، فخرج الاثنان معاً (${target.name} و ${sniper.name})!`
        );
      }
    }
  }

  // 3. Apply Mafia Boss Kill
  const mafiaBoss = room.players.find((p) => p.isAlive && p.role === 'MAFIA_BOSS');
  const medic = room.players.find((p) => p.isAlive && p.role === 'RIGHTEOUS_MEDIC');
  const healTargetId = medic ? room.nightActions.medicHealTargetId : undefined;

  if (mafiaBoss && room.nightActions.mafiaKillTargetId) {
    const victim = room.players.find(
      (p) => p.id === room.nightActions.mafiaKillTargetId && p.isAlive
    );
    if (victim) {
      if (healTargetId === victim.id) {
        savedByMedic = true;
        events.push('حاولت المافيا اغتيال أحد اللاعبين ليلاً، لكن مسعف الصالحين أنقذه في اللحظة الأخيرة!');
      } else {
        victim.isAlive = false;
        victim.eliminatedRound = room.round;
        victim.eliminatedReason = 'اغتاله شيخ المافيا ليلاً';
        killedNames.push(victim.name);
        events.push(`استيقظت المدينة على مقتل ${victim.name} بيد شيخ المافيا.`);
        if (victim.role === 'RIGHTEOUS_BOY') {
          boyKilledByMafia = victim;
        }
      }
    }
  }

  if (events.length === 0) {
    events.push('مرّت الليلة بهدوء دون إصابات.');
  }

  room.lastDaySummary = {
    round: room.round,
    killedNames,
    savedByMedic,
    silencedPlayerId,
    silencedPlayerName,
    sniperFired,
    sniperHitMafia,
    events,
  };

  events.forEach((ev) => room.chat.push(createSystemMessage(ev)));

  // Check win condition immediately
  const winCheck = checkWinner(room.players);
  if (winCheck.winner) {
    finishGame(room, winCheck.winner, winCheck.reason!);
    return;
  }

  // If Righteous Boy was killed by Mafia Boss, trigger his revenge pick
  if (boyKilledByMafia) {
    room.phase = 'NIGHT_REVENGE';
    room.revengePlayerId = boyKilledByMafia.id;
    room.revengeTriggerSource = 'NIGHT_MAFIA';
    room.phaseEndsAt = Date.now() + 30 * 1000;
    room.chat.push(
      createSystemMessage(
        `بما أن ${boyKilledByMafia.name} هو «الولد الصالح»، يحق له الآن اختيار لاعب واحد ليخرج معه!`
      )
    );
    return;
  }

  enterDayVoting(room);
}

export function enterDayVoting(room: InternalRoomState): void {
  room.phase = 'DAY_VOTING';
  room.phaseEndsAt = Date.now() + room.dayDurationSec * 1000;
  room.votes = {};
  room.accusedPlayerId = null;
  room.defenseText = null;
  room.defenseSubmitted = false;
  room.tiedCandidateIds = [];
  room.tieRound = 0;
  room.revengePlayerId = null;
  room.revengeTriggerSource = null;
  room.chat.push(
    createSystemMessage(
      `أشرق نهار الجولة ${room.round}. بدأ النقاش والتصويت العلني (يمكنكم تغيير الصوت أو سحبه في أي وقت).`
    )
  );
}

export function submitRevenge(
  room: InternalRoomState,
  playerId: string,
  targetId: string
): { ok: boolean; error?: string } {
  if (room.phase !== 'NIGHT_REVENGE' && room.phase !== 'DAY_REVENGE') {
    return { ok: false, error: 'ليست مرحلة انتقام الولد الصالح.' };
  }
  if (room.revengePlayerId !== playerId) {
    return { ok: false, error: 'أنت لست الولد الصالح صاحب هذا الاختيار.' };
  }
  const target = room.players.find((p) => p.id === targetId && p.isAlive);
  if (!target) {
    return { ok: false, error: 'يجب اختيار لاعب حي.' };
  }

  target.isAlive = false;
  target.eliminatedRound = room.round;
  target.eliminatedReason = 'أخذه الولد الصالح معه عند خروجه';

  const boy = room.players.find((p) => p.id === playerId);
  room.chat.push(
    createSystemMessage(
      `اختار الولد الصالح (${boy?.name || 'اللاعب'}) اصطحاب ${target.name} معه خارج اللعبة!`
    )
  );

  if (room.lastDaySummary && room.phase === 'NIGHT_REVENGE') {
    room.lastDaySummary.killedNames.push(target.name);
    room.lastDaySummary.events.push(`اصطحب الولد الصالح ${target.name} معه.`);
  }

  const winCheck = checkWinner(room.players);
  if (winCheck.winner) {
    finishGame(room, winCheck.winner, winCheck.reason!);
    return { ok: true };
  }

  if (room.phase === 'NIGHT_REVENGE') {
    enterDayVoting(room);
  } else {
    enterNightPhase(room, room.round + 1);
  }
  return { ok: true };
}

export function runBotRevengeIfNeeded(room: InternalRoomState): boolean {
  if (room.phase !== 'NIGHT_REVENGE' && room.phase !== 'DAY_REVENGE') return false;
  const boy = room.players.find((p) => p.id === room.revengePlayerId);
  if (!boy || !boy.isBot) return false;
  const living = room.players.filter((p) => p.isAlive && !p.sheikhRevealed);
  const pool = living.length > 0 ? living : room.players.filter((p) => p.isAlive);
  if (pool.length === 0) return false;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  submitRevenge(room, boy.id, pick.id);
  return true;
}

export function castVote(
  room: InternalRoomState,
  voterId: string,
  targetId: string
): { ok: boolean; error?: string } {
  if (
    room.phase !== 'DAY_VOTING' &&
    room.phase !== 'DAY_FINAL_VOTE' &&
    room.phase !== 'DAY_TIE_RUNOFF'
  ) {
    return { ok: false, error: 'التصويت غير متاح في هذه المرحلة.' };
  }

  const voter = room.players.find((p) => p.id === voterId && p.isAlive);
  if (!voter) {
    return { ok: false, error: 'اللاعبون الأحياء فقط يمكنهم التصويت.' };
  }

  const target = room.players.find((p) => p.id === targetId && p.isAlive);
  if (!target) {
    return { ok: false, error: 'لا يمكن التصويت للاعب خارج اللعبة.' };
  }

  if (room.phase === 'DAY_TIE_RUNOFF') {
    // Only non-tied players vote among tied candidates (unless everyone alive is tied)
    const nonTiedAlive = room.players.filter(
      (p) => p.isAlive && !room.tiedCandidateIds.includes(p.id)
    );
    if (nonTiedAlive.length > 0 && room.tiedCandidateIds.includes(voterId)) {
      return { ok: false, error: 'في التصويت الداخلي، يصوت بقية اللاعبين غير المتعادلين فقط.' };
    }
    if (!room.tiedCandidateIds.includes(targetId)) {
      return { ok: false, error: 'يجب اختيار أحد اللاعبين المتعادلين فقط.' };
    }
  }

  room.votes[voterId] = targetId;
  return { ok: true };
}

export function withdrawVote(
  room: InternalRoomState,
  voterId: string
): { ok: boolean; error?: string } {
  if (
    room.phase !== 'DAY_VOTING' &&
    room.phase !== 'DAY_FINAL_VOTE' &&
    room.phase !== 'DAY_TIE_RUNOFF'
  ) {
    return { ok: false, error: 'لا يمكن سحب الصوت الآن.' };
  }
  const voter = room.players.find((p) => p.id === voterId && p.isAlive);
  if (!voter) {
    return { ok: false, error: 'اللاعب غير نشط.' };
  }
  delete room.votes[voterId];
  return { ok: true };
}

export function getVoteTallies(room: InternalRoomState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const targetId of Object.values(room.votes)) {
    counts[targetId] = (counts[targetId] || 0) + 1;
  }
  return counts;
}

export function closeVotingPhase(room: InternalRoomState): void {
  if (
    room.phase !== 'DAY_VOTING' &&
    room.phase !== 'DAY_FINAL_VOTE' &&
    room.phase !== 'DAY_TIE_RUNOFF'
  ) {
    return;
  }

  const tallies = getVoteTallies(room);
  const entries = Object.entries(tallies);

  if (entries.length === 0) {
    if (room.phase === 'DAY_TIE_RUNOFF') {
      // Repeat runoff if nobody voted in runoff
      room.tieRound += 1;
      room.votes = {};
      room.phaseEndsAt = Date.now() + 35 * 1000;
      room.chat.push(
        createSystemMessage(
          `لم تُسجَّل أصوات في التصويت الداخلي. تُعاد جولة التصويت الداخلي رقم ${room.tieRound}.`
        )
      );
      return;
    }
    room.chat.push(createSystemMessage('انتهى التصويت دون أي أصوات. لم يخرج أحد اليوم.'));
    enterNightPhase(room, room.round + 1);
    return;
  }

  const maxVotes = Math.max(...entries.map(([, c]) => c));
  const topCandidateIds = entries
    .filter(([, c]) => c === maxVotes)
    .map(([id]) => id);

  if (room.phase === 'DAY_VOTING') {
    if (topCandidateIds.length === 1) {
      // Clear single leader -> Defense chance!
      const accused = room.players.find((p) => p.id === topCandidateIds[0])!;
      room.phase = 'DAY_DEFENSE';
      room.accusedPlayerId = accused.id;
      room.defenseText = null;
      room.defenseSubmitted = false;
      room.phaseEndsAt = Date.now() + 35 * 1000;
      room.chat.push(
        createSystemMessage(
          accused.isSilenced
            ? `حصل ${accused.name} على أعلى الأصوات (${maxVotes})، لكنه مُسكَّت في هذه الجولة ولا يمكنه التبرير.`
            : `حصل ${accused.name} على أعلى الأصوات (${maxVotes}). لديه الآن فرصة واحدة للتبرير.`
        )
      );
      return;
    } else {
      // Tie -> Start internal runoff vote!
      startTieRunoff(room, topCandidateIds, 1);
      return;
    }
  }

  if (room.phase === 'DAY_FINAL_VOTE') {
    if (topCandidateIds.length === 1) {
      eliminateByVote(room, topCandidateIds[0]);
    } else {
      startTieRunoff(room, topCandidateIds, 1);
    }
    return;
  }

  if (room.phase === 'DAY_TIE_RUNOFF') {
    if (topCandidateIds.length === 1) {
      eliminateByVote(room, topCandidateIds[0]);
    } else {
      // Tie persists -> Repeat tie runoff!
      startTieRunoff(room, topCandidateIds, room.tieRound + 1);
    }
  }
}

function startTieRunoff(
  room: InternalRoomState,
  candidateIds: string[],
  tieRound: number
): void {
  room.phase = 'DAY_TIE_RUNOFF';
  room.tiedCandidateIds = candidateIds;
  room.tieRound = tieRound;
  room.votes = {};
  room.phaseEndsAt = Date.now() + 40 * 1000;
  const names = candidateIds
    .map((id) => room.players.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(' و ');

  room.chat.push(
    createSystemMessage(
      tieRound === 1
        ? `تعادل في الأصوات بين (${names})! يبدأ الآن التصويت الداخلي ويصوّت بقية اللاعبين فقط.`
        : `استمر التعادل بين (${names})! تُعاد جولة التصويت الداخلي (#${tieRound}) حتى يخرج لاعب واحد.`
    )
  );
}

export function submitDefense(
  room: InternalRoomState,
  playerId: string,
  text: string
): { ok: boolean; error?: string } {
  if (room.phase !== 'DAY_DEFENSE' || room.accusedPlayerId !== playerId) {
    return { ok: false, error: 'ليست مرحلة تبريرك.' };
  }
  const accused = room.players.find((p) => p.id === playerId);
  if (!accused) return { ok: false, error: 'اللاعب غير موجود.' };
  if (accused.isSilenced) {
    return { ok: false, error: 'أنت مُسكَّت في هذه الجولة ولا يمكنك التحدث.' };
  }
  if (room.defenseSubmitted) {
    return { ok: false, error: 'لقد استخدمت فرصتك الوحيدة للتبرير بالفعل.' };
  }

  const clean = text.trim() || 'أنا مواطن صالح';
  room.defenseText = clean;
  room.defenseSubmitted = true;
  room.chat.push({
    id: createId('def'),
    senderId: accused.id,
    senderName: accused.name,
    text: clean,
    timestamp: Date.now(),
    type: 'DEFENSE',
  });

  return { ok: true };
}

export function useSheikhAbility(
  room: InternalRoomState,
  playerId: string
): { ok: boolean; error?: string } {
  if (room.phase !== 'DAY_DEFENSE' && room.phase !== 'DAY_FINAL_VOTE') {
    return { ok: false, error: 'تُستخدم قدرة شيخ الصالحين عند تصدّر الأصوات ضده.' };
  }
  const player = room.players.find((p) => p.id === playerId && p.isAlive);
  if (!player || player.role !== 'RIGHTEOUS_SHEIKH') {
    return { ok: false, error: 'هذه القدرة خاصة بشيخ الصالحين فقط.' };
  }
  if (room.accusedPlayerId !== playerId) {
    return { ok: false, error: 'يمكن استخدامها فقط عندما تكون صاحب أعلى عدد من الأصوات.' };
  }
  if (room.round <= 1) {
    return { ok: false, error: 'لا يمكن لشيخ الصالحين استخدام هذه القدرة في الجولة الأولى.' };
  }
  if (player.sheikhAbilityUsed) {
    return { ok: false, error: 'تم استخدام قدرة كشف الهوية بالفعل.' };
  }

  player.sheikhRevealed = true;
  player.sheikhAbilityUsed = true;
  room.votes = {};
  room.chat.push(
    createSystemMessage(
      `كشف ${player.name} عن هويته كـ «شيخ الصالحين»! تم سحب جميع الأصوات عنه ولن يخرج اليوم.`
    )
  );
  enterNightPhase(room, room.round + 1);
  return { ok: true };
}

export function finalizeDefenseToVoteOrEliminate(room: InternalRoomState): void {
  if (room.phase === 'DAY_DEFENSE') {
    // Move to brief final vote adjustment so players can react to the defense
    room.phase = 'DAY_FINAL_VOTE';
    room.phaseEndsAt = Date.now() + 25 * 1000;
    room.chat.push(
      createSystemMessage(
        'انتهى التبرير. يمكن للاعبين تعديل أصواتهم أو سحبها قبل الحسم النهائي.'
      )
    );
    return;
  }

  if (room.phase === 'DAY_FINAL_VOTE') {
    closeVotingPhase(room);
  }
}

function eliminateByVote(room: InternalRoomState, targetId: string): void {
  const victim = room.players.find((p) => p.id === targetId && p.isAlive);
  if (!victim) {
    enterNightPhase(room, room.round + 1);
    return;
  }

  const voteCount = Object.values(room.votes).filter((v) => v === victim.id).length;

  victim.isAlive = false;
  victim.eliminatedRound = room.round;
  victim.eliminatedReason = 'تم إخراجه بتصويت المدينة';
  victim.roleRevealedPublicly = true;

  const roleName = victim.role ? ROLES[victim.role].name : 'غير محدد';
  room.lastVoteElimination =
    victim.role && victim.team
      ? {
          round: room.round,
          playerId: victim.id,
          playerName: victim.name,
          role: victim.role,
          team: victim.team,
          seatNumber: victim.seatNumber,
          voteCount,
        }
      : null;

  room.chat.push(
    createSystemMessage(`قررت المدينة إخراج ${victim.name} بالتصويت — بطاقته كانت: «${roleName}».`)
  );

  room.phase = 'DAY_ELIMINATION';
  room.phaseEndsAt = Date.now() + 8000;
}

export function continueAfterElimination(room: InternalRoomState): void {
  if (room.phase !== 'DAY_ELIMINATION') return;

  const winCheck = checkWinner(room.players);
  if (winCheck.winner) {
    finishGame(room, winCheck.winner, winCheck.reason!);
    return;
  }

  const elimPlayer = room.lastVoteElimination
    ? room.players.find((p) => p.id === room.lastVoteElimination!.playerId)
    : undefined;

  if (elimPlayer && elimPlayer.role === 'RIGHTEOUS_BOY') {
    room.phase = 'DAY_REVENGE';
    room.revengePlayerId = elimPlayer.id;
    room.revengeTriggerSource = 'DAY_VOTE';
    room.phaseEndsAt = Date.now() + 30 * 1000;
    room.chat.push(
      createSystemMessage(
        `اللاعب ${elimPlayer.name} هو «الولد الصالح»! يختار الآن لاعباً واحداً ليخرج معه.`
      )
    );
    return;
  }

  enterNightPhase(room, room.round + 1);
}

export function finishGame(room: InternalRoomState, winner: Team, reason: string): void {
  room.phase = 'GAME_OVER';
  room.winner = winner;
  room.winReason = reason;
  room.phaseEndsAt = null;
  room.chat.push(
    createSystemMessage(
      `${winner === 'RIGHTEOUS' ? 'انتصر فريق الصالحين!' : 'انتصر فريق المافيا!'} — ${reason}`
    )
  );
}

export function addChatMessage(
  room: InternalRoomState,
  playerId: string,
  text: string
): { ok: boolean; error?: string } {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, error: 'اللاعب غير موجود.' };
  if (room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER') {
    if (!player.isAlive) {
      return { ok: false, error: 'اللاعبون الذين خرجوا لا يمكنهم الإرسال أثناء اللعب.' };
    }
    if (player.isSilenced) {
      return { ok: false, error: 'أنت مُسكَّت في هذه الجولة ولا يمكنك إرسال رسائل.' };
    }
    if (room.phase === 'NIGHT') {
      if (player.team === 'MAFIA') {
        const clean = text.trim();
        if (!clean) return { ok: false, error: 'الرسالة فارغة.' };
        room.chat.push({
          id: createId('maf'),
          senderId: player.id,
          senderName: `${player.name} (همس المافيا)`,
          text: clean,
          timestamp: Date.now(),
          type: 'MAFIA_WHISPER',
        });
        return { ok: true };
      }
      return { ok: false, error: 'النقاش متاح في النهار فقط.' };
    }
  }

  const clean = text.trim();
  if (!clean) return { ok: false, error: 'الرسالة فارغة.' };

  room.chat.push({
    id: createId('msg'),
    senderId: player.id,
    senderName: player.name,
    text: clean.slice(0, 240),
    timestamp: Date.now(),
    type: 'CHAT',
  });
  return { ok: true };
}

export function runBotDayActions(room: InternalRoomState): boolean {
  let changed = false;

  if (room.phase === 'DAY_VOTING') {
    const living = room.players.filter((p) => p.isAlive);
    const botsWithoutVote = living.filter((p) => p.isBot && !room.votes[p.id]);
    if (botsWithoutVote.length > 0) {
      for (const bot of botsWithoutVote) {
        const validTargets = living.filter((t) => {
          if (t.id === bot.id) return false;
          if (bot.team === 'MAFIA' && t.team === 'MAFIA') return false;
          if (t.sheikhRevealed) return false;
          return true;
        });
        const pool = validTargets.length > 0 ? validTargets : living.filter((t) => t.id !== bot.id);
        if (pool.length > 0) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          room.votes[bot.id] = pick.id;
          changed = true;
        }
      }
    }
  } else if (room.phase === 'DAY_DEFENSE') {
    const accused = room.players.find((p) => p.id === room.accusedPlayerId);
    if (accused && accused.isBot) {
      // AI Sheikh reveals identity in Round 2+ automatically!
      if (
        accused.role === 'RIGHTEOUS_SHEIKH' &&
        room.round >= 2 &&
        !accused.sheikhAbilityUsed
      ) {
        useSheikhAbility(room, accused.id);
        return true;
      }

      if (!accused.isSilenced && !room.defenseSubmitted) {
        const isImportantRighteous =
          accused.role === 'RIGHTEOUS_MEDIC' ||
          accused.role === 'RIGHTEOUS_SNIPER' ||
          accused.role === 'RIGHTEOUS_BOY' ||
          accused.role === 'RIGHTEOUS_SHEIKH';
        const line = isImportantRighteous
          ? 'أنا مواطن صالح مهم جداً'
          : accused.team === 'MAFIA'
          ? Math.random() < 0.45
            ? 'أنا مواطن صالح مهم جداً'
            : 'أنا مواطن صالح'
          : 'أنا مواطن صالح';
        submitDefense(room, accused.id, line);
        changed = true;
      }
    }
  } else if (room.phase === 'DAY_TIE_RUNOFF') {
    const nonTiedAlive = room.players.filter(
      (p) => p.isAlive && !room.tiedCandidateIds.includes(p.id)
    );
    const eligibleVoters =
      nonTiedAlive.length > 0 ? nonTiedAlive : room.players.filter((p) => p.isAlive);

    for (const bot of eligibleVoters) {
      if (!bot.isBot || room.votes[bot.id]) continue;
      const candidatePool = room.tiedCandidateIds.filter((cid) => {
        const candidate = room.players.find((p) => p.id === cid);
        if (!candidate) return false;
        if (bot.team === 'MAFIA' && candidate.team === 'MAFIA') return false;
        return true;
      });
      const pool = candidatePool.length > 0 ? candidatePool : room.tiedCandidateIds;
      const pickId = pool[Math.floor(Math.random() * pool.length)];
      if (pickId) {
        room.votes[bot.id] = pickId;
        changed = true;
      }
    }
  }

  return changed;
}

export function maybePostBotChat(room: InternalRoomState): boolean {
  if (room.phase !== 'DAY_VOTING') return false;
  const silentOrSpeakingBots = room.players.filter(
    (p) => p.isAlive && p.isBot && !p.isSilenced
  );
  if (silentOrSpeakingBots.length === 0) return false;

  const bot = silentOrSpeakingBots[Math.floor(Math.random() * silentOrSpeakingBots.length)];
  const livingOthers = room.players.filter((p) => p.isAlive && p.id !== bot.id);
  const suspect = livingOthers[Math.floor(Math.random() * livingOthers.length)];
  if (!suspect) return false;

  const templates = [
    `أشعر أن تصرفات ${suspect.name} مريبة بعض الشيء في هذه الجولة.`,
    `دعونا لا نتسرع في التصويت، المافيا تحاول استغلال الشكوك بيننا.`,
    `أين مساهمات ${suspect.name}؟ الصمت الزائد أحياناً يخفي دوراً خطيراً.`,
    `إذا كان بيننا قناص، فعليه مراقبة الأصوات المتقلبة قبل استخدام رصاصته.`,
    `أعتقد أننا بحاجة لتوحيد أصواتنا على المشتبه به الأقوى بدلاً من تشتيتها.`,
  ];

  const text = templates[Math.floor(Math.random() * templates.length)];
  room.chat.push({
    id: createId('botmsg'),
    senderId: bot.id,
    senderName: bot.name,
    text,
    timestamp: Date.now(),
    type: 'CHAT',
  });
  return true;
}

export function sanitizeStateForPlayer(
  room: InternalRoomState,
  viewerId: string
): PublicGameState {
  const viewer = room.players.find((p) => p.id === viewerId);
  const viewerIsMafia = viewer?.team === 'MAFIA';
  const revealAll = room.phase === 'GAME_OVER';

  const sanitizedPlayers: Player[] = room.players.map((p) => {
    const canSeeRole =
      revealAll ||
      p.id === viewerId ||
      Boolean(p.sheikhRevealed) ||
      Boolean(p.roleRevealedPublicly) ||
      (viewerIsMafia && p.team === 'MAFIA');

    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      isHost: p.isHost,
      isAlive: p.isAlive,
      connected: p.connected,
      seatNumber: p.seatNumber,
      isSilenced: p.isSilenced,
      sheikhRevealed: p.sheikhRevealed,
      sheikhAbilityUsed: p.id === viewerId || revealAll ? p.sheikhAbilityUsed : undefined,
      roleRevealedPublicly: Boolean(p.roleRevealedPublicly),
      sniperHasBullet: p.id === viewerId || revealAll ? p.sniperHasBullet : undefined,
      eliminatedRound: p.eliminatedRound,
      eliminatedReason: p.eliminatedReason,
      role: canSeeRole ? p.role : undefined,
      team: canSeeRole ? p.team : undefined,
    };
  });

  // Filter Mafia whispers so only Mafia or Game Over sees them
  const visibleChat = room.chat.filter((msg) => {
    if (msg.type === 'MAFIA_WHISPER') {
      return revealAll || viewerIsMafia;
    }
    return true;
  });

  let myNightChoice: string | undefined;
  if (viewer?.role === 'MAFIA_BOSS') myNightChoice = room.nightActions.mafiaKillTargetId;
  if (viewer?.role === 'MAFIA_SILENCER') myNightChoice = room.nightActions.silencerTargetId;
  if (viewer?.role === 'RIGHTEOUS_MEDIC') myNightChoice = room.nightActions.medicHealTargetId;
  if (viewer?.role === 'RIGHTEOUS_SNIPER') myNightChoice = room.nightActions.sniperTargetId;

  const requiredNight = getRequiredNightRolePlayers(room);
  const pendingCount = requiredNight.filter(
    (p) => !room.nightSubmittedPlayerIds.includes(p.id)
  ).length;

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    round: room.round,
    phaseEndsAt: room.phaseEndsAt,
    dayDurationSec: room.dayDurationSec,
    nightDurationSec: room.nightDurationSec,
    players: sanitizedPlayers,
    readyPlayerIds: room.readyPlayerIds,
    votes: room.votes,
    accusedPlayerId: room.accusedPlayerId,
    defenseText: room.defenseText,
    defenseSubmitted: room.defenseSubmitted,
    tiedCandidateIds: room.tiedCandidateIds,
    tieRound: room.tieRound,
    revengePlayerId: room.revengePlayerId,
    revengeTriggerSource: room.revengeTriggerSource,
    winner: room.winner,
    winReason: room.winReason,
    lastDaySummary: room.lastDaySummary,
    lastVoteElimination: room.lastVoteElimination ?? null,
    chat: visibleChat.slice(-80),
    myPlayerId: viewerId,
    myNightSubmitted: room.nightSubmittedPlayerIds.includes(viewerId),
    myNightChoice,
    nightPendingRolesCount: pendingCount,
  };
}
