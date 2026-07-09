import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';

const backActionsToDashboard = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);

export function useDashboardBackHandler() {
  const router = useRouter();
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      const goToDashboard = () => {
        router.replace('/dashboard');
        return true;
      };

      const hardwareBack = Platform.OS === 'android'
        ? BackHandler.addEventListener('hardwareBackPress', goToDashboard)
        : null;

      const navigationBack = navigation.addListener('beforeRemove', (event) => {
        if (!backActionsToDashboard.has(event.data.action.type)) return;
        event.preventDefault();
        router.replace('/dashboard');
      });

      return () => {
        hardwareBack?.remove();
        navigationBack();
      };
    }, [navigation, router]),
  );
}
