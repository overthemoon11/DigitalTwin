import { useCallback, useEffect, useRef, useState } from 'react';
import { boundsForEtsAsset, focusEtsViewport } from './etsStationTopology';

export interface ViewBox { x: number; y: number; w: number; h: number }

/** Generic pan/zoom viewport for an SVG schematic of fixed canvas size. */
export function useStationViewport(canvasW: number, canvasH: number, selectedId: string | null = null) {
  const full: ViewBox = { x: 0, y: 0, w: canvasW, h: canvasH };
  const [view, setView] = useState<ViewBox>(full);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef({ active: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    setView({ x: 0, y: 0, w: canvasW, h: canvasH });
  }, [canvasW, canvasH]);

  useEffect(() => {
    if (!selectedId) {
      setView({ x: 0, y: 0, w: canvasW, h: canvasH });
      return;
    }
    const bounds = boundsForEtsAsset(selectedId);
    if (bounds) setView(focusEtsViewport(bounds));
  }, [selectedId, canvasW, canvasH]);

  const clamp = useCallback((v: ViewBox): ViewBox => {
    const w = Math.max(220, Math.min(canvasW, v.w));
    const h = Math.max(160, Math.min(canvasH, v.h));
    return {
      x: Math.max(0, Math.min(canvasW - w, v.x)),
      y: Math.max(0, Math.min(canvasH - h, v.y)),
      w,
      h,
    };
  }, [canvasW, canvasH]);

  const fitAll = useCallback(() => setView({ x: 0, y: 0, w: canvasW, h: canvasH }), [canvasW, canvasH]);

  const zoomAt = useCallback((v: ViewBox, clientX: number, clientY: number, rect: DOMRect, zoomIn: boolean): ViewBox => {
    const factor = zoomIn ? 0.85 : 1.18;
    const nx = v.x + ((clientX - rect.left) / rect.width) * v.w;
    const ny = v.y + ((clientY - rect.top) / rect.height) * v.h;
    const nw = v.w * factor;
    const nh = v.h * factor;
    return clamp({
      x: nx - ((clientX - rect.left) / rect.width) * nw,
      y: ny - ((clientY - rect.top) / rect.height) * nh,
      w: nw,
      h: nh,
    });
  }, [clamp]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setView((prev) => zoomAt(prev, e.clientX, e.clientY, rect, e.deltaY < 0));
  }, [zoomAt]);

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
    setView((prev) => clamp({ ...prev, x: prev.x - (dx / rect.width) * prev.w, y: prev.y - (dy / rect.height) * prev.h }));
  }, [clamp]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    panRef.current.active = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  const zoomStep = useCallback((zoomIn: boolean) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setView((prev) => zoomAt(prev, rect.left + rect.width / 2, rect.top + rect.height / 2, rect, zoomIn));
  }, [zoomAt]);

  return {
    svgRef,
    viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
    fitAll,
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    zoomStep,
  };
}
