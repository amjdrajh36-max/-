import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, ShieldAlert, Users } from 'lucide-react';
import { ROLES, getTeamLabel } from '../shared/roles';
import { Player } from '../shared/types';
import { ROLE_IMAGES, getRoleAccentClasses } from '../data/roleAssets';
import { soundFx } from '../utils/sound';

interface SecretRoleCardProps {
  me: Player;
  allPlayers: Player[];
  defaultRevealed?: boolean;
  compact?: boolean;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export function SecretRoleCard({
  me,
  allPlayers,
  defaultRevealed = false,
  compact = false,
}: SecretRoleCardProps) {
  const [revealed, setRevealed] = useState(defaultRevealed);
  const [imgError, setImgError] = useState(false);

  const roleDef = me.role ? ROLES[me.role] : null;
  const accent = getRoleAccentClasses(me.role);
  const imgSrc = me.role ? ROLE_IMAGES[me.role] : undefined;

  const mafiaTeammates =
    me.team === 'MAFIA'
      ? allPlayers.filter((p) => p.id !== me.id && p.team === 'MAFIA')
      : [];

  const handleToggle = () => {
    soundFx.playCardFlip();
    setRevealed((prev) => !prev);
  };

  if (!roleDef) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
      className="w-full rounded-2xl border border-white/10 bg-[#151C2B] overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span className="font-bold text-slate-100">بطاقتك السرية</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">{me.name}</span>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className="min-h-[40px] px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-amber-400 text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          {revealed ? (
            <>
              <EyeOff className="w-4 h-4" />
              <span>إخفاء البطاقة</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span>كشف البطاقة</span>
            </>
          )}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.button
            key="hidden"
            type="button"
            onClick={handleToggle}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className="w-full p-6 flex flex-col items-center justify-center gap-3 text-center hover:bg-white/[0.02] transition-colors cursor-pointer min-h-[150px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-slate-100">الهوية مخفية لحماية سريتك</p>
              <p className="text-xs text-slate-400">اضغط هنا لكشف دورك وفريقك وقدرتك الخاصة</p>
            </div>
          </motion.button>
        ) : (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
            className={`p-5 ${compact ? 'flex flex-col sm:flex-row gap-4 items-center' : 'space-y-4'}`}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.04, ease: EASE_OUT_EXPO }}
              className={`relative overflow-hidden rounded-xl border ${accent.border} bg-gradient-to-br ${accent.gradient} shadow-xl ${
                compact ? 'w-28 h-28 shrink-0' : 'w-full h-64'
              }`}
            >
              {imgSrc && !imgError ? (
                <img
                  src={imgSrc}
                  alt={roleDef.name}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <Users className="w-10 h-10" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              {!compact && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, delay: 0.08, ease: EASE_OUT_EXPO }}
                  className="absolute bottom-4 right-4 left-4 flex items-end justify-between"
                >
                  <div>
                    <p className={`text-xs font-bold ${accent.text}`}>{getTeamLabel(roleDef.team)}</p>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-white">{roleDef.name}</h3>
                  </div>
                </motion.div>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.07, ease: EASE_OUT_EXPO }}
              className="flex-1 space-y-2.5 text-right w-full"
            >
              {compact && (
                <div>
                  <p className={`text-xs font-bold ${accent.text}`}>{getTeamLabel(roleDef.team)}</p>
                  <h3 className="text-xl font-extrabold text-white">{roleDef.name}</h3>
                </div>
              )}
              <p className="text-sm text-slate-200 leading-relaxed">{roleDef.abilityDetail}</p>

              {me.role === 'RIGHTEOUS_SNIPER' && (
                <p className="text-xs font-bold text-amber-400">
                  حالة الذخيرة: {me.sniperHasBullet ? 'الطلقة الوحيدة متاحة' : 'تم استخدام الطلقة'}
                </p>
              )}

              {me.role === 'RIGHTEOUS_SHEIKH' && (
                <p className="text-xs font-bold text-amber-400">
                  قدرة سحب الأصوات: {me.sheikhAbilityUsed ? 'تم استخدامها' : 'جاهزة (من الجولة الثانية)'}
                </p>
              )}

              {mafiaTeammates.length > 0 && (
                <div className="pt-2 border-t border-white/10">
                  <p className="text-xs text-red-300 font-bold mb-1">زملاؤك في فريق المافيا:</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-200">
                    {mafiaTeammates.map((mate) => (
                      <span key={mate.id}>
                        {mate.name} ({mate.role ? ROLES[mate.role].name : 'مافيا'})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
