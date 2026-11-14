import { useWindowDimensions } from 'react-native';

/**
 * Hook responsivo: detecta móvil vs tablet y devuelve márgenes, ancho
 * máximo de contenido y número de columnas. Sin valores fijos por
 * pantalla: los estilos se derivan de estas métricas.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const contentMaxWidth = isTablet ? 720 : width;
  const columns = isTablet ? 2 : 1;
  const horizontalMargin = isTablet ? (width >= 1024 ? 48 : 32) : 20;
  const cardGap = isTablet ? 24 : 16;
  return {
    width,
    height,
    isTablet,
    contentMaxWidth,
    columns,
    horizontalMargin,
    cardGap,
  };
}
