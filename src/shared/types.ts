export type Team = 'MAFIA' | 'RIGHTEOUS';

export type RoleId =
  | 'MAFIA_BOSS'
  | 'MAFIA_MEMBER'
  | 'MAFIA_SILENCER'
  | 'RIGHTEOUS_SHEIKH'
  | 'RIGHTEOUS_SNIPER'
  | 'RIGHTEOUS_MEDIC'
  | 'RIGHTEOUS_BOY'
  | 'RIGHTEOUS_CITIZEN';

export type GamePhase =
  | 'LOBBY'
  | 'ROLE_REVEAL'
  | 'NIGHT'
  | 'NIGHT_REVENGE'
  | 'DAY_VOTING'
  | 'DAY_DEFENSE'
  | 'DAY_FINAL_VOTE'
  | 'DAY_TIE_RUNOFF'
  | 'DAY_ELIMINATION'
  | 'DAY_REVENGE'
  | 'GAME_OVER';

export type ConnectionMode = 'ONLINE_ROOM' | 'OFFLINE_SOLO' | 'OFFLINE_PASS_PLAY';

export interface RoleDefinition {
  id: RoleId;
  name: string;
  team: Team;
  count: number;
  summary: string;
  abilityDetail: string;
  hasNightAction: boolean;
}

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  isAlive: boolean;
  connected: boolean;
  seatNumber: number;
  role?: RoleId;
  team?: Team;
  isSilenced: boolean;
  sheikhRevealed?: boolean;
  sheikhAbilityUsed?: boolean;
  roleRevealedPublicly?: boolean;
  sniperHasBullet?: boolean;
  eliminatedRound?: number;
  eliminatedReason?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  type: 'CHAT' | 'SYSTEM' | 'DEFENSE' | 'MAFIA_WHISPER';
}

export interface NightActions {
  mafiaKillTargetId?: string;
  silencerTargetId?: string;
  medicHealTargetId?: string;
  sniperTargetId?: string | 'SKIP';
}

export interface DaySummary {
  round: number;
  killedNames: string[];
  savedByMedic: boolean;
  silencedPlayerId?: string;
  silencedPlayerName?: string;
  sniperFired: boolean;
  sniperHitMafia?: boolean;
  events: string[];
}

export interface VoteEliminationSummary {
  round: number;
  playerId: string;
  playerName: string;
  role: RoleId;
  team: Team;
  seatNumber: number;
  voteCount: number;
}

export interface PublicGameState {
  roomCode: string;
  phase: GamePhase;
  round: number;
  phaseEndsAt: number | null;
  dayDurationSec: number;
  nightDurationSec: number;
  players: Player[];
  readyPlayerIds: string[];
  votes: Record<string, string>; // voterId -> targetId
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
  // Private to the viewing player (populated per client)
  myPlayerId: string;
  myNightSubmitted: boolean;
  myNightChoice?: string;
  nightPendingRolesCount: number;
}

export type ClientMessage =
  | { type: 'CREATE_ROOM'; playerName: string; dayDurationSec?: number }
  | { type: 'JOIN_ROOM'; roomCode: string; playerName: string; playerId?: string }
  | { type: 'RECONNECT'; roomCode: string; playerId: string }
  | { type: 'START_GAME' }
  | { type: 'MARK_ROLE_READY' }
  | { type: 'SUBMIT_NIGHT_ACTION'; targetId: string }
  | { type: 'CAST_VOTE'; targetId: string }
  | { type: 'WITHDRAW_VOTE' }
  | { type: 'CLOSE_VOTING' }
  | { type: 'SUBMIT_DEFENSE'; text: string }
  | { type: 'USE_SHEIKH_ABILITY' }
  | { type: 'FINALIZE_DEFENSE' }
  | { type: 'CONTINUE_AFTER_ELIMINATION' }
  | { type: 'SUBMIT_REVENGE'; targetId: string }
  | { type: 'SEND_CHAT'; text: string }
  | { type: 'PLAY_AGAIN' }
  | { type: 'UPDATE_SETTINGS'; dayDurationSec: number };

export type ServerMessage =
  | { type: 'ROOM_JOINED'; roomCode: string; playerId: string; state: PublicGameState }
  | { type: 'STATE_UPDATE'; state: PublicGameState }
  | { type: 'ERROR'; message: string };
