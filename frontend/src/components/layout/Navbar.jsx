import { Bell, Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const Navbar = ({ onMenuToggle }) => {
  const { user } = useAuth();

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

      <div className="flex items-center gap-3 sm:gap-5">
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