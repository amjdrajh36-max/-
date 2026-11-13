import { X, Shield, Crosshair, HeartPulse, Skull, VolumeX, Users } from 'lucide-react';
import { ROLES } from '../shared/roles';
import { RoleId } from '../shared/types';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_ORDER: RoleId[] = [
  'MAFIA_BOSS',
  'MAFIA_MEMBER',
  'MAFIA_SILENCER',
  'RIGHTEOUS_SHEIKH',
  'RIGHTEOUS_SNIPER',
  'RIGHTEOUS_MEDIC',
  'RIGHTEOUS_BOY',
  'RIGHTEOUS_CITIZEN',
];

function getRoleIcon(id: RoleId) {
  switch (id) {
    case 'MAFIA_BOSS':
    case 'MAFIA_MEMBER':
      return <Skull className="w-5 h-5 text-red-400 shrink-0" />;
    case 'MAFIA_SILENCER':
      return <VolumeX className="w-5 h-5 text-red-400 shrink-0" />;
    case 'RIGHTEOUS_SHEIKH':
      return <Shield className="w-5 h-5 text-amber-400 shrink-0" />;
    case 'RIGHTEOUS_SNIPER':
      return <Crosshair className="w-5 h-5 text-amber-400 shrink-0" />;
    case 'RIGHTEOUS_MEDIC':
      return <HeartPulse className="w-5 h-5 text-emerald-400 shrink-0" />;
    default:
      return <Users className="w-5 h-5 text-amber-400 shrink-0" />;
  }
}

export function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-title"
    >
      <div className="w-full max-w-3xl max-h-[88vh] bg-[#131926] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 id="rules-title" className="text-xl font-bold text-slate-100">
            قواعد لعبة المافيا ونظام الـ 15 لاعباً
          </h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="إغلاق القواعد"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8 text-slate-300 leading-relaxed">
          <section className="space-y-3">
            <h3 className="text-lg font-bold text-amber-400">01. نظام اللعب والفوز</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-4 rounded-xl bg-[#1A2233] border border-white/5 space-y-2">
                <p className="font-bold text-slate-100">تكوين الطاولة</p>
                <p>تتكون كل مباراة من 15 لاعباً. يشارك صاحب الغرفة كلاعب فعلي، وعند نقص العدد يتم إكمال المقاعد تلقائياً بلاعبين بالذكاء الاصطناعي.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#1A2233] border border-white/5 space-y-2">
                <p className="font-bold text-slate-100">شروط الفوز</p>
                <p>يفوز فريق الصالحين إذا خرج جميع أفراد المافيا. ويفوز فريق المافيا بمجرد أن يتبقى ثلاثة صالحين فقط في اللعبة.</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-bold text-amber-400">02. التصويت والتبرير والتعادل</h3>
            <ul className="space-y-2 text-sm list-disc list-inside text-slate-300">
              <li>التصويت علني أمام الجميع، ويمكن لأي لاعب سحب صوته أو تغييره في أي وقت قبل إغلاق التصويت.</li>
              <li>يحصل اللاعب صاحب أعلى عدد من الأصوات على فرصة واحدة للتبرير («أنا مواطن صالح» أو «أنا مواطن صالح مهم جداً») قبل الحسم النهائي.</li>
              <li>عند التعادل بين لاعبين أو أكثر، يبدأ تصويت داخلي بين المتعادلين فقط، ويصوّت بقية اللاعبين غير المتعادلين فقط، ويُعاد التصويت عند استمرار التعادل حتى يخرج لاعب واحد.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-lg font-bold text-amber-400">03. الأدوار الـ 15 (4 مافيا · 11 صالحاً)</h3>
            <div className="divide-y divide-white/10 border border-white/10 rounded-xl bg-[#1A2233]/60">
              {ROLE_ORDER.map((id) => {
                const role = ROLES[id];
                return (
                  <div key={id} className="p-4 flex items-start gap-4">
                    <div className="mt-0.5">{getRoleIcon(id)}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-bold text-slate-100 text-base">{role.name}</span>
                        <span className="text-slate-500">·</span>
                        <span className={role.team === 'MAFIA' ? 'text-red-400 font-medium' : 'text-amber-400 font-medium'}>
                          {role.team === 'MAFIA' ? 'فريق المافيا' : 'فريق الصالحين'}
                        </span>
                        {role.count > 1 && (
                          <>
                            <span className="text-slate-500">·</span>
                            <span className="text-slate-400 tabular-nums">{role.count} كروت</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm text-slate-300">{role.abilityDetail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors whitespace-nowrap"
          >
            فهمت القواعد
          </button>
        </div>
      </div>
    </div>
  );
}
