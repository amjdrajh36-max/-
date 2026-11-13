import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Cpu, Smartphone, ArrowLeft, Shield, Skull, LogOut } from 'lucide-react';
import { HERO_TABLE_IMAGE, ROLE_IMAGES } from '../data/roleAssets';
import { ROLES } from '../shared/roles';
import { RoleId } from '../shared/types';
import { PWAInstallButton } from './PWAInstallButton';

interface HomeScreenProps {
  initialRoomCode?: string;
  errorMsg: string | null;
  connecting: boolean;
  authUser: { displayName: string | null; email: string | null } | null;
  onSignOut: () => void;
  onCreateOnlineRoom: (playerName: string, dayDurationSec: number) => void;
  onJoinOnlineRoom: (roomCode: string, playerName: string) => void;
  onStartOfflineSolo: (playerName: string, dayDurationSec: number) => void;
  onStartPassPlay: (hostName: string, dayDurationSec: number) => void;
  onClearError: () => void;
}

type ModeTab = 'ONLINE_CREATE' | 'ONLINE_JOIN' | 'OFFLINE_SOLO' | 'OFFLINE_PASS';

const SHOWCASE_ROLES: RoleId[] = [
  'MAFIA_BOSS',
  'MAFIA_SILENCER',
  'MAFIA_MEMBER',
  'RIGHTEOUS_SHEIKH',
  'RIGHTEOUS_SNIPER',
  'RIGHTEOUS_MEDIC',
  'RIGHTEOUS_BOY',
  'RIGHTEOUS_CITIZEN',
];

