import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Sidebar from "./components/dashboard/Sidebar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inmobiliaria from "./pages/Inmobiliaria";
import Configuracion from "./pages/Configuracion";
import Tesoreria from "./pages/Tesoreria";
import HistorialMovimientos from './pages/HistorialMovimientos';
// Layout principal: Sidebar fijo + área de contenido dinámico
function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg-egg)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter basename="/Contratos">
          <Routes>
            {/* Ruta pública */}
            <Route path="/login" element={<Login />} />

            {/* Rutas privadas protegidas */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />

                {/* Inmobiliaria y Configuración */}
                <Route
                  element={
                    <ProtectedRoute allowedRoles={["admin", "inmobiliario"]} />
                  }
                >
                  <Route path="/inmobiliaria" element={<Inmobiliaria />} />
                  <Route path="/configuracion" element={<Configuracion />} />
                </Route>

                {/* Tesorería (desanidado y limpio) */}
                <Route
                  element={
                    <ProtectedRoute allowedRoles={["admin", "tesoreria"]} />
                  }
                >
                  <Route path="/tesoreria" element={<Tesoreria />} />
                </Route>
                <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
  <Route path="/auditoria" element={<HistorialMovimientos />} />
</Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}