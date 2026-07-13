import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../../constants/theme';
import { supabase } from '../../../supabaseClient';
import { InventoryNoticeModal, InventoryShell, inventoryShellStyles as styles } from './inventory-shell';
import { downloadInventoryReportPdf } from '../inventory-pdf';

const inventoryCsvTemplate = [
  'Código de Almacén;Referencia o SKU;Descripción del Item;Stock Contado o Físico;Stock Teórico o Sistema;Diferencia;Costo Unitario;Costo Total',
  'GM;00123;Producto prueba con ñ;10;8;2;1.50;3.00',
  'GM;00456;Producto prueba con tilde café;5;7;-2;2.00;-4.00',
].join('\n');

const crossesCsvTemplate = [
  'SKU;Descripción del artículo;Cruce asignado;Factor de conversión',
  '00123;Producto prueba con ñ;Materia prima A;1',
  '00456;Producto prueba con tilde café;Materia prima B;0.5',
].join('\n');

type InventoryReportListItem = {
  id: string;
  local_codigo: string;
  local_name_snapshot: string;
  inventory_cutoff_label?: string | null;
  inventory_date: string;
  assigned_auditor_name_snapshot?: string | null;
  status: string;
  created_at: string;
  inventory_email_sent?: boolean | null;
  inventory_email_status?: string | null;
  csv_items_count?: number;
  results_count?: number;
  manual_validations_count?: number;
  evidences_count?: number;
};

type ProfileSummary = {
  role: string | null;
};

type PendingListAction =
  | { type: 'send'; report: InventoryReportListItem }
  | { type: 'request-delete'; report: InventoryReportListItem }
  | { type: 'delete'; report: InventoryReportListItem };

function formatDate(date: string) {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  return [day, month, year].filter(Boolean).join('/');
}

