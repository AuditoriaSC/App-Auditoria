import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { brandColors } from '../../../../../constants/theme';
import { supabase } from '../../../../../src/supabaseClient';
import { InventoryNoticeModal, InventoryShell, inventoryShellStyles as styles } from '../../../../../src/features/inventory/components/inventory-shell';
import { downloadInventoryReportPdf } from '../../../../../src/features/inventory/inventory-pdf';

type EvidenceCategory =
  | 'Tirillas de cierre de caja'
  | 'Facturas manuales'
  | 'Traspasos pendientes'
  | 'Albaranes de compra pendientes'
  | 'Imagen del extracto de movimientos'
  | 'Imagen de regularización de bodega de diferencias'
  | 'Otro';

type EvidenceRow = {
  id: string;
  inventory_report_id: string;
  category: EvidenceCategory;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  delete_after_send: boolean;
  attached_to_email: boolean;
  deleted_after_send: boolean;
  deleted_after_send_at: string | null;
  cleanup_error: string | null;
};

type PendingEvidenceAction =
  | { type: 'delete-evidence'; evidence: EvidenceRow }
  | { type: 'mark-delete-after-send'; evidence: EvidenceRow }
  | { type: 'finalize' }
  | { type: 'send-email' };

type InventoryReportSummary = {
  id: string;
  local_codigo: string;
  local_name_snapshot: string;
  inventory_date: string;
  front_regularization_date: string;
  start_time: string;
  end_time: string;
  has_second_time_range: boolean;
  second_start_time: string | null;
  second_end_time: string | null;
  assigned_auditor_name_snapshot: string;
  status: string;
};

type ClosingSummary = {
  surplusTotal: number;
  shortageTotal: number;
  recountsOk: number;
  recountsModified: number;
  invoiceDifference: number | null;
  cashDifferenceTotal: number;
  evidenceCount: number;
  csvItemsCount: number;
  resultsCount: number;
  manualValidationsCount: number;
};

const bucketName = 'inventory-report-evidences';

const categoryOptions: Array<{ value: EvidenceCategory; label: string }> = [
  { value: 'Tirillas de cierre de caja', label: 'Tirillas de cierre de caja' },
  { value: 'Facturas manuales', label: 'Facturas manuales' },
  { value: 'Traspasos pendientes', label: 'Traspasos pendientes' },
  { value: 'Albaranes de compra pendientes', label: 'Albaranes de compra pendientes' },
  { value: 'Imagen del extracto de movimientos', label: 'Extracto de movimientos' },
  { value: 'Imagen de regularización de bodega de diferencias', label: 'Regularización de bodega de diferencias' },
  { value: 'Otro', label: 'Otro' },
];

const categories = categoryOptions.map((option) => option.value);

const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf', 'xls', 'xlsx', 'csv'];

const mimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function safeSegment(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function fileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function mimeForFile(file: File) {
  return file.type || mimeByExtension[fileExtension(file.name)] || 'application/octet-stream';
}

function isImageEvidence(evidence: Pick<EvidenceRow, 'file_name' | 'mime_type'>) {
  const mime = String(evidence.mime_type || '').toLowerCase();
  const name = evidence.file_name.toLowerCase();
  return mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(name);
}

function canDeleteAfterSend(evidence: EvidenceRow) {
  return !isImageEvidence(evidence) && !evidence.deleted_after_send;
}

function formatBytes(size?: number | null) {
  if (!size) return 'Sin tamaño';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string) {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  return [day, month, year].filter(Boolean).join('/');
}

function formatTime(time?: string | null) {
  if (!time) return '-';
  return time.slice(0, 5);
}

function categoryLabel(category: string) {
  const normalized = category
    .replace(/^Imagen del /i, '')
    .replace(/^Imagen de /i, '');
  return categoryOptions.find((option) => option.value === category)?.label || normalized;
}

export default function InventoryEvidenceScreen() {
  const router = useRouter();
  const { inventory_report_id } = useLocalSearchParams<{ inventory_report_id?: string }>();

  const [category, setCategory] = useState<EvidenceCategory>('Tirillas de cierre de caja');
  const [showCategoryOptions, setShowCategoryOptions] = useState(false);
  const [evidences, setEvidences] = useState<EvidenceRow[]>([]);
  const [report, setReport] = useState<InventoryReportSummary | null>(null);
  const [summary, setSummary] = useState<ClosingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingEvidenceAction | null>(null);

  const incompleteReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!report) reasons.push('Falta encabezado.');
    if (!summary || summary.csvItemsCount === 0) reasons.push('Falta CSV importado.');
    if (!summary || summary.resultsCount === 0) reasons.push('Faltan resultados generados/guardados.');
    if (!summary || summary.manualValidationsCount === 0) reasons.push('Faltan validaciones manuales guardadas o marcadas como no aplican.');
    return reasons;
  }, [report, summary]);

  const evidencesByCategory = useMemo(() => {
    return categories
      .map((item) => ({
        category: item,
        evidences: evidences.filter((evidence) => evidence.category === item),
      }))
      .filter((group) => group.evidences.length > 0);
  }, [evidences]);

  useEffect(() => {
    loadEvidences();
  }, [inventory_report_id]);

  async function loadEvidences() {
    if (!inventory_report_id) {
      setMessage('Falta el inventory_report_id. Primero selecciona un informe.');
      setLoading(false);
      return;
    }

    setLoading(true);
    await Promise.all([loadReportAndSummary(), loadEvidenceRows()]);
    setLoading(false);
  }

  async function loadEvidenceRows() {
    if (!inventory_report_id) return;

    const { data, error } = await supabase
      .from('inventory_report_evidences')
      .select('*')
      .eq('inventory_report_id', inventory_report_id)
      .order('uploaded_at', { ascending: true });

    if (error) {
      setMessage('No se pudieron cargar evidencias. Revisa si la migración ya fue aplicada.');
    } else {
      setEvidences((data || []) as EvidenceRow[]);
    }
  }

  async function loadReportAndSummary() {
    if (!inventory_report_id) return;

    const { data: reportData, error: reportError } = await supabase
      .from('inventory_reports')
      .select('id, local_codigo, local_name_snapshot, inventory_date, front_regularization_date, start_time, end_time, has_second_time_range, second_start_time, second_end_time, assigned_auditor_name_snapshot, status')
      .eq('id', inventory_report_id)
      .single<InventoryReportSummary>();

    if (reportError || !reportData) {
      setMessage('No se pudo cargar el encabezado del informe.');
      return;
    }

    setReport(reportData);

    const [
      csvItems,
      results,
      invoiceChecks,
      recounts,
      finishedProducts,
      cashClosures,
      evidenceCount,
    ] = await Promise.all([
      supabase.from('inventory_report_items').select('id', { count: 'exact', head: true }).eq('inventory_report_id', inventory_report_id),
      supabase.from('inventory_report_results').select('result_type, final_result', { count: 'exact' }).eq('inventory_report_id', inventory_report_id),
      supabase.from('inventory_manual_invoice_checks').select('calculated_difference', { count: 'exact' }).eq('inventory_report_id', inventory_report_id).limit(1),
      supabase.from('inventory_recounts').select('status', { count: 'exact' }).eq('inventory_report_id', inventory_report_id),
      supabase.from('inventory_finished_product_differences').select('id', { count: 'exact', head: true }).eq('inventory_report_id', inventory_report_id),
      supabase.from('inventory_cash_closures').select('cash_difference', { count: 'exact' }).eq('inventory_report_id', inventory_report_id),
      supabase.from('inventory_report_evidences').select('id', { count: 'exact', head: true }).eq('inventory_report_id', inventory_report_id),
    ]);

    const resultRows = (results.data || []) as Array<{ result_type: string; final_result: number | string | null }>;
    const cashRows = (cashClosures.data || []) as Array<{ cash_difference: number | string | null }>;
    const recountRows = (recounts.data || []) as Array<{ status: string }>;
    const manualCount = (invoiceChecks.count || 0) + (recounts.count || 0) + (finishedProducts.count || 0) + (cashClosures.count || 0);

    setSummary({
      surplusTotal: resultRows.reduce((total, row) => total + Math.max(Number(row.final_result || 0), 0), 0),
      shortageTotal: resultRows.reduce((total, row) => total + Math.min(Number(row.final_result || 0), 0), 0),
      recountsOk: recountRows.filter((row) => row.status === 'Recuento OK').length,
      recountsModified: recountRows.filter((row) => row.status === 'Recuento Modificado').length,
      invoiceDifference: invoiceChecks.data?.[0]?.calculated_difference ?? null,
      cashDifferenceTotal: cashRows.reduce((total, row) => total + Number(row.cash_difference || 0), 0),
      evidenceCount: evidenceCount.count || 0,
      csvItemsCount: csvItems.count || 0,
      resultsCount: results.count || 0,
      manualValidationsCount: manualCount,
    });
  }

  function selectFiles() {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      setMessage('La carga de evidencias está disponible solo en Web local.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,.pdf,.xls,.xlsx,.csv,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.style.display = 'none';
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if (files.length > 0) uploadFiles(files);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  }

  async function uploadFiles(files: File[]) {
    if (!inventory_report_id) {
      setMessage('Falta el inventory_report_id.');
      return;
    }

    const invalidFile = files.find((file) => !allowedExtensions.includes(fileExtension(file.name)));
    if (invalidFile) {
      setMessage(`Archivo no permitido: ${invalidFile.name}. Usa imagen, PDF, Excel o CSV.`);
      return;
    }

    setUploading(true);
    setMessage(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setUploading(false);
      setMessage('No se pudo validar el usuario logueado.');
      return;
    }

    for (const file of files) {
      const timestamp = Date.now();
      const safeCategory = safeSegment(category);
      const safeName = `${timestamp}-${safeSegment(file.name)}`;
      const filePath = `inventory-reports/${inventory_report_id}/${safeCategory}/${safeName}`;
      const mimeType = mimeForFile(file);

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        setMessage(`No se pudo subir ${file.name}: ${uploadError.message}`);
        setUploading(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('inventory_report_evidences')
        .insert([{
          inventory_report_id,
          category,
          file_name: file.name,
          file_path: filePath,
          mime_type: mimeType,
          size_bytes: file.size,
          uploaded_by: user.id,
        }]);

      if (insertError) {
        await supabase.storage.from(bucketName).remove([filePath]);
        setMessage(`No se pudo registrar ${file.name}: ${insertError.message}`);
        setUploading(false);
        return;
      }
    }

    setUploading(false);
    setMessage(`Evidencias cargadas: ${files.length}.`);
    await loadEvidences();
  }

  async function openEvidence(evidence: EvidenceRow) {
    if (evidence.deleted_after_send) {
      setMessage('Este archivo ya fue eliminado de Storage después del envío. Se conserva el registro del adjunto.');
      return;
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(evidence.file_path, 60 * 5);

    if (error || !data?.signedUrl) {
      setMessage('No se pudo generar enlace de visualización/descarga.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async function deleteEvidence(evidence: EvidenceRow) {
    if (evidence.deleted_after_send) {
      setMessage('Este archivo ya fue eliminado de Storage después del envío. Se conserva solo la trazabilidad.');
      return;
    }

    const { error: storageError } = await supabase.storage
      .from(bucketName)
      .remove([evidence.file_path]);

    if (storageError) {
      setMessage('No se pudo eliminar el archivo de Storage: ' + storageError.message);
      return;
    }

    const { error } = await supabase
      .from('inventory_report_evidences')
      .delete()
      .eq('id', evidence.id);

    if (error) {
      setMessage('No se pudo eliminar la metadata de evidencia: ' + error.message);
      return;
    }

    setMessage('Evidencia eliminada.');
    await loadEvidences();
  }

  async function toggleDeleteAfterSend(evidence: EvidenceRow) {
    if (!canDeleteAfterSend(evidence)) {
      setMessage('Las imágenes no se eliminan automáticamente. Esta opción solo aplica para documentos.');
      return;
    }

    const nextValue = !evidence.delete_after_send;

    const { error } = await supabase
      .from('inventory_report_evidences')
      .update({
        delete_after_send: nextValue,
        cleanup_error: null,
      })
      .eq('id', evidence.id);

    if (error) {
      setMessage('No se pudo actualizar la regla del archivo: ' + error.message);
      return;
    }

    setMessage(nextValue
      ? 'Archivo marcado para adjuntar al correo y eliminar después del envío exitoso.'
      : 'Archivo desmarcado. No se eliminará automáticamente.');
    await loadEvidences();
  }

  async function finalizeInventoryReport() {
    if (!inventory_report_id) return;
    if (incompleteReasons.length > 0) {
      setMessage('No se puede finalizar: ' + incompleteReasons.join(' '));
      return;
    }

    setFinalizing(true);
    setMessage(null);

    const { error } = await supabase
      .from('inventory_reports')
      .update({ status: 'finalized', updated_at: new Date().toISOString() })
      .eq('id', inventory_report_id);

    setFinalizing(false);

    if (error) {
      setMessage('No se pudo finalizar el informe: ' + error.message);
      return;
    }

    router.push('/modulos/inventarios');
  }

  async function handleDownloadPdf() {
    if (!inventory_report_id) return;
    if (Platform.OS !== 'web') {
      setMessage('La descarga del PDF está disponible solo en Web.');
      return;
    }

    setGeneratingPdf(true);
    setMessage(null);
    try {
      await downloadInventoryReportPdf(inventory_report_id);
      setMessage('PDF generado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleSendEmail() {
    if (!inventory_report_id) return;
    setSendingEmail(true);
    setMessage(null);

    const { data, error } = await supabase.functions.invoke('send-inventory-report', {
      body: { inventoryReportId: inventory_report_id },
    });

    setSendingEmail(false);

    if (error) {
      setMessage('No se pudo enviar el correo: ' + error.message);
      return;
    }

    const response = data as { message?: string; recipients?: string[]; error?: string } | null;
    if (response?.error) {
      setMessage('No se pudo enviar el correo: ' + response.error);
      return;
    }

    const recipients = response?.recipients?.length ? ` Destinatarios: ${response.recipients.join(', ')}.` : '';
    setMessage(`${response?.message || 'Correo enviado correctamente.'}${recipients}`);
    await loadEvidences();
  }

  function confirmPendingAction() {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === 'delete-evidence') {
      void deleteEvidence(action.evidence);
      return;
    }
    if (action.type === 'mark-delete-after-send') {
      void toggleDeleteAfterSend(action.evidence);
      return;
    }
    if (action.type === 'finalize') {
      void finalizeInventoryReport();
      return;
    }
    void handleSendEmail();
  }

  if (loading) {
    return (
      <InventoryShell title="Evidencias" subtitle="Cargando evidencias del informe.">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={brandColors.greenDark} />
          <Text style={styles.hint}>Cargando...</Text>
        </View>
      </InventoryShell>
    );
  }

  return (
    <InventoryShell
      title="Evidencias"
      backLabel="← Volver a validaciones"
      backRoute="/modulos/inventarios/validaciones-manuales"
      backParams={{ inventory_report_id }}
      subtitle="Adjunta evidencias fotográficas y documentales del informe de inventario. No genera correo ni PDF todavía."
    >
      <View style={[styles.form, styles.dropdownHost]}>
        {message ? <Text style={styles.hint}>{message}</Text> : null}

        <Text style={styles.blockTitle}>Categoría de evidencia</Text>
        <View style={styles.categoryDropdown}>
          <TouchableOpacity
            style={styles.categoryDropdownButton}
            onPress={() => setShowCategoryOptions((current) => !current)}
          >
            <Text style={styles.categoryDropdownLabel}>{categoryLabel(category)}</Text>
            <Text style={styles.categoryDropdownIcon}>{showCategoryOptions ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {showCategoryOptions ? (
            <View style={styles.categoryDropdownPanel}>
              {categoryOptions.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.categoryDropdownOption, category === item.value && styles.categoryDropdownOptionActive]}
                  onPress={() => {
                    setCategory(item.value);
                    setShowCategoryOptions(false);
                  }}
                >
                  <Text style={styles.categoryDropdownOptionText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.footerActions}>
          <TouchableOpacity disabled={uploading || !inventory_report_id} style={[styles.primaryButton, styles.footerPrimaryButton, (uploading || !inventory_report_id) && styles.disabledButton]} onPress={selectFiles}>
            <Text style={styles.primaryButtonText}>{uploading ? 'Subiendo...' : 'Adjuntar archivos'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Permitidos: imágenes, PDF, Excel y CSV.</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Evidencias subidas</Text>
        {evidences.length === 0 ? <Text style={styles.hint}>Aún no hay evidencias adjuntas.</Text> : null}

        {evidencesByCategory.map((group) => (
          <View key={group.category} style={styles.evidenceCategoryGroup}>
            <Text style={styles.evidenceCategoryTitle}>{categoryLabel(group.category)}</Text>
            <View style={styles.evidenceMiniCardList}>
              {group.evidences.map((evidence, index) => (
                <View key={evidence.id} style={styles.evidenceMiniCard}>
                  <View style={styles.evidenceMiniInfo}>
                    <Text style={styles.evidenceMiniTitle}>{index + 1}. {evidence.file_name}</Text>
                    <Text style={styles.evidenceMiniMeta}>{formatBytes(evidence.size_bytes)} · {new Date(evidence.uploaded_at).toLocaleString()}</Text>
                    {evidence.deleted_after_send ? (
                      <Text style={styles.evidenceMiniMeta}>Archivo eliminado de Storage tras envío · registro conservado</Text>
                    ) : evidence.delete_after_send ? (
                      <Text style={styles.errorText}>Se adjuntará al correo y se eliminará después del envío exitoso.</Text>
                    ) : null}
                    {evidence.attached_to_email && !evidence.deleted_after_send ? (
                      <Text style={styles.evidenceMiniMeta}>Adjuntado al último correo.</Text>
                    ) : null}
                    {evidence.cleanup_error ? (
                      <Text style={styles.errorText}>Error de limpieza: {evidence.cleanup_error}</Text>
                    ) : null}
                  </View>
                  <View style={styles.evidenceMiniActions}>
                    <TouchableOpacity style={styles.evidenceMiniButton} onPress={() => openEvidence(evidence)}>
                      <Text style={styles.secondaryButtonText}>Ver</Text>
                    </TouchableOpacity>
                    {canDeleteAfterSend(evidence) ? (
                      <TouchableOpacity
                        style={[styles.evidenceMiniButton, evidence.delete_after_send && styles.selectedButton]}
                        onPress={() => evidence.delete_after_send ? toggleDeleteAfterSend(evidence) : setPendingAction({ type: 'mark-delete-after-send', evidence })}
                      >
                        <Text style={styles.secondaryButtonText}>{evidence.delete_after_send ? 'No eliminar' : 'Adjuntar y eliminar'}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.evidenceMiniButton} onPress={() => setPendingAction({ type: 'delete-evidence', evidence })}>
                      <Text style={styles.secondaryButtonText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Resumen final</Text>
        {report ? (
          <>
            <Text style={styles.blockDescription}>Local: {report.local_codigo} · {report.local_name_snapshot}</Text>
            <Text style={styles.blockDescription}>Fecha inventario: {formatDate(report.inventory_date)}</Text>
            <Text style={styles.blockDescription}>Fecha regularización: {formatDate(report.front_regularization_date)}</Text>
            <Text style={styles.blockDescription}>Horario: {formatTime(report.start_time)} - {formatTime(report.end_time)}</Text>
            {report.has_second_time_range ? (
              <Text style={styles.blockDescription}>Segundo horario: {formatTime(report.second_start_time)} - {formatTime(report.second_end_time)}</Text>
            ) : null}
          </>
        ) : null}
        {summary ? (
          <Text style={styles.blockDescription}>Cantidad de archivos subidos: {evidences.length || summary.evidenceCount}</Text>
        ) : null}
        {incompleteReasons.length > 0 ? (
          <Text style={styles.errorText}>Pendiente: {incompleteReasons.join(' ')}</Text>
        ) : (
          <Text style={styles.hint}>Informe completo para cierre local. Evidencias opcionales.</Text>
        )}
      </View>

      <View style={styles.footerActions}>
        <TouchableOpacity
          disabled={generatingPdf || !inventory_report_id}
          style={[styles.secondaryButton, styles.footerSecondaryButton, (generatingPdf || !inventory_report_id) && styles.disabledButton]}
          onPress={handleDownloadPdf}
        >
          <Text style={styles.secondaryButtonText}>{generatingPdf ? 'Generando PDF...' : '⬇ Descargar PDF'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={sendingEmail || !inventory_report_id}
          style={[styles.secondaryButton, styles.footerSecondaryButton, (sendingEmail || !inventory_report_id) && styles.disabledButton]}
          onPress={() => setPendingAction({ type: 'send-email' })}
        >
          <Text style={styles.secondaryButtonText}>{sendingEmail ? 'Enviando...' : '✉ Cerrar y enviar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={finalizing || incompleteReasons.length > 0}
          style={[styles.primaryButton, styles.footerPrimaryButton, (finalizing || incompleteReasons.length > 0) && styles.disabledButton]}
          onPress={() => setPendingAction({ type: 'finalize' })}
        >
          <Text style={styles.primaryButtonText}>{finalizing ? 'Finalizando...' : 'Finalizar informe de inventario'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, styles.footerSecondaryButton]} onPress={() => router.push('/modulos/inventarios')}>
          <Text style={styles.secondaryButtonText}>Volver al listado local</Text>
        </TouchableOpacity>
      </View>
      <InventoryNoticeModal
        visible={pendingAction !== null}
        title={pendingAction?.type === 'delete-evidence'
          ? 'Eliminar evidencia'
          : pendingAction?.type === 'mark-delete-after-send'
            ? 'Adjuntar y limpiar Storage'
            : pendingAction?.type === 'finalize'
              ? 'Finalizar informe'
              : 'Cerrar y enviar'}
        message={pendingAction?.type === 'delete-evidence'
          ? `¿Eliminar evidencia "${pendingAction.evidence.file_name}"?`
          : pendingAction?.type === 'mark-delete-after-send'
            ? 'Este archivo será adjuntado al correo y eliminado de Supabase Storage solo después de enviarse correctamente. Se conservará registro del envío. ¿Continuar?'
            : pendingAction?.type === 'finalize'
              ? '¿Finalizar informe de inventario? Esta fase solo marca el informe como finalized, no genera PDF ni envía correo.'
              : '¿Cerrar y enviar informe de inventario por correo? El PDF seguirá disponible para descarga desde la app y no se enviará como adjunto.'}
        variant={pendingAction?.type === 'delete-evidence' ? 'danger' : pendingAction?.type === 'mark-delete-after-send' ? 'warning' : 'info'}
        confirmLabel={pendingAction?.type === 'delete-evidence' ? 'Eliminar' : pendingAction?.type === 'send-email' ? 'Enviar' : 'Continuar'}
        cancelLabel="Cancelar"
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </InventoryShell>
  );
}
