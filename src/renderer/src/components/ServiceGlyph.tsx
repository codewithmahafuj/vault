import type { JSX } from 'react';
import { normalizeService } from '../../../shared/normalize';
import { globeMark, resolveServiceMark } from './service-marks';

interface ServiceGlyphProps {
  readonly service: string;
}

export default function ServiceGlyph({ service }: ServiceGlyphProps): JSX.Element {
  const mark = resolveServiceMark(normalizeService(service)) ?? globeMark();
  const Mark = mark.component;

  return (
    <span
      className="tile"
      style={{ color: `var(${mark.colorVariable})` }}
      aria-hidden="true"
      data-service={service}
    >
      <Mark />
    </span>
  );
}
