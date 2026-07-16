import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { brandColors, brandRadii } from '../../constants/theme';

type NoticeVariant = 'info' | 'success' | 'warning' | 'danger';

type AppNoticeModalProps = {
  visible: boolean;
  title: string;
  message: string;
  variant?: NoticeVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  neutralLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  onNeutral?: () => void;
};

export function AppNoticeModal({
  visible,
  title,
  message,
  variant = 'info',
  confirmLabel = 'Aceptar',
  cancelLabel,
  neutralLabel,
  onConfirm,
  onCancel,
  onNeutral,
}: AppNoticeModalProps) {
  const accentStyle = variant === 'danger'
    ? styles.accentDanger
    : variant === 'warning'
      ? styles.accentWarning
      : variant === 'success'
        ? styles.accentSuccess
        : styles.accentInfo;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNeutral || onCancel || onConfirm}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={[styles.accent, accentStyle]} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            {neutralLabel && onNeutral ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={onNeutral} activeOpacity={0.84}>
                <Text style={styles.secondaryButtonText}>{neutralLabel}</Text>
              </TouchableOpacity>
            ) : null}
            {cancelLabel && onCancel ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={onCancel} activeOpacity={0.84}>
                <Text style={styles.secondaryButtonText}>{cancelLabel}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.primaryButton} onPress={onConfirm} activeOpacity={0.84}>
              <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: brandColors.white,
    borderRadius: brandRadii.lg,
    borderWidth: 1,
    borderColor: brandColors.border,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 5,
  },
  accentInfo: { backgroundColor: brandColors.greenDark },
  accentSuccess: { backgroundColor: brandColors.success },
  accentWarning: { backgroundColor: brandColors.warning },
  accentDanger: { backgroundColor: brandColors.danger },
  title: {
    color: brandColors.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },
  message: {
    color: brandColors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
    flexWrap: 'wrap',
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: brandRadii.md,
    backgroundColor: brandColors.greenDark,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: brandColors.white,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: brandRadii.md,
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: brandColors.greenDark,
    fontWeight: '900',
  },
});
