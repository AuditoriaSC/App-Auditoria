import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from './inventory-shell';
import { downloadInventoryReportPdf } from '../inventory-pdf';

const actions = [
  {
    title: 'Crear Informe de Inventario',
    description: 'Inicia el flujo del informe: encabezado, CSV, resultados, validaciones, evidencias y cierre local.',
    route: '/modulos/inventarios/crear',
  },
] as const;

const flowSteps = [
  'Encabezado',
  'Carga CSV',
  'Resultados',
  'Validaciones Manuales',
  'Evidencias',
  'Revisión / Cierre',
] as const;

const inventoryCsvTemplate = [
  'Código de Almacén,Referencia o SKU,Descripción del Item,Stock Contado o Físico,Stock Teórico o Sistema,Diferencia,Costo Unitario,Costo Total',
  'GM,00123,Producto prueba con ñ,10,8,2,1.50,3.00',
  'GM,00456,Producto prueba con tilde café,5,7,-2,2.00,-4.00',
].join('\n');

const crossesCsvTemplate = [
  'SKU,Descripción del artículo,Cruce asignado,Factor de conversión',
  '00123,Producto prueba con ñ,Materia prima A,1',
  '00456,Producto prueba con tilde café,Materia prima B,0.5',
].join('\n');

type InventoryReportListItem = {
  id: string;
  local_codigo: string;
  local_name_snapshot: string;
  inventory_cutoff_label?: string | null;
  inventory_date: string;
  status: string;
  created_at: string;
  inventory_email_sent?: boolean | null;
  inventory_email_status?: string | null;
};

function formatDate(date: string) {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  return [day, month, year].filter(Boolean).join('/');
}

function reportStatusLabel(report: InventoryReportListItem) {
  if (report.inventory_email_sent || report.inventory_email_status === 'sent') return 'Enviado';

  const labels: Record<string, string> = {
    draft: 'Borrador',
    csv_loaded: 'CSV cargado',
    results_validated: 'Resultados guardados',
    manual_validations_completed: 'Validaciones guardadas',
    finalized: 'Finalizado',
  };

  return labels[report.status] || report.status || 'Borrador';
}

function primaryActionForReport(report: InventoryReportListItem) {
  if (report.inventory_email_sent || report.inventory_email_status === 'sent' || report.status === 'finalized') {
    return {
      label: 'Ver informe',
      pathname: '/modulos/inventarios/evidencias',
    } as const;
  }

  if (report.status === 'manual_validations_completed') {
    return {
      label: 'Continuar a evidencias',
      pathname: '/modulos/inventarios/evidencias',
    } as const;
  }

  if (report.status === 'results_validated') {
    return {
      label: 'Continuar validaciones',
      pathname: '/modulos/inventarios/validaciones-manuales',
    } as const;
  }

  if (report.status === 'csv_loaded') {
    return {
      label: 'Continuar resultados',
      pathname: '/modulos/inventarios/resultados',
    } as const;
  }

  return {
    label: 'Continuar CSV',
    pathname: '/modulos/inventarios/carga-csv',
  } as const;
}

