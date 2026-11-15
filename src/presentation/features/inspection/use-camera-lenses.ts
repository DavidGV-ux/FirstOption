import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CameraView, LensInfo } from 'expo-camera';
import {
  buildLensOptions,
  chooseLens,
  defaultLensForFacing,
  type CameraFacing,
  type CameraLensOption,
} from './camera-lenses';

export type CameraLensStatus = 'idle' | 'loading' | 'ready' | 'unsupported';

/**
 * Selección de lente por cámara. Se conserva durante la sesión para que
 * cambiar entre los modos pupila/pulso no vuelva a la lente por defecto.
 */
const sessionLens: Record<CameraFacing, string | null> = {
  front: defaultLensForFacing('front'),
  back: defaultLensForFacing('back'),
};

interface LensSnapshot {
  facing: CameraFacing;
  options: readonly CameraLensOption[];
  status: CameraLensStatus;
  error: string | null;
}

export interface UseCameraLensesResult {
  options: readonly CameraLensOption[];
  selectedLens: string | null;
  status: CameraLensStatus;
  error: string | null;
  selectLens: (deviceType: string) => void;
  handleCameraReady: () => void;
  handleAvailableLensesChanged: (event: { lenses: readonly LensInfo[] }) => void;
  refresh: () => Promise<void>;
}

/**
 * Envuelve `CameraView.getAvailableLensesAsync()`.
 *
 * - iOS: devuelve las lentes físicas de la cámara activa.
 * - Android: expo-camera no implementa la enumeración de lentes; la llamada
 *   falla o devuelve una lista vacía. En ese caso el estado es
 *   `unsupported` y la UI lo dice explícitamente: no se inventa una lista.
 */
export function useCameraLenses(
  cameraRef: RefObject<CameraView | null>,
  facing: CameraFacing,
): UseCameraLensesResult {
  const [snapshot, setSnapshot] = useState<LensSnapshot>({
    facing,
    options: [],
    status: 'idle',
    error: null,
  });
  const [selectedByFacing, setSelectedByFacing] = useState<Record<CameraFacing, string | null>>({
    front: sessionLens.front,
    back: sessionLens.back,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Se descarta cualquier resultado de la cámara anterior: al cambiar de
  // posición (frontal/trasera) no se muestran lentes que ya no aplican.
  const options = useMemo(
    () => (snapshot.facing === facing ? snapshot.options : []),
    [snapshot, facing],
  );
  const status = snapshot.facing === facing ? snapshot.status : 'idle';
  const error = snapshot.facing === facing ? snapshot.error : null;
  const selectedLens = selectedByFacing[facing];

  const applyLenses = useCallback(
    (lenses: readonly LensInfo[]) => {
      const nextOptions = buildLensOptions(lenses, facing);
      if (!mountedRef.current) return;

      if (nextOptions.length === 0) {
        setSnapshot({ facing, options: [], status: 'unsupported', error: null });
        return;
      }

      const nextSelected = chooseLens(nextOptions, sessionLens[facing]);
      sessionLens[facing] = nextSelected;
      setSelectedByFacing((current) => ({ ...current, [facing]: nextSelected }));
      setSnapshot({ facing, options: nextOptions, status: 'ready', error: null });
    },
    [facing],
  );

  const refresh = useCallback(async () => {
    const view = cameraRef.current;
    if (!view || typeof view.getAvailableLensesAsync !== 'function') {
      if (mountedRef.current) {
        setSnapshot({ facing, options: [], status: 'unsupported', error: null });
      }
      return;
    }

    if (mountedRef.current) {
      setSnapshot((current) =>
        current.facing === facing && current.status === 'ready'
          ? current
          : { facing, options: [], status: 'loading', error: null },
      );
    }

    try {
      const lenses = await view.getAvailableLensesAsync();
      if (!mountedRef.current) return;
      if (!Array.isArray(lenses) || lenses.length === 0) {
        setSnapshot({ facing, options: [], status: 'unsupported', error: null });
        return;
      }
      applyLenses(lenses);
    } catch (cause) {
      if (!mountedRef.current) return;
      setSnapshot({
        facing,
        options: [],
        status: 'unsupported',
        error: cause instanceof Error ? cause.message : null,
      });
    }
  }, [applyLenses, cameraRef, facing]);

  const handleCameraReady = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleAvailableLensesChanged = useCallback(
    (event: { lenses: readonly LensInfo[] }) => {
      if (Array.isArray(event.lenses) && event.lenses.length > 0) {
        applyLenses(event.lenses);
      }
    },
    [applyLenses],
  );

  const selectLens = useCallback(
    (deviceType: string) => {
      if (!options.some((option) => option.deviceType === deviceType)) return;
      sessionLens[facing] = deviceType;
      setSelectedByFacing((current) => ({ ...current, [facing]: deviceType }));
    },
    [facing, options],
  );

  return {
    options,
    selectedLens,
    status,
    error,
    selectLens,
    handleCameraReady,
    handleAvailableLensesChanged,
    refresh,
  };
}
