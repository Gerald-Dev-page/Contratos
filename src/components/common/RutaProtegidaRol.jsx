import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function RutaProtegidaRol({ rolesPermitidos }) {
  const { user, perfil, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const rolActual = perfil?.rol || user?.user_metadata?.rol || 'operador';

  if (!rolesPermitidos.includes(rolActual)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}