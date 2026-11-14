import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppServicesProvider } from './_providers';
import { palette } from '@/presentation/theme/tokens';

export default function RootLayout() {
  return (
    <AppServicesProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.background },
          headerTitleStyle: { color: palette.textPrimary },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Órbita Salud' }} />
        <Stack.Screen
          name="registrar"
          options={{ title: 'Registrar seguimiento' }}
        />
        <Stack.Screen name="historial" options={{ title: 'Historial' }} />
        <Stack.Screen name="acceso" options={{ title: 'Acceso' }} />
        <Stack.Screen name="linterna" options={{ title: 'Linterna de inspección' }} />
      </Stack>
    </AppServicesProvider>
  );
}
