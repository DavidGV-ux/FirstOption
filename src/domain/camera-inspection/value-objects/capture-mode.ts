/**
 * Modo de captura empleado en la inspección.
 */
export const CAPTURE_MODES = [
  'front_camera',
  'back_camera',
  'manual_only',
] as const;

export type CaptureMode = (typeof CAPTURE_MODES)[number];

export const CAPTURE_MODE_LABELS_ES: Record<CaptureMode, string> = {
  front_camera: 'Cámara frontal asistida',
  back_camera: 'Cámara trasera asistida',
  manual_only: 'Registro manual sin captura',
};
