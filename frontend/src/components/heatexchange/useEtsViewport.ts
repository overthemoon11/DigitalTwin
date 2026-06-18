import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ETS_FULL_VIEW,
  boundsForEtsEquipment,
  focusEtsViewport,
  panEtsView,
  viewBoxString,
  zoomEtsAt,
} from './etsDetailLayout';

export function useEtsViewport(selectedId: string | null) {
  const [view, setView] = useState(ETS_FULL_VIEW);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    setView(ETS_FULL_VIEW);
    if (!selectedId) return;
    const bounds = boundsForEtsEquipment(selectedId);
    if (bounds) setView(focusEtsViewport(bounds));
  }, [selectedId]);

  const fitAll = useCallback(() => setView(ETS_FULL_VIEW), []);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setView((prev) => zoomEtsAt(prev, e.clientX, e.clientY, rect, e.deltaY < 0));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if ((e.target as Element).closest('.plant-equip')) return;
    panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!panRef.current.active || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = e.clientX - panRef.current.lastX;
    const dy = e.clientY - panRef.current.lastY;
    panRef.current.lastX = e.clientX;
    panRef.current.lastY = e.clientY;
    setView((prev) => {
      const dxSvg = (dx / rect.width) * prev.w;
      const dySvg = (dy / rect.height) * prev.h;
      return panEtsView(prev, dxSvg, dySvg);
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    panRef.current.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const zoomStep = useCallback((zoomIn: boolean) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setView((prev) =>
      zoomEtsAt(prev, rect.left + rect.width / 2, rect.top + rect.height / 2, rect, zoomIn)
    );
  }, []);

  return {
    svgRef,
    viewBox: viewBoxString(view),
    fitAll,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    zoomStep,
  };
}
