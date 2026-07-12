import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type VisitApproval = {
  id: string;
  requested_by: string;
  status: string;
  old_score: number | null;
  new_score: number | null;
  reason: string | null;
  requested_at: string;
  change_summary: { question?: string; old_value?: string; new_value?: string }[];
  audit_reports?: { id: string; region: string; local_name_snapshot: string | null; local_code_snapshot: string | null; auditor_name_snapshot: string | null } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

type InventoryAuthorization = {
  id: string;
  inventory_report_id: string | null;
  local_code_snapshot: string | null;
  local_name_snapshot: string | null;
  request_type: string;
  requested_by: string;
  status: string;
  reason: string | null;
  requested_at: string;
  inventory_reports?: { id: string; local_codigo: string | null; local_name_snapshot: string | null; assigned_auditor_name_snapshot: string | null; inventory_date: string | null } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export default function AuthorizationsPage() {
  const router = useRouter();
  const [visitItems, setVisitItems] = useState<VisitApproval[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryAuthorization[]>([]);
  const [userId, setUserId] = useState('');
  const [comment, setComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || Platform.OS !== 'web') {
      setMessage('Esta revisión está disponible solo en Web para administradores.');
      setLoading(false);
      return;
    }

    setUserId(user.id);

    const { data, error } = await supabase.from('audit_edit_approvals')
      .select('id, requested_by, status, old_score, new_score, reason, requested_at, change_summary, audit_reports(id, region, local_name_snapshot, local_code_snapshot, auditor_name_snapshot), profiles!audit_edit_approvals_requested_by_fkey(full_name, email)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    setVisitItems((data || []) as unknown as VisitApproval[]);
    setMessage(error ? 'No se pudieron cargar las solicitudes de visitas.' : null);

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory_authorization_requests')
      .select('id, inventory_report_id, local_code_snapshot, local_name_snapshot, request_type, requested_by, status, reason, requested_at, inventory_reports(id, local_codigo, local_name_snapshot, assigned_auditor_name_snapshot, inventory_date), profiles!inventory_authorization_requests_requested_by_fkey(full_name, email)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (inventoryError) {
      setInventoryItems([]);
      setMessage((current) => current || 'No se pudieron cargar autorizaciones de inventario. Revisa si la migración fue aplicada.');
    } else {
      setInventoryItems((inventoryData || []) as unknown as InventoryAuthorization[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function reviewVisit(item: VisitApproval, decision: 'approved' | 'rejected') {
    setBusy(item.id);
    setMessage(null);
    let deliveryError: string | null = null;

    const { data, error } = await supabase.functions.invoke('manage-report-edit', {
      body: { action: 'review', approvalId: item.id, decision, adminComment: comment[item.id] || '' },
    });

    if (error || !data?.ok) {
      setMessage(data?.error || error?.message || 'No se pudo revisar la solicitud.');
      setBusy(null);
      return;
    }

    if (decision === 'approved' && data.shouldResend) {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finalize-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          Authorization: `Bearer ${sessionData.session?.access_token || ''}`,
        },
        body: JSON.stringify({ reportId: data.reportId, region: data.region, isResend: !data.isInitialSend }),
      });

      if (!response.ok) {
        if (data.isInitialSend) await supabase.from('audit_reports').update({ should_send: false, updated_at: new Date().toISOString() }).eq('id', data.reportId);
        deliveryError = data.isInitialSend ? 'La recalificación fue aprobada, pero el informe no pudo enviarse.' : 'La recalificación fue aprobada, pero el correo no pudo reenviarse.';
      } else if (!data.isInitialSend) {
        await supabase.from('audit_reports').update({ last_resent_at: new Date().toISOString(), resent_count: Number(data.resentCount || 0) + 1, last_resent_by: userId, updated_at: new Date().toISOString() }).eq('id', data.reportId);
      }
    }

    setVisitItems((current) => current.filter((value) => value.id !== item.id));
    setMessage(deliveryError || (decision === 'approved' ? 'Solicitud de visita aprobada.' : 'Solicitud de visita rechazada.'));
    setBusy(null);
  }

  async function deleteInventoryReport(reportId: string) {
    const { data: evidences } = await supabase
      .from('inventory_report_evidences')
      .select('file_path')
      .eq('inventory_report_id', reportId);

    const filePaths = ((evidences || []) as Array<{ file_path: string | null }>)
      .map((evidence) => evidence.file_path)
      .filter(Boolean) as string[];

    if (filePaths.length > 0) {
      await supabase.storage.from('inventory-report-evidences').remove(filePaths);
    }

    const { error } = await supabase
      .from('inventory_reports')
      .delete()
      .eq('id', reportId);

    if (error) throw new Error(error.message);
  }

  async function reviewInventory(item: InventoryAuthorization, decision: 'approved' | 'rejected') {
    setBusy(item.id);
    setMessage(null);

    if (decision === 'approved' && item.inventory_report_id) {
      try {
        await deleteInventoryReport(item.inventory_report_id);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No se pudo eliminar el informe de inventario.');
        setBusy(null);
        return;
      }
    }

    const { error } = await supabase
      .from('inventory_authorization_requests')
      .update({
        status: decision,
        reviewed_by: userId,
        admin_comment: comment[item.id] || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', item.id);

    if (error) {
      setMessage('No se pudo actualizar la autorización: ' + error.message);
      setBusy(null);
      return;
    }

    setInventoryItems((current) => current.filter((value) => value.id !== item.id));
    setMessage(decision === 'approved' ? 'Solicitud de inventario aprobada.' : 'Solicitud de inventario rechazada.');
    setBusy(null);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={brandColors.greenDark} />
        <Text style={styles.loadingText}>Cargando autorizaciones...</Text>
      </View>
    );
  }

  const hasNoItems = visitItems.length === 0 && inventoryItems.length === 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Autorizaciones</Text>
          <Text style={styles.subtitle}>Revisa solicitudes administrativas antes de aplicar cambios sensibles.</Text>
        </View>
        <TouchableOpacity style={styles.secondary} onPress={() => router.replace('/administrador-recursos')}>
          <Text style={styles.secondaryText}>Volver</Text>
        </TouchableOpacity>
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {hasNoItems ? <View style={styles.card}><Text style={styles.cardTitle}>No hay autorizaciones pendientes</Text></View> : null}

      {visitItems.length > 0 ? <Text style={styles.sectionTitle}>Recalificaciones de visitas</Text> : null}
      {visitItems.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.cardTitle}>{item.audit_reports?.local_name_snapshot || 'Visita'} · {item.audit_reports?.local_code_snapshot || ''}</Text>
          <Text style={styles.meta}>Auditor: {item.audit_reports?.auditor_name_snapshot || 'Sin dato'} · Región: {item.audit_reports?.region}</Text>
          <Text style={styles.meta}>Solicita: {item.profiles?.full_name || item.profiles?.email || 'Usuario'}</Text>
          <Text style={styles.impact}>Calificación: {Number(item.old_score || 0).toFixed(2)} → {Number(item.new_score || 0).toFixed(2)}</Text>
          {(item.change_summary || []).map((change, index) => (
            <Text key={index} style={styles.change}>{change.question || 'Pregunta'}: {change.old_value} → {change.new_value}</Text>
          ))}
          <Text style={styles.reason}>Motivo: {item.reason || 'Sin motivo'}</Text>
          <TextInput style={styles.input} value={comment[item.id] || ''} onChangeText={(value) => setComment((current) => ({ ...current, [item.id]: value }))} placeholder="Comentario del administrador (opcional)" placeholderTextColor={brandColors.inputPlaceholder} />
          {item.requested_by === userId ? (
            <Text style={styles.warning}>Otro administrador debe revisar una solicitud propia.</Text>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.approve} disabled={busy === item.id} onPress={() => reviewVisit(item, 'approved')}><Text style={styles.actionText}>Aprobar</Text></TouchableOpacity>
              <TouchableOpacity style={styles.reject} disabled={busy === item.id} onPress={() => reviewVisit(item, 'rejected')}><Text style={styles.actionText}>Rechazar</Text></TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      {inventoryItems.length > 0 ? <Text style={styles.sectionTitle}>Inventarios</Text> : null}
      {inventoryItems.map((item) => {
        const report = item.inventory_reports;
        const localCode = report?.local_codigo || item.local_code_snapshot || '-';
        const localName = report?.local_name_snapshot || item.local_name_snapshot || 'Informe eliminado';

        return (
          <View key={item.id} style={styles.card}>
            <Text style={styles.cardTitle}>{localCode} · {localName}</Text>
            <Text style={styles.meta}>Tipo: Eliminación de informe de inventario</Text>
            <Text style={styles.meta}>Auditor: {report?.assigned_auditor_name_snapshot || item.profiles?.full_name || item.profiles?.email || 'Usuario'}</Text>
            <Text style={styles.reason}>Motivo: {item.reason || 'Sin motivo'}</Text>
            <TextInput style={styles.input} value={comment[item.id] || ''} onChangeText={(value) => setComment((current) => ({ ...current, [item.id]: value }))} placeholder="Comentario del administrador (opcional)" placeholderTextColor={brandColors.inputPlaceholder} />
            {item.requested_by === userId ? (
              <Text style={styles.warning}>Otro administrador debe revisar una solicitud propia.</Text>
            ) : (
              <View style={styles.actions}>
                <TouchableOpacity style={styles.approve} disabled={busy === item.id} onPress={() => reviewInventory(item, 'approved')}><Text style={styles.actionText}>Aprobar eliminación</Text></TouchableOpacity>
                <TouchableOpacity style={styles.reject} disabled={busy === item.id} onPress={() => reviewInventory(item, 'rejected')}><Text style={styles.actionText}>Rechazar</Text></TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandColors.background },
  container: { padding: 18, paddingBottom: 40, gap: 12, maxWidth: 960, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: brandColors.background },
  loadingText: { marginTop: 8, color: brandColors.textSecondary },
  header: { backgroundColor: brandColors.white, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: brandColors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { fontSize: 23, fontWeight: '900', color: brandColors.textPrimary },
  subtitle: { color: brandColors.textSecondary, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: brandColors.greenDark, marginTop: 8 },
  message: { padding: 12, backgroundColor: brandColors.creamSoft, color: brandColors.coffeeDark, fontWeight: '800' },
  card: { backgroundColor: brandColors.white, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: brandColors.border, gap: 8 },
  cardTitle: { fontWeight: '900', fontSize: 16, color: brandColors.textPrimary },
  meta: { color: brandColors.textSecondary, fontWeight: '700' },
  impact: { fontWeight: '900', color: brandColors.greenDark },
  change: { color: brandColors.textPrimary },
  reason: { color: brandColors.coffeeDark, fontWeight: '800' },
  input: { borderWidth: 1, borderColor: brandColors.border, borderRadius: 8, padding: 10, backgroundColor: brandColors.white, color: brandColors.inputText },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  approve: { padding: 11, borderRadius: 8, backgroundColor: brandColors.greenDark },
  reject: { padding: 11, borderRadius: 8, backgroundColor: brandColors.danger },
  actionText: { color: brandColors.white, fontWeight: '900' },
  warning: { color: brandColors.warning, fontWeight: '800' },
  secondary: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: brandColors.border },
  secondaryText: { color: brandColors.greenDark, fontWeight: '900' },
});
