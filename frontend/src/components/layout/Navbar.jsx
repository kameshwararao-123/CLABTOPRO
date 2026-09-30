import { Bell, Menu, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useRestriction } from "../../context/RestrictionContext";

const Navbar = ({ onMenuToggle }) => {
  const { user } = useAuth();
  const { switchCount } = useRestriction();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden focus:outline-none"
          title="Open Menu"
        >
          <Menu size={22} />
        </button>

        <div>
          <p className="text-xs sm:text-sm text-slate-500">
            Welcome back
          </p>

          <h2 className="text-base sm:text-lg font-bold text-slate-800">
            {user?.username}
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Anti-cheat tab & app switch monitor badge */}
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border transition ${
            switchCount > 0
              ? "bg-amber-50 border-amber-300 text-amber-900 shadow-xs"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
          title="Tab switching and background app switching are monitored and restricted"
        >
          {switchCount > 0 ? (
            <>
              <ShieldAlert size={14} className="text-amber-600 animate-pulse" />
              <span>{switchCount} Switch Warning{switchCount > 1 ? "s" : ""}</span>
            </>
          ) : (
            <>
              <ShieldCheck size={14} className="text-emerald-600" />
              <span className="hidden xs:inline">Protected: Tab/App Monitored</span>
              <span className="xs:hidden">Protected</span>
            </>
          )}
        </div>

        <button className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
          <Bell size={20} />
        </button>

        <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600 text-sm sm:text-base">
          {user?.username?.charAt(0)?.toUpperCase()}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
