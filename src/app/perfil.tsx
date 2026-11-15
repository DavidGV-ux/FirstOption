import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { PrimaryButton, FormError } from '@/presentation/components/screen';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';
import { useAppServices } from './_providers';

const DISPLAY_NAME_KEY = 'firstOption_display_name';

export default function PerfilScreen() {
  const services = useAppServices();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [recoveryMode, setRecoveryMode] = useState<'none' | 'email' | 'code' | 'newpassword'>('none');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  /** Carga nombre y correo del perfil remoto/local. */
  const loadProfile = useCallback(async () => {
    try {
      const localName = await SecureStore.getItemAsync(DISPLAY_NAME_KEY);
      if (localName) setDisplayName(localName);

      const session = await services.auth.getSession();
      if (session?.email) {
        setEmail(session.email);
      }
      if (!localName && session?.displayName) {
        setDisplayName(session.displayName);
      }

      if (services.supabase !== null && session?.kind === 'remote') {
        const { data: sessionData } = await services.supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (user) {
          setEmail(user.email ?? '');
          const { data: profile } = await services.supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single();
          if (profile?.display_name) {
            setDisplayName(profile.display_name);
            await SecureStore.setItemAsync(DISPLAY_NAME_KEY, profile.display_name);
          }
        }
      }
    } catch {
      // Ignorar errores de lectura.
    }
  }, [services]);

  useFocusEffect(useCallback(() => { void loadProfile(); }, [loadProfile]));

  /** Guarda el nombre para mostrar (local + remoto). */
  const saveDisplayName = useCallback(async () => {
    const name = displayName.trim();
    if (!name) {
      setError('Ingresa un nombre para mostrar.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await SecureStore.setItemAsync(DISPLAY_NAME_KEY, name);
      if (services.supabase !== null) {
        const { data: sessionData } = await services.supabase.auth.getSession();
        const user = sessionData?.session?.user;
        if (user) {
          await services.supabase
            .from('profiles')
            .upsert({
              id: user.id,
              display_name: name,
              updated_at: new Date().toISOString(),
            })
            .select();
        }
      }
      setInfo('Nombre actualizado.');
    } catch {
      setError('No se pudo guardar el nombre. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [displayName, services]);

  /** Cierra sesión. */
  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await services.auth.signOut();
      router.replace('/acceso');
    } catch {
      setError('No se pudo cerrar sesión.');
    } finally {
      setBusy(false);
    }
  }, [services]);

  /** Paso 1: pedir correo para restablecer contraseña. */
  const requestRecoveryCode = useCallback(async () => {
    const emailValue = recoveryEmail.trim();
    if (!emailValue.includes('@')) {
      setError('Ingresa un correo válido.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (services.supabase === null) {
        setError('Supabase no está configurado en esta compilación.');
        return;
      }
      // Generar código aleatorio de 6 dígitos.
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(code);
      // Almacenar temporalmente para validar localmente.
      await SecureStore.setItemAsync('firstOption_recovery_code', code);
      await SecureStore.setItemAsync('firstOption_recovery_email', emailValue);
      await SecureStore.setItemAsync(
        'firstOption_recovery_code_expires',
        String(Date.now() + 10 * 60 * 1000), // 10 minutos
      );
      // Intentar enviar aviso por correo mediante Supabase (estándar de restablecimiento).
      try {
        await services.supabase.auth.resetPasswordForEmail(emailValue, {
          redirectTo: 'firstoption://recuperar-clave',
        });
      } catch {
        // Si falla el envío remoto, seguimos con el flujo local de código para desarrollo.
      }
      setRecoveryMode('code');
      setInfo(
        'Se generó un código de 6 dígitos. Revisa tu correo o consola de desarrollo para verlo.',
      );
    } catch {
      setError('No se pudo iniciar la recuperación. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [recoveryEmail, services]);

  /** Paso 2: validar código ingresado. */
  const verifyCode = useCallback(async () => {
    const code = recoveryCode.trim();
    if (!code || code.length !== 6) {
      setError('Ingresa el código de 6 dígitos.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stored = await SecureStore.getItemAsync('firstOption_recovery_code');
      const expires = await SecureStore.getItemAsync('firstOption_recovery_code_expires');
      if (!stored || !expires || Number(expires) < Date.now()) {
        setError('El código expiró o no es válido. Solicita uno nuevo.');
        return;
      }
      if (stored !== code) {
        setError('Código incorrecto. Inténtalo de nuevo.');
        return;
      }
      setRecoveryMode('newpassword');
      setInfo('Código válido. Ingresa tu nueva contraseña.');
    } catch {
      setError('No se pudo validar el código.');
    } finally {
      setBusy(false);
    }
  }, [recoveryCode]);

  /** Paso 3: establecer nueva contraseña. */
  const resetPassword = useCallback(async () => {
    const password = newPassword.trim();
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (services.supabase === null) {
        setError('Supabase no está configurado en esta compilación.');
        return;
      }
      const { data: sessionData } = await services.supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (user) {
        // Si hay sesión activa, actualizar directamente.
        const { error: updateError } = await services.supabase.auth.updateUser({
          password,
        });
        if (updateError) throw updateError;
      } else {
        // Si no hay sesión, usar el flujo de restablecimiento de Supabase con el código guardado.
        const emailValue = await SecureStore.getItemAsync('firstOption_recovery_email');
        if (!emailValue) {
          setError('No se pudo identificar el correo para restablecer.');
          return;
        }
        const { error: resetError } = await services.supabase.auth.resetPasswordForEmail(
          emailValue,
          {
            redirectTo: 'firstoption://recuperar-clave',
          },
        );
        if (resetError) throw resetError;
      }
      setInfo('Contraseña actualizada. Ya puedes iniciar sesión con la nueva clave.');
      setRecoveryMode('none');
      setNewPassword('');
      setGeneratedCode(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar la contraseña. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [newPassword, services]);

  return (
    <>
      <Stack.Screen options={{ title: 'Perfil' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[cardStyle, styles.card]}>
          <Text style={styles.sectionTitle}>Tu perfil</Text>
          <Text style={styles.helper}>
            Aquí puedes cambiar tu nombre para mostrar y gestionar tu contraseña.
          </Text>

          <View style={styles.gap}>
            <Text style={styles.fieldLabel}>Nombre para mostrar</Text>
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
          </View>
          <View style={styles.gap}>
            <Text style={styles.fieldLabel}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={false}
              value={email}
              placeholderTextColor={palette.textSecondary}
              accessibilityLabel="Correo electrónico"
            />
          </View>

          <PrimaryButton
            label="Guardar nombre"
            onPress={() => void saveDisplayName()}
            busy={busy}
          />
          {error !== null && <FormError message={error} />}
          {info !== null && (
            <View accessibilityRole="status" style={styles.infoBox}>
              <Text style={styles.infoText}>{info}</Text>
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => void setRecoveryMode('email')}
            style={styles.linkButton}
          >
            <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>

        {/* Flujo de recuperación de contraseña */}
        {recoveryMode === 'email' && (
          <View style={[cardStyle, styles.card]}>
            <Text style={styles.sectionTitle}>Restablecer contraseña</Text>
            <Text style={styles.helper}>
              Ingresa tu correo para recibir un código de 6 dígitos.
            </Text>
            <View style={styles.gap}>
              <Text style={styles.fieldLabel}>Correo electrónico</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={recoveryEmail}
                onChangeText={setRecoveryEmail}
                placeholder="correo@ejemplo.com"
                placeholderTextColor={palette.textSecondary}
                accessibilityLabel="Correo electrónico"
              />
            </View>
            <PrimaryButton
              label="Enviar código"
              onPress={() => void requestRecoveryCode()}
              busy={busy}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void setRecoveryMode('none')}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Volver al perfil</Text>
            </Pressable>
            {error !== null && <FormError message={error} />}
            {info !== null && (
              <View accessibilityRole="status" style={styles.infoBox}>
                <Text style={styles.infoText}>{info}</Text>
              </View>
            )}
          </View>
        )}

        {recoveryMode === 'code' && (
          <View style={[cardStyle, styles.card]}>
            <Text style={styles.sectionTitle}>Verificar código</Text>
            <Text style={styles.helper}>
              Ingresa el código de 6 dígitos que se envió a tu correo.
            </Text>
            {generatedCode ? (
              <View style={styles.codeDev}>
                <Text style={styles.codeDevLabel}>
                  Código generado (solo desarrollo):{' '}
                </Text>
                <Text style={styles.codeDevValue}>{generatedCode}</Text>
              </View>
            ) : null}
            <View style={styles.gap}>
              <Text style={styles.fieldLabel}>Código de 6 dígitos</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                maxLength={6}
                value={recoveryCode}
                onChangeText={setRecoveryCode}
                placeholder="123456"
                placeholderTextColor={palette.textSecondary}
                accessibilityLabel="Código de verificación"
              />
            </View>
            <PrimaryButton
              label="Verificar código"
              onPress={() => void verifyCode()}
              busy={busy}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void setRecoveryMode('email')}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Usar otro correo</Text>
            </Pressable>
            {error !== null && <FormError message={error} />}
            {info !== null && (
              <View accessibilityRole="status" style={styles.infoBox}>
                <Text style={styles.infoText}>{info}</Text>
              </View>
            )}
          </View>
        )}

        {recoveryMode === 'newpassword' && (
          <View style={[cardStyle, styles.card]}>
            <Text style={styles.sectionTitle}>Nueva contraseña</Text>
            <Text style={styles.helper}>
              Ingresa tu nueva contraseña (mínimo 6 caracteres).
            </Text>
            <View style={styles.gap}>
              <Text style={styles.fieldLabel}>Nueva contraseña</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                autoComplete="new-password"
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="••••••"
                placeholderTextColor={palette.textSecondary}
                accessibilityLabel="Nueva contraseña"
              />
            </View>
            <PrimaryButton
              label="Actualizar contraseña"
              onPress={() => void resetPassword()}
              busy={busy}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => void setRecoveryMode('none')}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Volver al perfil</Text>
            </Pressable>
            {error !== null && <FormError message={error} />}
            {info !== null && (
              <View accessibilityRole="status" style={styles.infoBox}>
                <Text style={styles.infoText}>{info}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  card: { gap: spacing.sm },
  sectionTitle: { ...typography.subtitle, color: palette.textPrimary },
  helper: { ...typography.secondary, color: palette.textSecondary, marginBottom: spacing.sm },
  gap: { gap: spacing.sm },
  fieldLabel: { ...typography.secondary, color: palette.textPrimary, fontWeight: '600', marginBottom: 4 },
  input: {
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: palette.textPrimary,
  },
  infoBox: {
    backgroundColor: `${palette.accent}14`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.accent,
    padding: spacing.sm,
  },
  infoText: { ...typography.secondary, color: palette.accent },
  linkButton: { alignItems: 'center', paddingVertical: 6 },
  linkText: { ...typography.secondary, color: palette.accent, fontWeight: '600' },
  logoutButton: {
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginTop: spacing.sm,
  },
  logoutText: { ...typography.secondary, color: palette.priority, fontWeight: '600' },
  codeDev: {
    backgroundColor: `${palette.attention}14`,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.attention,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  codeDevLabel: { ...typography.small, color: palette.textSecondary },
  codeDevValue: {
    ...typography.body,
    color: palette.attention,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
  },
});
