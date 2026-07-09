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
  metricValue: {
    color: brandColors.greenDark,
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
});

export const inventoryShellStyles = styles;
