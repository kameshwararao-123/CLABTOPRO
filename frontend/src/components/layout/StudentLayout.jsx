import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { RestrictionProvider } from "../../context/RestrictionContext";
import RestrictionModal from "../common/RestrictionModal";

const StudentLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <RestrictionProvider>
      <div className="min-h-screen bg-slate-50 relative">
        <RestrictionModal />

        <Sidebar
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />

        <div className="lg:ml-64">
          <Navbar onMenuToggle={() => setMobileMenuOpen(true)} />

          <main className="p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </RestrictionProvider>
  );
};

export default StudentLayout;

