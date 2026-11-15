import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import type { MissionPhase } from '@/domain/observations/observation';
import {
  MISSION_PHASES,
  MISSION_PHASE_LABELS_ES,
} from '@/domain/observations/observation';
import { PrimaryButton } from '@/presentation/components/screen';
import { cardStyle, palette, radius, spacing, typography } from '@/presentation/theme/tokens';

import { InspectionDisclaimer } from '@/presentation/features/inspection/InspectionDisclaimer';
import { CameraPulseView } from '@/presentation/features/inspection/CameraPulseView';
import { CameraPlrView } from '@/presentation/features/inspection/CameraPlrView';

/** Modos disponibles: solo reflejo fotomotor (PLR) y pulso óptico (PPG). */
type InspectionMode = 'pulse' | 'plr';

/**
 * Pantalla de linterna de inspección.
 *
 * - No incluye captura pupilar asistida: la estimación automática del
 *   tamaño pupilar resultó poco fiable y se retiró de la interfaz.
 * - El pulso PPG solo reporta frecuencia cardíaca y calidad de señal.
 * - El reflejo (PLR) mide latencia/velocidad con un pulso de luz.
 * - La cámara se desmonta antes de cambiar de modo para evitar bloqueos
 *   de CameraX en Android.
 */
export default function LinternaScreen() {
  const [permission, requestPermission] = useCameraPermissions();

  const [focused, setFocused] = useState(false);
  const [inspectionMode, setInspectionMode] = useState<InspectionMode>('pulse');
  const [phase, setPhase] = useState<MissionPhase | null>(null);

  // En Android, montar la cámara nueva antes de que la anterior termine de
  // liberarse puede bloquear CameraX. Desmontamos, cambiamos de modo y
  // volvemos a montar tras una pausa breve.
  const [cameraMounted, setCameraMounted] = useState(true);
  const [switchingMode, setSwitchingMode] = useState<InspectionMode | null>(null);
  const [cameraGeneration, setCameraGeneration] = useState(0);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Desmontar la cámara al perder foco (evita consumir la cámara en segundo plano).
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setCameraMounted(true);
      return () => {
        setFocused(false);
        setCameraMounted(false);
      };
    }, []),
  );

  const switchInspectionMode = useCallback(
    (next: InspectionMode) => {
      if (next === inspectionMode || switchingMode !== null) return;
      setCameraMounted(false);
      setSwitchingMode(next);
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      switchTimerRef.current = setTimeout(() => {
        switchTimerRef.current = null;
        setInspectionMode(next);
        setCameraGeneration((value) => value + 1);
        setCameraMounted(true);
        setSwitchingMode(null);
      }, 320);
    },
    [inspectionMode, switchingMode],
  );

  useEffect(
    () => () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    },
    [],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Linterna de inspección' }} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Aviso y disclaimer ético obligatorio permanente */}
        <InspectionDisclaimer />

        {/* Fase de la misión: se guarda junto con cada medición */}
        <View style={[cardStyle, styles.section]}>
          <Text style={styles.sectionTitle}>Fase de la misión</Text>
          <Text style={styles.hintText}>
            Se registra junto con la medición para dar contexto. Selecciona una
            antes de guardar.
          </Text>
          <View style={styles.row}>
            {MISSION_PHASES.map((option) => {
              const selected = phase === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={MISSION_PHASE_LABELS_ES[option]}
                  accessibilityState={{ selected }}
                  onPress={() => setPhase(option)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {MISSION_PHASE_LABELS_ES[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {phase === null ? (
            <Text style={styles.warningText}>
              Sin fase seleccionada no se podrá guardar la medición.
            </Text>
          ) : null}
        </View>

        {/* Selector de modo de inspección */}
        <View style={[cardStyle, styles.modeSection]}>
          <Text style={styles.sectionTitle}>Modo de inspección</Text>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modo medición de pulso con linterna (PPG)"
              accessibilityState={{ selected: inspectionMode === 'pulse' }}
              onPress={() => switchInspectionMode('pulse')}
              disabled={switchingMode !== null}
              style={[styles.option, inspectionMode === 'pulse' && styles.optionSelected]}
            >
              <Text style={[styles.optionLabel, inspectionMode === 'pulse' && styles.optionLabelSelected]}>
                Pulso (PPG)
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modo reflejo fotomotor pupilar (PLR)"
              accessibilityState={{ selected: inspectionMode === 'plr' }}
              onPress={() => switchInspectionMode('plr')}
              disabled={switchingMode !== null}
              style={[styles.option, inspectionMode === 'plr' && styles.optionSelected]}
            >
              <Text style={[styles.optionLabel, inspectionMode === 'plr' && styles.optionLabelSelected]}>
                Reflejo (PLR)
              </Text>
            </Pressable>
          </View>
          {switchingMode ? (
            <Text style={styles.hintText}>
              Cambiando de modo y liberando la cámara del modo anterior…
            </Text>
          ) : null}
        </View>

        {/* Permisos de cámara */}
        {permission === null ? (
          <Text style={styles.hintText}>Verificando permisos de cámara…</Text>
        ) : !permission.granted ? (
          <View style={[cardStyle, styles.section]}>
            <Text style={styles.sectionTitle}>Permiso de cámara</Text>
            <Text style={styles.bodyText}>
              Se requiere acceso a la cámara para la medición de pulso y reflejo
              pupilar. No se guardan fotos ni se graba audio. Si deniegas el
              permiso, el registro diario sigue disponible sin estas mediciones.
            </Text>
            {permission.canAskAgain ? (
              <PrimaryButton
                label="Permitir acceso a la cámara"
                onPress={() => void requestPermission()}
              />
            ) : (
              <>
                <Text style={styles.bodyText}>
                  El permiso quedó denegado en el sistema. Puedes activarlo en ajustes.
                </Text>
                <PrimaryButton
                  label="Abrir ajustes del sistema"
                  onPress={() => void Linking.openSettings()}
                />
              </>
            )}
          </View>
        ) : inspectionMode === 'pulse' ? (
          <View style={[cardStyle, styles.section]}>
            <Text style={styles.sectionTitle}>Pulso con linterna (PPG)</Text>
            <Text style={styles.hintText}>
              Coloca la yema del dedo cubriendo suavemente la cámara trasera y la
              linterna. Solo se reporta frecuencia cardíaca y calidad de señal;
              no se estiman presión ni saturación.
            </Text>

            {focused && cameraMounted && (
              <CameraPulseView
                key={`pulse-${cameraGeneration}`}
                missionPhase={phase}
              />
            )}
          </View>
        ) : (
          <View style={[cardStyle, styles.section]}>
            <Text style={styles.sectionTitle}>Reflejo Fotomotor Pupilar (PLR)</Text>
            <Text style={styles.hintText}>
              Protocolo de estimulación con pulso de luz (300 ms) para medir
              latencia de contracción, velocidad de miosis y redilatación
              funcional. Es una medición experimental, no un diagnóstico.
            </Text>

            {focused && cameraMounted && (
              <CameraPlrView
                key={`plr-${cameraGeneration}`}
                missionPhase={phase}
              />
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
  section: { gap: spacing.md },
  modeSection: { gap: spacing.xs },
  sectionTitle: { ...typography.cardTitle, color: palette.textPrimary, marginBottom: spacing.xs },
  bodyText: { ...typography.body, color: palette.textSecondary },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.xs },
  option: {
    minHeight: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionSelected: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  optionLabel: { ...typography.secondary, color: palette.textPrimary },
  optionLabelSelected: { color: palette.accent, fontWeight: '700' },
  hintText: { ...typography.small, color: palette.textSecondary, marginTop: spacing.xs },
  warningText: { ...typography.small, color: palette.attention, fontWeight: '600' },
});
