import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { brandColors } from '../../../constants/theme';
import { FloatingSelect } from '../../../src/components/FloatingSelect';
import { supabase } from '../../../src/supabaseClient';

const AUTHORIZED_ROLES = ['super_admin', 'admin'];

type ReportRow = {
  id: string;
  region: string | null;
  visit_type_id: string | null;
  final_grade: number | null;
  final_percentage: number | null;
  updated_at: string | null;
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
};

export default function ExportacionAvanzadaPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [regionFilter, setRegionFilter] = useState('TODAS');
  const [visitTypeFilter, setVisitTypeFilter] = useState('TODOS');

  useEffect(() => {
    validateAdminRole();
  }, []);

  const validateAdminRole = async () => {
    setCheckingAuth(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserRole('none');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      setUserRole(profile?.role || 'none');
    } catch {
      setUserRole('none');
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleExportDatabase = async () => {
    setExporting(true);
    try {
      let query = supabase
        .from('audit_reports')
        .select('id, region, visit_type_id, final_grade, final_percentage, updated_at, profiles!audit_reports_user_id_fkey(full_name)')
        .eq('status', 'finalized');

      if (regionFilter !== 'TODAS') {
        query = query.eq('region', regionFilter);
      }

      if (visitTypeFilter !== 'TODOS') {
        query = query.eq('visit_type_id', visitTypeFilter);
      }

      const { data: reports, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;
      if (!reports || reports.length === 0) {
        alert('No se encontraron registros consolidados que cumplan con los criterios seleccionados.');
        return;
      }

      let csvContent = '\uFEFF';
      csvContent += 'ID Reporte;Región;Tipo de Visita;Auditor Evaluador;Calificación;Porcentaje de Cumplimiento;Fecha de Sello\n';

      (reports as unknown as ReportRow[]).forEach((report) => {
        const profile = Array.isArray(report.profiles) ? report.profiles[0] : report.profiles;
        const auditor = profile?.full_name ? profile.full_name.replace(/;/g, ' ') : 'Anónimo';
        const percentage = `${report.final_percentage ?? 0}%`;
        const date = report.updated_at ? report.updated_at.substring(0, 10) : '';

        csvContent += [
          report.id,
          report.region || 'No especificada',
          report.visit_type_id || 'Ordinaria',
          auditor,
          report.final_grade ?? 0,
          percentage,
          date,
        ].join(';') + '\n';
      });

      const filename = `Reporte_Avanzado_${regionFilter}_${Date.now()}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Descargar matriz de datos',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        alert('El módulo de compartir no está disponible en este dispositivo.');
      }
    } catch (err: any) {
      alert('Error procesando la exportación: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (checkingAuth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={brandColors.greenDark} />
        <Text style={styles.loadingText}>Validando credenciales...</Text>
      </View>
    );
  }

  if (!userRole || !AUTHORIZED_ROLES.includes(userRole)) {
    return (
      <View style={styles.deniedContainer}>
        <Text style={styles.deniedIcon}>🔒</Text>
        <Text style={styles.deniedTitle}>Acceso restringido</Text>
        <Text style={styles.deniedMessage}>
          Esta sección de descargas avanzadas está disponible únicamente para usuarios administradores.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <Text style={styles.title}>Exportación ejecutiva de datos</Text>
      <Text style={styles.subtitle}>Generador unificado de reportes en formato CSV/Excel con filtros dinámicos.</Text>

      <View style={styles.filterCard}>
        <Text style={styles.cardTitle}>Configurar parámetros del archivo</Text>

        <FloatingSelect
          label="Área geográfica / regiones"
          value={regionFilter}
          onChange={setRegionFilter}
          options={[
            { label: 'Unificar ambas regiones', value: 'TODAS' },
            { label: 'Solo Región Costa', value: 'Costa' },
            { label: 'Solo Región Sierra', value: 'Sierra' },
          ]}
        />

        <FloatingSelect
          label="Tipo de visita"
          value={visitTypeFilter}
          onChange={setVisitTypeFilter}
          options={[
            { label: 'Todos los tipos de visita', value: 'TODOS' },
            { label: 'Sabatina', value: 'Sabatina' },
            { label: 'Nocturna', value: 'Nocturna' },
          ]}
        />

        <TouchableOpacity
          style={[styles.downloadButton, exporting && styles.disabledButton]}
          onPress={handleExportDatabase}
          disabled={exporting}
        >
          <Text style={styles.downloadButtonText}>
            {exporting ? 'Compilando base...' : 'Compilar y descargar informe'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Nota: el archivo se genera con separador por punto y coma y codificación UTF-8 para conservar tildes y caracteres especiales en Excel.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.background },
  container: { padding: 20, maxWidth: 550, alignSelf: 'center', width: '100%', backgroundColor: brandColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, backgroundColor: brandColors.background },
  loadingText: { marginTop: 10, fontSize: 14, color: brandColors.textSecondary, fontWeight: '500' },
  title: { fontSize: 22, fontWeight: 'bold', color: brandColors.greenDark },
  subtitle: { fontSize: 13, color: brandColors.textSecondary, marginTop: 4, marginBottom: 20 },
  filterCard: {
    backgroundColor: brandColors.white,
    padding: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: brandColors.border,
    boxShadow: '0px 2px 8px rgba(58,38,24,0.08)',
    position: 'relative',
    zIndex: 1000,
    elevation: 20,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: brandColors.textPrimary, marginBottom: 15 },
  downloadButton: { backgroundColor: brandColors.greenDark, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  disabledButton: { backgroundColor: brandColors.green, opacity: 0.7 },
  downloadButtonText: { color: brandColors.white, fontSize: 15, fontWeight: 'bold' },
  infoBox: { marginTop: 15, padding: 12, backgroundColor: brandColors.greenSoft, borderRadius: 8, borderWidth: 1, borderColor: brandColors.border },
  infoText: { fontSize: 12, color: brandColors.greenDark, lineHeight: 17 },
  deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: brandColors.background, marginTop: 50 },
  deniedIcon: { fontSize: 40, marginBottom: 10 },
  deniedTitle: { fontSize: 18, fontWeight: 'bold', color: brandColors.textPrimary },
  deniedMessage: { fontSize: 13, color: brandColors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 18 },
});
