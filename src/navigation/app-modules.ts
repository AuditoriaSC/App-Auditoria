import { Platform } from 'react-native';

export type AppRole = 'auditor' | 'admin' | 'super_admin';
export type AppPlatform = 'web' | 'mobile';
export type AppModuleKey = 'evaluations' | 'inventory' | 'admin';

export type AppModule = {
  key: AppModuleKey;
  label: string;
  description: string;
  route: string;
  icon: string;
  roles: AppRole[];
  platforms: AppPlatform[];
};

export const appModules: AppModule[] = [
  {
    key: 'evaluations',
    label: 'Evaluaciones',
    description: 'Visitas, checklist y reportes',
    route: '/dashboard',
    icon: '✓',
    roles: ['auditor', 'admin', 'super_admin'],
    platforms: ['web', 'mobile'],
  },
  {
    key: 'inventory',
    label: 'Informes de Inventario',
    description: 'Inventarios físicos y validaciones',
    route: '/modulos/inventarios',
    icon: '▦',
    roles: ['auditor', 'admin', 'super_admin'],
    platforms: ['web'],
  },
  {
    key: 'admin',
    label: 'Administración',
    description: 'Recursos, usuarios y configuración',
    route: '/administrador-recursos',
    icon: '⚙',
    roles: ['admin', 'super_admin'],
    platforms: ['web'],
  },
];

export function getCurrentPlatform(): AppPlatform {
  return Platform.OS === 'web' ? 'web' : 'mobile';
}

export function canRoleSeeModule(module: AppModule, role?: string | null) {
  return Boolean(role && module.roles.includes(role as AppRole));
}

export function isModuleAvailableOnCurrentPlatform(module: AppModule) {
  return module.platforms.includes(getCurrentPlatform());
}

export function getVisibleAppModules(role?: string | null) {
  return appModules.filter((module) => canRoleSeeModule(module, role));
}

export function getActiveModuleKey(segments: string[]): AppModuleKey {
  if (segments.includes('inventarios')) return 'inventory';

  const adminRoutes = new Set([
    'administrador-recursos',
    'preguntas',
    'locales',
    'responsables',
    'usuarios',
    'invitaciones',
    'exportar-avanzado',
    'solicitudes-edicion',
  ]);

  if (segments.some((segment) => adminRoutes.has(segment))) return 'admin';

  return 'evaluations';
}
