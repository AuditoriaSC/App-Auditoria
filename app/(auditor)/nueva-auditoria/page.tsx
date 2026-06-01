'use client';

import { useState, useEffect } from 'react';

// Interfaces estrictas para TypeScript
interface Region {
  id: string;
  nombre: string;
}

interface LocalComercial {
  id: string;
  nombre: string;
  region_id: string;
}

interface Responsable {
  id: string;
  nombre: string;
  region_id: string;
}

export default function NuevaAuditoriaPage() {
  // Estados para los datos maestros (vendrían de Supabase)
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [localesTodos, setLocalesTodos] = useState<LocalComercial[]>([]);
  const [responsablesTodos, setResponsablesTodos] = useState<Responsable[]>([]);

  // Estados del Formulario
  const [regionSeleccionada, setRegionSeleccionada] = useState('');
  const [localSeleccionado, setLocalSeleccionado] = useState('');
  const [responsableSeleccionado, setResponsableSeleccionado] = useState('');
  const [auditorEquipo, setAuditorEquipo] = useState('');
  const [tipoVisita, setTipoVisita] = useState('');

  // Estados filtrados automáticos
  const [localesFiltrados, setLocalesFiltrados] = useState<LocalComercial[]>([]);
  const [responsablesFiltrados, setResponsablesFiltrados] = useState<Responsable[]>([]);

  // 1. Simulación de carga de datos iniciales (Aquí conectarás tus tablas de Supabase más adelante)
  useEffect(() => {
    // Datos de prueba con diferentes regiones
    setRegiones([
      { id: 'reg-1', nombre: 'Región Norte' },
      { id: 'reg-2', nombre: 'Región Sur' },
    ]);

    setLocalesTodos([
      { id: 'loc-1', nombre: 'Sucursal Norte Alta', region_id: 'reg-1' },
      { id: 'loc-2', nombre: 'Sucursal Norte Centro', region_id: 'reg-1' },
      { id: 'loc-3', nombre: 'Sucursal Sur Principal', region_id: 'reg-2' },
    ]);

    setResponsablesTodos([
      { id: 'resp-1', nombre: 'Carlos Mendoza (Gerente Norte)', region_id: 'reg-1' },
      { id: 'resp-2', nombre: 'Ana López (Supervisor Norte)', region_id: 'reg-1' },
      { id: 'resp-3', nombre: 'María Rodríguez (Gerente Sur)', region_id: 'reg-2' },
    ]);
  }, []);

  // 2. EFECTO CLAVE: Cada vez que cambie la región, se filtran los locales y responsables
  useEffect(() => {
    if (regionSeleccionada) {
      setLocalesFiltrados(localesTodos.filter(l => l.region_id === regionSeleccionada));
      setResponsablesFiltrados(responsablesTodos.filter(r => r.region_id === regionSeleccionada));
    } else {
      setLocalesFiltrados([]);
      setResponsablesFiltrados([]);
    }
    // Resetear los hijos si cambia la región madre
    setLocalSeleccionado('');
    setResponsableSeleccionado('');
  }, [regionSeleccionada, localesTodos, responsablesTodos]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const datosAuditoria = {
      regionId: regionSeleccionada,
      localId: localSeleccionado,
      responsableId: responsableSeleccionado,
      auditorEquipo,
      tipoVisita,
      fechaInicio: new Date().toISOString(),
    };

    console.log('Datos listos para guardar e iniciar el checklist:', datosAuditoria);
    // Aquí irá el router.push('/auditor/checklist/ID') en el siguiente paso
    alert('¡Auditoría inicializada con éxito! Cargando checklist...');
  };

  return (
    <div style={{ maxWidth: '500px', margin: '40px auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #333', paddingBottom: '10px' }}>Nueva Auditoría</h2>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        
        {/* FILTRO MAESTRO: Región */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontWeight: 'bold' }}>Región Geográfica *</label>
          <select 
            value={regionSeleccionada} 
            onChange={(e) => setRegionSeleccionada(e.target.value)}
            required
            style={{ padding: '8px', borderRadius: '4px' }}
          >
            <option value="">-- Selecciona una Región --</option>
            {regiones.map(r => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </div>

        {/* Local Comercial (Filtrado) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontWeight: 'bold' }}>Local Comercial *</label>
          <select 
            value={localSeleccionado} 
            onChange={(e) => setLocalSeleccionado(e.target.value)}
            disabled={!regionSeleccionada}
            required
            style={{ padding: '8px', borderRadius: '4px' }}
          >
            <option value="">{regionSeleccionada ? '-- Selecciona un Local --' : '▲ Selecciona primero una región'}</option>
            {localesFiltrados.map(l => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
        </div>

        {/* Responsable (Filtrado) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontWeight: 'bold' }}>Responsable del Local *</label>
          <select 
            value={responsableSeleccionado} 
            onChange={(e) => setResponsableSeleccionado(e.target.value)}
            disabled={!regionSeleccionada}
            required
            style={{ padding: '8px', borderRadius: '4px' }}
          >
            <option value="">{regionSeleccionada ? '-- Selecciona al Responsable --' : '▲ Selecciona primero una región'}</option>
            {responsablesFiltrados.map(r => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </select>
        </div>

        {/* Auditor / Equipo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontWeight: 'bold' }}>Auditor / Equipo Evaluador *</label>
          <input 
            type="text" 
            placeholder="Ej: Juan Pérez / Equipo Control"
            value={auditorEquipo}
            onChange={(e) => setAuditorEquipo(e.target.value)}
            required
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        {/* Tipo de Visita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontWeight: 'bold' }}>Tipo de Visita *</label>
          <select 
            value={tipoVisita} 
            onChange={(e) => setTipoVisita(e.target.value)}
            required
            style={{ padding: '8px', borderRadius: '4px' }}
          >
            <option value="">-- Selecciona el Tipo --</option>
            <option value="ordinaria">Ordinaria / Rutina</option>
            <option value="extraordinaria">Extraordinaria / Sorpresa</option>
            <option value="seguimiento">Seguimiento de Incidencias</option>
          </select>
        </div>

        {/* Botón de envío */}
        <button 
          type="submit"
          style={{ 
            marginTop: '10px', 
            padding: '12px', 
            backgroundColor: regionSeleccionada && localSeleccionado ? '#10b981' : '#ccc', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: regionSeleccionada && localSeleccionado ? 'pointer' : 'not-allowed',
            fontWeight: 'bold'
          }}
          disabled={!regionSeleccionada || !localSeleccionado}
        >
          Comenzar Auditoría 📝
        </button>

      </form>
    </div>
  );
}