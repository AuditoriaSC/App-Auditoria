import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Picker } from '@react-native-picker/picker'; // Componente nativo para desplegables

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
  const router = useRouter();

  // Estados para los datos maestros (simulados por ahora)
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [localesTodos, setLocalesTodos] = useState<LocalComercial[]>([]);
  const [responsablesTodos, setResponsablesTodos] = useState<Responsable[]>([]);

  // Estados del Formulario
  const [regionSeleccionada, setRegionSeleccionada] = useState('');
  const [localSeleccionado, setLocalSeleccionado] = useState('');
  const [responsableSeleccionado, setResponsableSeleccionado] = useState('');
  const [auditorEquipo, setAuditorEquipo] = useState('');
  const [tipoVisita, setTipoVisita] = useState('');

  // Estados filtrados reactivos
  const [localesFiltrados, setLocalesFiltrados] = useState<LocalComercial[]>([]);
  const [responsablesFiltrados, setResponsablesFiltrados] = useState<Responsable[]>([]);

  // Carga de datos de simulación inicial
  useEffect(() => {
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

  // Filtro reactivo por región geográfica
  useEffect(() => {
    if (regionSeleccionada) {
      setLocalesFiltrados(localesTodos.filter(l => l.region_id === regionSeleccionada));
      setResponsablesFiltrados(responsablesTodos.filter(r => r.region_id === regionSeleccionada));
    } else {
      setLocalesFiltrados([]);
      setResponsablesFiltrados([]);
    }
    setLocalSeleccionado('');
    setResponsableSeleccionado('');
  }, [regionSeleccionada, localesTodos, responsablesTodos]);

  const handleComenzar = () => {
    if (!regionSeleccionada || !localSeleccionado || !responsableSeleccionado || !auditorEquipo || !tipoVisita) {
      alert('Por favor complete todos los campos obligatorios.');
      return;
    }

    // Navegar al checklist dinámico pasando los filtros como parámetros de URL
    router.push({
      pathname: `/checklist/auditoria-${Date.now()}`,
      params: {
        region: regionSeleccionada === 'reg-1' ? 'Región Norte' : 'Región Sur',
        visit_type_id: tipoVisita
      }
    });
  };

  const isFormValid = regionSeleccionada && localSeleccionado && responsableSeleccionado && auditorEquipo && tipoVisita;

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.card}>
        <Text style={styles.title}>Nueva Auditoría</Text>
        
        {/* Desplegable: Región */}
        <Text style={styles.label}>Región Geográfica *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={regionSeleccionada}
            onValueChange={(itemValue) => setRegionSeleccionada(itemValue)}
          >
            <option value="">-- Selecciona una Región --</option>
            {regiones.map(r => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </Picker>
        </View>

        {/* Desplegable: Local Comercial */}
        <Text style={styles.label}>Local Comercial *</Text>
        <View style={[styles.pickerContainer, !regionSeleccionada && styles.disabledPicker]}>
          <Picker
            selectedValue={localSeleccionado}
            onValueChange={(itemValue) => setLocalSeleccionado(itemValue)}
            enabled={!!regionSeleccionada}
          >
            <option value="">{regionSeleccionada ? '-- Selecciona un Local --' : '▲ Selecciona primero una región'}</option>
            {localesFiltrados.map(l => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </Picker>
        </View>

        {/* Desplegable: Responsable */}
        <Text style={styles.label}>Responsable del Local *</Text>
        <View style={[styles.pickerContainer, !regionSeleccionada && styles.disabledPicker]}>
          <Picker
            selectedValue={responsableSeleccionado}
            onValueChange={(itemValue) => setResponsableSeleccionado(itemValue)}
            enabled={!!regionSeleccionada}
          >
            <option value="">{regionSeleccionada ? '-- Selecciona al Responsable --' : '▲ Selecciona primero una región'}</option>
            {responsablesFiltrados.map(r => (
              <option key={r.id} value={r.id}>{r.nombre}</option>
            ))}
          </Picker>
        </View>

        {/* Entrada: Auditor / Equipo */}
        <Text style={styles.label}>Auditor / Equipo Evaluador *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Juan Pérez / Equipo Control"
          value={auditorEquipo}
          onChangeText={setAuditorEquipo}
        />

        {/* Desplegable: Tipo de Visita */}
        <Text style={styles.label}>Tipo de Visita *</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={tipoVisita}
            onValueChange={(itemValue) => setTipoVisita(itemValue)}
          >
            <option value="">-- Selecciona el Tipo --</option>
            <option value="ordinaria">Ordinaria / Rutina</option>
            <option value="extraordinaria">Extraordinaria / Sorpresa</option>
            <option value="seguimiento">Seguimiento de Incidencias</option>
          </Picker>
        </View>

        {/* Botón de Envío */}
        <TouchableOpacity 
          style={[styles.button, !isFormValid && styles.disabledButton]} 
          onPress={handleComenzar}
          disabled={!isFormValid}
        >
          <Text style={styles.buttonText}>Comenzar Auditoría 📝</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { padding: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5', minHeight: '100%' },
  card: { backgroundColor: '#fff', padding: 25, borderRadius: 10, width: '100%', maxWidth: 450, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#f0f0f0', paddingBottom: 10 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 5, marginTop: 10 },
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, backgroundColor: '#fff', marginBottom: 10 },
  disabledPicker: { backgroundColor: '#eaeaea', borderColor: '#ddd' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 10, fontSize: 15, backgroundColor: '#fff', marginBottom: 10 },
  button: { backgroundColor: '#10b981', padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 15 },
  disabledButton: { backgroundColor: '#a7f3d0', opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});