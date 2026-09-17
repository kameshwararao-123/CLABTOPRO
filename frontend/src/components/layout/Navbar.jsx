import { Bell } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const Navbar = () => {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <p className="text-sm text-slate-500">
          Welcome back
        </p>

        <h2 className="text-lg font-bold text-slate-800">
          {user?.username}
        </h2>
      </div>

      <div className="flex items-center gap-5">
        <button className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
          <Bell size={20} />
        </button>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600">
          {user?.username?.charAt(0)?.toUpperCase()}
        </div>
      </div>
    </header>
  );
};

export default Navbar;