import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../../../src/supabaseClient';
import SignaturePad from '../../../../src/features/audits/components/signature-pad';

export default function ConclusionesRoutePage() {
  const router = useRouter();
  const { id: reportId, region } = useLocalSearchParams();

  const [loading, setLoading] = useState(true);
  const [porcentaje, setPorcentaje] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Estados locales para las firmas en formato Base64 temporal
  const [firmaAuditorBase64, setFirmaAuditorBase64] = useState<string | null>(null);
  const [firmaResponsableBase64, setFirmaResponsableBase64] = useState<string | null>(null);

  useEffect(() => {
    async function calcularResultados() {
      setLoading(true);
      const { data: answers } = await supabase.from('audit_answers').select('value').eq('report_id', reportId);

      if (answers && answers.length > 0) {
        const totalCumple = answers.filter((a) => a.value === 'cumple').length;
        setPorcentaje(Math.round((totalCumple / answers.length) * 100));
      }
      setLoading(false);
    }
    if (reportId) calcularResultados();
  }, [reportId]);

  // FUNCIÓN AUXILIAR: Convierte una cadena Base64 en un objeto Blob para Supabase Storage
  const base64ToBlob = async (base64Data: string) => {
    const response = await fetch(base64Data);
    const blob = await response.blob();
    return blob;
  };

  const handleFinalizarAuditoria = async () => {
    if (!firmaAuditorBase64 || !firmaResponsableBase64) {
      alert('Error: Ambas firmas son obligatorias para cerrar la auditoría.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Preparar las rutas del Storage: costa/2026-06-01/report-id/firmas/...
      const folderRegion = String(region || 'general').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const folderDate = "2026-06-01";
      const basePath = `${folderRegion}/${folderDate}/${reportId}/firmas`;

      // 2. Convertir strings Base64 a Blobs binarios
      const blobAuditor = await base64ToBlob(firmaAuditorBase64);
      const blobResponsable = await base64ToBlob(firmaResponsableBase64);

      // 3. Subir firma del Auditor al Storage
      const pathAuditor = `${basePath}/firma_auditor.png`;
      const { error: errStorageAuditor } = await supabase.storage
        .from('evidencias')
        .upload(pathAuditor, blobAuditor, { contentType: 'image/png', upsert: true });

      if (errStorageAuditor) throw new Error(`Firma Auditor: ${errStorageAuditor.message}`);

      // 4. Subir firma del Responsable al Storage
      const pathResponsable = `${basePath}/firma_responsable.png`;
      const { error: errStorageResponsable } = await supabase.storage
        .from('evidencias')
        .upload(pathResponsable, blobResponsable, { contentType: 'image/png', upsert: true });

      if (errStorageResponsable) throw new Error(`Firma Responsable: ${errStorageResponsable.message}`);

      // 5. Obtener las URLs públicas de las firmas guardadas
      const { data: { publicUrl: urlAuditor } } = supabase.storage.from('evidencias').getPublicUrl(pathAuditor);
      const { data: { publicUrl: urlResponsable } } = supabase.storage.from('evidencias').getPublicUrl(pathResponsable);

      // 6. Actualizar el registro del reporte con los enlaces del Storage y marcar como finalizado
      const { error: errUpdate } = await supabase
        .from('audit_reports')
        .update({
          signature_auditor_url: urlAuditor,
          signature_responsible_url: urlResponsable,
          status: 'finalizado',
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (errUpdate) throw errUpdate;

      alert('¡Firmas subidas al Storage y auditoría sellada con éxito!');
      router.replace('/nueva-auditoria');
    } catch (err: any) {
      alert('Error al guardar reporte: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const ambosFirmados = firmaAuditorBase64 !== null && firmaResponsableBase64 !== null;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Cierre y Firmas</Text>
      <Text style={styles.subtitle}>Resultado de Cumplimiento: {porcentaje}%</Text>

      {/* Lienzo 1: Auditor */}
      <SignaturePad
        title="Firma del Auditor Evaluador"
        onOK={(img) => { setFirmaAuditorBase64(img); alert('✓ Firma de auditor capturada localmente.'); }}
        onClear={() => setFirmaAuditorBase64(null)}
      />

      {/* Lienzo 2: Responsable */}
      <SignaturePad
        title="Firma del Responsable del Local"
        onOK={(img) => { setFirmaResponsableBase64(img); alert('✓ Firma de responsable capturada localmente.'); }}
        onClear={() => setFirmaResponsableBase64(null)}
      />

      {/* Botón de Envío */}
      <TouchableOpacity 
        style={[styles.submitButton, !ambosFirmados && styles.disabledButton]} 
        onPress={handleFinalizarAuditoria}
        disabled={!ambosFirmados || isSaving}
      >
        <Text style={styles.submitButtonText}>
          {isSaving ? 'Subiendo archivos a Storage...' : 'Subir Firmas y Sellar Auditoría 🔐'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 500, alignSelf: 'center', width: '100%', backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a202c' },
  subtitle: { fontSize: 14, color: '#4a5568', marginBottom: 20 },
  submitButton: { backgroundColor: '#10b981', padding: 15, borderRadius: 6, alignItems: 'center', marginTop: 15, marginBottom: 50 },
  disabledButton: { backgroundColor: '#a7f3d0', opacity: 0.7 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});