import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Code2,
  Users,
  PlusCircle,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const AdminNavbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinks = [
    {
      name: "Dashboard",
      path: "/admin",
      icon: LayoutDashboard,
      end: true,
    },
    {
      name: "Manage Problems",
      path: "/admin/problems",
      icon: Code2,
      end: true,
    },
    {
      name: "Students",
      path: "/admin/students",
      icon: Users,
      end: false,
    },
    {
      name: "Create POTD",
      path: "/admin/problems/create",
      icon: PlusCircle,
      end: false,
    },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <NavLink to="/admin" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-sm shadow-indigo-200">
              C
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800">CLAB</span>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                  Admin
                </span>
              </div>
              <p className="text-xs text-slate-400">Management Portal</p>
            </div>
          </NavLink>

          {/* Nav Items */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.path}
                  to={link.path}
                  end={link.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-indigo-50 font-semibold text-indigo-600"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`
                  }
                >
                  <Icon size={17} />
                  {link.name}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Right side Profile & Logout */}
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2.5 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600">
              {user?.username?.charAt(0)?.toUpperCase() || "A"}
            </div>
            <div className="text-left text-xs">
              <p className="font-semibold text-slate-700 leading-tight">
                {user?.username || "Admin"}
              </p>
              <p className="text-slate-400 leading-tight">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Logout"
            className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50/60 px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100/80"
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile nav row */}
      <div className="flex border-t border-slate-100 px-4 py-2 overflow-x-auto md:hidden">
        {navLinks.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.path}
              to={link.path}
              end={link.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? "bg-indigo-50 font-semibold text-indigo-600"
                    : "text-slate-600 hover:bg-slate-50"
                }`
              }
            >
              <Icon size={15} />
              {link.name}
            </NavLink>
          );
        })}
      </div>
    </header>
  );
};

export default AdminNavbar;

