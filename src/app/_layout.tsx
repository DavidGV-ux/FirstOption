import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppServicesProvider } from './_providers';
import { palette } from '@/presentation/theme/tokens';
import { useAutoSync } from './hooks/use-auto-sync';

export default function RootLayout() {
  useAutoSync();
  return (
    <AppServicesProvider>
      <StatusBar style="light" />
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
    </AppServicesProvider>
  );
}
