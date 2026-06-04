/** SVG-native rotation — avoids CSS transform breaking SVG translate (top-left bug). */
interface Props {
  durSec: number;
  cx?: number;
  cy?: number;
}

export function ScadaSpin({ durSec, cx = 0, cy = 0 }: Props) {
  if (durSec <= 0) return null;
  return (
    <animateTransform
      attributeName="transform"
      attributeType="XML"
      type="rotate"
      from={`0 ${cx} ${cy}`}
      to={`360 ${cx} ${cy}`}
      dur={`${durSec}s`}
      repeatCount="indefinite"
    />
  );
}
