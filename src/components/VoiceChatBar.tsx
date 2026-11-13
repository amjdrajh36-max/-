import { Mic, MicOff, Volume2, VolumeX, PhoneOff } from 'lucide-react';
import { VoiceManagerSnapshot } from '../firebase/voiceChatManager';
import { soundFx } from '../utils/sound';

interface VoiceChatBarProps {
  voice: VoiceManagerSnapshot;
  onToggleMic: () => void;
  onToggleSpeaker: () => void;
  onLeaveVoice: () => void;
}

export function VoiceChatBar({
  voice,
  onToggleMic,
  onToggleSpeaker,
  onLeaveVoice,
}: VoiceChatBarProps) {
  const activePeers = Object.values(voice.peers).filter((p) => p.joinedVoice);
  const speakingPeers = activePeers.filter((p) => p.speaking && p.micEnabled);

  return (
    <section
      aria-label="المحادثة الصوتية الجماعية"
      className="rounded-2xl border border-white/10 bg-[#131926] p-4 sm:px-5 space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-bold text-slate-200">المايك والمحادثة الصوتية</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {activePeers.length > 0
                ? `${activePeers.length} متصل بالصوت`
                : 'انضم لتتحدث وتسمع أصدقاءك'}
            </span>
          </div>

          {voice.forcedMuteReason ? (
            <p className="text-xs text-red-300">{voice.forcedMuteReason}</p>
          ) : speakingPeers.length > 0 ? (
            <p className="text-xs text-emerald-300 font-medium truncate">
              يتحدث الآن: {speakingPeers.map((p) => p.name).join('، ')}
            </p>
          ) : (
            <p className="text-xs text-slate-400 truncate">
              {voice.joinedVoice
                ? voice.micEnabled
                  ? 'المايك مفتوح الآن — يسمعك جميع المتصلين بالصوت'
                  : 'أنت في وضع الاستماع (المايك مكتوم)'
                : 'اضغط «تشغيل المايك» للتحدث مباشرة مع جميع اللاعبين'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={voice.connectingVoice || Boolean(voice.forcedMuteReason && !voice.joinedVoice)}
            onClick={() => {
              soundFx.playMicToggle(!voice.micEnabled);
              onToggleMic();
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
              voice.micEnabled
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            }`}
          >
            {voice.micEnabled ? (
              <>
                <Mic className="w-4 h-4" />
                <span>المايك مفتوح (كتم)</span>
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4" />
                <span>{voice.connectingVoice ? 'جاري التشغيل...' : 'تشغيل المايك'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={voice.connectingVoice}
            onClick={onToggleSpeaker}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              voice.joinedVoice && !voice.speakerMuted
                ? 'bg-white/10 border-white/20 text-slate-100 hover:bg-white/15'
                : 'bg-[#0B0F17] border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            {voice.joinedVoice && voice.speakerMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-red-400" />
                <span>السماعة مكتومة</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-amber-400" />
                <span>{voice.joinedVoice ? 'سماع الغرفة' : 'استماع فقط'}</span>
              </>
            )}
          </button>

          {voice.joinedVoice && (
            <button
              type="button"
              onClick={onLeaveVoice}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-600 border border-red-500/30 text-red-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="إغلاق الصوت"
            >
              <PhoneOff className="w-4 h-4" />
              <span>إنهاء الصوت</span>
            </button>
          )}
        </div>
      </div>

      {voice.voiceError && (
        <p className="text-xs text-red-300 pt-1 border-t border-white/10">
          {voice.voiceError}
        </p>
      )}
    </section>
  );
}
