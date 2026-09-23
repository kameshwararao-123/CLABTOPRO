import { Outlet } from "react-router-dom";
import AdminNavbar from "./AdminNavbar";

const AdminLayout = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <AdminNavbar />
      <main>
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;

