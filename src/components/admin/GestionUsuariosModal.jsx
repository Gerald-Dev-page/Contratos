import { useEffect, useState } from 'react';
import { X, UserCheck, UserX, Shield, Loader2 } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { registrarMovimiento } from '../../utils/logger';

export default function GestionUsuariosModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actualizandoId, setActualizandoId] = useState(null);

  useEffect(() => {
    if (isOpen) cargarUsuarios();
  }, [isOpen]);

  const cargarUsuarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsuarios(data || []);
    } catch (err) {
      mostrarToast(`Error al cargar usuarios: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleEstadoUsuario = async (u) => {
    if (u.id === user.id) {
      mostrarToast('No podés pausar tu propia cuenta de Administrador.', 'error');
      return;
    }

    const nuevoEstado = !u.activo;
    setActualizandoId(u.id);

    try {
      const { error } = await supabase
        .from('perfiles')
        .update({ activo: nuevoEstado })
        .eq('id', u.id);

      if (error) throw error;

      await registrarMovimiento({
        usuario: user,
        accion: 'USUARIO_ESTADO',
        entidad: 'perfiles',
        entidadId: u.id,
        detalles: {
          usuario_afectado: u.email,
          nuevo_estado: nuevoEstado ? 'Activo' : 'Pausado'
        }
      });

      mostrarToast(`Usuario ${u.email} ${nuevoEstado ? 'activado' : 'pausado'} con éxito.`);
      cargarUsuarios();
    } catch (err) {
      mostrarToast(`Error al actualizar estado: ${err.message}`, 'error');
    } finally {
      setActualizandoId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="card-ergonomica w-full max-w-2xl bg-white overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-warm)] bg-[var(--color-bg-surface)]">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-indigo-600" />
            <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Gestión y Control de Operadores</h3>
          </div>
          <button onClick={onClose} className="btn-icono text-xs"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500">Cargando cuentas...</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Usuario / Email</th>
                  <th className="py-2.5 px-3">Rol</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{u.nombre || u.email}</div>
                      <span className="text-[11px] text-slate-500">{u.email}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="uppercase text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                        {u.rol}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {u.activo ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                          Pausado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => toggleEstadoUsuario(u)}
                        disabled={actualizandoId === u.id || u.id === user.id}
                        className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 mx-auto cursor-pointer ${
                          u.activo
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {actualizandoId === u.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : u.activo ? (
                          <>
                            <UserX size={12} /> Pausar Acceso
                          </>
                        ) : (
                          <>
                            <UserCheck size={12} /> Reactivar
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}