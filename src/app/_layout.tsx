import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppServicesProvider, useAppServices } from './_providers';
import { palette } from '@/presentation/theme/tokens';

export default function RootLayout() {
  return (
    <AppServicesProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AppServicesProvider>
  );
}

/**
 * Guardia de sesión: la app abre en el acceso y no permite quedarse en
 * otras pantallas sin una sesión remota o local. Los datos locales solo
 * se muestran después de comprobar la sesión.
 */
function RootNavigator() {
  const services = useAppServices();
  const router = useRouter();
  const segments = useSegments();
  const segmentRoot = segments[0] ?? '';

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await services.auth.getSession();
        if (!active) return;
        const inAccess = segmentRoot === 'acceso';
        if (session === null && !inAccess) {
          router.replace('/acceso');
        } else if (session !== null && inAccess) {
          router.replace('/');
        }
      } catch {
        // Si no se puede comprobar, el inicio vuelve a intentarlo.
      }
    })();
    return () => {
      active = false;
    };
  }, [services.auth, router, segmentRoot]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.background },
        headerTintColor: palette.textPrimary,
        headerTitleStyle: { color: palette.textPrimary, fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'firstOption', headerShown: false }} />
      <Stack.Screen name="registrar" options={{ title: 'Registrar seguimiento' }} />
      <Stack.Screen name="historial" options={{ title: 'Historial' }} />
      <Stack.Screen name="acceso" options={{ title: 'Acceso' }} />
      <Stack.Screen name="linterna" options={{ title: 'Linterna de inspección' }} />
      <Stack.Screen name="analisis" options={{ title: 'Análisis descriptivo' }} />
      <Stack.Screen name="estado" options={{ title: 'Estado general' }} />
      <Stack.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Stack>
  );
}
