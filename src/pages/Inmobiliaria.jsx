import { useEffect, useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Eye, 
  Edit3, 
  Phone, 
  CheckCheck, 
  Loader2,
  BellRing,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { registrarMovimiento } from '../utils/logger';
import ContratoFormModal from '../components/inmobiliaria/ContratoFormModal';
import DetalleTitularModal from '../components/inmobiliaria/DetalleTitularModal';
import EditarContratoModal from '../components/inmobiliaria/EditarContratoModal';
import BotonVerPdf from '../components/common/BotonVerPdf';

export default function Inmobiliaria() {
  const { user } = useAuth();
  const { mostrarToast } = useToast();
  const [contratos, setContratos] = useState([]);
  const [alertasMora, setAlertasMora] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [marcandoAvisoId, setMarcandoAvisoId] = useState(null);

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const elementosPorPagina = 8;

  // Estados de modales
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);
  const [contratoDetalle, setContratoDetalle] = useState(null);
  const [contratoParaEditar, setContratoParaEditar] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [resContratos, resAlertas] = await Promise.all([
        supabase
          .from('contratos')
          .select('*')
          .order('created_at', { ascending: false }),

        supabase
          .from('avisos_mora')
          .select(`
            *,
            contratos (
              id,
              numero_expediente,
              titular_nombre,
              titular_telefono
            ),
            cuotas (
              numero_cuota,
              periodo
            )
          `)
          .eq('estado', 'pendiente_envio')
          .order('fecha_reporte', { ascending: false })
      ]);

      if (resContratos.error) throw resContratos.error;
      if (resAlertas.error) throw resAlertas.error;

      setContratos(resContratos.data || []);
      setAlertasMora(resAlertas.data || []);
    } catch (err) {
      console.error('Error cargando módulo inmobiliaria:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarcarComoAvisado = async (aviso) => {
    setMarcandoAvisoId(aviso.id);
    const ahora = new Date().toISOString();

    try {
      const { error } = await supabase
        .from('avisos_mora')
        .update({
          estado: 'notificado',
          fecha_notificacion_cliente: ahora,
          gestionado_por: user.id
        })
        .eq('id', aviso.id);

      if (error) throw error;

      await registrarMovimiento({
        usuario: user,
        modulo: 'INMOBILIARIA',
        accion: 'CLIENTE_NOTIFICADO',
        descripcion: `Contacto de mora realizado a ${aviso.contratos?.titular_nombre} (Exp. ${aviso.contratos?.numero_expediente})`,
        expedienteId: aviso.contrato_id,
        detalles: { aviso_id: aviso.id, fecha: ahora }
      });

      mostrarToast('Contacto con el titular registrado exitosamente.');
      cargarDatos();
    } catch (err) {
      mostrarToast(`Error al marcar aviso: ${err.message}`, 'error');
    } finally {
      setMarcandoAvisoId(null);
    }
  };

  const contratosFiltrados = useMemo(() => {
    return contratos.filter((c) =>
      c.titular_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.numero_expediente?.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.titular_dni?.includes(busqueda) ||
      c.padron?.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [contratos, busqueda]);

  const totalPaginas = Math.ceil(contratosFiltrados.length / elementosPorPagina) || 1;
  const contratosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * elementosPorPagina;
    return contratosFiltrados.slice(inicio, inicio + elementosPorPagina);
  }, [contratosFiltrados, paginaActual]);

  return (
    <div className="p-8 w-full space-y-6">
      
      {/* 1. Alertas de Tesorería */}
      {alertasMora.length > 0 && (
        <div className="w-full rounded-xl border border-amber-300 bg-amber-50/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
            <BellRing size={18} className="text-amber-600 animate-pulse" />
            <span>Alertas de Tesorería: Clientes para contactar por mora ({alertasMora.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertasMora.map((a) => (
              <div 
                key={a.id} 
                className="bg-white border border-amber-200 p-4 rounded-lg shadow-xs flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-slate-900 text-sm">
                      {a.contratos?.titular_nombre || 'Titular'}
                    </span>
                    <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      Cuota #{a.cuotas?.numero_cuota}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 font-medium">
                    <Phone size={13} className="text-slate-400" />
                    Tel: <span className="font-semibold text-slate-800">{a.contratos?.titular_telefono || 'Sin teléfono'}</span> • Exp: {a.contratos?.numero_expediente}
                  </p>

                  <p className="text-xs italic text-slate-600 bg-slate-50 p-2.5 rounded mt-2 border border-slate-100">
                    "{a.mensaje_tesoreria}"
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">
                    Emitido: {new Date(a.fecha_reporte).toLocaleDateString('es-AR')}
                  </span>
                  <button
                    onClick={() => handleMarcarComoAvisado(a)}
                    disabled={marcandoAvisoId === a.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {marcandoAvisoId === a.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <CheckCheck size={14} />
                    )}
                    Marcar como Avisado
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Gestión Inmobiliaria y Lotes
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Administración de expedientes de venta, catastro y seguimiento de cobranzas
          </p>
        </div>

        <button
          onClick={() => setModalNuevoAbierto(true)}
          className="btn-primario text-sm py-2.5 px-5 flex items-center gap-2 cursor-pointer shadow-md bg-indigo-600 hover:bg-indigo-700 font-semibold"
        >
          <Plus size={18} /> Nuevo Contrato
        </button>
      </div>

      {/* 3. Buscador */}
      <div className="card-ergonomica p-4 flex items-center gap-3 bg-white border border-slate-200 w-full">
        <Search size={18} className="text-slate-400 ml-1" />
        <input
          type="text"
          placeholder="Buscar por Titular, Expediente, DNI o N° de Padrón..."
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPaginaActual(1);
          }}
          className="w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none"
        />
      </div>

      {/* 4. Tabla de Contratos */}
      <div className="card-ergonomica bg-white overflow-hidden shadow-xs border border-slate-200 w-full">
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Cargando contratos...</div>
        ) : contratosPaginados.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No se encontraron contratos registrados.</div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-5 font-semibold">Expediente</th>
                  <th className="py-3.5 px-5 font-semibold">Titular y DNI</th>
                  <th className="py-3.5 px-5 font-semibold">Catastro</th>
                  <th className="py-3.5 px-5 font-semibold">Contacto</th>
                  <th className="py-3.5 px-5 font-semibold">Monto Total</th>
                  <th className="py-3.5 px-5 font-semibold text-center">Contrato PDF</th>
                  <th className="py-3.5 px-5 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contratosPaginados.map((c) => {
                  const fechaAlta = c.created_at || c.fecha_carga;
                  const fechaFormateada = fechaAlta 
                    ? new Date(fechaAlta).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '-';

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-5 whitespace-nowrap">
                        <div className="font-semibold text-indigo-950">{c.numero_expediente}</div>
                        <span className="text-[11px] text-slate-400 font-mono block mt-0.5">
                          Alta: {fechaFormateada}
                        </span>
                      </td>

                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-900">{c.titular_nombre}</div>
                        <span className="text-xs text-slate-500">DNI: {c.titular_dni}</span>
                      </td>

                      <td className="py-4 px-5 text-slate-600 text-xs">
                        <p>Mz: <span className="font-semibold text-slate-800">{c.manzana}</span> | Parc: <span className="font-semibold text-slate-800">{c.parcela}</span></p>
                        <p className="text-slate-400">Padrón: {c.padron}</p>
                      </td>

                      <td className="py-4 px-5 text-slate-600 text-xs">
                        <p>{c.titular_telefono}</p>
                        <p className="text-slate-400">{c.titular_email}</p>
                      </td>

                      <td className="py-4 px-5 font-semibold text-slate-900 whitespace-nowrap">
                        ${Number(c.monto_total).toLocaleString('es-AR')}
                        <span className="block text-xs font-normal text-slate-500">{c.cantidad_cuotas} cuotas</span>
                      </td>

                      <td className="py-4 px-5 text-center">
                        <BotonVerPdf
                          filePath={c.contrato_pdf_url}
                          bucket="contratos-pdf"
                          titulo={`Contrato Exp. ${c.numero_expediente}`}
                        />
                      </td>

                      <td className="py-4 px-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setContratoDetalle(c)}
                            className="btn-icono py-1.5 px-3 text-xs flex items-center gap-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-semibold rounded-lg cursor-pointer"
                            title="Ver Ficha y Cuotas"
                          >
                            <Eye size={15} /> Ver Ficha
                          </button>

                          <button
                            onClick={() => setContratoParaEditar(c)}
                            className="btn-icono py-1.5 px-2.5 text-xs flex items-center gap-1 text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium rounded-lg cursor-pointer"
                            title="Editar Datos de Contacto y Catastro"
                          >
                            <Edit3 size={15} /> Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Barra de Paginación */}
        {totalPaginas > 1 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>
              Página <b>{paginaActual}</b> de <b>{totalPaginas}</b> ({contratosFiltrados.length} contratos)
            </span>
            <div className="flex gap-2">
              <button
                disabled={paginaActual === 1}
                onClick={() => setPaginaActual((p) => Math.max(p - 1, 1))}
                className="btn-icono py-1.5 px-3 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={paginaActual === totalPaginas}
                onClick={() => setPaginaActual((p) => Math.min(p + 1, totalPaginas))}
                className="btn-icono py-1.5 px-3 border border-slate-300 bg-white rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modales */}
      <ContratoFormModal
        isOpen={modalNuevoAbierto}
        onClose={() => setModalNuevoAbierto(false)}
        onContratoCreado={cargarDatos}
      />

      {contratoDetalle && (
        <DetalleTitularModal
          contrato={contratoDetalle}
          onClose={() => {
            setContratoDetalle(null);
            cargarDatos();
          }}
        />
      )}

      {contratoParaEditar && (
        <EditarContratoModal
          contrato={contratoParaEditar}
          onClose={() => setContratoParaEditar(null)}
          onActualizado={cargarDatos}
        />
      )}
    </div>
  );
}