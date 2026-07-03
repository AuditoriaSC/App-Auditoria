import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../constants/theme';
import { supabase } from '../../../src/supabaseClient';

type Approval = {
  id: string; requested_by: string; status: string; old_score: number | null; new_score: number | null; reason: string | null; requested_at: string;
  change_summary: { question?: string; old_value?: string; new_value?: string }[];
  audit_reports?: { id: string; region: string; local_name_snapshot: string | null; local_code_snapshot: string | null; auditor_name_snapshot: string | null } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export default function EditApprovalsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Approval[]>([]);
  const [userId, setUserId] = useState('');
  const [comment, setComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || Platform.OS !== 'web') { setMessage('Esta revision esta disponible solo en Web para administradores.'); setLoading(false); return; }
    setUserId(user.id);
    const { data, error } = await supabase.from('audit_edit_approvals')
      .select('id, requested_by, status, old_score, new_score, reason, requested_at, change_summary, audit_reports(id, region, local_name_snapshot, local_code_snapshot, auditor_name_snapshot), profiles!audit_edit_approvals_requested_by_fkey(full_name, email)')
      .eq('status', 'pending').order('requested_at', { ascending: true });
    setItems((data || []) as unknown as Approval[]);
    setMessage(error ? 'No se pudieron cargar las solicitudes.' : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const review = async (item: Approval, decision: 'approved' | 'rejected') => {
    setBusy(item.id); setMessage(null);
    let deliveryError: string | null = null;
    const { data, error } = await supabase.functions.invoke('manage-report-edit', { body: { action: 'review', approvalId: item.id, decision, adminComment: comment[item.id] || '' } });
    if (error || !data?.ok) { setMessage(data?.error || error?.message || 'No se pudo revisar la solicitud.'); setBusy(null); return; }
    if (decision === 'approved' && data.shouldResend) {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/finalize-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '', Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
        body: JSON.stringify({ reportId: data.reportId, region: data.region, isResend: !data.isInitialSend }),
      });
      if (!response.ok) {
        if (data.isInitialSend) await supabase.from('audit_reports').update({ should_send: false, updated_at: new Date().toISOString() }).eq('id', data.reportId);
        deliveryError = data.isInitialSend ? 'La recalificacion fue aprobada, pero el informe no pudo enviarse.' : 'La recalificacion fue aprobada, pero el correo no pudo reenviarse.';
      } else if (!data.isInitialSend) {
        await supabase.from('audit_reports').update({ last_resent_at: new Date().toISOString(), resent_count: Number(data.resentCount || 0) + 1, last_resent_by: userId, updated_at: new Date().toISOString() }).eq('id', data.reportId);
      }
    }
    setItems((current) => current.filter((value) => value.id !== item.id));
    setMessage(deliveryError || (decision === 'approved' ? 'Solicitud aprobada.' : 'Solicitud rechazada.'));
    setBusy(null);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={brandColors.greenDark} /><Text>Cargando solicitudes...</Text></View>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
    <View style={styles.header}><View><Text style={styles.title}>Solicitudes de recalificacion</Text><Text style={styles.subtitle}>Los cambios no se aplican hasta ser aprobados.</Text></View><TouchableOpacity style={styles.secondary} onPress={() => router.replace('/administrador-recursos')}><Text style={styles.secondaryText}>Volver</Text></TouchableOpacity></View>
    {message && <Text style={styles.message}>{message}</Text>}
    {items.length === 0 && <View style={styles.card}><Text style={styles.cardTitle}>No hay solicitudes pendientes</Text></View>}
    {items.map((item) => <View key={item.id} style={styles.card}>
      <Text style={styles.cardTitle}>{item.audit_reports?.local_name_snapshot || 'Visita'} · {item.audit_reports?.local_code_snapshot || ''}</Text>
      <Text style={styles.meta}>Auditor: {item.audit_reports?.auditor_name_snapshot || 'Sin dato'} · Región: {item.audit_reports?.region}</Text>
      <Text style={styles.meta}>Solicita: {item.profiles?.full_name || item.profiles?.email || 'Usuario'}</Text>
      <Text style={styles.impact}>Calificación: {Number(item.old_score || 0).toFixed(2)} → {Number(item.new_score || 0).toFixed(2)}</Text>
      {(item.change_summary || []).map((change, index) => <Text key={index} style={styles.change}>{change.question || 'Pregunta'}: {change.old_value} → {change.new_value}</Text>)}
      <Text style={styles.reason}>Motivo: {item.reason || 'Sin motivo'}</Text>
      <TextInput style={styles.input} value={comment[item.id] || ''} onChangeText={(value) => setComment((current) => ({ ...current, [item.id]: value }))} placeholder="Comentario del administrador (opcional)" />
      {item.requested_by === userId ? <Text style={styles.warning}>Otro administrador debe revisar una solicitud propia.</Text> : <View style={styles.actions}>
        <TouchableOpacity style={styles.approve} disabled={busy === item.id} onPress={() => review(item, 'approved')}><Text style={styles.actionText}>Aprobar</Text></TouchableOpacity>
        <TouchableOpacity style={styles.reject} disabled={busy === item.id} onPress={() => review(item, 'rejected')}><Text style={styles.actionText}>Rechazar</Text></TouchableOpacity>
      </View>}
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:brandColors.background},container:{padding:18,paddingBottom:40,gap:12,maxWidth:960,width:'100%',alignSelf:'center'},center:{flex:1,alignItems:'center',justifyContent:'center',gap:8},header:{backgroundColor:brandColors.white,padding:16,borderRadius:10,borderWidth:1,borderColor:brandColors.border,flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},title:{fontSize:23,fontWeight:'900',color:brandColors.textPrimary},subtitle:{color:brandColors.textSecondary,marginTop:4},message:{padding:12,backgroundColor:brandColors.creamSoft,color:brandColors.coffeeDark,fontWeight:'800'},card:{backgroundColor:brandColors.white,padding:15,borderRadius:10,borderWidth:1,borderColor:brandColors.border,gap:8},cardTitle:{fontWeight:'900',fontSize:16,color:brandColors.textPrimary},meta:{color:brandColors.textSecondary,fontWeight:'700'},impact:{fontWeight:'900',color:brandColors.greenDark},change:{color:brandColors.textPrimary},reason:{color:brandColors.coffeeDark,fontWeight:'800'},input:{borderWidth:1,borderColor:brandColors.border,borderRadius:8,padding:10,backgroundColor:brandColors.white},actions:{flexDirection:'row',gap:10,justifyContent:'flex-end'},approve:{padding:11,borderRadius:8,backgroundColor:brandColors.greenDark},reject:{padding:11,borderRadius:8,backgroundColor:brandColors.danger},actionText:{color:brandColors.white,fontWeight:'900'},warning:{color:brandColors.warning,fontWeight:'800'},secondary:{padding:10,borderRadius:8,borderWidth:1,borderColor:brandColors.border},secondaryText:{color:brandColors.greenDark,fontWeight:'900'}
});
