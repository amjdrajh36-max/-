import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Moon,
  Sun,
  Crosshair,
  HeartPulse,
  Skull,
  VolumeX,
  ShieldCheck,
  Send,
  CheckCircle2,
  RotateCcw,
  Eye,
  AlertTriangle,
  Gavel,
  Mic,
  Shield,
  Star,
} from 'lucide-react';
import { ROLES, getTeamLabel } from '../shared/roles';
import { ConnectionMode, Player, PublicGameState } from '../shared/types';
import { ROLE_IMAGES, SCENE_IMAGES, getRoleAccentClasses } from '../data/roleAssets';
import { SecretRoleCard } from './SecretRoleCard';
import { soundFx } from '../utils/sound';
import { VoiceManagerSnapshot } from '../firebase/voiceChatManager';
import { VoiceChatBar } from './VoiceChatBar';

const QUICK_CHAT_PHRASES = [
  'أنا مواطن صالح',
  'صوّتوا بحذر',
  'راقبوا من يغيّر صوته',
  'لديّ شكوك قوية',
];

interface GameBoardProps {
  state: PublicGameState;
  mode: ConnectionMode;
  isHost: boolean;
  voice?: VoiceManagerSnapshot;
  onToggleMic?: () => void;
  onToggleSpeaker?: () => void;
  onLeaveVoice?: () => void;
  localHumans?: Player[];
  onSwitchLocalHuman?: (playerId: string) => void;
  onMarkReady: () => void;
  onSubmitNightAction: (targetId: string) => void;
  onCastVote: (targetId: string) => void;
  onWithdrawVote: () => void;
  onCloseVoting: () => void;
  onSubmitDefense: (text: string) => void;
  onUseSheikhAbility: () => void;
  onFinalizeDefense: () => void;
  onContinueAfterElimination: () => void;
  onSubmitRevenge: (targetId: string) => void;
  onSendChat: (text: string) => void;
}

