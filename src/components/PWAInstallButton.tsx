import { useState } from 'react';
import { Download, Smartphone, X, Copy, Check, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { copyTextReliably, isEmbeddedIframe } from '../utils/clipboard';

interface PWAInstallButtonProps {
  variant?: 'header' | 'card';
}

export function PWAInstallButton({ variant = 'header' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (isInstalled) {
    return null;
  }

  const inIframe = typeof window !== 'undefined' && isEmbeddedIframe();
  const standaloneUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (ok) return;
    }
    setShowGuide(true);
  };

  const handleCopyUrl = async () => {
    const ok = await copyTextReliably(standaloneUrl);
    if (ok) {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'header'
            ? 'px-4 py-2 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0'
            : 'w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-amber-500/30 text-amber-300 font-bold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap'
        }
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>تثبيت اللعبة</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#131926] border border-white/10 overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-2 text-amber-400">
                <Smartphone className="w-5 h-5" />
                <h3 id="install-guide-title" className="text-lg font-bold text-white">
                  تنزيل وتثبيت لعبة المافيا
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-sm text-slate-300 leading-relaxed">
              {inIframe && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-100 space-y-2.5">
                  <p className="text-xs font-bold text-amber-300">
                    تنبيه مهم: أنت تفتح اللعبة داخل نافذة المعاينة
                  </p>
                  <p className="text-xs leading-relaxed">
                    يمنع المتصفح تثبيت التطبيقات من داخل نوافذ المعاينة. افتح اللعبة في تبويب متصفح مستقل أولاً لتظهر لك نافذة التثبيت الفورية:
                  </p>
                  <a
                    href={standaloneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>فتح اللعبة في تبويب مستقل للتثبيت</span>
                  </a>
                </div>
              )}

              {isIOS ? (
                <div className="space-y-2">
                  <p className="font-bold text-white">التثبيت على iPhone / iPad:</p>
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>افتح الرابط في متصفح Safari مباشرة.</li>
                    <li>اضغط على زر <strong>المشاركة (Share)</strong> في شريط المتصفح.</li>
                    <li>اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="font-bold text-white">التثبيت على أندرويد ليعمل كتطبيق محلي:</p>
                  <ol className="list-decimal list-inside space-y-1.5">
                    <li>افتح رابط اللعبة مباشرة في متصفح <strong>Google Chrome</strong> (وليس من داخل إطار معاينة).</li>
                    <li>اضغط على قائمة النقاط الثلاث (⋮) في أعلى المتصفح.</li>
                    <li>اختر <strong>تثبيت التطبيق (Install app)</strong> أو <strong>الإضافة إلى الشاشة الرئيسية</strong> ثم اضغط <strong>تثبيت</strong>.</li>
                    <li>تُضاف أيقونة «لعبة المافيا» لشاشتك الرئيسية وتعمل بملء الشاشة وأوضاع الذكاء الاصطناعي دون إنترنت.</li>
                  </ol>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-[#0B0F17] border border-white/10 space-y-2">
                <p className="text-xs text-slate-400">رابط التطبيق المباشر للنسخ والفتح في Chrome:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={standaloneUrl}
                    dir="ltr"
                    onFocus={(e) => e.target.select()}
                    className="text-xs font-mono text-amber-300 bg-transparent border-none focus:outline-none flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="min-h-[38px] px-3 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? 'تم النسخ' : 'نسخ'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm"
              >
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
