import React from "react";
import { ShieldAlert, AlertTriangle, Clock, Lock, CheckCircle2 } from "lucide-react";
import { useRestriction } from "../../context/RestrictionContext";

const RestrictionModal = () => {
  const {
    showWarningModal,
    switchCount,
    lastViolationType,
    lastViolationTime,
    acknowledgeWarning,
  } = useRestriction();

  if (!showWarningModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border-2 border-red-500/80 bg-white shadow-2xl shadow-red-950/30 animate-in zoom-in-95 duration-200">
        {/* Header Alert Strip */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-xs shadow-inner">
              <ShieldAlert size={26} className="text-white animate-pulse" />
            </div>
            <div>
              <span className="inline-block rounded-full bg-red-950/40 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-200">
                Action Restricted
              </span>
              <h3 className="text-lg font-black tracking-tight text-white">
                ACTION NOT ALLOWED!
              </h3>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div>
            <h4 className="text-base font-extrabold text-slate-900">
              Tab or Application Switch Detected
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Navigating away from the platform, switching browser tabs, pressing Alt+Tab, or opening background applications is strictly prohibited.
            </p>
          </div>

          {/* Violation Info Card */}
          <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-600">Violation Event:</span>
              <span className="font-extrabold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full">
                {lastViolationType || "Window Focus Lost"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-600">Violation Count:</span>
              <span className="font-extrabold text-rose-800 bg-white border border-rose-200 px-2.5 py-0.5 rounded-full">
                Warning #{switchCount}
              </span>
            </div>

            {lastViolationTime && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">Recorded At:</span>
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Clock size={12} className="text-slate-400" />
                  {lastViolationTime}
                </span>
              </div>
            )}
          </div>

          {/* Academic Integrity Notice */}
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200/80 p-3 text-xs text-amber-900">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong>Notice:</strong> All switching incidents are permanently recorded and reported with your submission. Please stay on this window.
            </p>
          </div>

          {/* Dismiss / Return Button */}
          <button
            type="button"
            onClick={acknowledgeWarning}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-red-500/25 transition hover:from-red-700 hover:to-rose-700 focus:outline-none focus:ring-4 focus:ring-red-200 cursor-pointer"
          >
            <CheckCircle2 size={18} />
            <span>I Understand &amp; Return to Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestrictionModal;
