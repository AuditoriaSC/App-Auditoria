import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../../src/supabaseClient';

// Definición estricta de Roles Autorizados para esta descarga
const ROLES_PERMITIDOS = ['super_admin', 'regional_admin', 'vip'];

interface ReportRow {
  id: string;
  region: string;
  visit_type_id: string;
  final_grade: number;
  final_percentage: number;
  updated_at: string;
  profiles: {
    full_name: string | null;
  } | null;
}

export default function ExportacionAvanzadaPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filtros dinámicos seleccionados por el usuario
  const [filtroRegion, setFiltroRegion] = useState('TODAS'); // 'TODAS' permite bajar ambas regiones juntas
  const [filtroTipoVisita, setFiltroTipoVisita] = useState('TODOS');

  useEffect(() => {
    validarRolAdministrativo();
  }, []);

  const validarRolAdministrativo = async () => {
    setCheckingAuth(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserRole('none');
        setCheckingAuth(false);
        return;
      }

      // Consultar el rol extendido en la tabla 'profiles'
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      setUserRole(profile?.role || 'none');
    } catch (err) {
      setUserRole('none');
    } finally {
      setCheckingAuth(false);
    }
  };

  // PROCESAMIENTO ANALÍTICO: Filtrado y Compilación del archivo unificado
  const handleExportarBaseDatos = async () => {
    setExporting(true);
    try {
      // 1. Construir query base a Supabase
      let query = supabase
        .from('audit_reports')
        .select('id, region, visit_type_id, final_grade, final_percentage, updated_at, profiles(full_name)')
        .eq('status', 'finalized');

      // Filtro condicional por Región (Si es 'TODAS', no inyecta el .eq, trayendo ambas regiones juntas)
      if (filtroRegion !== 'TODAS') {
        query = query.eq('region', filtroRegion);
      }

      // Filtro condicional por Tipo de Visita
      if (filtroTipoVisita !== 'TODOS') {
        query = query.eq('visit_type_id', filtroTipoVisita);
      }

      const { data: reports, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;
      if (!reports || reports.length === 0) {
        alert('No se encontraron registros consolidados que cumplan con los criterios seleccionados.');
        setExporting(false);
        return;
      }

      // 2. Definir Estructura y BOM de compatibilidad universal con Microsoft Excel
      let csvContent = '\uFEFF'; // Agrega la marca BOM UTF-8 para que Excel interprete bien las tildes y la Ñ
      csvContent += 'ID Reporte;Región;Tipo de Visita;Auditor Evaluador;Calificación;Porcentaje de Cumplimiento;Fecha de Sello\n';

      // 3. Compilar matriz de filas
      reports.forEach((r: any) => {
        const id = r.id;
        const regionStr = r.region || 'No especificada';
        const tipoVisitaStr = r.visit_type_id || 'Ordinaria';
        const auditor = r.profiles?.full_name ? r.profiles.full_name.replace(/;/g, ' ') : 'Anónimo';
        const nota = r.final_grade ?? 0;
        const porcentaje = `${r.final_percentage ?? 0}%`;
        const fecha = r.updated_at ? r.updated_at.substring(0, 10) : '2026-06-02';

        csvContent += `${id};${regionStr};${tipoVisitaStr};${auditor};${nota};${porcentaje};${fecha}\n`;
      });

      // 4. Escribir archivo físico binario en el FileSystem de Expo
      const filename = `Reporte_Avanzado_${filtroRegion}_${Date.now()}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // 5. Invocar interfaz nativa para Guardar/Compartir el archivo en Excel o Drive
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Descargar Matriz de Datos',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        alert('El módulo de compartición nativo no está disponible en este dispositivo.');
      }

    } catch (err: any) {
      alert('Error procesando la exportación: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (checkingAuth) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#0070f3" /><Text style={styles.loadingText}>Validando Credenciales VIP...</Text></View>;
  }

  // VALIDACIÓN ESTRICTA DE ACCESO POR ROL ADMINISTRATIVO REQUERIDO
  if (!userRole || !ROLES_PERMITIDOS.includes(userRole)) {
    return (
      <View style={styles.deniedContainer}>
        <Text style={styles.deniedIcon}>🔒</Text>
        <Text style={styles.deniedTitle}>Acceso Restringido</Text>
        <Text style={styles.deniedMessage}>Esta sección de descargas avanzadas y consolidación de bases de datos solo está disponible para usuarios con perfiles Super Admin, Regional Admin o cuentas VIP corporativas.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Exportación Ejecutiva de Datos</Text>
      <Text style={styles.subtitle}>Generador unificado de reportes en formato CSV/Excel con filtros dinámicos</Text>

      <View style={styles.filterCard}>
        <Text style={styles.cardTitle}>⚙️ Configurar Parámetros del Archivo</Text>

        {/* Filtro 1: Región (Con opción unificada) */}
        <Text style={styles.label}>Área Geográfica / Regiones</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={filtroRegion}
            onValueChange={(val) => setFiltroRegion(val)}
          >
            <Picker.Item label="Unificar Ambas Regiones (Descarga Completa)" value="TODAS" />
            <Picker.Item label="Solo Región Costa" value="Costa" />
            <Picker.Item label="Solo Región Sierra" value="Sierra" />
            <Picker.Item label="Solo Región Oriente" value="Oriente" />
          </Picker>
        </View>

        {/* Filtro 2: Tipo de Visita */}
        <Text style={styles.label}>Segmentación por Tipo de Visita</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={filtroTipoVisita}
            onValueChange={(val) => setFiltroTipoVisita(val)}
          >
            <Picker.Item label="Todos los Tipos de Visita" value="TODOS" />
            <Picker.Item label="Ordinaria / Rutina" value="ordinaria" />
            <Picker.Item label="Extraordinaria / Sorpresa" value="extraordinaria" />
            <Picker.Item label="Seguimiento Técnico" value="seguimiento" />
          </Picker>
        </View>

        {/* Botón de Ejecución Automática */}
        <TouchableOpacity 
          style={[styles.downloadButton, exporting && styles.disabledButton]} 
          onPress={handleExportarBaseDatos}
          disabled={exporting}
        >
          <Text style={styles.downloadButtonText}>
            {exporting ? 'Compilando Base...' : '🚀 Compilar y Descargar Informe'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>💡 **Nota de compatibilidad:** Este generador inyecta un formateador de separador por punto y coma (`;`) y cabecera de codificación de bytes BOM UTF-8 para asegurar la visualización directa e inmediata de caracteres especiales y acentos en **Microsoft Excel** sin necesidad de asistentes de importación.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 550, alignSelf: 'center', width: '100%', backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  loadingText: { marginTop: 10, fontSize: 14, color: '#475569', fontWeight: '500' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 20 },
  filterCard: { backgroundColor: '#fff', padding: 20, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', boxShadow: '0px 2px 8px rgba(0,0,0,0.05)' },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 15 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6, marginTop: 8 },
  pickerContainer: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, backgroundColor: '#fff', marginBottom: 15, overflow: 'hidden' },
  downloadButton: { backgroundColor: '#0070f3', padding: 14, borderRadius: 6, alignItems: 'center', marginTop: 10 },
  disabledButton: { backgroundColor: '#93c5fd', opacity: 0.7 },
  downloadButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  infoBox: { marginTop: 15, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  infoText: { fontSize: 12, color: '#166534', lineHeight: 17 },
  deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, textAlign: 'center', backgroundColor: '#fff', marginTop: 50 },
  deniedIcon: { fontSize: 40, marginBottom: 10 },
  deniedTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  deniedMessage: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 18 }
});