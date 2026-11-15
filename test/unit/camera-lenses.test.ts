import {
  buildLensOptions,
  chooseLens,
  describeLens,
  defaultLensForFacing,
} from '@/presentation/features/inspection/camera-lenses';

const WIDE = 'AVCaptureDeviceTypeBuiltInWideAngleCamera';
const ULTRA = 'AVCaptureDeviceTypeBuiltInUltraWideCamera';
const TELE = 'AVCaptureDeviceTypeBuiltInTelephotoCamera';
const TRIPLE = 'AVCaptureDeviceTypeBuiltInTripleCamera';

const lens = (deviceType: string, localizedName: string) => ({ deviceType, localizedName });

describe('selección de lente de cámara', () => {
  it('ordena la lente principal primero y descarta cámaras virtuales cuando hay físicas', () => {
    const options = buildLensOptions(
      [
        lens(TELE, 'Back Telephoto Camera'),
        lens(TRIPLE, 'Back Triple Camera'),
        lens(WIDE, 'Back Camera'),
        lens(ULTRA, 'Back Ultra Wide Camera'),
      ],
      'back',
    );

    expect(options.map((option) => option.deviceType)).toEqual([WIDE, ULTRA, TELE]);
    expect(options[0].preferred).toBe(true);
    expect(options[0].label).toBe('Principal');
  });

  it('usa la cámara virtual solo si no hay ninguna lente física disponible', () => {
    const options = buildLensOptions([lens(TRIPLE, 'Back Triple Camera')], 'back');

    expect(options).toHaveLength(1);
    expect(options[0].deviceType).toBe(TRIPLE);
  });

  it('conserva la lente elegida si sigue estando disponible', () => {
    const options = buildLensOptions(
      [lens(WIDE, 'Back Camera'), lens(ULTRA, 'Back Ultra Wide Camera')],
      'back',
    );

    expect(chooseLens(options, ULTRA)).toBe(ULTRA);
  });

  it('cae en la primera lente disponible cuando no hay principal ni selección válida', () => {
    const options = buildLensOptions(
      [lens(ULTRA, 'Back Ultra Wide Camera'), lens(TELE, 'Back Telephoto Camera')],
      'back',
    );

    expect(chooseLens(options, null)).toBe(ULTRA);
    expect(chooseLens(options, 'lente-inexistente')).toBe(ULTRA);
    expect(chooseLens([], WIDE)).toBeNull();
  });

  it('describe la lente principal como la más cercana al flash', () => {
    const description = describeLens(lens(WIDE, 'Back Camera'));

    expect(description.preferred).toBe(true);
    expect(description.hint).toMatch(/flash/i);
  });

  it('propone la lente estándar en ambas posiciones antes de enumerar', () => {
    expect(defaultLensForFacing('back')).toBe(WIDE);
    expect(defaultLensForFacing('front')).toBe(WIDE);
  });
});