function primaryActionForReport(report: InventoryReportListItem) {
  if (report.inventory_email_sent || report.inventory_email_status === 'sent' || report.status === 'finalized') {
    return {
      label: 'Abrir informe',
      pathname: '/modulos/inventarios/evidencias',
    } as const;
  }

  if (report.status === 'manual_validations_completed') {
    return {
      label: 'Continuar evidencias',
      pathname: '/modulos/inventarios/evidencias',
    } as const;
  }

  if (report.status === 'results_validated' || (report.manual_validations_count || 0) > 0) {
    return {
      label: 'Continuar validaciones',
      pathname: '/modulos/inventarios/validaciones-manuales',
    } as const;
  }

  if (report.status === 'csv_loaded' || (report.results_count || 0) > 0) {
    return {
      label: 'Continuar resultados',
      pathname: '/modulos/inventarios/resultados',
    } as const;
  }

  if ((report.csv_items_count || 0) > 0) {
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
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generatingPdfReportId, setGeneratingPdfReportId] = useState<string | null>(null);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cutoffFilter, setCutoffFilter] = useState('TODOS');
  const [showCutoffFilterOptions, setShowCutoffFilterOptions] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingListAction | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single<ProfileSummary>();
        if (active) setProfile(profileData || null);
      }

      const { data, error } = await supabase
        .from('inventory_reports')
        .select('id, local_codigo, local_name_snapshot, inventory_cutoff_label, inventory_date, assigned_auditor_name_snapshot, status, created_at, inventory_email_sent, inventory_email_status')
        .order('created_at', { ascending: false })
        .limit(40);

      if (!active) return;
      if (error) {
        setMessage('No se pudo cargar el listado local de informes.');
      } else {
        const baseReports = (data || []) as InventoryReportListItem[];
        const enrichedReports = await Promise.all(baseReports.map(async (report) => {
          const [
            itemsResult,
            resultsResult,
            invoicesResult,
            recountsResult,
            finishedProductsResult,
            cashClosuresResult,
            evidencesResult,
          ] = await Promise.all([
            supabase
              .from('inventory_report_items')
              .select('id', { count: 'exact', head: true })
              .eq('inventory_report_id', report.id),
            supabase
              .from('inventory_report_results')
              .select('id', { count: 'exact', head: true })
              .eq('inventory_report_id', report.id),
            supabase
              .from('inventory_manual_invoice_checks')
              .select('id', { count: 'exact', head: true })
              .eq('inventory_report_id', report.id),
            supabase
              .from('inventory_recounts')
              .select('id', { count: 'exact', head: true })
              .eq('inventory_report_id', report.id),
            supabase
              .from('inventory_finished_product_differences')
              .select('id', { count: 'exact', head: true })
              .eq('inventory_report_id', report.id),
            supabase
              .from('inventory_cash_closures')
              .select('id', { count: 'exact', head: true })
              .eq('inventory_report_id', report.id),
            supabase
              .from('inventory_report_evidences')
              .select('id', { count: 'exact', head: true })
              .eq('inventory_report_id', report.id),
          ]);

          return {
            ...report,
            csv_items_count: itemsResult.count || 0,
            results_count: resultsResult.count || 0,
            manual_validations_count:
              (invoicesResult.count || 0)
              + (recountsResult.count || 0)
              + (finishedProductsResult.count || 0)
              + (cashClosuresResult.count || 0),
            evidences_count: evidencesResult.count || 0,
          };
        }));

        if (active) setReports(enrichedReports);
      }
    }

    loadReports();

    return () => {
      active = false;
    };
  }, []);

  const cutoffOptions = useMemo(() => {
    return ['TODOS', ...Array.from(new Set(reports.map((report) => report.inventory_cutoff_label || 'Sin corte')))];
  }, [reports]);

  const filteredReports = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return reports.filter((report) => {
      const matchesCutoff = cutoffFilter === 'TODOS' || (report.inventory_cutoff_label || 'Sin corte') === cutoffFilter;
      const searchable = [
        report.local_codigo,
        report.local_name_snapshot,
        report.assigned_auditor_name_snapshot || '',
        formatDate(report.inventory_date),
        report.inventory_cutoff_label || '',
      ].join(' ').toLowerCase();

      return matchesCutoff && (!normalizedSearch || searchable.includes(normalizedSearch));
    });
  }, [cutoffFilter, reports, searchQuery]);

  const canDeleteReports = profile?.role === 'admin' || profile?.role === 'super_admin';

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

  async function handleSendEmail(reportId: string) {

    setSendingReportId(reportId);
    setMessage(null);

    const { data, error } = await supabase.functions.invoke('send-inventory-report', {
      body: { inventoryReportId: reportId },
    });

    setSendingReportId(null);

    if (error) {
      setMessage('No se pudo enviar el correo: ' + error.message);
      return;
    }

    const response = data as { message?: string; error?: string } | null;
    if (response?.error) {
      setMessage('No se pudo enviar el correo: ' + response.error);
      return;
    }

    setMessage(response?.message || 'Correo enviado correctamente.');
  }

  async function handleDeleteReport(report: InventoryReportListItem) {
    if (!canDeleteReports) {

      setDeletingReportId(report.id);
      setMessage(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setDeletingReportId(null);
        setMessage('No se pudo validar el usuario para crear la solicitud.');
        return;
      }

      const { error } = await supabase
        .from('inventory_authorization_requests')
        .insert([{
          inventory_report_id: report.id,
          local_code_snapshot: report.local_codigo,
          local_name_snapshot: report.local_name_snapshot,
          request_type: 'delete_report',
          requested_by: user.id,
          reason: `Solicitud de eliminación del informe ${report.local_codigo} · ${report.local_name_snapshot}`,
        }]);

      setDeletingReportId(null);

      if (error) {
        const duplicate = error.message?.toLowerCase().includes('duplicate') || error.code === '23505';
        setMessage(duplicate
          ? 'Ya existe una solicitud pendiente para eliminar este informe.'
          : 'No se pudo registrar la solicitud. Revisa si la migración de Autorizaciones ya fue aplicada.');
        return;
      }

      setMessage('Solicitud enviada a Autorizaciones. El informe no se eliminará hasta que un admin o super_admin lo apruebe.');
      return;
    }


    setDeletingReportId(report.id);
    setMessage(null);

    const { data: evidences } = await supabase
      .from('inventory_report_evidences')
      .select('file_path')
      .eq('inventory_report_id', report.id);

    const filePaths = ((evidences || []) as Array<{ file_path: string | null }>)
      .map((evidence) => evidence.file_path)
      .filter(Boolean) as string[];

    if (filePaths.length > 0) {
      await supabase.storage.from('inventory-report-evidences').remove(filePaths);
    }

    const { error } = await supabase
      .from('inventory_reports')
      .delete()
      .eq('id', report.id);

    setDeletingReportId(null);

    if (error) {
      setMessage('No se pudo eliminar el informe: ' + error.message);
      return;
    }

    setReports((current) => current.filter((item) => item.id !== report.id));
    setMessage('Informe eliminado correctamente.');
  }

  function confirmPendingAction() {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === 'send') {
      void handleSendEmail(action.report.id);
      return;
    }
    void handleDeleteReport(action.report);
  }

  return (
    <InventoryShell
      title="Informes de Inventario"
      subtitle="Módulo web para elaborar, revisar y consultar informes de inventario."
      showBackToModule={false}
    >
      <View style={styles.compactActionGrid}>
        <TouchableOpacity style={styles.compactActionCard} onPress={() => router.push('/modulos/inventarios/crear')}>
          <Text style={styles.cardTitle}>Crear Informe de Inventario</Text>
          <Text style={styles.cardDescription}>Nuevo informe con encabezado, CSV, resultados y evidencias.</Text>
          <Text style={styles.cardStatus}>Crear</Text>
        </TouchableOpacity>

        <View style={styles.compactActionCard}>
          <Text style={styles.cardTitle}>Plantillas CSV</Text>
          <Text style={styles.cardDescription}>Modelos base para inventario y cruces.</Text>
          <View style={styles.compactTemplateActions}>
            <TouchableOpacity
              style={styles.compactTemplateButton}
              onPress={() => downloadCsvTemplate('plantilla_inventario.csv', inventoryCsvTemplate)}
            >
              <Text style={styles.secondaryButtonText}>Inventario</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.compactTemplateButton}
              onPress={() => downloadCsvTemplate('plantilla_cruces_inventario.csv', crossesCsvTemplate)}
            >
              <Text style={styles.secondaryButtonText}>Cruces</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Listado local de informes de inventario</Text>
        {message ? <Text style={styles.hint}>{message}</Text> : null}

        <View style={styles.reportFilterRow}>
          <TextInput
            style={[styles.input, styles.reportSearchInput]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por local, auditor o fecha"
            placeholderTextColor={brandColors.textSecondary}
          />
          <View style={styles.reportCutoffSelector}>
            <TouchableOpacity
              style={[styles.categoryDropdownButton, styles.reportCutoffButton]}
              onPress={() => setShowCutoffFilterOptions((current) => !current)}
            >
              <Text style={styles.categoryDropdownLabel}>Corte: {cutoffFilter}</Text>
              <Text style={styles.categoryDropdownIcon}>{showCutoffFilterOptions ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>

            {showCutoffFilterOptions ? (
              <View style={styles.reportCutoffPanel}>
                <ScrollView style={styles.segmentSelectorScroll} nestedScrollEnabled>
                  {cutoffOptions.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.categoryDropdownOption, cutoffFilter === option && styles.categoryDropdownOptionActive]}
                      onPress={() => {
                        setCutoffFilter(option);
                        setShowCutoffFilterOptions(false);
                      }}
                    >
                      <Text style={styles.categoryDropdownOptionText}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>

        {reports.length === 0 ? <Text style={styles.hint}>Aún no hay informes de inventario para mostrar.</Text> : null}
        {reports.length > 0 && filteredReports.length === 0 ? <Text style={styles.hint}>No hay informes que coincidan con la búsqueda o el corte seleccionado.</Text> : null}

        <View style={styles.reportCardGrid}>
          {filteredReports.map((report) => {
            const primaryAction = primaryActionForReport(report);

            return (
              <View key={report.id} style={styles.compactReportCard}>
                <View style={styles.compactReportInfo}>
                  <Text style={styles.compactReportTitle}>{report.local_codigo} · {report.local_name_snapshot}</Text>
                  <Text style={styles.compactReportMeta}>Auditor: {report.assigned_auditor_name_snapshot || 'Sin auditor'}</Text>
                  <Text style={styles.compactReportMeta}>Fecha: {formatDate(report.inventory_date)} · Corte: {report.inventory_cutoff_label || 'Sin corte'}</Text>
                </View>

                <View style={styles.iconActionRow}>
                  <TouchableOpacity
                    accessibilityLabel={primaryAction.label}
                    style={styles.iconButton}
                    onPress={() => router.push({
                      pathname: primaryAction.pathname,
                      params: { inventory_report_id: report.id },
                    })}
                  >
                    <Text style={styles.iconButtonText}>✎</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityLabel="Reenviar informe por correo"
                    disabled={sendingReportId === report.id}
                    style={[styles.iconButton, sendingReportId === report.id && styles.disabledButton]}
                    onPress={() => setPendingAction({ type: 'send', report })}
                  >
                    <Text style={styles.iconButtonText}>{sendingReportId === report.id ? '…' : '✉'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityLabel="Descargar PDF"
                    disabled={generatingPdfReportId === report.id}
                    style={[styles.iconButton, generatingPdfReportId === report.id && styles.disabledButton]}
                    onPress={() => handleDownloadPdf(report.id)}
                  >
                    <Text style={styles.iconButtonText}>{generatingPdfReportId === report.id ? '…' : '↓'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityLabel={canDeleteReports ? 'Eliminar informe' : 'Solicitar eliminación'}
                    disabled={deletingReportId === report.id}
                    style={[styles.iconButton, deletingReportId === report.id && styles.disabledButton]}
                    onPress={() => setPendingAction({ type: canDeleteReports ? 'delete' : 'request-delete', report })}
                  >
                    <Text style={styles.iconButtonText}>{deletingReportId === report.id ? '…' : '×'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <InventoryNoticeModal
        visible={pendingAction !== null}
        title={pendingAction?.type === 'send'
          ? 'Reenviar informe'
          : pendingAction?.type === 'request-delete'
            ? 'Solicitar eliminación'
            : 'Eliminar informe'}
        message={pendingAction?.type === 'send'
          ? '¿Deseas reenviar el informe de inventario por correo?'
          : pendingAction?.type === 'request-delete'
            ? `Se enviará una solicitud para eliminar el informe de ${pendingAction.report.local_name_snapshot}. El registro no se elimina hasta que un superior lo apruebe.`
            : `¿Eliminar completamente el informe de ${pendingAction?.report.local_name_snapshot || ''}? Esta acción elimina el informe y sus datos asociados.`}
        variant={pendingAction?.type === 'delete' ? 'danger' : pendingAction?.type === 'request-delete' ? 'warning' : 'info'}
        confirmLabel={pendingAction?.type === 'send' ? 'Reenviar' : pendingAction?.type === 'delete' ? 'Eliminar' : 'Solicitar'}
        cancelLabel="Cancelar"
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </InventoryShell>
  );
}
