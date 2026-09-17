import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Code2,
  List,
  FileCode,
  BarChart3,
  User,
  LogOut,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const Sidebar = () => {
  const { logout } = useAuth();

  const links = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      name: "Today's Problem",
      path: "/today",
      icon: Code2,
    },
    {
      name: "All Problems",
      path: "/problems",
      icon: List,
    },
    {
      name: "My Submissions",
      path: "/submissions",
      icon: FileCode,
    },
    {
      name: "Statistics",
      path: "/statistics",
      icon: BarChart3,
    },
    {
      name: "Profile",
      path: "/profile",
      icon: User,
    },
  ];

  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-slate-200 bg-white lg:block">
      <div className="flex h-full flex-col p-5">

        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
            C
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-800">
              CLAB
            </h1>
            <p className="text-xs text-slate-500">
              C Learning Buddy
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {links.map((link) => {
            const Icon = link.icon;

            return (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-indigo-50 text-indigo-600"
                      : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                <Icon size={19} />
                {link.name}
              </NavLink>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50"
        >
          <LogOut size={19} />
          Logout
        </button>

      </div>
    </aside>
  );
};

export default Sidebar;