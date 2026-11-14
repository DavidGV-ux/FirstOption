import type { FrameAnalyzerPort, EyeGuideRegion, FrameAnalysisResult } from '@/domain/camera-inspection/ports/frame-analyzer-port';
import type { ImageEncoderPort } from '@/domain/camera-inspection/ports/image-encoder-port';
import type { RawCapturedImage } from '@/domain/camera-inspection/ports/camera-capture-port';

export interface AnalyzeInspectionCaptureDto {
  captureId: string;
  image: RawCapturedImage;
  guide?: EyeGuideRegion;
}

export class AnalyzeInspectionCaptureUseCase {
  constructor(
    private readonly encoder: ImageEncoderPort,
    private readonly analyzer: FrameAnalyzerPort,
  ) {}

  async execute(dto: AnalyzeInspectionCaptureDto): Promise<FrameAnalysisResult> {
    const { captureId, image } = dto;

    // Región de la guía por defecto (centrada en pantalla con radio del ~25% de ancho)
    const guide: EyeGuideRegion = dto.guide ?? {
      centerX: 0.5,
      centerY: 0.45,
      radiusX: 0.22,
      radiusY: 0.16,
    };

    // Decodificar a píxeles RGBA
    const pixels = image.base64
      ? await this.encoder.decodeToRgba(image.base64)
      : {
          data: new Uint8Array(0),
          width: image.width,
          height: image.height,
        };

    // Analizar la señal
    return this.analyzer.analyze(captureId, pixels, guide);
  }
}
