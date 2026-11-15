import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { FormError, PrimaryButton } from '@/presentation/components/screen';
import { cardStyle, palette, spacing, typography } from '@/presentation/theme/tokens';
import { useAppServices } from './_providers';

const DISPLAY_NAME_KEY = 'firstOption_display_name';

/**
 * Acceso con Supabase Auth (email + contraseña).
 *
 * Reglas honestas:
 * - Sin conexión no hay autenticación remota: el error lo dice y los
 *   datos locales siguen funcionando igual.
 * - El registro crea el perfil remoto vía trigger; no se piden datos
 *   clínicos aquí.
 * - Al crear cuenta se pide un nombre para mostrar ("¿Cómo quieres que
 *   te llamamos?") que se guarda en el perfil y se usa en el inicio.
 */
export default function AccessScreen() {
  const services = useAppServices();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /** Guarda el nombre para mostrar localmente (para usarlo sin red). */
  const saveDisplayNameLocally = useCallback(async (name: string) => {
    try {
      await SecureStore.setItemAsync(DISPLAY_NAME_KEY, name);
    } catch {
      // Ignorar si SecureStore no está disponible.
    }
  }, []);

  // Si ya hay sesión (remota o local), no tiene sentido quedarse aquí.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await services.auth.getSession();
        if (active && session !== null) router.replace('/');
      } catch {
        // Sin sesión: se muestra el formulario.
      }
    })();
    return () => {
      active = false;
    };
  }, [services.auth]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const outcome =
        mode === 'signin'
          ? await services.auth.signIn(email, password)
          : await services.auth.signUp(email, password, displayName);

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      if (mode === 'signup' && displayName.trim().length > 0) {
        await saveDisplayNameLocally(displayName.trim());
      }

      if (outcome.message !== undefined) {
        setInfo(outcome.message);
        // Dejar leer el aviso (cuenta local pendiente o correo por
        // confirmar) antes de entrar al inicio.
        setTimeout(() => router.replace('/'), 1200);
      } else {
        router.replace('/');
      }
    } catch {
      setError(
        'No se pudo completar la operación. Los registros locales siguen guardados en el dispositivo.',
      );
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.includes('@') && password.length >= 6 && !busy;

  return (
    <>
      <Stack.Screen options={{ title: 'Acceso' }} />
      <View style={styles.container}>
        <View style={[cardStyle, styles.gap]}>
          <Text style={styles.title}>{mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
          <Text style={styles.help}>
            La cuenta permite sincronizar con el servidor cuando haya
            internet. Si no tienes conexión, puedes crear la cuenta en este
            dispositivo: se validará y subirá automáticamente al recuperar
            internet. Los registros locales siguen funcionando sin cuenta.
          </Text>
          {mode === 'signup' && (
            <>
              <Text style={styles.fieldLabel}>¿Cómo quieres que te llamamos?</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="words"
                autoComplete="name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Tu nombre"
                placeholderTextColor={palette.textSecondary}
                accessibilityLabel="Nombre para mostrar"
              />
              <Text style={styles.fieldHelp}>
                Este nombre aparecerá en el inicio de la app. Puedes dejarlo
                vacío si prefieres usar tu correo.
              </Text>
            </>
          )}
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            placeholderTextColor={palette.textSecondary}
            accessibilityLabel="Correo electrónico"
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña (mínimo 6 caracteres)"
            placeholderTextColor={palette.textSecondary}
            accessibilityLabel="Contraseña"
          />
          {error !== null && <FormError message={error} />}
          {info !== null && (
            <View accessibilityRole="status" style={styles.infoBox}>
              <Text style={styles.infoText}>{info}</Text>
            </View>
          )}
          <PrimaryButton
            label={mode === 'signin' ? 'Iniciar sesión' : 'Crear cuenta'}
            onPress={() => void submit()}
            disabled={!canSubmit}
            busy={busy}
          />
          {busy && <ActivityIndicator color={palette.accent} />}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setInfo(null);
            }}
            style={styles.switchButton}
          >
            <Text style={styles.switchText}>
              {mode === 'signin'
                ? '¿No tienes cuenta? Crear una'
                : '¿Ya tienes cuenta? Iniciar sesión'}
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, padding: spacing.lg, justifyContent: 'center' },
  gap: { gap: spacing.md },
  title: { ...typography.title, color: palette.textPrimary },
  help: { ...typography.secondary, color: palette.textSecondary },
  fieldLabel: { ...typography.secondary, color: palette.textPrimary, fontWeight: '600', marginBottom: 4 },
  fieldHelp: { ...typography.small, color: palette.textSecondary, marginBottom: spacing.sm },
  input: {
    backgroundColor: palette.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...typography.body,
    color: palette.textPrimary,
  },
  infoBox: {
    backgroundColor: `${palette.accent}14`,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.accent,
    padding: 8,
  },
  infoText: { ...typography.secondary, color: palette.accent },
  switchButton: { alignItems: 'center', paddingVertical: 4 },
  switchText: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
});
