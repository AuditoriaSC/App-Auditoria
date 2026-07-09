import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../supabaseClient';
import { InventoryShell, inventoryShellStyles as styles } from './inventory-shell';

const actions = [
  {
    title: 'Crear Informe de Inventario',
    description: 'Abrir el encabezado inicial del informe. En esta fase no guarda datos reales.',
    route: '/modulos/inventarios/crear',
  },
  {
    title: 'Cargar Cruces de Inventario',
    description: 'Espacio reservado para subir la base de cruces cuando implementemos la lógica CSV.',
    route: '/modulos/inventarios/cruces-base',
  },
] as const;

const nextSections = [
  ['Carga CSV de Inventario', 'Placeholder para el archivo fuente del inventario.'],
  ['Resultados de Inventario', 'Bloques base para sobrantes, faltantes y cruces.'],
  ['Validaciones Manuales', 'Facturas manuales, reconteos, producto terminado y cierres de caja.'],
  ['Evidencias', 'Carga futura de imágenes, PDF, Excel o CSV.'],
] as const;

type InventoryReportListItem = {
  id: string;
  local_codigo: string;
  local_name_snapshot: string;
  inventory_date: string;
  status: string;
  created_at: string;
};

export default function InventoryModuleScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<InventoryReportListItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      const { data, error } = await supabase
        .from('inventory_reports')
        .select('id, local_codigo, local_name_snapshot, inventory_date, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!active) return;
      if (error) {
        setMessage('No se pudo cargar el listado local de informes.');
      } else {
        setReports((data || []) as InventoryReportListItem[]);
      }
    }

    loadReports();

    return () => {
      active = false;
    };
  }, []);

  return (
    <InventoryShell
      title="Informes de Inventario"
      subtitle="Módulo en desarrollo local. Esta estructura no procesa archivos, no genera reportes y no modifica Auditoría 1.0."
      showBackToModule={false}
    >
      <View style={styles.grid}>
        {actions.map((action) => (
          <TouchableOpacity key={action.title} style={styles.card} onPress={() => router.push(action.route)}>
            <Text style={styles.cardTitle}>{action.title}</Text>
            <Text style={styles.cardDescription}>{action.description}</Text>
            <Text style={styles.cardStatus}>Abrir</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Módulo en desarrollo local</Text>
        <Text style={styles.blockDescription}>
          Por ahora estas pantallas sirven para validar navegación y estructura. El módulo permanece oculto fuera del entorno local/desarrollo y no se publica en Expo Web ni OTA.
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.blockTitle}>Listado local de informes de inventario</Text>
        {message ? <Text style={styles.hint}>{message}</Text> : null}
        {reports.length === 0 ? <Text style={styles.hint}>Aún no hay informes de inventario para mostrar.</Text> : null}
        {reports.map((report) => (
          <View key={report.id} style={styles.block}>
            <Text style={styles.blockTitle}>{report.local_codigo} · {report.local_name_snapshot}</Text>
            <Text style={styles.blockDescription}>Fecha inventario: {report.inventory_date}</Text>
            <Text style={styles.blockDescription}>Estado: {report.status}</Text>
            <View style={styles.grid}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({
                  pathname: '/modulos/inventarios/carga-csv',
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.secondaryButtonText}>Abrir CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({
                  pathname: '/modulos/inventarios/resultados',
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.secondaryButtonText}>Abrir resultados</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push({
                  pathname: '/modulos/inventarios/evidencias',
                  params: { inventory_report_id: report.id },
                })}
              >
                <Text style={styles.secondaryButtonText}>Abrir cierre</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {nextSections.map(([title, description]) => (
          <View key={title} style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardDescription}>{description}</Text>
            <Text style={styles.cardStatus}>Pendiente</Text>
          </View>
        ))}
      </View>
    </InventoryShell>
  );
}
