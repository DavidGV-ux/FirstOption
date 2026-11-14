/**
 * Entidad: Métricas de análisis de fotograma / imagen capturada.
 * Derivadas directamente del procesamiento de la señal de imagen.
 */
export interface FrameAnalysis {
  captureId: string;
  brightness: number; // 0 a 255 (brillo medio)
  contrast: number; // desviación estándar o gradiente de contraste
  sharpness: number; // indicador de nitidez basado en gradientes / laplaciano
  motionScore: number; // 0.0 (estático) a 1.0 (movimiento extremo)
  blinkDetected: boolean;
  eyeOpen: boolean;
  eyeInGuide: boolean;
  lightingScore: number; // 0.0 (pésima luz) a 1.0 (óptima)
  resolutionWidth: number;
  resolutionHeight: number;
  createdAt: string;
}
