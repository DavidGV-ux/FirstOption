import * as SecureStore from 'expo-secure-store';
import { useCallback, useState } from 'react';
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

  const submit = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (services.supabase === null) {
        setError('Supabase no está configurado en esta compilación.');
        return;
      }
      if (mode === 'signin') {
        const { error: signInError } = await services.supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError !== null) {
          setError(mensajeAuth(signInError.message));
          return;
        }
        router.back();
      } else {
        const { error: signUpError, data } = await services.supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim() || null,
            },
          },
        });
        if (signUpError !== null) {
          setError(mensajeAuth(signUpError.message));
          return;
        }
        // Guardar el nombre para mostrar localmente (funciona sin red).
        await saveDisplayNameLocally(displayName.trim());
        // Guardar en el perfil remoto de Supabase (tabla profiles).
        if (services.supabase !== null && data.user?.id) {
          try {
            await services.supabase
              .from('profiles')
              .upsert({
                id: data.user.id,
                display_name: displayName.trim() || null,
                updated_at: new Date().toISOString(),
              })
              .select();
          } catch {
            // No bloquear si falla el perfil remoto; el local ya se guardó.
          }
        }
        if (data.session !== null) {
          router.back();
        } else {
          setInfo(
            'Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión.',
          );
        }
      }
    } catch {
      setError('No se pudo contactar al servidor. Verifica tu conexión: los registros locales siguen guardados en el dispositivo.');
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
            internet. Sin conexión, el registro local sigue funcionando.
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

/** Mensajes de error de auth en español, sin exponer detalles técnicos. */
function mensajeAuth(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (message.includes('already registered')) {
    return 'Ese correo ya está registrado. Inicia sesión.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Confirma tu correo antes de iniciar sesión.';
  }
  if (message.toLowerCase().includes('network')) {
    return 'Sin conexión con el servidor. Inténtalo cuando haya internet.';
  }
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
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
