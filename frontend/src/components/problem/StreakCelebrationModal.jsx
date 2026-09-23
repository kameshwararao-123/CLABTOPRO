import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  CheckCircle2,
  Trophy,
  X,
  ArrowRight,
  Sparkles,
  CalendarCheck,
} from "lucide-react";

const StreakCelebrationModal = ({
  isOpen,
  onClose,
  streak = 1,
  longestStreak = 1,
  totalSolved = 1,
}) => {
  if (!isOpen) return null;

  // Week days representation
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayIndex = new Date().getDay();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
        {/* Top Glow & Flame Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-6 sm:p-8 text-center text-white">
          {/* Subtle background circles for depth */}
          <div className="absolute -top-12 -left-12 h-40 w-40 rounded-full bg-white/10 blur-xl pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-yellow-300/20 blur-xl pointer-events-none" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white/80 transition hover:bg-black/30 hover:text-white"
            title="Close"
          >
            <X size={18} />
          </button>

          {/* Pulsing Flame Icon */}
          <div className="mx-auto mb-2.5 sm:mb-3 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-md">
            <span className="text-4xl sm:text-5xl animate-bounce">🔥</span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider backdrop-blur-xs">
            <Sparkles size={13} className="text-yellow-200" />
            Today's Problem Solved!
          </div>

          <h2 className="mt-2.5 sm:mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
            {streak} Day Streak!
          </h2>

          <p className="mt-1 text-xs sm:text-sm text-orange-100 font-medium">
            You've maintained your C coding habit today!
          </p>
        </div>

        {/* Card Body */}
        <div className="p-4 sm:p-6">
          {/* 7-Day Mini Calendar Tracker */}
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 sm:p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2.5 sm:mb-3">
              <span className="flex items-center gap-1 text-[11px] sm:text-xs">
                <CalendarCheck size={14} className="text-orange-500" />
                This Week's Activity
              </span>
              <span className="text-[10px] sm:text-[11px] text-emerald-600 font-bold">
                Today Completed ✓
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
              {daysOfWeek.map((day, idx) => {
                const isToday = idx === todayIndex;
                const isPast = idx < todayIndex;

                return (
                  <div
                    key={day}
                    className={`flex flex-col items-center rounded-xl py-1.5 px-0.5 sm:py-2 sm:px-1 text-xs transition ${
                      isToday
                        ? "bg-gradient-to-b from-orange-500 to-amber-500 text-white shadow-sm font-bold scale-105"
                        : isPast
                        ? "bg-emerald-50 text-emerald-700 font-medium"
                        : "bg-white text-slate-400 border border-slate-100"
                    }`}
                  >
                    <span className="text-[9px] sm:text-[10px] uppercase">{day}</span>
                    <span className="mt-0.5 sm:mt-1 text-xs">
                      {isToday ? "🔥" : isPast ? "✓" : "•"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats Summary Grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-semibold uppercase">
                <CheckCircle2 size={13} className="text-emerald-500" />
                Solved
              </div>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {totalSolved}
              </p>
              <p className="text-[10px] text-slate-400">Total Problems</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 font-semibold uppercase">
                <Trophy size={13} className="text-amber-500" />
                Best Streak
              </div>
              <p className="mt-1 text-2xl font-bold text-slate-800">
                {longestStreak}
              </p>
              <p className="text-[10px] text-slate-400">Consecutive Days</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col gap-2.5">
            <Link
              to="/dashboard"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 text-sm"
            >
              <span>View Dashboard</span>
              <ArrowRight size={16} />
            </Link>

            <button
              onClick={onClose}
              className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Continue Practicing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreakCelebrationModal;