export function HomeScreen({
  initialRoomCode = '',
  errorMsg,
  connecting,
  authUser,
  onSignOut,
  onCreateOnlineRoom,
  onJoinOnlineRoom,
  onStartOfflineSolo,
  onStartPassPlay,
  onClearError,
}: HomeScreenProps) {
  const [activeTab, setActiveTab] = useState<ModeTab>(
    initialRoomCode ? 'ONLINE_JOIN' : 'ONLINE_CREATE'
  );
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [dayDurationSec, setDayDurationSec] = useState(90);
  const [heroImgError, setHeroImgError] = useState(false);
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);

  const handleSubmit = () => {
    onClearError();
    setLocalValidationError(null);
    const cleanName = playerName.trim();
    if (!cleanName) {
      setLocalValidationError('يرجى كتابة اسمك في اللعبة أولاً.');
      return;
    }

    if (activeTab === 'ONLINE_CREATE') {
      onCreateOnlineRoom(cleanName, dayDurationSec);
    } else if (activeTab === 'ONLINE_JOIN') {
      if (!roomCode.trim()) {
        setLocalValidationError('يرجى إدخال رمز الغرفة أولاً.');
        return;
      }
      onJoinOnlineRoom(roomCode.trim(), cleanName);
    } else if (activeTab === 'OFFLINE_SOLO') {
      onStartOfflineSolo(cleanName, dayDurationSec);
    } else {
      onStartPassPlay(cleanName, dayDurationSec);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-14">
      {/* Hero 2-Column Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Right Column (RTL): Setup & Play Card */}
        <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-white/10 bg-[#131926] p-6 sm:p-8 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
              <span>15 لاعباً</span>
              <span className="text-slate-600">·</span>
              <span>4 مافيا و 11 صالحاً</span>
              <span className="text-slate-600">·</span>
              <span>ذكاء اصطناعي تلقائي</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight [text-wrap:balance]">
              المواجهة السرية بين المافيا والصالحين
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              أنشئ غرفة جماعية ليلعب كل صديق من هاتفه، أو العب فوراً دون اتصال ضد لاعبين بالذكاء الاصطناعي بنظام الـ 15 لاعباً والأدوار الكاملة.
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-[#0B0F17] border border-white/10">
            <button
              type="button"
              onClick={() => {
                onClearError();
                setActiveTab('ONLINE_CREATE');
              }}
              className={`min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'ONLINE_CREATE'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              إنشاء غرفة
            </button>
            <button
              type="button"
              onClick={() => {
                onClearError();
                setActiveTab('ONLINE_JOIN');
              }}
              className={`min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'ONLINE_JOIN'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              انضمام لغرفة
            </button>
            <button
              type="button"
              onClick={() => {
                onClearError();
                setActiveTab('OFFLINE_SOLO');
              }}
              className={`min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'OFFLINE_SOLO'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              فردي (ذكاء اصطناعي)
            </button>
            <button
              type="button"
              onClick={() => {
                onClearError();
                setActiveTab('OFFLINE_PASS');
              }}
              className={`min-h-[42px] px-2.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'OFFLINE_PASS'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              هاتف واحد
            </button>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="mafia_alias_entry" className="block text-xs font-bold text-slate-300">
                اسمك في اللعبة
              </label>
              <input
                id="mafia_alias_entry"
                name="mafia_alias_entry"
                type="text"
                maxLength={24}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={playerName}
                onChange={(e) => {
                  setLocalValidationError(null);
                  setPlayerName(e.target.value);
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="مثال: عبدالله"
                className="w-full min-h-[46px] px-4 rounded-xl bg-[#0B0F17] border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            <AnimatePresence initial={false}>
              {activeTab === 'ONLINE_JOIN' && (
                <motion.div
                  key="room-pin-field"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-1.5"
                >
                  <label htmlFor="mafia_room_pin" className="block text-xs font-bold text-slate-300">
                    رمز الغرفة (4 أرقام)
                  </label>
                  <input
                    id="mafia_room_pin"
                    name="mafia_room_pin"
                    type="text"
                    inputMode="numeric"
                    enterKeyHint="go"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-form-type="other"
                    value={roomCode}
                    onChange={(e) => {
                      setLocalValidationError(null);
                      setRoomCode(e.target.value);
                    }}
                    onKeyDown={handleInputKeyDown}
                    placeholder="مثال: 4829"
                    className="w-full min-h-[46px] px-4 rounded-xl bg-[#0B0F17] border border-white/15 text-slate-100 font-mono tracking-widest text-center text-lg placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {activeTab !== 'ONLINE_JOIN' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">
                  مدة النقاش والتصويت في النهار
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[60, 90, 120].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setDayDurationSec(sec)}
                      className={`min-h-[42px] rounded-xl border text-xs font-bold tabular-nums transition-colors ${
                        dayDurationSec === sec
                          ? 'bg-white/10 border-amber-400 text-amber-300'
                          : 'bg-[#0B0F17] border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {sec} ثانية
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(activeTab === 'ONLINE_CREATE' || activeTab === 'ONLINE_JOIN') && (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                {authUser ? (
                  <>
                    <span className="truncate">
                      حساب Google المتصل: {authUser.email || authUser.displayName}
                    </span>
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="inline-flex items-center gap-1 text-slate-300 hover:text-amber-400 font-bold shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>تغيير الحساب</span>
                    </button>
                  </>
                ) : (
                  <span>
                    سيتم تسجيل الدخول بحساب Google تلقائياً عند الضغط للمزامنة السحابية بين هواتف الأصدقاء.
                  </span>
                )}
              </div>
            )}

            {(localValidationError || errorMsg) && (
              <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
                {localValidationError || errorMsg}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={connecting}
              className="w-full min-h-[50px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-extrabold text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                {connecting
                  ? 'جاري الاتصال...'
                  : activeTab === 'ONLINE_CREATE'
                  ? 'إنشاء غرفة والانضمام كلاعب'
                  : activeTab === 'ONLINE_JOIN'
                  ? 'دخول الغرفة الآن'
                  : activeTab === 'OFFLINE_SOLO'
                  ? 'بدء اللعب ضد 14 لاعباً ذكياً'
                  : 'إعداد غرفة على نفس الهاتف'}
              </span>
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          <PWAInstallButton variant="card" />
        </div>

        {/* Left Column (RTL): Atmospheric Artwork */}
        <div className="lg:col-span-6 relative rounded-2xl border border-amber-500/20 overflow-hidden bg-[#131926] min-h-[320px] lg:min-h-full shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]">
          {!heroImgError ? (
            <img
              src={HERO_TABLE_IMAGE}
              alt="طاولة لعبة المافيا السرية مع 15 بطاقة"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-amber-950/40 via-[#131926] to-black flex items-center justify-center">
              <Skull className="w-20 h-20 text-amber-500/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F17] via-[#0B0F17]/35 to-black/20" />
          <div className="absolute bottom-6 right-6 left-6 space-y-2">
            <p className="text-xs font-bold text-amber-400">توزيع سري للأدوار · ليل ونهار تلقائي · محادثة صوتية حية</p>
            <p className="text-xl sm:text-2xl font-extrabold text-white leading-snug [text-wrap:balance]">
              صاحب الغرفة يشارك كلاعب فعلي في مواجهة الـ 15 لاعباً
            </p>
          </div>
        </div>
      </section>

      {/* 3-Column Mode Explanation Strip */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl border border-white/10 bg-[#131926] space-y-2">
          <Users className="w-6 h-6 text-amber-400" />
          <h2 className="text-lg font-bold text-white">غرف جماعية لهواتف الأصدقاء</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            يدخل كل لاعب من هاتفه عبر رمز الغرفة، ويستلم بطاقته السرية وينفذ قدراته الليلية ويصوّت علناً في النهار.
          </p>
        </div>
        <div className="p-6 rounded-2xl border border-white/10 bg-[#131926] space-y-2">
          <Cpu className="w-6 h-6 text-amber-400" />
          <h2 className="text-lg font-bold text-white">إكمال تلقائي بالذكاء الاصطناعي</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            إذا لم يكتمل عدد 15 لاعباً حقيقياً، يضيف النظام لاعبين بالذكاء الاصطناعي يشاركون في النقاش والقدرات والتصويت.
          </p>
        </div>
        <div className="p-6 rounded-2xl border border-white/10 bg-[#131926] space-y-2">
          <Smartphone className="w-6 h-6 text-amber-400" />
          <h2 className="text-lg font-bold text-white">لعب دون إنترنت</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            تعمل أوضاع اللعب الفردي وتمرير الهاتف محلياً بالكامل داخل التطبيق دون أي اتصال خارجي.
          </p>
        </div>
      </section>

      {/* 15 Roles Showcase — Full 8 Character Illustrations */}
      <section id="roles-section" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-2xl font-extrabold text-white">الشخصيات والقدرات في المافيا</h2>
            <p className="text-sm text-slate-400 mt-1">
              4 لاعبين في فريق المافيا مقابل 11 لاعباً في فريق الصالحين (من بينهم 7 كروت صالح)
            </p>
          </div>
          <span className="text-xs text-slate-400 tabular-nums">إجمالي البطاقات: 15 بطاقة</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SHOWCASE_ROLES.map((roleId, idx) => {
            const role = ROLES[roleId];
            const img = ROLE_IMAGES[roleId];
            const isMafia = role.team === 'MAFIA';
            return (
              <motion.article
                key={roleId}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.12 }}
                transition={{ duration: 0.32, delay: Math.min(idx * 0.04, 0.25), ease: 'easeOut' }}
                whileHover={{ y: -4 }}
                className={`group rounded-2xl border overflow-hidden flex flex-col bg-[#131926] transition-colors ${
                  isMafia
                    ? 'border-red-500/20 hover:border-red-500/45'
                    : 'border-white/10 hover:border-amber-500/40'
                }`}
              >
                <div className="h-56 relative bg-slate-950 overflow-hidden">
                  {img ? (
                    <img
                      src={img}
                      alt={role.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Shield className="w-12 h-12 text-slate-700" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#131926] via-[#131926]/20 to-transparent" />
                </div>
                <div className="p-5 space-y-2 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isMafia ? 'text-red-400 font-bold' : 'text-amber-400 font-bold'}>
                      {isMafia ? 'فريق المافيا' : 'فريق الصالحين'}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400 tabular-nums">
                      {role.count} {role.count > 1 ? 'بطاقات' : 'بطاقة'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white">{role.name}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{role.abilityDetail}</p>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
