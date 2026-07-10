import { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../../constants/theme';
import { canAccessInventoryModule } from '../access';

type InventoryShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showBackToModule?: boolean;
};

export function InventoryShell({ title, subtitle, children, showBackToModule = true }: InventoryShellProps) {
  const router = useRouter();

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.center}>
        <Text style={styles.restrictedTitle}>Disponible solo en Web</Text>
        <Text style={styles.restrictedText}>Informes de Inventario no forma parte de la aplicación móvil.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/dashboard')}>
          <Text style={styles.primaryButtonText}>Volver al dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!canAccessInventoryModule()) {
    return (
      <View style={styles.center}>
        <Text style={styles.restrictedTitle}>Módulo no disponible</Text>
        <Text style={styles.restrictedText}>Esta funcionalidad permanece oculta fuera del entorno local/desarrollo.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/dashboard')}>
          <Text style={styles.primaryButtonText}>Volver al dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>Desarrollo local</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {showBackToModule ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/modulos/inventarios')}>
          <Text style={styles.secondaryButtonText}>← Volver a Informes de Inventario</Text>
        </TouchableOpacity>
      ) : null}

      {children}
    </ScrollView>
  );
}

type PlaceholderBlockProps = {
  title: string;
  description: string;
};

export function PlaceholderBlock({ title, description }: PlaceholderBlockProps) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.blockDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 48,
    gap: 18,
    backgroundColor: brandColors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: brandColors.background,
  },
  restrictedTitle: {
    color: brandColors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  restrictedText: {
    color: brandColors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 460,
  },
  hero: {
    backgroundColor: brandColors.greenDark,
    borderRadius: 12,
    padding: 24,
    gap: 10,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: brandColors.cream,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  statusBadgeText: {
    color: brandColors.greenDark,
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: brandColors.white,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: brandColors.logoWhite,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 760,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  card: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 260,
    minHeight: 145,
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 18,
  },
  cardTitle: {
    color: brandColors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  cardDescription: {
    color: brandColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
    flex: 1,
  },
  cardStatus: {
    color: brandColors.greenDark,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 14,
  },
  block: {
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 18,
    gap: 8,
  },
  blockTitle: {
    color: brandColors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },
  blockDescription: {
    color: brandColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: brandColors.greenDark,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: brandColors.white,
    fontWeight: '900',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: brandColors.greenSoft,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: brandColors.greenDark,
    fontWeight: '900',
  },
  selectedButton: {
    borderWidth: 2,
    borderColor: brandColors.greenDark,
    backgroundColor: brandColors.cream,
  },
  form: {
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 18,
    gap: 14,
  },
  field: {
    gap: 6,
  },
  twoColumnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 24,
    rowGap: 14,
    width: '100%',
    alignItems: 'flex-start',
  },
  twoColumnItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 300,
    gap: 6,
  },
  label: {
    color: brandColors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  input: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: brandColors.inputText,
    backgroundColor: brandColors.white,
  },
  dateTimeItem: {
    gap: 6,
  },
  clockButton: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: brandColors.white,
  },
  clockValue: {
    color: brandColors.inputText,
    fontSize: 14,
    fontWeight: '800',
  },
  clockHint: {
    color: brandColors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  webDateTimeShell: {
    position: 'relative',
    minHeight: 44,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: brandColors.white,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  webDateTimeDisplay: {
    color: brandColors.inputText,
    fontSize: 14,
    fontWeight: '800',
  },
  disabledButton: {
    backgroundColor: brandColors.border,
  },
  hint: {
    color: brandColors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  errorText: {
    color: brandColors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  successText: {
    color: brandColors.greenDark,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 19,
  },
  manualPositiveValue: {
    color: brandColors.greenDark,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 21,
  },
  manualNegativeValue: {
    color: brandColors.danger,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 21,
  },
  manualNeutralValue: {
    color: brandColors.textSecondary,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 21,
  },
  optionsPanel: {
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  optionRow: {
    backgroundColor: brandColors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionTitle: {
    color: brandColors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  optionSubtitle: {
    color: brandColors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 160,
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 14,
  },
  smallMetricCard: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricValue: {
    color: brandColors.greenDark,
    fontSize: 24,
    fontWeight: '900',
  },
  metricDangerValue: {
    color: brandColors.danger,
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: brandColors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  table: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: brandColors.border,
  },
  tableHeader: {
    flex: 1,
    minWidth: 110,
    backgroundColor: brandColors.greenSoft,
    color: brandColors.greenDark,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
  },
  tableCell: {
    flex: 1,
    minWidth: 110,
    color: brandColors.textSecondary,
    fontSize: 12,
    padding: 9,
    backgroundColor: brandColors.white,
  },
  tableErrorCell: {
    flex: 1,
    minWidth: 110,
    color: brandColors.danger,
    fontSize: 12,
    fontWeight: '800',
    padding: 9,
    backgroundColor: brandColors.white,
  },
  reportTableArticleHeader: {
    flex: 2,
    minWidth: 280,
    backgroundColor: brandColors.greenDark,
    color: brandColors.white,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
  },
  reportTableNumberHeader: {
    flex: 1,
    minWidth: 120,
    backgroundColor: brandColors.greenDark,
    color: brandColors.white,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
    textAlign: 'right',
  },
  reportTableArticleCell: {
    flex: 2,
    minWidth: 280,
    backgroundColor: brandColors.white,
    padding: 9,
    gap: 3,
  },
  reportTableArticleTitle: {
    color: brandColors.greenDark,
    fontSize: 12,
    fontWeight: '900',
  },
  reportTableNumberCell: {
    flex: 1,
    minWidth: 120,
    color: brandColors.textSecondary,
    fontSize: 12,
    padding: 9,
    backgroundColor: brandColors.white,
    textAlign: 'right',
  },
  reportTablePositiveCell: {
    flex: 1,
    minWidth: 120,
    color: brandColors.greenDark,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
    backgroundColor: brandColors.white,
    textAlign: 'right',
  },
  reportTableNegativeCell: {
    flex: 1,
    minWidth: 120,
    color: brandColors.danger,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
    backgroundColor: brandColors.white,
    textAlign: 'right',
  },
  reportAdjustmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 10,
    backgroundColor: brandColors.creamSoft,
    borderBottomWidth: 1,
    borderBottomColor: brandColors.border,
    alignItems: 'flex-start',
  },
  reportAdjustmentItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    minWidth: 220,
    gap: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 12,
    padding: 18,
    gap: 12,
  },
  recountTableHeader: {
    flex: 1,
    minWidth: 130,
    backgroundColor: brandColors.greenDark,
    color: brandColors.white,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
  },
  recountDescriptionHeader: {
    flex: 2,
    minWidth: 240,
    backgroundColor: brandColors.greenDark,
    color: brandColors.white,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
  },
  recountActionHeader: {
    flex: 0.65,
    minWidth: 76,
    backgroundColor: brandColors.greenDark,
    color: brandColors.white,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
  },
  recountTableInput: {
    flex: 1,
    minWidth: 130,
    borderWidth: 0,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
    color: brandColors.inputText,
    backgroundColor: brandColors.white,
    paddingHorizontal: 9,
    paddingVertical: 8,
    fontSize: 12,
  },
  recountDescriptionInput: {
    flex: 2,
    minWidth: 240,
    borderWidth: 0,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
    color: brandColors.inputText,
    backgroundColor: brandColors.white,
    paddingHorizontal: 9,
    paddingVertical: 8,
    fontSize: 12,
  },
  recountRemoveButton: {
    flex: 0.65,
    minWidth: 76,
    backgroundColor: brandColors.greenSoft,
    paddingHorizontal: 9,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualTablePositiveCell: {
    flex: 0.85,
    minWidth: 92,
    color: brandColors.greenDark,
    backgroundColor: brandColors.white,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 8,
    textAlign: 'right',
  },
  manualTableNegativeCell: {
    flex: 0.85,
    minWidth: 92,
    color: brandColors.danger,
    backgroundColor: brandColors.white,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 8,
    textAlign: 'right',
  },
  manualTableNeutralCell: {
    flex: 0.85,
    minWidth: 92,
    color: brandColors.textSecondary,
    backgroundColor: brandColors.white,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 9,
    paddingVertical: 8,
    textAlign: 'right',
  },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: brandColors.inputText,
    backgroundColor: brandColors.white,
    textAlignVertical: 'top',
  },
  evidenceCategoryGroup: {
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  evidenceCategoryTitle: {
    color: brandColors.greenDark,
    fontSize: 13,
    fontWeight: '900',
  },
  evidenceMiniCardList: {
    gap: 7,
  },
  evidenceMiniCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: brandColors.white,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  evidenceMiniInfo: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
    gap: 2,
  },
  evidenceMiniTitle: {
    color: brandColors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
  },
  evidenceMiniMeta: {
    color: brandColors.textSecondary,
    fontSize: 11,
  },
  evidenceMiniActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  evidenceMiniButton: {
    backgroundColor: brandColors.greenSoft,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    marginTop: 8,
  },
  footerPrimaryButton: {
    marginTop: 0,
    minWidth: 132,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerSecondaryButton: {
    alignSelf: 'auto',
    minWidth: 132,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
});

export const inventoryShellStyles = styles;
