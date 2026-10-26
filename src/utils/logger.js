import { supabase } from '../services/supabase';

/**
 * Registra un movimiento en historial_movimientos respetando el esquema real de BD.
 */
export async function registrarMovimiento({ 
  usuario, 
  modulo = 'SISTEMA', 
  accion, 
  descripcion, 
  expedienteId = null, 
  detalles = {} 
}) {
  try {
    const payload = {
      usuario_id: usuario?.id || null,
      modulo: modulo.toUpperCase(),
      accion: accion.toUpperCase(),
      descripcion: descripcion || `${accion} realizado por ${usuario?.email || 'operador'}`,
      expediente_id: expedienteId || null,
      detalles: typeof detalles === 'object' ? detalles : { info: detalles }
    };

    const { error } = await supabase.from('historial_movimientos').insert([payload]);

    if (error) {
      console.warn('Fallo al asentar historial_movimientos:', error.message);
    }
  } catch (err) {
    console.warn('Excepción capturada en logger:', err.message);
  }
}