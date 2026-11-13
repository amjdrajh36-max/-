import { useState } from 'react';
import { Copy, Check, Play, UserPlus, Trash2, Bot, User, Mic } from 'lucide-react';
import { MAX_PLAYERS } from '../shared/roles';
import { ConnectionMode, PublicGameState } from '../shared/types';
import { copyTextReliably } from '../utils/clipboard';
import { SCENE_IMAGES } from '../data/roleAssets';
import { VoiceManagerSnapshot } from '../firebase/voiceChatManager';
import { VoiceChatBar } from './VoiceChatBar';

interface LobbyScreenProps {
  state: PublicGameState;
  mode: ConnectionMode;
  isHost: boolean;
  voice?: VoiceManagerSnapshot;
  onToggleMic?: () => void;
  onToggleSpeaker?: () => void;
  onLeaveVoice?: () => void;
  onStartGame: () => void;
  onUpdateDayDuration: (sec: number) => void;
  onAddLocalPlayer?: (name: string) => void;
  onRemoveLocalPlayer?: (playerId: string) => void;
}

export function LobbyScreen({
  state,
  mode,
  isHost,
  voice,
  onToggleMic,
  onToggleSpeaker,
  onLeaveVoice,
  onStartGame,
  onUpdateDayDuration,
  onAddLocalPlayer,
  onRemoveLocalPlayer,
}: LobbyScreenProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [localName, setLocalName] = useState('');

  const humanCount = state.players.length;
  const aiToAdd = Math.max(0, MAX_PLAYERS - humanCount);

  const handleCopyCode = async () => {
    const ok = await copyTextReliably(state.roomCode);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}?room=${state.roomCode}`;
    const ok = await copyTextReliably(url);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    }
  };

  const handleAddLocal = () => {
    if (!localName.trim() || !onAddLocalPlayer) return;
    onAddLocalPlayer(localName.trim());
    setLocalName('');
  };

  const seatSlots = Array.from({ length: MAX_PLAYERS }, (_, idx) => {
    const player = state.players[idx];
    return { seat: idx + 1, player };
  });

  const isPrivateDevHost =
    typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {mode === 'ONLINE_ROOM' && isPrivateDevHost && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100 leading-relaxed">
          <strong>تنبيه عند دعوة الأصدقاء:</strong> غرفتك متزامنة سحابياً عبر جميع الأجهزة، لكن الرابط الحالي (`ais-dev`) خاص بحساب المطور فقط وقد يظهر خطأ 404 لدى أصدقائك. افتح رابط المشاركة العام من زر <strong>Share App</strong> في AI Studio وأرسله لهم مع رمز الغرفة <strong>{state.roomCode}</strong>.
        </div>
      )}

      {mode === 'ONLINE_ROOM' && voice && onToggleMic && onToggleSpeaker && onLeaveVoice && (
        <VoiceChatBar
          voice={voice}
          onToggleMic={onToggleMic}
          onToggleSpeaker={onToggleSpeaker}
          onLeaveVoice={onLeaveVoice}
        />
      )}

      {/* Room Header Summary with Grand Council Scene */}
      <section className="relative rounded-2xl border border-amber-500/20 bg-[#131926] overflow-hidden">
        <img
          src={SCENE_IMAGES.DAY}
          alt="قاعة مجلس المدينة"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[#0B0F17]/95 via-[#131926]/85 to-[#0B0F17]/75" />
        <div className="relative p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
              <span>
                {mode === 'ONLINE_ROOM'
                  ? 'غرفة جماعية مباشرة'
                  : mode === 'OFFLINE_PASS_PLAY'
                  ? 'وضع الهاتف الواحد (دون اتصال)'
                  : 'وضع اللعب الفردي (دون اتصال)'}
              </span>
            <span className="text-slate-600">·</span>
            <span className="tabular-nums text-slate-300">
              {humanCount} من {MAX_PLAYERS} لاعباً حقيقياً
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">غرفة انتظار اللاعبين</h1>
          <p className="text-sm text-slate-300">
            {aiToAdd > 0
              ? `عند بدء اللعبة الآن، سيتم إكمال ${aiToAdd} مقاعد تلقائياً بلاعبين بالذكاء الاصطناعي.`
              : `اكتمل عدد اللاعبين الـ ${MAX_PLAYERS} الحقيقيين! الغرفة جاهزة للانطلاق.`}
          </p>
        </div>

        {mode === 'ONLINE_ROOM' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="px-5 py-3 rounded-xl bg-[#0B0F17]/90 border border-amber-500/30 text-center">
              <p className="text-xs text-slate-400">رمز الغرفة</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-amber-400 tabular-nums">
                {state.roomCode}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0B0F17]/80 hover:bg-white/10 border border-white/15 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'تم نسخ الرمز' : 'نسخ الرمز'}</span>
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0B0F17]/80 hover:bg-white/10 border border-white/15 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'تم نسخ الرابط' : 'نسخ رابط الدعوة'}</span>
              </button>
            </div>
          </div>
        )}
        </div>
      </section>

      {/* Pass & Play Add Local Player */}
      {mode === 'OFFLINE_PASS_PLAY' && humanCount < MAX_PLAYERS && onAddLocalPlayer && (
        <div className="rounded-2xl border border-white/10 bg-[#131926] p-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="mafia_local_alias" className="block text-xs font-bold text-slate-300">
              إضافة لاعب مشارك على نفس الهاتف
            </label>
            <input
              id="mafia_local_alias"
              name="mafia_local_alias"
              type="text"
              maxLength={24}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-form-type="other"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLocal();
                }
              }}
              placeholder="اكتب اسم الصديق..."
              className="w-full min-h-[46px] px-4 rounded-xl bg-[#0B0F17] border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
          <button
            type="button"
            onClick={handleAddLocal}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4 text-amber-400" />
            <span>إضافة لاعب</span>
          </button>
        </div>
      )}

      {/* 15 Seats Grid */}
      <section className="rounded-2xl border border-white/10 bg-[#131926] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">مقاعد الطاولة ({MAX_PLAYERS} لاعباً)</h2>
          <span className="text-xs text-slate-400 tabular-nums">
            {humanCount} حقيقي · {aiToAdd} ذكاء اصطناعي عند البدء
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {seatSlots.map(({ seat, player }) => (
            <div
              key={seat}
              className={`p-4 rounded-xl border flex flex-col justify-between min-h-[92px] ${
                player
                  ? 'bg-[#1A2233] border-white/15'
                  : 'bg-[#0B0F17]/60 border-dashed border-white/10'
              }`}
            >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-mono tabular-nums">مقعد {seat}</span>
                  {player ? (
                    (() => {
                      const peerVoice = voice?.peers[player.id];
                      if (peerVoice?.micEnabled) {
                        return (
                          <Mic
                            className={`w-4 h-4 ${
                              peerVoice.speaking ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          />
                        );
                      }
                      return <User className="w-4 h-4 text-amber-400" />;
                    })()
                  ) : (
                    <Bot className="w-4 h-4 text-slate-500" />
                  )}
                </div>

              {player ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-100 truncate">{player.name}</p>
                    <p className="text-xs text-slate-400">
                      {player.isHost ? 'صاحب الغرفة (لاعب)' : 'لاعب مشارك'}
                    </p>
                  </div>
                  {mode === 'OFFLINE_PASS_PLAY' && !player.isHost && onRemoveLocalPlayer && (
                    <button
                      type="button"
                      onClick={() => onRemoveLocalPlayer(player.id)}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      aria-label={`حذف ${player.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-sm font-medium text-slate-400">مقعد شاغر</p>
                  <p className="text-xs text-slate-500">يُكمل بالذكاء الاصطناعي</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Host Controls */}
      <section className="rounded-2xl border border-white/10 bg-[#131926] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-200">مدة التصويت النهاري</p>
          <div className="flex items-center gap-2">
            {[60, 90, 120].map((sec) => (
              <button
                key={sec}
                type="button"
                disabled={!isHost}
                onClick={() => onUpdateDayDuration(sec)}
                className={`min-h-[40px] px-4 rounded-xl border text-xs font-bold tabular-nums transition-colors ${
                  state.dayDurationSec === sec
                    ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                    : 'bg-[#0B0F17] border-white/10 text-slate-400'
                } ${!isHost ? 'opacity-60 cursor-not-allowed' : 'hover:text-white'}`}
              >
                {sec} ثانية
              </button>
            ))}
          </div>
        </div>

        {isHost ? (
          <button
            type="button"
            onClick={onStartGame}
            className="min-h-[50px] px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-base flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>بدء اللعبة وتوزيع الأدوار</span>
          </button>
        ) : (
          <p className="text-sm font-medium text-slate-300">
            في انتظار صاحب الغرفة لبدء المباراة...
          </p>
        )}
      </section>
    </div>
  );
}
