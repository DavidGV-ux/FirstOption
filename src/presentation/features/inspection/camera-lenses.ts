import type { LensInfo } from 'expo-camera';

export type CameraFacing = 'front' | 'back';

export interface CameraLensOption {
  deviceType: string;
  localizedName: string;
  /** Etiqueta corta en español para los botones. */
  label: string;
  /** Explicación de para qué sirve esa lente y su relación con el flash. */
  hint: string;
  /** La lente estándar: en iPhone suele ser la más cercana al flash. */
  preferred: boolean;
}

const WIDE_ANGLE = 'AVCaptureDeviceTypeBuiltInWideAngleCamera';
const ULTRA_WIDE = 'AVCaptureDeviceTypeBuiltInUltraWideCamera';
const TELEPHOTO = 'AVCaptureDeviceTypeBuiltInTelephotoCamera';
const TRUE_DEPTH = 'AVCaptureDeviceTypeBuiltInTrueDepthCamera';
const DUAL = 'AVCaptureDeviceTypeBuiltInDualCamera';
const DUAL_WIDE = 'AVCaptureDeviceTypeBuiltInDualWideCamera';
const TRIPLE = 'AVCaptureDeviceTypeBuiltInTripleCamera';

/**
 * Cámaras virtuales: iOS decide internamente qué lente física usar (a veces
 * la ultra gran angular para enfoque cercano). Para PPG queremos fijar una
 * lente física concreta, así que no las mostramos salvo que no haya otra.
 */
const VIRTUAL_DEVICE_TYPES = new Set([DUAL, DUAL_WIDE, TRIPLE]);

const DEVICE_DESCRIPTIONS: Record<string, { label: string; hint: string }> = {
  [WIDE_ANGLE]: {
    label: 'Principal',
    hint: 'Lente estándar. En iPhone suele ser la que está físicamente junto al flash.',
  },
  [ULTRA_WIDE]: {
    label: 'Ultra gran angular',
    hint: 'Campo de visión amplio. En varios modelos el flash queda más lejos de esta lente.',
  },
  [TELEPHOTO]: {
    label: 'Teleobjetivo',
    hint: 'Zoom óptico. Normalmente está más alejada del flash que la lente principal.',
  },
  [TRUE_DEPTH]: {
    label: 'Frontal TrueDepth',
    hint: 'Cámara frontal con sensores de profundidad.',
  },
  [DUAL]: {
    label: 'Cámara dual (automática)',
    hint: 'El sistema puede cambiar de lente por su cuenta; no fija una lente física.',
  },
  [DUAL_WIDE]: {
    label: 'Cámara dual gran angular (automática)',
    hint: 'El sistema puede cambiar de lente por su cuenta; no fija una lente física.',
  },
  [TRIPLE]: {
    label: 'Cámara triple (automática)',
    hint: 'El sistema puede cambiar de lente por su cuenta; no fija una lente física.',
  },
};

/** Orden estable y predecible para la UI (principal primero). */
const LENS_ORDER: readonly string[] = [
  WIDE_ANGLE,
  ULTRA_WIDE,
  TELEPHOTO,
  TRUE_DEPTH,
  DUAL_WIDE,
  DUAL,
  TRIPLE,
];

function fallbackLabel(lens: LensInfo): string {
  // localizedName suele venir en el idioma del sistema ("Back Camera").
  const cleaned = lens.localizedName
    .replace(/\b(back|front|rear|camera|cámara|trasera|frontal)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : 'Lente';
}

export function describeLens(lens: LensInfo): CameraLensOption {
  const known = DEVICE_DESCRIPTIONS[lens.deviceType];
  return {
    deviceType: lens.deviceType,
    localizedName: lens.localizedName,
    label: known?.label ?? fallbackLabel(lens),
    hint: known?.hint ?? 'Lente de cámara detectada por el sistema.',
    preferred: lens.deviceType === WIDE_ANGLE,
  };
}

/**
 * Normaliza la lista nativa:
 * - descarta cámaras virtuales cuando hay lentes físicas disponibles;
 * - ordena la principal primero;
 * - deja una sola entrada por deviceType.
 */
export function buildLensOptions(
  lenses: readonly LensInfo[],
  _facing: CameraFacing,
): CameraLensOption[] {
  const unique = new Map<string, LensInfo>();
  for (const lens of lenses) {
    if (!lens || typeof lens.deviceType !== 'string' || lens.deviceType.length === 0) {
      continue;
    }
    if (!unique.has(lens.deviceType)) {
      unique.set(lens.deviceType, lens);
    }
  }

  const all = [...unique.values()];
  const physical = all.filter((lens) => !VIRTUAL_DEVICE_TYPES.has(lens.deviceType));
  const usable = physical.length > 0 ? physical : all;

  const orderIndex = (deviceType: string) => {
    const index = LENS_ORDER.indexOf(deviceType);
    return index === -1 ? LENS_ORDER.length : index;
  };

  return usable
    .sort((a, b) => {
      const byOrder = orderIndex(a.deviceType) - orderIndex(b.deviceType);
      if (byOrder !== 0) return byOrder;
      return a.localizedName.localeCompare(b.localizedName);
    })
    .map(describeLens);
}

/**
 * Elige la lente inicial:
 * 1. la última que eligió la persona en esta sesión, si sigue existiendo;
 * 2. la lente principal (la más próxima al flash en iPhone);
 * 3. la primera disponible.
 */
export function chooseLens(
  options: readonly CameraLensOption[],
  stored: string | null,
): string | null {
  if (options.length === 0) return null;
  if (stored && options.some((option) => option.deviceType === stored)) {
    return stored;
  }
  return options.find((option) => option.preferred)?.deviceType ?? options[0].deviceType;
}

/**
 * En iOS, `AVCaptureDeviceTypeBuiltInWideAngleCamera` es la lente física
 * estándar. Pasarla desde el inicio evita que el sistema elija la cámara
 * virtual «macro» (que puede saltar a la ultra gran angular y alejarse del
 * flash). En Android el prop no está soportado y el sistema usa su cámara
 * trasera predeterminada.
 */
export function defaultLensForFacing(facing: CameraFacing): string | null {
  return facing === 'back' ? WIDE_ANGLE : WIDE_ANGLE;
}
