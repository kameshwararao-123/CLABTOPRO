import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Code2,
  List,
  FileCode,
  BarChart3,
  User,
  LogOut,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const Sidebar = ({ isOpen, onClose }) => {
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

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  const handleLogout = () => {
    if (onClose) onClose();
    logout();
  };

  const navContent = (
    <div className="flex h-full flex-col p-5">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-sm shadow-indigo-200">
            C
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-800">CLAB</h1>
            <p className="text-xs text-slate-500">C Learning Buddy</p>
          </div>
        </div>

        {/* Close button for mobile drawer */}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden"
            title="Close Menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1.5">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <NavLink
              key={link.path}
              to={link.path}
              onClick={handleLinkClick}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-50 font-semibold text-indigo-600"
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
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition"
      >
        <LogOut size={19} />
        Logout
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-slate-200 bg-white lg:block z-30">
        {navContent}
      </aside>

      {/* Mobile Sliding Drawer & Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <aside className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-2xl transition-transform duration-300">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;