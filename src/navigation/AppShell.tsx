import { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { brandColors, brandRadii } from '../../constants/theme';
import { supabase } from '../supabaseClient';
import {
  AppModule,
  getActiveModuleKey,
  getCurrentPlatform,
  getVisibleAppModules,
  isModuleAvailableOnCurrentPlatform,
} from './app-modules';

type AppShellProps = {
  children: ReactNode;
};

type ShellProfile = {
  full_name: string | null;
  role: string | null;
  region: string | null;
};

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const segments = useSegments();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<ShellProfile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const activeModuleKey = getActiveModuleKey(segments.map(String));
  const isWideWeb = Platform.OS === 'web' && width >= 980;
  const platform = getCurrentPlatform();
  const visibleModules = useMemo(() => getVisibleAppModules(profile?.role), [profile?.role]);
  const activeModule = visibleModules.find((module) => module.key === activeModuleKey);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      setUserEmail(user?.email || null);

      if (!user) {
        setProfile(null);
        setLoadingProfile(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, role, region')
        .eq('id', user.id)
        .single<ShellProfile>();

      if (!active) return;
      setProfile(data || { full_name: user.email || 'Usuario', role: null, region: null });
      setLoadingProfile(false);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const closeDrawer = () => {
    if (!isWideWeb) setDrawerOpen(false);
  };

  const handleModulePress = (module: AppModule) => {
    const available = isModuleAvailableOnCurrentPlatform(module);

    if (!available) {
      setNotice(module.key === 'inventory'
        ? 'Este módulo está disponible únicamente desde la versión web.'
        : 'Administración está disponible únicamente desde la versión web.');
      if (!isWideWeb) setDrawerOpen(false);
      return;
    }

    setNotice(null);
    router.push(module.route);
    closeDrawer();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setDrawerOpen(false);
    router.replace('/login');
  };

  return (
    <View style={styles.shell}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.menuButton} onPress={() => setDrawerOpen((current) => !current)} accessibilityLabel="Abrir menú">
          <Text style={styles.menuButtonText}>☰</Text>
        </TouchableOpacity>
        <View style={styles.topBarText}>
          <Text style={styles.appTitle}>Auditoría Sweet & Coffee</Text>
          <Text style={styles.moduleState}>{activeModule?.label || 'Evaluaciones'} · {platform === 'web' ? 'Web' : 'APK'}</Text>
        </View>
        <View style={styles.activeBadge}>
          <Text style={styles.activeBadgeText}>Activo</Text>
        </View>
      </View>

      {notice ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {isWideWeb && drawerOpen ? (
          <View style={styles.sidebar}>
            <DrawerContent
              loadingProfile={loadingProfile}
              profile={profile}
              userEmail={userEmail}
              activeModuleKey={activeModuleKey}
              visibleModules={visibleModules}
              onModulePress={handleModulePress}
              onSignOut={handleSignOut}
            />
          </View>
        ) : null}

        <View style={styles.content}>
          {children}
        </View>
      </View>

      {!isWideWeb ? (
        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableOpacity style={styles.backdropPressable} activeOpacity={1} onPress={() => setDrawerOpen(false)} />
            <View style={[styles.drawerPanel, Platform.OS !== 'web' && { paddingTop: insets.top }]}>
              <DrawerContent
                loadingProfile={loadingProfile}
                profile={profile}
                userEmail={userEmail}
                activeModuleKey={activeModuleKey}
                visibleModules={visibleModules}
                onModulePress={handleModulePress}
                onSignOut={handleSignOut}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

type DrawerContentProps = {
  loadingProfile: boolean;
  profile: ShellProfile | null;
  userEmail: string | null;
  activeModuleKey: string;
  visibleModules: AppModule[];
  onModulePress: (module: AppModule) => void;
  onSignOut: () => void;
};

function DrawerContent({ loadingProfile, profile, userEmail, activeModuleKey, visibleModules, onModulePress, onSignOut }: DrawerContentProps) {
  const appVersion = Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version || null;
  const environment = getEnvironmentLabel();

  return (
    <View style={styles.drawerContent}>
      <View style={styles.drawerHeader}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>S&C</Text>
        </View>
        <View style={styles.profileTextBlock}>
          {loadingProfile ? (
            <ActivityIndicator color={brandColors.greenDark} />
          ) : (
            <>
              <Text style={styles.profileName}>{profile?.full_name || userEmail || 'Usuario'}</Text>
              <Text style={styles.profileMeta}>{userEmail || 'Correo no disponible'}</Text>
              <Text style={styles.profileMeta}>{formatRole(profile?.role)} · {profile?.region || 'Región no asignada'}</Text>
            </>
          )}
        </View>
      </View>

      <ScrollView style={styles.moduleList} contentContainerStyle={styles.moduleListContent}>
        {visibleModules.map((module) => {
          const active = activeModuleKey === module.key;
          const available = isModuleAvailableOnCurrentPlatform(module);

          return (
            <TouchableOpacity
              key={module.key}
              style={[styles.moduleItem, active && styles.activeModuleItem, !available && styles.disabledModuleItem]}
              onPress={() => onModulePress(module)}
              activeOpacity={0.82}
            >
              <View style={[styles.moduleIcon, active && styles.activeModuleIcon]}>
                <Text style={[styles.moduleIconText, active && styles.activeModuleIconText]}>{module.icon}</Text>
              </View>
              <View style={styles.moduleText}>
                <View style={styles.moduleTitleRow}>
                  <Text style={styles.moduleTitle}>{module.label}</Text>
                  {!available ? (
                    <View style={[styles.platformBadge, styles.disabledBadge]}>
                      <Text style={[styles.platformBadgeText, styles.disabledBadgeText]}>Disponible en Web</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.moduleDescription}>{module.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.drawerFooter}>
        {appVersion ? <Text style={styles.footerText}>Versión {appVersion}</Text> : null}
        {environment ? <Text style={styles.footerText}>Ambiente {environment}</Text> : null}
        <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
        <Text style={styles.footerText}>Desarrollado por el Dep. de Auditoría</Text>
        <Text style={styles.footerText}>© 2026 Sweet & Coffee</Text>
      </View>
    </View>
  );
}

function getEnvironmentLabel() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return 'local';

  const webUrl = process.env.EXPO_PUBLIC_WEB_APP_URL || '';
  if (webUrl.includes('preview')) return 'preview';
  if (webUrl.includes('expo.app')) return 'web';

  return null;
}

function formatRole(role?: string | null) {
  if (role === 'super_admin') return 'Super admin';
  if (role === 'admin') return 'Admin';
  if (role === 'auditor') return 'Auditor';
  return 'Rol no asignado';
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: brandColors.background,
  },
  topBar: {
    minHeight: 64,
    backgroundColor: brandColors.greenDark,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: brandRadii.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    color: brandColors.white,
    fontSize: 24,
    fontWeight: '900',
  },
  topBarText: {
    flex: 1,
  },
  appTitle: {
    color: brandColors.white,
    fontSize: 18,
    fontWeight: '900',
  },
  moduleState: {
    color: brandColors.logoWhite,
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  activeBadge: {
    backgroundColor: brandColors.greenSoft,
    borderRadius: brandRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeBadgeText: {
    color: brandColors.greenDark,
    fontWeight: '900',
    fontSize: 12,
  },
  noticeBar: {
    backgroundColor: '#FFF6E5',
    borderBottomWidth: 1,
    borderBottomColor: '#E8D3A8',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  noticeText: {
    color: brandColors.coffeeDark,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  sidebar: {
    width: 330,
    backgroundColor: brandColors.surface,
    borderRightWidth: 1,
    borderRightColor: brandColors.border,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.38)',
    flexDirection: 'row',
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  drawerPanel: {
    width: Platform.OS === 'web' ? 360 : '86%',
    maxWidth: 390,
    backgroundColor: brandColors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  drawerContent: {
    flex: 1,
    backgroundColor: brandColors.surface,
  },
  drawerHeader: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: brandColors.border,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: brandColors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: brandColors.white,
    fontWeight: '900',
    fontSize: 14,
  },
  profileTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: brandColors.textPrimary,
    fontWeight: '900',
    fontSize: 16,
  },
  profileMeta: {
    color: brandColors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
    marginTop: 2,
  },
  moduleList: {
    flex: 1,
  },
  moduleListContent: {
    padding: 14,
    gap: 10,
  },
  moduleItem: {
    borderWidth: 1,
    borderColor: brandColors.border,
    borderRadius: brandRadii.lg,
    padding: 12,
    backgroundColor: brandColors.creamSoft,
    flexDirection: 'row',
    gap: 12,
  },
  activeModuleItem: {
    borderColor: brandColors.greenDark,
    backgroundColor: brandColors.greenSoft,
  },
  disabledModuleItem: {
    opacity: 0.78,
  },
  moduleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: brandColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: brandColors.border,
  },
  activeModuleIcon: {
    backgroundColor: brandColors.greenDark,
    borderColor: brandColors.greenDark,
  },
  moduleIconText: {
    color: brandColors.greenDark,
    fontWeight: '900',
    fontSize: 18,
  },
  activeModuleIconText: {
    color: brandColors.white,
  },
  moduleText: {
    flex: 1,
    minWidth: 0,
  },
  moduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  moduleTitle: {
    color: brandColors.textPrimary,
    fontWeight: '900',
    fontSize: 15,
  },
  moduleDescription: {
    color: brandColors.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    fontSize: 12,
  },
  platformBadge: {
    borderRadius: brandRadii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  disabledBadge: {
    backgroundColor: '#F3E8D7',
  },
  platformBadgeText: {
    color: brandColors.greenDark,
    fontWeight: '900',
    fontSize: 10,
  },
  disabledBadgeText: {
    color: brandColors.coffee,
  },
  drawerFooter: {
    borderTopWidth: 1,
    borderTopColor: brandColors.border,
    padding: 16,
    gap: 6,
  },
  signOutButton: {
    backgroundColor: brandColors.greenDark,
    borderRadius: brandRadii.md,
    paddingVertical: 11,
    alignItems: 'center',
    marginVertical: 8,
  },
  signOutText: {
    color: brandColors.white,
    fontWeight: '900',
  },
  footerText: {
    color: brandColors.inputPlaceholder,
    fontSize: 11,
    fontWeight: '700',
  },
});

