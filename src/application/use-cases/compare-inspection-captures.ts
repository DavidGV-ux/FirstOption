import type { IdGenerator } from '@/domain/shared/ids';
import type { InspectionRepositoryPort } from '@/domain/camera-inspection/ports/inspection-repository-port';
import type { CameraCapture } from '@/domain/camera-inspection/entities/camera-capture';
import type { PupilEstimate } from '@/domain/camera-inspection/entities/pupil-estimate';
import type { InspectionComparison } from '@/domain/camera-inspection/entities/inspection-comparison';
import { compareInspectionCaptures } from '@/domain/camera-inspection/policies/comparison-policy';

export interface CompareInspectionCapturesDto {
  subjectId: string;
  currentCapture: CameraCapture;
  currentEstimate: PupilEstimate;
}

export class CompareInspectionCapturesUseCase {
  constructor(
    private readonly repo: InspectionRepositoryPort,
    private readonly ids: IdGenerator,
  ) {}

  async execute(dto: CompareInspectionCapturesDto): Promise<InspectionComparison | null> {
    const baselineRecord = await this.repo.getLatestCapture(
      dto.subjectId,
      dto.currentCapture.eyeSide,
    );

    if (!baselineRecord || !baselineRecord.estimate) {
      return null;
    }

    const comparisonId = `cmp-${this.ids.uuid()}`;

    const comparison = compareInspectionCaptures({
      comparisonId,
      subjectId: dto.subjectId,
      baseline: {
        capture: baselineRecord.capture,
        estimate: baselineRecord.estimate,
      },
      current: {
        capture: dto.currentCapture,
        estimate: dto.currentEstimate,
      },
    });

    return comparison;
  }
}