export function GameBoard({
  state,
  mode,
  isHost,
  voice,
  onToggleMic,
  onToggleSpeaker,
  onLeaveVoice,
  localHumans = [],
  onSwitchLocalHuman,
  onMarkReady,
  onSubmitNightAction,
  onCastVote,
  onWithdrawVote,
  onCloseVoting,
  onSubmitDefense,
  onUseSheikhAbility,
  onFinalizeDefense,
  onContinueAfterElimination,
  onSubmitRevenge,
  onSendChat,
}: GameBoardProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [chatText, setChatText] = useState('');
  const [defenseInput, setDefenseInput] = useState('');
  const [privacyUnlockedFor, setPrivacyUnlockedFor] = useState<string | null>(null);
  const [showRoleDrawer, setShowRoleDrawer] = useState(false);
  const prevPhaseRef = useRef(state.phase);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const me = useMemo(
    () => state.players.find((p) => p.id === state.myPlayerId)!,
    [state.players, state.myPlayerId]
  );

  // Sound cues on phase transition
  useEffect(() => {
    if (prevPhaseRef.current !== state.phase) {
      if (state.phase === 'NIGHT') soundFx.playNightStart();
      else if (state.phase === 'DAY_VOTING') soundFx.playDayStart();
      else if (
        state.phase === 'DAY_ELIMINATION' ||
        state.phase === 'NIGHT_REVENGE' ||
        state.phase === 'DAY_REVENGE'
      )
        soundFx.playElimination();
      prevPhaseRef.current = state.phase;
      setPrivacyUnlockedFor(null);
    }
  }, [state.phase]);

  // Countdown timer
  useEffect(() => {
    const update = () => {
      if (!state.phaseEndsAt) {
        setSecondsLeft(0);
        return;
      }
      const diff = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const id = window.setInterval(update, 500);
    return () => clearInterval(id);
  }, [state.phaseEndsAt]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chat.length]);

  const isNight = state.phase === 'NIGHT' || state.phase === 'NIGHT_REVENGE';
  const aliveCount = state.players.filter((p) => p.isAlive).length;

  // Vote tallies and voter names per target
  const voteMap = useMemo(() => {
    const map: Record<string, Player[]> = {};
    for (const [voterId, targetId] of Object.entries(state.votes)) {
      const voter = state.players.find((p) => p.id === voterId);
      if (voter) {
        if (!map[targetId]) map[targetId] = [];
        map[targetId].push(voter);
      }
    }
    return map;
  }, [state.votes, state.players]);

  const myCurrentVoteTargetId = state.votes[me.id];

  // Check if voting is currently open for `me`
  const nonTiedAlive = state.players.filter(
    (p) => p.isAlive && !state.tiedCandidateIds.includes(p.id)
  );
  const canVoteInRunoff =
    state.phase === 'DAY_TIE_RUNOFF' &&
    me.isAlive &&
    (nonTiedAlive.length === 0 || !state.tiedCandidateIds.includes(me.id));

  const canVoteNow =
    me.isAlive &&
    (state.phase === 'DAY_VOTING' ||
      state.phase === 'DAY_FINAL_VOTE' ||
      canVoteInRunoff);

  // Night role eligibility
  const myRoleHasNightAction =
    me.isAlive &&
    (me.role === 'MAFIA_BOSS' ||
      me.role === 'MAFIA_SILENCER' ||
      me.role === 'RIGHTEOUS_MEDIC' ||
      (me.role === 'RIGHTEOUS_SNIPER' && Boolean(me.sniperHasBullet)));

  // Pass & Play privacy guard for ROLE_REVEAL and NIGHT
  const needsPassPlayPrivacyLock =
    mode === 'OFFLINE_PASS_PLAY' &&
    localHumans.length > 1 &&
    (state.phase === 'ROLE_REVEAL' || (state.phase === 'NIGHT' && myRoleHasNightAction && !state.myNightSubmitted)) &&
    privacyUnlockedFor !== `${state.phase}_${state.round}_${me.id}`;

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendChat(chatText.trim());
    setChatText('');
  };

  const handleDefenseForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!defenseInput.trim()) return;
    onSubmitDefense(defenseInput.trim());
    setDefenseInput('');
  };

  const canSendChat =
    me.isAlive &&
    !me.isSilenced &&
    (state.phase === 'DAY_VOTING' ||
      state.phase === 'DAY_DEFENSE' ||
      state.phase === 'DAY_FINAL_VOTE' ||
      state.phase === 'DAY_TIE_RUNOFF' ||
      (state.phase === 'NIGHT' && me.team === 'MAFIA'));

  const phaseTitle = (() => {
    switch (state.phase) {
      case 'ROLE_REVEAL':
        return 'توزيع البطاقات السرية';
      case 'NIGHT':
        return `الليل — الجولة ${state.round}`;
      case 'NIGHT_REVENGE':
        return 'اختيار الولد الصالح';
      case 'DAY_VOTING':
        return `النهار — النقاش والتصويت (الجولة ${state.round})`;
      case 'DAY_DEFENSE':
        return 'فرصة التبرير والدفاع';
      case 'DAY_FINAL_VOTE':
        return 'التصويت النهائي بعد التبرير';
      case 'DAY_TIE_RUNOFF':
        return `التصويت الداخلي للتعادل (إعادة #${state.tieRound})`;
      case 'DAY_ELIMINATION':
        return 'نتيجة التصويت — كشف البطاقة';
      case 'DAY_REVENGE':
        return 'اختيار الولد الصالح';
      default:
        return 'مجريات اللعبة';
    }
  })();

  const accusedPlayer = state.accusedPlayerId
    ? state.players.find((p) => p.id === state.accusedPlayerId)
    : null;

  const canSheikhReveal =
    me.id === state.accusedPlayerId &&
    me.role === 'RIGHTEOUS_SHEIKH' &&
    me.isAlive &&
    state.round >= 2 &&
    !me.sheikhAbilityUsed &&
    (state.phase === 'DAY_DEFENSE' || state.phase === 'DAY_FINAL_VOTE');

  const totalPhaseSec = useMemo(() => {
    if (state.phase === 'NIGHT') return state.nightDurationSec || 35;
    if (state.phase === 'DAY_VOTING') return state.dayDurationSec || 90;
    if (state.phase === 'DAY_DEFENSE') return 35;
    if (state.phase === 'DAY_FINAL_VOTE') return 25;
    if (state.phase === 'DAY_TIE_RUNOFF') return 40;
    if (state.phase === 'DAY_ELIMINATION') return 8;
    if (state.phase === 'NIGHT_REVENGE' || state.phase === 'DAY_REVENGE') return 30;
    return 0;
  }, [state.phase, state.dayDurationSec, state.nightDurationSec]);

  const timerProgress =
    totalPhaseSec > 0 && state.phaseEndsAt
      ? Math.max(0, Math.min(1, secondsLeft / totalPhaseSec))
      : 0;

  const topVoteSummary = useMemo(() => {
    const entries = Object.entries(voteMap);
    if (entries.length === 0) return null;
    let maxVotes = 0;
    let leaders: Player[] = [];
    for (const [targetId, voters] of entries) {
      const target = state.players.find((p) => p.id === targetId);
      if (!target) continue;
      if (voters.length > maxVotes) {
        maxVotes = voters.length;
        leaders = [target];
      } else if (voters.length === maxVotes) {
        leaders.push(target);
      }
    }
    if (leaders.length === 0) return null;
    return { leaders, maxVotes };
  }, [voteMap, state.players]);

  const myNightTargetLabel = useMemo(() => {
    if (!state.myNightChoice) return null;
    if (state.myNightChoice === 'SKIP') return 'الاحتفاظ بالطلقة وعدم الإطلاق';
    return state.players.find((p) => p.id === state.myNightChoice)?.name || null;
  }, [state.myNightChoice, state.players]);

  return (
    <div
      className={`min-h-[calc(100vh-3.5rem)] transition-colors duration-500 ${
        isNight ? 'bg-[#090D16]' : 'bg-[#101624]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {mode === 'ONLINE_ROOM' && voice && onToggleMic && onToggleSpeaker && onLeaveVoice && (
          <VoiceChatBar
            voice={voice}
            onToggleMic={onToggleMic}
            onToggleSpeaker={onToggleSpeaker}
            onLeaveVoice={onLeaveVoice}
          />
        )}

        {/* Phase Status Header with Atmospheric Scene Artwork */}
        <section
          className={`relative rounded-2xl border overflow-hidden ${
            isNight
              ? 'bg-[#0E1422] border-indigo-500/30 shadow-[0_12px_40px_-15px_rgba(79,70,229,0.25)]'
              : 'bg-[#171F30] border-amber-500/25 shadow-[0_12px_40px_-15px_rgba(245,158,11,0.18)]'
          }`}
        >
          <img
            src={isNight ? SCENE_IMAGES.NIGHT : SCENE_IMAGES.DAY}
            alt={isNight ? 'المدينة في الليل' : 'مجلس المدينة في النهار'}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-35 transition-opacity duration-500"
          />
          <div
            className={`absolute inset-0 ${
              isNight
                ? 'bg-gradient-to-l from-[#090D16]/95 via-[#0F1627]/85 to-[#090D16]/70'
                : 'bg-gradient-to-l from-[#101624]/95 via-[#171F30]/80 to-[#101624]/65'
            }`}
          />

          <div className="relative p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${state.phase}_${state.round}_${state.tieRound}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="flex items-center gap-3.5"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                    isNight
                      ? 'bg-indigo-500/20 border-indigo-400/30 text-indigo-200'
                      : 'bg-amber-500/20 border-amber-400/30 text-amber-300'
                  }`}
                >
                  {isNight ? <Moon className="w-6 h-6" /> : <Sun className="w-6 h-6" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="font-bold text-white">{me.name}</span>
                    <span className="text-slate-500">·</span>
                    <span className={me.isAlive ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      {me.isAlive ? 'على قيد الحياة' : 'خارج اللعب'}
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="tabular-nums">
                      الأحياء: {aliveCount} / {state.players.length}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                    {phaseTitle}
                  </h1>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap items-center gap-3">
              {state.phase !== 'ROLE_REVEAL' && (
                <button
                  type="button"
                  onClick={() => setShowRoleDrawer((v) => !v)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0B0F17]/80 hover:bg-white/10 border border-white/15 text-xs font-bold text-amber-300 flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Eye className="w-4 h-4" />
                  <span>{showRoleDrawer ? 'إخفاء بطاقتي' : 'بطاقتي السرية'}</span>
                </button>
              )}
              {state.phaseEndsAt && (
                <div className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0B0F17]/90 border border-white/15 flex items-center gap-2">
                  <span className="text-xs text-slate-300">الوقت المتبقي</span>
                  <span
                    className={`font-mono text-base font-bold tabular-nums ${
                      secondsLeft <= 10 ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {secondsLeft}ث
                  </span>
                </div>
              )}
            </div>
          </div>

          {state.phaseEndsAt && totalPhaseSec > 0 && (
            <div className="relative h-1.5 w-full bg-white/10 overflow-hidden">
              <div
                className={`h-full origin-right transition-transform duration-500 ${
                  secondsLeft <= 10
                    ? 'bg-red-500'
                    : isNight
                    ? 'bg-indigo-400'
                    : 'bg-amber-400'
                }`}
                style={{ transform: `scaleX(${timerProgress})` }}
              />
            </div>
          )}
        </section>

        {/* Pass & Play Active Player Switcher (During Day / Voting) */}
        {mode === 'OFFLINE_PASS_PLAY' &&
          localHumans.length > 1 &&
          state.phase !== 'ROLE_REVEAL' &&
          state.phase !== 'NIGHT' &&
          onSwitchLocalHuman && (
            <section className="rounded-2xl border border-amber-500/25 bg-[#151C2B] p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-bold text-amber-300">
                تبديل اللاعب النشط على الهاتف:
              </div>
              <div className="flex flex-wrap gap-2">
                {localHumans.map((hp) => (
                  <button
                    key={hp.id}
                    type="button"
                    onClick={() => onSwitchLocalHuman(hp.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      hp.id === me.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-[#0B0F17] text-slate-300 border-white/10 hover:text-white'
                    }`}
                  >
                    {hp.name} {!hp.isAlive ? '(خرج)' : ''}
                  </button>
                ))}
              </div>
            </section>
          )}

        {/* Collapsible Secret Role Card during active game */}
        <AnimatePresence>
          {showRoleDrawer && state.phase !== 'ROLE_REVEAL' && (
            <motion.div
              key="secret-role-drawer"
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <SecretRoleCard me={me} allPlayers={state.players} defaultRevealed={true} compact={true} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Silenced Banner if `me` is silenced */}
        <AnimatePresence>
          {me.isAlive && me.isSilenced && !isNight && (
            <motion.div
              key="silenced-banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 flex items-center gap-3 text-red-200 text-sm"
            >
              <VolumeX className="w-5 h-5 text-red-400 shrink-0" />
              <p>
                <strong>تم إسكاتك في هذه الجولة:</strong> اختارك «مافيا التسكيت» لتكميم صوتك اليوم، لا يمكنك إرسال رسائل أو تبرير نفسك حتى الليل القادم.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dawn Summary Banner */}
        <AnimatePresence>
          {state.lastDaySummary &&
            state.lastDaySummary.round === state.round &&
            state.phase === 'DAY_VOTING' && (
              <motion.section
                key={`dawn-summary-${state.round}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="rounded-2xl border border-white/10 bg-[#151C2B] p-4 sm:p-5 space-y-2"
              >
                <p className="text-xs font-bold text-amber-400">تقرير فجر الجولة {state.round}</p>
                <ul className="space-y-1 text-sm text-slate-200">
                  {state.lastDaySummary.events.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </motion.section>
            )}
        </AnimatePresence>

        {/* ROLE REVEAL VIEW */}
        {state.phase === 'ROLE_REVEAL' ? (
          <motion.section
            key="phase-role-reveal"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="max-w-xl mx-auto space-y-5 py-4"
          >
            {needsPassPlayPrivacyLock ? (
              <div className="rounded-2xl border border-amber-500/30 bg-[#151C2B] p-8 text-center space-y-4">
                <p className="text-xs font-bold text-amber-400">خصوصية البطاقة السرية</p>
                <h2 className="text-2xl font-extrabold text-white">مرر الهاتف إلى: {me.name}</h2>
                <p className="text-sm text-slate-300">
                  تأكد من عدم نظر الآخرين إلى الشاشة قبل كشف بطاقتك السرية.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setPrivacyUnlockedFor(`${state.phase}_${state.round}_${me.id}`)
                  }
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm transition-colors"
                >
                  أنا {me.name} — أظهر بطاقتي
                </button>
              </div>
            ) : (
              <>
                <SecretRoleCard me={me} allPlayers={state.players} />
                <div className="rounded-2xl border border-white/10 bg-[#151C2B] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-sm text-slate-300">
                    <span className="font-bold text-white">جاهزية اللاعبين: </span>
                    <span className="tabular-nums">
                      {state.readyPlayerIds.length} / {state.players.length}
                    </span>
                  </div>
                  {state.readyPlayerIds.includes(me.id) ? (
                    <span className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      تم تأكيد جاهزيتك — بانتظار البقية
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={onMarkReady}
                      className="min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm transition-colors whitespace-nowrap"
                    >
                      فهمت دوري — جاهز للبدء
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.section>
        ) : (
          /* ACTIVE PLAY: 2-COLUMN DESKTOP LAYOUT */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Right Column (7 cols): Context Action + 15-Player Table */}
            <div className="lg:col-span-7 space-y-5">
              <AnimatePresence mode="wait">
                {/* NIGHT ACTION / PASS-PLAY PRIVACY */}
                {state.phase === 'NIGHT' && (
                  <motion.section
                    key={`night-panel-${state.round}-${state.myNightSubmitted ? 'done' : 'open'}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="rounded-2xl border border-indigo-400/20 bg-[#121828] p-5 space-y-4"
                  >
                  {needsPassPlayPrivacyLock ? (
                    <div className="text-center space-y-4 py-4">
                      <p className="text-xs font-bold text-indigo-300">دور ليلي سري</p>
                      <h2 className="text-xl font-extrabold text-white">مرر الهاتف إلى: {me.name}</h2>
                      <button
                        type="button"
                        onClick={() =>
                          setPrivacyUnlockedFor(`${state.phase}_${state.round}_${me.id}`)
                        }
                        className="min-h-[46px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm"
                      >
                        أنا {me.name} — فتح مهمتي الليلية
                      </button>
                    </div>
                  ) : myRoleHasNightAction ? (
                    state.myNightSubmitted ? (
                      <div className="flex items-start gap-3 text-emerald-300 text-sm py-2">
                        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p>
                            تم تسجيل قرارك الليلي بنجاح. في انتظار بقية أصحاب الأدوار الليلية ({state.nightPendingRolesCount} متبقٍ).
                          </p>
                          {myNightTargetLabel && (
                            <p className="text-xs text-slate-300">
                              اختيارك المسجّل: <strong className="text-white">{myNightTargetLabel}</strong>
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <NightActionPanel
                        me={me}
                        players={state.players}
                        onSubmit={onSubmitNightAction}
                      />
                    )
                  ) : (
                    <div className="py-3 space-y-1 text-center">
                      <p className="text-base font-bold text-slate-100">
                        المدينة نائمة الآن...
                      </p>
                      <p className="text-sm text-slate-400">
                        {me.isAlive
                          ? me.team === 'MAFIA'
                            ? 'ينفذ شيخ المافيا ومافيا التسكيت مهامهما الآن، يمكنك الهمس مع فريقك في المحادثة.'
                            : 'ينفذ أصحاب القدرات الليلية أدوارهم سراً، انتظر إشراقة الصباح.'
                          : 'أنت خارج اللعبة وتتابع الأحداث بصمت.'}
                      </p>
                    </div>
                  )}
                </motion.section>
              )}

              {/* VOTE ELIMINATION CARD REVEAL */}
              {state.phase === 'DAY_ELIMINATION' && state.lastVoteElimination && (() => {
                const elim = state.lastVoteElimination;
                const roleDef = ROLES[elim.role];
                const accent = getRoleAccentClasses(elim.role);
                const imgSrc = ROLE_IMAGES[elim.role];
                const isMafia = elim.team === 'MAFIA';
                return (
                  <motion.section
                    key={`elim-reveal-${elim.playerId}-${elim.round}`}
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.97 }}
                    transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                    className={`rounded-2xl border overflow-hidden ${
                      isMafia
                        ? 'bg-gradient-to-b from-red-950/75 via-[#151C2B] to-[#0E1320] border-red-500/50 shadow-[0_20px_50px_-15px_rgba(239,68,68,0.35)]'
                        : 'bg-gradient-to-b from-amber-950/60 via-[#151C2B] to-[#0E1320] border-amber-500/50 shadow-[0_20px_50px_-15px_rgba(245,158,11,0.3)]'
                    }`}
                  >
                    <div className="p-5 sm:p-7 flex flex-col sm:flex-row items-center gap-6">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.85, rotate: -2 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        transition={{ duration: 0.4, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className={`relative w-40 h-40 sm:w-48 sm:h-48 rounded-2xl border-2 overflow-hidden shrink-0 bg-gradient-to-br ${accent.gradient} ${accent.border} shadow-2xl`}
                      >
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={`${elim.playerName} — ${roleDef.name}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Skull className="w-12 h-12" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      </motion.div>

                      <div className="flex-1 text-center sm:text-right space-y-2.5 min-w-0">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs text-slate-300">
                          <span className="font-bold text-red-400">خرج بتصويت المدينة</span>
                          <span className="text-slate-600">·</span>
                          <span className="tabular-nums">الجولة {elim.round}</span>
                          <span className="text-slate-600">·</span>
                          <span className="tabular-nums">{elim.voteCount} صوت</span>
                        </div>

                        <div className="space-y-1">
                          <h2 className="text-2xl sm:text-3xl font-extrabold text-white truncate">
                            {elim.playerName}
                          </h2>
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-base sm:text-lg font-extrabold">
                            <span className="text-slate-300">الكرت:</span>
                            <span className={accent.text}>{roleDef.name}</span>
                            <span className="text-slate-600 text-sm">·</span>
                            <span className="text-sm font-bold text-slate-300">
                              {getTeamLabel(elim.team)}
                            </span>
                          </div>
                        </div>

                        <p className="text-sm text-slate-300 leading-relaxed">
                          {roleDef.summary}
                        </p>

                        {(isHost || mode === 'OFFLINE_SOLO' || mode === 'OFFLINE_PASS_PLAY') && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={onContinueAfterElimination}
                              className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-colors whitespace-nowrap"
                            >
                              متابعة للمرحلة التالية ({secondsLeft}ث)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.section>
                );
              })()}

              {/* REVENGE PANEL (Righteous Boy) */}
              {(state.phase === 'NIGHT_REVENGE' || state.phase === 'DAY_REVENGE') && (
                <motion.section
                  key={`revenge-panel-${state.phase}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="rounded-2xl border border-red-500/35 bg-red-950/30 p-5 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h2 className="text-lg font-extrabold text-white">قدرة الولد الصالح</h2>
                      <p className="text-sm text-slate-200 mt-1">
                        {state.revengePlayerId === me.id
                          ? 'لقد خرجت من اللعبة! اختر الآن لاعباً واحداً ليخرج معك فوراً.'
                          : `يختار اللاعب (${
                              state.players.find((p) => p.id === state.revengePlayerId)?.name || 'الولد الصالح'
                            }) لاعباً ليصطحبه معه.`}
                      </p>
                    </div>
                  </div>
                  {state.revengePlayerId === me.id && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {state.players
                        .filter((p) => p.isAlive)
                        .map((target) => (
                          <button
                            key={target.id}
                            type="button"
                            onClick={() => onSubmitRevenge(target.id)}
                            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition-colors"
                          >
                            إخراج {target.name}
                          </button>
                        ))}
                    </div>
                  )}
                </motion.section>
              )}

              {/* DEFENSE PANEL */}
              {state.phase === 'DAY_DEFENSE' && accusedPlayer && (
                <motion.section
                  key={`defense-panel-${accusedPlayer.id}-${Boolean(state.defenseText)}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="rounded-2xl border border-amber-500/35 bg-[#192033] p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold text-amber-400">فرصة التبرير الوحيدة</p>
                      <h2 className="text-xl font-extrabold text-white mt-0.5">
                        المُتّهم الأعلى أصواتاً: {accusedPlayer.name}
                      </h2>
                    </div>
                    <Gavel className="w-6 h-6 text-amber-400 shrink-0" />
                  </div>

                  {accusedPlayer.isSilenced ? (
                    <p className="text-sm text-red-300">
                      هذا اللاعب مُسكَّت في هذه الجولة ولا يمكنه تقديم تبرير.
                    </p>
                  ) : state.defenseText ? (
                    <div className="p-4 rounded-xl bg-[#0B0F17] border border-amber-400/30 text-slate-100 space-y-1.5">
                      <p className="text-xs text-amber-400 font-bold">بيان الدفاع المختار:</p>
                      <p className="text-base font-extrabold text-white leading-relaxed">
                        «{state.defenseText}»
                      </p>
                    </div>
                  ) : accusedPlayer.id === me.id ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-300">
                          اختر رسالة التبرير أمام الجميع:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              soundFx.playDefense();
                              onSubmitDefense('أنا مواطن صالح');
                            }}
                            className="min-h-[54px] p-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                          >
                            <Shield className="w-4 h-4 shrink-0" />
                            <span>أنا مواطن صالح</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              soundFx.playDefense();
                              onSubmitDefense('أنا مواطن صالح مهم جداً');
                            }}
                            className="min-h-[54px] p-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                          >
                            <Star className="w-4 h-4 shrink-0" />
                            <span>أنا مواطن صالح مهم جداً</span>
                          </button>
                        </div>
                      </div>

                      <form
                        onSubmit={(e) => {
                          soundFx.playDefense();
                          handleDefenseForm(e);
                        }}
                        className="pt-3 border-t border-white/10 space-y-2"
                      >
                        <label
                          htmlFor="customDefense"
                          className="block text-xs text-slate-400"
                        >
                          أو اكتب تبريراً إضافياً بكلماتك:
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            id="customDefense"
                            type="text"
                            maxLength={220}
                            autoComplete="off"
                            data-lpignore="true"
                            value={defenseInput}
                            onChange={(e) => setDefenseInput(e.target.value)}
                            placeholder="اكتب تبريرك المخصص..."
                            className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#0B0F17] border border-white/15 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                          />
                          <button
                            type="submit"
                            disabled={!defenseInput.trim()}
                            className="min-h-[44px] px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white font-bold text-xs whitespace-nowrap"
                          >
                            إرسال التبرير
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">
                      في انتظار {accusedPlayer.name} لاختيار تبريره («أنا مواطن صالح» أو «أنا مواطن صالح مهم جداً»)...
                    </p>
                  )}

                  {canSheikhReveal && (
                    <button
                      type="button"
                      onClick={onUseSheikhAbility}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      <span>كشف هويتي كـ «شيخ الصالحين» وسحب الأصوات عني</span>
                    </button>
                  )}

                  {(isHost || accusedPlayer.id === me.id) && (
                    <button
                      type="button"
                      onClick={onFinalizeDefense}
                      className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors"
                    >
                      إنهاء التبرير والانتقال للتصويت النهائي
                    </button>
                  )}
                </motion.section>
              )}

              {/* VOTING & TIE RUNOFF CONTROL BAR */}
              {(state.phase === 'DAY_VOTING' ||
                state.phase === 'DAY_FINAL_VOTE' ||
                state.phase === 'DAY_TIE_RUNOFF') && (
                <motion.section
                  key={`voting-bar-${state.phase}-${state.tieRound}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="rounded-2xl border border-white/10 bg-[#161E2F] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    {state.phase === 'DAY_TIE_RUNOFF' ? (
                      <>
                        <p className="text-sm font-bold text-amber-400">
                          تصويت داخلي على المتعادلين (الجولة #{state.tieRound})
                        </p>
                        <p className="text-xs text-slate-300">
                          {canVoteInRunoff
                            ? 'اختر أحد المتعادلين من الطاولة أدناه. يستمر التكرار حتى يخرج لاعب واحد.'
                            : 'يصوّت بقية اللاعبين غير المتعادلين فقط في هذه الجولة.'}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-white">
                          {myCurrentVoteTargetId
                            ? `صوتك الحالي موجّه ضد: ${
                                state.players.find((p) => p.id === myCurrentVoteTargetId)?.name
                              }`
                            : 'اضغط على أي لاعب حي لتوجيه صوتك ضده'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {topVoteSummary
                            ? topVoteSummary.leaders.length === 1
                              ? `الأعلى أصواتاً حالياً: ${topVoteSummary.leaders[0].name} (${topVoteSummary.maxVotes})`
                              : `تعادل حالي (${topVoteSummary.maxVotes} أصوات): ${topVoteSummary.leaders
                                  .map((l) => l.name)
                                  .join(' و ')}`
                            : 'التصويت علني ويمكنك تغيير صوتك أو سحبه في أي وقت.'}
                        </p>
                      </>
                    )}
                    {canSheikhReveal && (
                      <button
                        type="button"
                        onClick={onUseSheikhAbility}
                        className="mt-2 min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>كشف هويتي كشيخ الصالحين وسحب الأصوات</span>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canVoteNow && myCurrentVoteTargetId && (
                      <button
                        type="button"
                        onClick={() => {
                          soundFx.playVote();
                          onWithdrawVote();
                        }}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 font-bold text-xs flex items-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>سحب صوتي</span>
                      </button>
                    )}
                    {(isHost || mode === 'OFFLINE_SOLO') && (
                      <button
                        type="button"
                        onClick={
                          state.phase === 'DAY_FINAL_VOTE'
                            ? onFinalizeDefense
                            : onCloseVoting
                        }
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap"
                      >
                        {state.phase === 'DAY_FINAL_VOTE'
                          ? 'اعتماد النتيجة النهائية'
                          : 'إغلاق التصويت الآن'}
                      </button>
                    )}
                  </div>
                </motion.section>
              )}
              </AnimatePresence>

              {/* 15-PLAYER CIRCLE / GRID */}
              <section className="rounded-2xl border border-white/10 bg-[#131926] p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">
                    طاولة اللاعبين ({state.players.length} لاعباً)
                  </h2>
                  <span className="text-xs text-slate-400 tabular-nums">
                    إجمالي الأصوات: {Object.keys(state.votes).length}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {state.players.map((p, idx) => {
                    const voters = voteMap[p.id] || [];
                    const isMyVote = myCurrentVoteTargetId === p.id;
                    const isTiedCandidate =
                      state.phase === 'DAY_TIE_RUNOFF' &&
                      state.tiedCandidateIds.includes(p.id);

                    const canClickToVote =
                      canVoteNow &&
                      p.isAlive &&
                      (state.phase !== 'DAY_TIE_RUNOFF' || isTiedCandidate);

                    const showSeatRole =
                      Boolean(p.role) &&
                      (p.sheikhRevealed || p.roleRevealedPublicly || (p.id !== me.id && p.team === 'MAFIA'));
                    const showSeatThumb =
                      Boolean(p.role && ROLE_IMAGES[p.role]) &&
                      (p.roleRevealedPublicly || p.sheikhRevealed);

                    return (
                      <motion.div
                        key={p.id}
                        layout="position"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.22,
                          delay: Math.min(idx * 0.018, 0.22),
                          ease: 'easeOut',
                        }}
                        className={`rounded-xl border p-3.5 transition-colors flex flex-col justify-between gap-2.5 ${
                          !p.isAlive
                            ? 'bg-[#0B0F17]/50 border-white/5 opacity-75'
                            : isMyVote
                            ? 'bg-amber-500/10 border-amber-400'
                            : isTiedCandidate
                            ? 'bg-red-950/25 border-red-400/50'
                            : 'bg-[#1A2233] border-white/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            {showSeatThumb && p.role && ROLE_IMAGES[p.role] && (
                              <motion.img
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.25 }}
                                src={ROLE_IMAGES[p.role]}
                                alt={`${p.name} — ${ROLES[p.role].name}`}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-lg object-cover border border-white/15 shrink-0"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-mono text-slate-500 tabular-nums">
                                  #{p.seatNumber}
                                </span>
                                <span className="font-bold text-slate-100 truncate">
                                  {p.name}
                                </span>
                                {p.id === me.id && (
                                  <span className="text-xs font-bold text-amber-400">(أنت)</span>
                                )}
                                {voice?.peers[p.id]?.micEnabled && (
                                  <Mic
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      voice.peers[p.id].speaking
                                        ? 'text-emerald-400'
                                        : 'text-slate-400'
                                    }`}
                                  />
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                <span>{p.isAlive ? 'نشط' : 'خرج'}</span>
                                {state.accusedPlayerId === p.id &&
                                  (state.phase === 'DAY_DEFENSE' || state.phase === 'DAY_FINAL_VOTE') && (
                                    <>
                                      <span>·</span>
                                      <span className="text-amber-400 font-bold">في قفص الاتهام</span>
                                    </>
                                  )}
                                {p.isSilenced && p.isAlive && (
                                  <>
                                    <span>·</span>
                                    <span className="text-red-400 font-bold">مُسكَّت</span>
                                  </>
                                )}
                                {showSeatRole && p.role && (
                                  <>
                                    <span>·</span>
                                    <span
                                      className={`font-bold ${
                                        p.team === 'MAFIA'
                                          ? 'text-red-400'
                                          : p.sheikhRevealed
                                          ? 'text-emerald-400'
                                          : 'text-amber-400'
                                      }`}
                                    >
                                      {ROLES[p.role].name}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {voters.length > 0 && (
                              <span className="text-sm font-mono font-bold text-amber-400 tabular-nums">
                                {voters.length} صوت
                              </span>
                            )}
                            {canClickToVote && (
                              <button
                                type="button"
                                onClick={() => {
                                  soundFx.playVote();
                                  if (isMyVote) onWithdrawVote();
                                  else onCastVote(p.id);
                                }}
                                className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                                  isMyVote
                                    ? 'bg-amber-500 text-slate-950'
                                    : 'bg-white/10 hover:bg-amber-500 hover:text-slate-950 text-white'
                                }`}
                              >
                                {isMyVote ? 'سحب' : 'تصويت'}
                              </button>
                            )}
                          </div>
                        </div>

                        {voters.length > 0 && (
                          <p className="text-xs text-slate-300 border-t border-white/10 pt-2">
                            صوّت له: {voters.map((v) => v.name).join('، ')}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Left Column (5 cols): Live Discussion & Narrative Feed */}
            <aside className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#131926] flex flex-col h-[520px] lg:h-[650px] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-base font-bold text-white">مجلس النقاش والأحداث</h2>
                <span className="text-xs text-slate-400">
                  {state.phase === 'NIGHT' && me.team === 'MAFIA'
                    ? 'همس المافيا السري'
                    : 'سجل مباشر'}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {state.chat.map((msg) => {
                  if (msg.type === 'SYSTEM') {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                        className="p-3 rounded-xl bg-white/[0.04] border border-white/5 text-xs sm:text-sm text-slate-300 leading-relaxed"
                      >
                        <span className="text-amber-400 font-bold ml-1.5">الراوي:</span>
                        <span>{msg.text}</span>
                      </motion.div>
                    );
                  }
                  if (msg.type === 'DEFENSE') {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                        className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-100 space-y-1"
                      >
                        <p className="text-xs font-bold text-amber-400">
                          تبرير {msg.senderName}:
                        </p>
                        <p>{msg.text}</p>
                      </motion.div>
                    );
                  }
                  if (msg.type === 'MAFIA_WHISPER') {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                        className="p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-sm text-red-100 space-y-0.5"
                      >
                        <p className="text-xs font-bold text-red-400">{msg.senderName}</p>
                        <p>{msg.text}</p>
                      </motion.div>
                    );
                  }
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      className={`p-3 rounded-xl border text-sm space-y-0.5 ${
                        msg.senderId === me.id
                          ? 'bg-amber-500/10 border-amber-500/20 text-slate-100'
                          : 'bg-[#1A2233] border-white/5 text-slate-200'
                      }`}
                    >
                      <p className="text-xs font-bold text-amber-400">{msg.senderName}</p>
                      <p className="leading-relaxed">{msg.text}</p>
                    </motion.div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {canSendChat && state.phase !== 'NIGHT' && (
                <div className="px-3 pt-2.5 pb-1 border-t border-white/10 bg-[#0E1420] flex flex-wrap gap-1.5">
                  {QUICK_CHAT_PHRASES.map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => onSendChat(phrase)}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-amber-500 hover:text-slate-950 border border-white/10 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={handleChatSubmit}
                className={`p-3 ${
                  canSendChat && state.phase !== 'NIGHT' ? '' : 'border-t border-white/10'
                } bg-[#0E1420] flex items-center gap-2`}
              >
                <input
                  type="text"
                  maxLength={240}
                  autoComplete="off"
                  data-lpignore="true"
                  disabled={!canSendChat}
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder={
                    !me.isAlive
                      ? 'لا يمكنك الكتابة بعد الخروج'
                      : me.isSilenced
                      ? 'أنت مُسكَّت في هذه الجولة'
                      : state.phase === 'NIGHT'
                      ? me.team === 'MAFIA'
                        ? 'اهمس لزملائك في المافيا...'
                        : 'النقاش متاح في النهار فقط'
                      : 'شارك تحليلك أو دفاعك مع الجميع...'
                  }
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#161E2F] border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!canSendChat || !chatText.trim()}
                  className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold flex items-center justify-center transition-colors"
                  aria-label="إرسال رسالة"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

interface NightActionPanelProps {
  me: Player;
  players: Player[];
  onSubmit: (targetId: string) => void;
}

function NightActionPanel({ me, players, onSubmit }: NightActionPanelProps) {
  const living = players.filter((p) => p.isAlive);

  if (me.role === 'MAFIA_BOSS') {
    const targets = living.filter((p) => p.team !== 'MAFIA');
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-red-400">
          <Skull className="w-5 h-5" />
          <h2 className="text-base font-extrabold">مهمة شيخ المافيا: اختر ضحية الليلة</h2>
        </div>
        <p className="text-xs text-slate-300">
          اختر لاعباً من فريق الصالحين لاغتياله هذه الليلة.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSubmit(t.id)}
              className="min-h-[46px] px-3 py-2 rounded-xl bg-red-950/60 hover:bg-red-600 border border-red-500/40 text-slate-100 hover:text-white font-bold text-sm transition-colors"
            >
              قتل {t.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (me.role === 'MAFIA_SILENCER') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-red-400">
          <VolumeX className="w-5 h-5" />
          <h2 className="text-base font-extrabold">مهمة مافيا التسكيت: اختر من تُسكته غداً</h2>
        </div>
        <p className="text-xs text-slate-300">
          يمكنك إسكات أي دور دون استثناء لجولة نهارية واحدة.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {living.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSubmit(t.id)}
              className="min-h-[46px] px-3 py-2 rounded-xl bg-[#1A2233] hover:bg-red-600 border border-white/15 text-slate-100 font-bold text-sm transition-colors"
            >
              إسكات {t.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (me.role === 'RIGHTEOUS_MEDIC') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <HeartPulse className="w-5 h-5" />
          <h2 className="text-base font-extrabold">مهمة مسعف الصالحين: اختر من تحميه الليلة</h2>
        </div>
        <p className="text-xs text-slate-300">
          يمكنك علاج أي لاعب بما في ذلك نفسك، ويمكنك تكرار علاج نفس الشخص في جولات مختلفة.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {living.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSubmit(t.id)}
              className="min-h-[46px] px-3 py-2 rounded-xl bg-emerald-950/50 hover:bg-emerald-500 hover:text-slate-950 border border-emerald-500/40 text-emerald-100 font-bold text-sm transition-colors"
            >
              علاج {t.id === me.id ? `${t.name} (نفسك)` : t.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (me.role === 'RIGHTEOUS_SNIPER' && me.sniperHasBullet) {
    const targets = living.filter((p) => p.id !== me.id);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-amber-400">
          <Crosshair className="w-5 h-5" />
          <h2 className="text-base font-extrabold">قناص الصالحين: طلقة واحدة طوال اللعبة</h2>
        </div>
        <p className="text-xs text-slate-300">
          إذا أصبت رجل مافيا يخرج وحده، وإذا أصبت صالحاً تخرج أنت وهو معاً!
        </p>
        <button
          type="button"
          onClick={() => onSubmit('SKIP')}
          className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-100 font-bold text-sm"
        >
          الاحتفاظ بالطلقة وعدم الإطلاق هذه الليلة
        </button>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSubmit(t.id)}
              className="min-h-[46px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500 hover:text-slate-950 border border-amber-500/40 text-amber-200 font-bold text-sm transition-colors"
            >
              إطلاق على {t.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
