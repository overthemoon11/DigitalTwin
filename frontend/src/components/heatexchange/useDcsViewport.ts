import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DCS_FULL_VIEW,
  boundsForDcsEquipment,
  focusDcsViewport,
  panDcsView,
  viewBoxString,
  zoomDcsAt,
} from './dcsPlantLayout';

export function useDcsViewport(selectedId: string | null) {
  const [view, setView] = useState(DCS_FULL_VIEW);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    if (!selectedId) {
      setView(DCS_FULL_VIEW);
      return;
    }
    const bounds = boundsForDcsEquipment(selectedId);
    if (bounds) setView(focusDcsViewport(bounds));
  }, [selectedId]);

  const fitAll = useCallback(() => setView(DCS_FULL_VIEW), []);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setView((prev) => zoomDcsAt(prev, e.clientX, e.clientY, rect, e.deltaY < 0));
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
      return panDcsView(prev, dxSvg, dySvg);
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
      zoomDcsAt(prev, rect.left + rect.width / 2, rect.top + rect.height / 2, rect, zoomIn)
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
