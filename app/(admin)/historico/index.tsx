import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

interface AuditReport {
  id: string;
  created_at: string;
  final_percentage: number;
  final_grade: number;
  status: string;
  profiles: {
    full_name: string | null;
  } | null;
}

export default function HistoricoAuditoriasPage() {
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchFinishedReports();
  }, []);

  const fetchFinishedReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('audit_reports')
      .select('*, profiles!audit_reports_user_id_fkey(full_name)')
      .eq('status', 'finalized')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setReports(data as any);
    }
    setLoading(false);
  };

  // ACCIÓN PRINCIPAL: Generar cadena CSV y gatillar ventana de guardado/compartido nativa
  const handleExportCSV = async () => {
    if (reports.length === 0) {
      alert('No existen reportes finalizados en este momento para exportar.');
      return;
    }

    setExporting(true);
    try {
      // 1. Definir encabezados de las columnas del CSV
      let csvContent = 'ID Reporte,Fecha Cierre,Auditor,Porcentaje,Nota Final,Estado\n';

      // 2. Insertar registros sanitizados fila por fila
      reports.forEach((r) => {
        const id = r.id;
        const fecha = r.created_at ? r.created_at.substring(0, 10) : '2026-06-02';
        const auditor = r.profiles?.full_name ? r.profiles.full_name.replace(/,/g, ' ') : 'Anonimo';
        const porcentaje = `${r.final_percentage}%`;
        const nota = r.final_grade;
        const estado = r.status;

        csvContent += `${id},${fecha},${auditor},${porcentaje},${nota},${estado}\n`;
      });

      // 3. Crear ruta física temporal en el sistema de archivos del móvil/PC
      const fileUri = `${FileSystem.documentDirectory}historico_auditorias_${Date.now()}.csv`;

      // 4. Escribir los datos con codificación UTF-8
      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // 5. Invocar el menú nativo del sistema para guardar o enviar el reporte
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exportar Historial de Auditorías',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        alert('La función de compartir archivos no está soportada en esta plataforma.');
      }
    } catch (err: any) {
      alert('Error generando la exportación: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={brandColors.greenDark} /><Text style={styles.loadingText}>Cargando histórico...</Text></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Histórico de Auditorías</Text>
          <Text style={styles.subtitle}>Reportes cerrados en la plataforma</Text>
        </View>
        
        <TouchableOpacity 
          style={[styles.exportButton, exporting && styles.disabledButton]} 
          onPress={handleExportCSV}
          disabled={exporting}
        >
          <Text style={styles.exportButtonText}>
            {exporting ? 'Generando...' : '📊 Exportar CSV'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* RENDERIZADO DE TABLA / TARJETAS */}
      {reports.length === 0 ? (
        <Text style={styles.emptyText}>No se encuentran reportes consolidados.</Text>
      ) : (
        reports.map((report) => {
          const esAprobado = report.final_percentage >= 85;
          return (
            <View key={report.id} style={styles.reportCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportId}>ID: {report.id}</Text>
                <Text style={styles.reportMeta}>Auditor: {report.profiles?.full_name || 'Desconocido'}</Text>
                <Text style={styles.reportDate}>Cierre: 2026-06-02</Text>
              </View>

              <View style={styles.scoreContainer}>
                <Text style={[styles.scoreText, esAprobado ? styles.textGreen : styles.textRed]}>
                  {report.final_grade}/10
                </Text>
                <Text style={styles.percentageText}>{report.final_percentage}%</Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.background },
  container: { padding: 20, maxWidth: 650, alignSelf: 'center', width: '100%', backgroundColor: brandColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: brandColors.border, paddingBottom: 15, gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 22, fontWeight: 'bold', color: brandColors.greenDark },
  subtitle: { fontSize: 13, color: brandColors.textSecondary, marginTop: 2 },
  exportButton: { backgroundColor: brandColors.greenDark, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  disabledButton: { backgroundColor: brandColors.green, opacity: 0.7 },
  exportButtonText: { color: brandColors.white, fontWeight: 'bold', fontSize: 14 },
  emptyText: { color: brandColors.textSecondary, fontStyle: 'italic', textAlign: 'center', marginTop: 30 },
  reportCard: { flexDirection: 'row', backgroundColor: brandColors.white, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: brandColors.border, marginTop: 12, alignItems: 'center' },
  reportId: { fontSize: 14, fontWeight: '700', color: brandColors.textPrimary },
  reportMeta: { fontSize: 13, color: brandColors.textSecondary, marginTop: 4 },
  reportDate: { fontSize: 11, color: brandColors.textSecondary, marginTop: 2 },
  scoreContainer: { alignItems: 'flex-end', minWidth: 70 },
  scoreText: { fontSize: 18, fontWeight: 'bold' },
  percentageText: { fontSize: 12, color: brandColors.textSecondary, fontWeight: '500', marginTop: 2 },
  textGreen: { color: brandColors.success },
  textRed: { color: brandColors.danger },
});
