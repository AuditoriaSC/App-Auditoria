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

const inventoryCsvTemplate = [
  'Código de Almacén,Referencia o SKU,Descripción del Item,Stock Contado o Físico,Stock Teórico o Sistema,Diferencia,Costo Unitario,Costo Total',
  'GM,00123,Producto prueba con ñ,10,8,2,1.50,3.00',
  'GM,00456,Producto prueba con tilde café,5,7,-2,2.00,-4.00',
].join('\n');

const crossesCsvTemplate = [
  'SKU,Descripción del artículo,Cruce asignado,Factor de conversión',
  '00123,Producto prueba con ñ,Materia prima A,1',
  '00456,Producto prueba con tilde café,Materia prima B,0.5',
].join('\n');

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

  function downloadCsvTemplate(fileName: string, csvContent: string) {
    if (typeof document === 'undefined') {
      setMessage('La descarga de plantillas está disponible solo en Web local.');
      return;
    }

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

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
        <Text style={styles.blockTitle}>Plantillas CSV para pruebas locales</Text>
        <Text style={styles.blockDescription}>
          Descarga estos modelos para probar el flujo con columnas exactas. Recuerda ajustar el Código de Almacén al local seleccionado en el encabezado.
        </Text>
        <View style={styles.grid}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => downloadCsvTemplate('plantilla_inventario.csv', inventoryCsvTemplate)}
          >
            <Text style={styles.secondaryButtonText}>Descargar plantilla CSV de inventario</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => downloadCsvTemplate('plantilla_cruces_inventario.csv', crossesCsvTemplate)}
          >
            <Text style={styles.secondaryButtonText}>Descargar plantilla CSV de cruces</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>SKU se conserva como texto; no lo conviertas a número para no perder ceros a la izquierda.</Text>
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
