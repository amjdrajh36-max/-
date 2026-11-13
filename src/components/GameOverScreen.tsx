import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, RotateCcw, Home, Skull, ShieldCheck } from 'lucide-react';
import { ROLES, getTeamLabel } from '../shared/roles';
import { ConnectionMode, PublicGameState } from '../shared/types';
import { ROLE_IMAGES, SCENE_IMAGES } from '../data/roleAssets';
import { soundFx } from '../utils/sound';
import { VoiceManagerSnapshot } from '../firebase/voiceChatManager';
import { VoiceChatBar } from './VoiceChatBar';

interface GameOverScreenProps {
  state: PublicGameState;
  mode: ConnectionMode;
  isHost: boolean;
  voice?: VoiceManagerSnapshot;
  onToggleMic?: () => void;
  onToggleSpeaker?: () => void;
  onLeaveVoice?: () => void;
  onPlayAgain: () => void;
  onExitHome: () => void;
}

export function GameOverScreen({
  state,
  mode,
  isHost,
  voice,
  onToggleMic,
  onToggleSpeaker,
  onLeaveVoice,
  onPlayAgain,
  onExitHome,
}: GameOverScreenProps) {
  const isRighteousWin = state.winner === 'RIGHTEOUS';
  const me = state.players.find((p) => p.id === state.myPlayerId);
  const didIWin = me?.team === state.winner;

  useEffect(() => {
    soundFx.playVictory();
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {mode === 'ONLINE_ROOM' && voice && onToggleMic && onToggleSpeaker && onLeaveVoice && (
        <VoiceChatBar
          voice={voice}
          onToggleMic={onToggleMic}
          onToggleSpeaker={onToggleSpeaker}
          onLeaveVoice={onLeaveVoice}
        />
      )}

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={`relative rounded-2xl border overflow-hidden ${
          isRighteousWin
            ? 'border-amber-500/40 bg-[#131926] shadow-[0_20px_60px_-20px_rgba(245,158,11,0.3)]'
            : 'border-red-500/40 bg-[#131926] shadow-[0_20px_60px_-20px_rgba(239,68,68,0.3)]'
        }`}
      >
        <div className="relative h-56 sm:h-72 w-full overflow-hidden">
          <img
            src={isRighteousWin ? SCENE_IMAGES.VICTORY_RIGHTEOUS : SCENE_IMAGES.VICTORY_MAFIA}
            alt={isRighteousWin ? 'انتصار فريق الصالحين' : 'سيطرة فريق المافيا'}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131926] via-[#131926]/45 to-black/25" />
          <div className="absolute bottom-4 right-0 left-0 flex justify-center">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center border backdrop-blur-sm ${
                isRighteousWin
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                  : 'bg-red-500/20 border-red-400/40 text-red-300'
              }`}
            >
              <Trophy className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 pt-2 text-center space-y-4">
          <div className="space-y-2 max-w-2xl mx-auto">
            <p className="text-sm font-bold text-slate-300">
              انتهت المباراة في الجولة {state.round}
              {me?.team && (
                <>
                  <span className="mx-2 text-slate-500">·</span>
                  <span className={didIWin ? 'text-emerald-400' : 'text-red-400'}>
                    {didIWin ? 'حقق فريقك الانتصار' : 'خسر فريقك هذه الجولة'}
                  </span>
                </>
              )}
            </p>
            <h1
              className={`text-3xl sm:text-4xl font-extrabold ${
                isRighteousWin ? 'text-amber-400' : 'text-red-400'
              }`}
            >
              {isRighteousWin ? 'فوز فريق الصالحين!' : 'فوز فريق المافيا!'}
            </h1>
            <p className="text-base text-slate-200">{state.winReason}</p>
          </div>

          <div className="pt-3 flex flex-wrap items-center justify-center gap-3">
            {isHost ? (
              <button
                type="button"
                onClick={onPlayAgain}
                className="px-6 py-3 min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                <span>لعب جولة جديدة</span>
              </button>
            ) : (
              <p className="text-sm text-slate-400">في انتظار صاحب الغرفة لبدء جولة جديدة...</p>
            )}
            <button
              type="button"
              onClick={onExitHome}
              className="px-6 py-3 min-h-[48px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-bold text-sm flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Home className="w-4 h-4" />
              <span>العودة للرئيسية</span>
            </button>
          </div>
        </div>
      </motion.div>

      <section className="rounded-2xl border border-white/10 bg-[#131926] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">كشف جميع الأدوار والنتائج النهائية</h2>
          <span className="text-xs text-slate-400 tabular-nums">{state.players.length} لاعباً</span>
        </div>

        <div className="divide-y divide-white/10">
          {state.players.map((p, idx) => {
            const roleDef = p.role ? ROLES[p.role] : null;
            const isMafia = p.team === 'MAFIA';
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.4), ease: 'easeOut' }}
                className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-center gap-3">
                  {p.role && ROLE_IMAGES[p.role] ? (
                    <img
                      src={ROLE_IMAGES[p.role]}
                      alt={roleDef?.name || p.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-cover border border-white/15 shrink-0"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-lg bg-white/5 text-slate-400 text-xs font-mono tabular-nums flex items-center justify-center shrink-0">
                      {p.seatNumber}
                    </span>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-100">{p.name}</span>
                      {p.id === state.myPlayerId && (
                        <span className="text-xs text-amber-400 font-bold">(أنت)</span>
                      )}
                      {p.isBot && <span className="text-xs text-slate-500">· ذكاء اصطناعي</span>}
                    </div>
                    {p.eliminatedReason && (
                      <p className="text-xs text-slate-400">{p.eliminatedReason}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm sm:text-left">
                  <div className="flex items-center gap-2">
                    <span className={isMafia ? 'text-red-400 font-bold' : 'text-amber-400 font-bold'}>
                      {roleDef ? roleDef.name : 'غير محدد'}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-xs text-slate-400">
                      {p.team ? getTeamLabel(p.team) : ''}
                    </span>
                  </div>
                  <span className="text-slate-600">·</span>
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    {p.isAlive ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-400">ناجٍ</span>
                      </>
                    ) : (
                      <>
                        <Skull className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-400">خرج</span>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
