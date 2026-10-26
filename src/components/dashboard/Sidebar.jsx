// src/components/dashboard/Sidebar.jsx
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  CreditCard,
  LogOut,
  Settings,
  UserCircle,
  History as HistoryIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

// Rutas a logos institucionales
import logoCaja from "../../public/Logo-caja.png";
import logoGerald from "../../public/Logo-Gerald.png";

export default function Sidebar() {
  const { perfil, rol, logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer ${
      isActive
        ? "bg-[var(--color-brand-primary)] text-white shadow-sm font-semibold"
        : "text-slate-300 hover:bg-[var(--color-sidebar-hover)] hover:text-white"
    }`;

  return (
    <aside className="w-64 bg-[var(--color-sidebar-bg)] border-r border-[var(--color-sidebar-border)] flex flex-col justify-between h-screen p-5 shrink-0 select-none">
      <div className="space-y-6">
        {/* Logo Institucional */}
        <div className="flex items-center px-1 py-1">
          <img
            src={logoCaja}
            alt="Caja Social"
            className="h-11 w-auto object-contain"
          />
        </div>

        {/* Navegación según Rol con texto text-sm e iconos size 20 */}
        <nav className="space-y-2">
          <NavLink to="/" end className={linkClass}>
            <LayoutDashboard size={20} strokeWidth={1.8} />
            <span>Dashboard</span>
          </NavLink>

          {(rol === "admin" || rol === "inmobiliario") && (
            <NavLink to="/inmobiliaria" className={linkClass}>
              <FolderKanban size={20} strokeWidth={1.8} />
              <span>Contratos y Terrenos</span>
            </NavLink>
          )}

          {(rol === "admin" || rol === "tesoreria") && (
            <NavLink to="/tesoreria" className={linkClass}>
              <CreditCard size={20} strokeWidth={1.8} />
              <span>Tesorería y Cobros</span>
            </NavLink>
          )}

          {(rol === "admin" || rol === "inmobiliario") && (
            <NavLink to="/configuracion" className={linkClass}>
              <Settings size={20} strokeWidth={1.8} />
              <span>Configuración</span>
            </NavLink>
          )}

          {rol === "admin" && (
            <NavLink to="/auditoria" className={linkClass}>
              <HistoryIcon size={20} strokeWidth={1.8} />
              <span>Auditoría de Movimientos</span>
            </NavLink>
          )}
        </nav>
      </div>

      {/* Perfil, Logout y Marca Gerald.Dev */}
      <div className="pt-4 border-t border-[var(--color-sidebar-border)] space-y-4">
        <div className="flex items-center gap-3 px-1">
          <UserCircle
            size={32}
            className="text-slate-400 shrink-0"
            strokeWidth={1.75}
          />
          <div className="overflow-hidden">
            <strong
              className="block text-sm font-semibold text-white truncate"
              title={perfil?.nombre_completo}
            >
              {perfil?.nombre_completo || "Usuario"}
            </strong>
            <span
              className="block text-xs text-slate-400 truncate"
              title={perfil?.email}
            >
              {perfil?.email}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors cursor-pointer"
        >
          <LogOut size={16} strokeWidth={2} />
          <span>Cerrar Sesión</span>
        </button>

        <div className="flex items-center justify-between px-1 pt-2 border-t border-[var(--color-sidebar-border)]/60">
          <span className="text-[10px] text-slate-400 font-medium">
            Powered by
          </span>
          <img
            src={logoGerald}
            alt="Gerald Agency"
            className="h-4 w-auto opacity-75"
          />
        </div>
      </div>
    </aside>
  );
}