export default function InventoryModuleScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<InventoryReportListItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [generatingPdfReportId, setGeneratingPdfReportId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      const { data, error } = await supabase
        .from('inventory_reports')
        .select('id, local_codigo, local_name_snapshot, inventory_cutoff_label, inventory_date, status, created_at, inventory_email_sent, inventory_email_status')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!active) return;
      if (error) {
        setMessage('No se pudo cargar el listado local de informes.');
      } else {
        setReports((data || []) as InventoryReportListItem[]);
      }
    }

    loadReports();

    return () => {
      active = false;
    };
  }, []);

  function downloadCsvTemplate(fileName: string, csvContent: string) {
    if (typeof document === 'undefined') {
      setMessage('La descarga de plantillas está disponible solo en Web local.');
      return;
    }

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf(reportId: string) {
    setGeneratingPdfReportId(reportId);
    setMessage(null);
    try {
      await downloadInventoryReportPdf(reportId);
      setMessage('PDF generado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
    } finally {
      setGeneratingPdfReportId(null);
    }
  }

  return (
    <InventoryShell
      title="Informes de Inventario"
      subtitle="Módulo en desarrollo local. Permanece oculto fuera del entorno de pruebas y no modifica Auditoría 1.0."
      showBackToModule={false}
    >
      <View style={styles.grid}>
        {actions.map((action) => (
          <TouchableOpacity key={action.title} style={styles.card} onPress={() => router.push(action.route)}>
            <Text style={styles.cardTitle}>{action.title}</Text>
            <Text style={styles.cardDescription}>{action.description}</Text>
            <Text style={styles.cardStatus}>Abrir</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Flujo del informe</Text>
        <Text style={styles.blockDescription}>
          Crea un informe y avanza por las pantallas en orden. La base maestra de cruces se mantiene desde Administrador de Recursos para evitar accesos duplicados.
        </Text>
        <View style={styles.flowStepRow}>
          {flowSteps.map((step, index) => (
            <View key={step} style={styles.flowStepPill}>
              <Text style={styles.flowStepText}>{index + 1}. {step}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Plantillas CSV para pruebas locales</Text>
        <Text style={styles.blockDescription}>
          Descarga estos modelos para probar el flujo con columnas exactas. Recuerda ajustar el Código de Almacén al local seleccionado en el encabezado.
        </Text>
        <View style={styles.grid}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => downloadCsvTemplate('plantilla_inventario.csv', inventoryCsvTemplate)}
          >
            <Text style={styles.secondaryButtonText}>Descargar plantilla CSV de inventario</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => downloadCsvTemplate('plantilla_cruces_inventario.csv', crossesCsvTemplate)}
          >
            <Text style={styles.secondaryButtonText}>Descargar plantilla CSV de cruces</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>SKU se conserva como texto; no lo conviertas a número para no perder ceros a la izquierda.</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Listado local de informes de inventario</Text>
        {message ? <Text style={styles.hint}>{message}</Text> : null}
        {reports.length === 0 ? <Text style={styles.hint}>Aún no hay informes de inventario para mostrar.</Text> : null}
        {reports.map((report) => {
          const primaryAction = primaryActionForReport(report);

          return (
          <View key={report.id} style={styles.block}>
            <Text style={styles.blockTitle}>{report.local_codigo} · {report.local_name_snapshot}</Text>
            <Text style={styles.blockDescription}>Corte: {report.inventory_cutoff_label || 'Sin corte asignado'}</Text>
            <Text style={styles.blockDescription}>Fecha inventario: {formatDate(report.inventory_date)}</Text>
            <Text style={styles.blockDescription}>Estado: {reportStatusLabel(report)}</Text>
            <View style={styles.footerActions}>
              <TouchableOpacity
                style={[styles.primaryButton, styles.footerPrimaryButton]}
                onPress={() => router.push({
                  pathname: primaryAction.pathname,
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.primaryButtonText}>{primaryAction.label}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.grid}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({
                  pathname: '/modulos/inventarios/carga-csv',
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.secondaryButtonText}>Abrir CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({
                  pathname: '/modulos/inventarios/resultados',
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.secondaryButtonText}>Abrir resultados</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({
                  pathname: '/modulos/inventarios/validaciones-manuales',
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.secondaryButtonText}>Abrir validaciones</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({
                  pathname: '/modulos/inventarios/evidencias',
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.secondaryButtonText}>Abrir evidencias / cierre</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={generatingPdfReportId === report.id}
                style={[styles.secondaryButton, generatingPdfReportId === report.id && styles.disabledButton]}
                onPress={() => handleDownloadPdf(report.id)}
              >
                <Text style={styles.secondaryButtonText}>{generatingPdfReportId === report.id ? 'Generando...' : '⬇ PDF'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          );
        })}
      </View>

    </InventoryShell>
  );
}
