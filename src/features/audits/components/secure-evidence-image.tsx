import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { brandColors } from '../../../../constants/theme';
import { signedEvidenceUrl } from '../../../evidenceStorage';

export default function SecureEvidenceImage({ reference }: { reference: string }) {
  const [uri, setUri] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    signedEvidenceUrl(reference).then((value) => active && setUri(value)).catch(() => active && setUri(null));
    return () => { active = false; };
  }, [reference]);

  if (!uri) return <View style={styles.preview}><ActivityIndicator color={brandColors.greenDark} /></View>;
  return <>
    <TouchableOpacity onPress={() => setOpen(true)}><Image source={{ uri }} style={styles.preview} /></TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.close} onPress={() => setOpen(false)}><Text style={styles.closeText}>Cerrar</Text></TouchableOpacity>
        <Image source={{ uri }} style={styles.fullImage} resizeMode="contain" />
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  preview: { width: 96, height: 96, borderRadius: 8, backgroundColor: brandColors.creamSoft, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', padding: 18, justifyContent: 'center' },
  fullImage: { width: '100%', height: '88%' }, close: { alignSelf: 'flex-end', padding: 12 }, closeText: { color: brandColors.white, fontWeight: '900' },
});
