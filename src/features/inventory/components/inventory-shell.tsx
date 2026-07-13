import { ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { brandColors } from '../../../../constants/theme';
import { canAccessInventoryModule } from '../access';
import { supabase } from '../../../supabaseClient';

type InventoryShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showBackToModule?: boolean;
  backLabel?: string;
  backRoute?: string;
  backParams?: Record<string, string | undefined>;
};

export function InventoryShell({
  title,
  subtitle,
  children,
  showBackToModule = true,
  backLabel = '← Volver a Informes de Inventario',
  backRoute = '/modulos/inventarios',
  backParams,
}: InventoryShellProps) {
  const router = useRouter();
  const [profile, setProfile] = useState<{ role: string | null; email: string | null } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(Platform.OS === 'web');

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (Platform.OS !== 'web') return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single<{ role: string | null; email: string | null }>();

      if (!active) return;
      setProfile(data || null);
      setLoadingProfile(false);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

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

  if (loadingProfile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={brandColors.greenDark} />
        <Text style={styles.restrictedText}>Validando acceso...</Text>
      </View>
    );
  }

  if (!canAccessInventoryModule(profile?.role, profile?.email)) {
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
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push({
            pathname: backRoute,
            params: backParams,
          } as never)}
        >
          <Text style={styles.secondaryButtonText}>{backLabel}</Text>
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
  compactActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    alignItems: 'stretch',
  },
  compactActionCard: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 300,
    minWidth: 260,
    minHeight: 116,
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  compactTemplateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  compactTemplateButton: {
    backgroundColor: brandColors.greenSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  flowStepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  flowStepPill: {
    backgroundColor: brandColors.greenSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  flowStepText: {
    color: brandColors.greenDark,
    fontSize: 12,
    fontWeight: '900',
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
  searchSelectorButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    backgroundColor: brandColors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  searchSelectorText: {
    color: brandColors.inputText,
    fontSize: 14,
    fontWeight: '800',
    flexShrink: 1,
  },
  searchSelectorPlaceholder: {
    color: brandColors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  cutoffInlineRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    width: '100%',
    zIndex: 35,
  },
  segmentSelector: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 130,
    position: 'relative',
    zIndex: 35,
  },
  segmentSelectorButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    backgroundColor: brandColors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  segmentSelectorPanel: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 180,
    elevation: 18,
    maxHeight: 188,
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  segmentSelectorScroll: {
    maxHeight: 176,
  },
  categoryDropdown: {
    width: '100%',
    maxWidth: 520,
    position: 'relative',
    zIndex: 90,
    elevation: 12,
  },
  categoryDropdownButton: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    backgroundColor: brandColors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryDropdownLabel: {
    color: brandColors.inputText,
    fontSize: 14,
    fontWeight: '800',
  },
  categoryDropdownIcon: {
    color: brandColors.greenDark,
    fontSize: 18,
    fontWeight: '900',
  },
  categoryDropdownPanel: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 120,
    elevation: 16,
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  categoryDropdownOption: {
    backgroundColor: brandColors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryDropdownOptionActive: {
    backgroundColor: brandColors.greenSoft,
    borderWidth: 1,
    borderColor: brandColors.greenDark,
  },
  categoryDropdownOptionText: {
    color: brandColors.greenDark,
    fontSize: 13,
    fontWeight: '900',
  },
  form: {
    backgroundColor: brandColors.surface,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 18,
    gap: 14,
  },
  dropdownHost: {
    zIndex: 200,
    elevation: 20,
    overflow: 'visible',
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
  maskedDateTimeShell: {
    position: 'relative',
    minHeight: 44,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: brandColors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    overflow: 'hidden',
  },
  dateTimeIconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandColors.greenSoft,
  },
  dateTimeIconText: {
    fontSize: 16,
    color: brandColors.greenDark,
    fontWeight: '900',
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
  reportFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'flex-start',
    zIndex: 140,
  },
  reportSearchInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 360,
    minWidth: 260,
  },
  reportCutoffSelector: {
    width: 240,
    maxWidth: '100%',
    position: 'relative',
    zIndex: 150,
  },
  reportCutoffPanel: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 220,
    elevation: 20,
    maxHeight: 188,
    backgroundColor: brandColors.creamSoft,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    padding: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  reportCardGrid: {
    gap: 10,
  },
  compactReportCard: {
    backgroundColor: brandColors.white,
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  compactReportInfo: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 260,
    gap: 2,
  },
  compactReportTitle: {
    color: brandColors.greenDark,
    fontSize: 13,
    fontWeight: '900',
  },
  compactReportMeta: {
    color: brandColors.textSecondary,
    fontSize: 11,
  },
  iconActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: brandColors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    color: brandColors.greenDark,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
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
    alignItems: 'stretch',
  },
  tableHeader: {
    flex: 1,
    minWidth: 110,
    backgroundColor: brandColors.greenSoft,
    color: brandColors.greenDark,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
  },
  tableCell: {
    flex: 1,
    minWidth: 110,
    color: brandColors.textSecondary,
    fontSize: 12,
    padding: 9,
    backgroundColor: brandColors.white,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
  },
  tableErrorCell: {
    flex: 1,
    minWidth: 110,
    color: brandColors.danger,
    fontSize: 12,
    fontWeight: '800',
    padding: 9,
    backgroundColor: brandColors.white,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
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
  reportTableTotalTitle: {
    color: brandColors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reportTableTotalRow: {
    backgroundColor: brandColors.greenSoft,
  },
  reportTableTotalSurplusRow: {
    backgroundColor: '#DFF3E8',
  },
  reportTableTotalShortageRow: {
    backgroundColor: '#F6D9D6',
  },
  reportTableTotalArticleCell: {
    flex: 2,
    minWidth: 280,
    padding: 9,
    gap: 3,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
  },
  reportTableTotalNumberCell: {
    flex: 1,
    minWidth: 120,
    color: brandColors.textPrimary,
    fontSize: 12,
    padding: 9,
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
  },
  reportTableTotalLabelCell: {
    flex: 1,
    minWidth: 120,
    padding: 9,
    alignItems: 'flex-end',
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
  },
  reportTableTotalDifferenceCell: {
    flex: 1,
    minWidth: 120,
    color: brandColors.textPrimary,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
    textAlign: 'right',
  },
  reportTableActionText: {
    color: brandColors.info,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  reportTableSpacer: {
    height: 14,
    backgroundColor: brandColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: brandColors.border,
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
    flex: 1,
    minWidth: 110,
    backgroundColor: brandColors.greenDark,
    color: brandColors.white,
    fontSize: 12,
    fontWeight: '900',
    padding: 9,
  },
  recountTableInput: {
    flex: 1,
    minWidth: 110,
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
    flex: 1,
    minWidth: 110,
    backgroundColor: brandColors.greenSoft,
    paddingHorizontal: 9,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualTablePositiveCell: {
    flex: 1,
    minWidth: 110,
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
    flex: 1,
    minWidth: 110,
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
    flex: 1,
    minWidth: 110,
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
