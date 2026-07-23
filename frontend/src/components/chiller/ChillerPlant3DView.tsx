import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PlantEquipment, PlantHeaders } from '../../types/plant';

/**
 * 3D view of the T1 chiller plant (three.js) styled after a Honeywell/Niagara
 * BMS graphic: dark plant room, beige cylindrical chillers with yellow tags,
 * navy cooling towers on yellow legs, teal pumps, green condenser / blue
 * chilled-water piping with flow arrows, black BMS data tiles per equipment,
 * and CW/CHW header summary panels. Inventory and live values come from the
 * T1 dataset twin (5 CH · 6 CHWP · 6 CWP · 5 CT + tanks/valves) — same
 * equipment ids as the 2D view, so selection stays in sync.
 */

interface Props {
  equipment: Record<string, PlantEquipment>;
  headers: PlantHeaders | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/* ------------------------------- layout ---------------------------------- */

const TRAIN_DX = 14;
const CH_XS = [0, 1, 2, 3, 4].map((i) => i * TRAIN_DX);
const STANDBY_X = 5 * TRAIN_DX;
const CHWP_Z = 12;
const CWP_Z = -12;
const CT_XS = [0, 1, 2, 3, 4].map((i) => 4 + i * 13);
const CT_Z = -30;
const RISER = { m: { x: 10, z: 32 }, h: { x: 44, z: 32 } };
const TANK = { x: 74, z: -30 };
const MUP_X = [66, 70];
const EXPTNK_X = [62, 67];
const EXPTNK_Z = 26;
const BV_X = [56, 60];
const BV_Z = 19;

/* Loop colours — light variants of the 2D palette (supply light, return medium) */
const LOOP3D = {
  cws: 0x4ade80,
  cwr: 0x16a34a,
  chws: 0x7dd3fc,
  chwr: 0x3b82f6,
} as const;

const COLOR = {
  bg: 0xf8fafc,
  ground: 0xe9eff4,
  gridA: 0xd3dde4,
  gridB: 0xe2eaf0,
  chillerBody: 0xdfd5b8,
  chillerCap: 0x8b99a7,
  skid: 0xaab4bf,
  pumpBody: 0x4fb3c4,
  pumpMotor: 0x7fc4d1,
  towerBody: 0xa7b8c4,
  towerTop: 0x93a5b1,
  towerLeg: 0xe4b83d,
  fanBlade: 0x8494a1,
  riser: 0xbcc6d0,
  expTank: 0x74a9e0,
  makeupTank: 0xb4bec7,
  valve: 0xd06565,
  selected: 0x0284c7,
} as const;

interface FaceplateHandle {
  sprite: THREE.Sprite;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
}

interface UnitHandle {
  group: THREE.Group;
  bodyMats: THREE.MeshStandardMaterial[];
  label: FaceplateHandle;
  variant: 'chiller' | 'default';
  fan?: THREE.Group;
}

/* --------------------------- faceplate tiles ------------------------------ */

const FP = { W: 320, TITLE: 56, ROW: 42, PAD: 12 } as const;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeFaceplate(rowCount: number, worldW: number, baseY: number): FaceplateHandle {
  const canvas = document.createElement('canvas');
  canvas.width = FP.W;
  canvas.height = FP.TITLE + rowCount * FP.ROW + FP.PAD;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(worldW, (worldW * canvas.height) / canvas.width, 1);
  sprite.center.set(0.5, 0);
  sprite.position.y = baseY;
  sprite.renderOrder = 10;
  return { sprite, ctx, texture };
}

/** Light BMS data tile — 2D-style white plate; yellow name chip for chillers. */
function drawFaceplate(
  handle: FaceplateHandle,
  title: string,
  statusColor: string,
  rows: Array<[string, string]>,
  variant: 'chiller' | 'default',
) {
  const { ctx } = handle;
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  roundRectPath(ctx, 2, 2, w - 4, h - 4, 8);
  ctx.fill();
  ctx.stroke();
  /* title band */
  ctx.fillStyle = variant === 'chiller' ? '#f2cf1b' : '#f1f5f9';
  roundRectPath(ctx, 2, 2, w - 4, FP.TITLE, 8);
  ctx.fill();
  ctx.fillStyle = statusColor;
  ctx.beginPath();
  ctx.arc(24, FP.TITLE / 2 + 2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = variant === 'chiller' ? '#111418' : '#0369a1';
  ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title, 42, FP.TITLE / 2 + 11);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2, FP.TITLE + 2);
  ctx.lineTo(w - 2, FP.TITLE + 2);
  ctx.stroke();
  /* rows */
  rows.forEach(([label, value], i) => {
    const yy = FP.TITLE + (i + 1) * FP.ROW - 10;
    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(15,23,42,0.035)';
      ctx.fillRect(4, FP.TITLE + i * FP.ROW + 4, w - 8, FP.ROW);
    }
    ctx.fillStyle = '#64748b';
    ctx.font = '23px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, 20, yy);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 24px "Consolas", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(value, w - 20, yy);
    ctx.textAlign = 'left';
  });
  handle.texture.needsUpdate = true;
}

/** Plain floating pipe-label text (CWS / CHWR / To High Rise …). */
function makePipeText(text: string, worldW = 5): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeText(text, 128, 46);
  ctx.fillStyle = '#334155';
  ctx.fillText(text, 128, 46);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(worldW, worldW / 4, 1);
  sprite.renderOrder = 9;
  return sprite;
}

/* ------------------------------ geometry helpers -------------------------- */

function pipeSegment(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 10), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function flowArrow(a: THREE.Vector3, b: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.7, 12), material);
  cone.position.copy(a).addScaledVector(dir, 0.5);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return cone;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------------------------- the component ------------------------------ */

export default function ChillerPlant3DView({ equipment, headers, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const unitsRef = useRef<Map<string, UnitHandle>>(new Map());
  const ringRef = useRef<THREE.Mesh | null>(null);
  const fansRef = useRef<THREE.Group[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  /* Build the scene once. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const units = unitsRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR.bg);
    scene.fog = new THREE.Fog(COLOR.bg, 260, 460);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
    camera.position.set(96, 54, 90);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(34, 0, 2);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = 1.48;
    controls.minDistance = 18;
    controls.maxDistance = 260;

    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe8ee, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(70, 95, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(460, 340),
      new THREE.MeshStandardMaterial({ color: COLOR.ground, roughness: 0.96 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(34, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(460, 92, COLOR.gridA, COLOR.gridB);
    grid.position.set(34, 0.02, 0);
    scene.add(grid);

    const registerShadows = (group: THREE.Group) =>
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          (o as THREE.Mesh).receiveShadow = true;
        }
      });

    const addUnit = (
      id: string,
      x: number,
      z: number,
      variant: 'chiller' | 'default',
      build: (group: THREE.Group, bodyMats: THREE.MeshStandardMaterial[]) => {
        labelY: number;
        labelRows: number;
        labelW?: number;
        fan?: THREE.Group;
      },
    ) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.userData.equipId = id;
      const bodyMats: THREE.MeshStandardMaterial[] = [];
      const { labelY, labelRows, labelW, fan } = build(group, bodyMats);
      const label = makeFaceplate(labelRows, labelW ?? 7, labelY);
      group.add(label.sprite);
      registerShadows(group);
      scene.add(group);
      units.set(id, { group, bodyMats, label, variant, fan });
      if (fan) fansRef.current.push(fan);
    };

    /* chillers — water-cooled centrifugal machine (like the real T1 units):
     * twin horizontal shells, bolted tube-sheet covers on the end plates,
     * compressor/motor assembly on top, control panel on the side. */
    CH_XS.forEach((x, i) => {
      addUnit(`ch-${i + 1}`, x, 0, 'chiller', (g, mats) => {
        const cream = new THREE.MeshStandardMaterial({ color: COLOR.chillerBody, roughness: 0.55, metalness: 0.08 });
        const foot = new THREE.MeshStandardMaterial({ color: 0x6b7681, roughness: 0.7 });
        const bolt = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6 });
        mats.push(cream);

        /* end plates with feet */
        [-4.1, 4.1].forEach((dx) => {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.0, 5.2), cream);
          plate.position.set(dx, 2.6, -0.2);
          g.add(plate);
          [-1.9, 1.5].forEach((fz) => {
            const f = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, 0.9), foot);
            f.position.set(dx, 0.12, fz);
            g.add(f);
          });
        });

        /* lower (evaporator) + upper (condenser) shells */
        const lower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 7.8, 24), cream);
        lower.rotation.z = Math.PI / 2;
        lower.position.set(0, 1.75, 0.55);
        g.add(lower);
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 7.8, 22), cream);
        upper.rotation.z = Math.PI / 2;
        upper.position.set(0, 3.6, -1.15);
        g.add(upper);

        /* bolted tube-sheet covers protruding through the end plates */
        const cover = (dx: number, y: number, z: number, r: number) => {
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.55, 24), cream);
          disc.rotation.z = Math.PI / 2;
          disc.position.set(dx, y, z);
          g.add(disc);
          const n = 12;
          for (let b = 0; b < n; b++) {
            const a = (b / n) * Math.PI * 2;
            const bh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), bolt);
            bh.position.set(dx + Math.sign(dx) * 0.3, y + Math.cos(a) * (r - 0.2), z + Math.sin(a) * (r - 0.2));
            g.add(bh);
          }
        };
        cover(-4.45, 1.75, 0.55, 1.7);
        cover(4.45, 1.75, 0.55, 1.7);
        cover(-4.45, 3.6, -1.15, 1.32);
        cover(4.45, 3.6, -1.15, 1.32);

        /* compressor / motor assembly on top with cone couplings */
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 2.6, 18), cream);
        motor.rotation.z = Math.PI / 2;
        motor.position.set(0.3, 5.0, -0.3);
        g.add(motor);
        const coneL = new THREE.Mesh(new THREE.ConeGeometry(0.82, 1.1, 16), cream);
        coneL.rotation.z = Math.PI / 2;
        coneL.position.set(-1.55, 5.0, -0.3);
        g.add(coneL);
        const coneR = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 14), cream);
        coneR.rotation.z = -Math.PI / 2;
        coneR.position.set(2.05, 5.0, -0.3);
        g.add(coneR);
        const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 14), cream);
        volute.position.set(-2.3, 4.4, -0.3);
        g.add(volute);

        /* control panel with display + indicator lights */
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.1, 0.32), cream);
        panel.position.set(1.5, 3.1, 2.25);
        g.add(panel);
        [-0.35, 0.35].forEach((py, k) => {
          const legMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), foot);
          legMesh.position.set(1.5 + py, 1.6, 2.2);
          g.add(legMesh);
          void k;
        });
        const screen = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.36, 0.06),
          new THREE.MeshBasicMaterial({ color: 0x7c3aed }),
        );
        screen.position.set(1.15, 3.45, 2.44);
        g.add(screen);
        ([0x16a34a, 0xdc2626, 0xf59e0b, 0x2563eb] as number[]).forEach((c, k) => {
          const led = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.06), new THREE.MeshBasicMaterial({ color: c }));
          led.position.set(0.95 + k * 0.34, 2.85, 2.44);
          g.add(led);
        });

        return { labelY: 6.1, labelRows: 6, labelW: 7.4 };
      });
    });

    /* end-suction pump set (reference style): baseplate, volute with axial
     * suction flange facing the header + top discharge flange, coupling guard,
     * finned motor on mounting blocks. `flip` turns the set 180° so front-row
     * (CHWP) suctions face their header. */
    const buildEndSuctionPump = (opts: { body: number; motor: number; guard: number; flip?: boolean }) =>
      (g: THREE.Group, mats: THREE.MeshStandardMaterial[]) => {
      if (opts.flip) g.rotation.y = Math.PI;
      const blue = new THREE.MeshStandardMaterial({ color: opts.body, roughness: 0.35, metalness: 0.15 });
      const skidBlue = new THREE.MeshStandardMaterial({ color: 0x2559a8, roughness: 0.5 });
      const red = new THREE.MeshStandardMaterial({ color: opts.guard, roughness: 0.4 });
      const navy = new THREE.MeshStandardMaterial({ color: opts.motor, roughness: 0.45, metalness: 0.3 });
      mats.push(blue, navy);
      const AX = 1.35; // shaft centreline height

      const skid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 5.0), skidBlue);
      skid.position.y = 0.35;
      g.add(skid);

      /* volute on pedestal, axial suction flange, top discharge flange */
      const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.85, 20), blue);
      volute.rotation.x = Math.PI / 2;
      volute.position.set(0, AX, -1.7);
      g.add(volute);
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), blue);
      pedestal.position.set(0, 0.8, -1.7);
      g.add(pedestal);
      const suction = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 14), blue);
      suction.rotation.x = Math.PI / 2;
      suction.position.set(0, AX, -2.35);
      g.add(suction);
      const sucFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.14, 16), blue);
      sucFlange.rotation.x = Math.PI / 2;
      sucFlange.position.set(0, AX, -2.62);
      g.add(sucFlange);
      const discharge = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.62, 12), blue);
      discharge.position.set(0, AX + 0.72, -1.7);
      g.add(discharge);
      const disFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16), blue);
      disFlange.position.set(0, 2.32, -1.7);
      g.add(disFlange);

      /* red coupling guard on a leg */
      const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.85, 14), red);
      guard.rotation.x = Math.PI / 2;
      guard.position.set(0, AX, -0.85);
      g.add(guard);
      const guardLeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), red);
      guardLeg.position.set(0, 0.85, -0.85);
      g.add(guardLeg);

      /* finned motor + fan cowl + terminal box on mounting blocks */
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.5), navy);
      block.position.set(0, 0.6, 0.75);
      g.add(block);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.0, 18), navy);
      motor.rotation.x = Math.PI / 2;
      motor.position.set(0, AX, 0.75);
      g.add(motor);
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.035, 6, 18), navy);
        fin.position.set(0, AX, 0.3 + f * 0.32);
        g.add(fin);
      }
      const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.67, 0.67, 0.4, 18), navy);
      cowl.rotation.x = Math.PI / 2;
      cowl.position.set(0, AX, 1.95);
      g.add(cowl);
      const tbox = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.62), navy);
      tbox.position.set(0, AX + 0.72, 0.75);
      g.add(tbox);

      return { labelY: 3.2, labelRows: 3, labelW: 5.6 };
    };
    const cwPump = () => buildEndSuctionPump({ body: 0x2f6cb5, motor: 0x2e3d51, guard: 0xd23327 });
    const chwPump = () => buildEndSuctionPump({ body: 0x2565c0, motor: 0x2565c0, guard: 0xf0c419, flip: true });
    CH_XS.forEach((x, i) => addUnit(`cwp-${i + 1}`, x, CWP_Z, 'default', cwPump()));
    addUnit('cwp-6', STANDBY_X, CWP_Z, 'default', cwPump());
    /* chilled-water pumps — royal blue with yellow coupling guard (reference),
     * flipped so the axial suction faces the CHWR header at the front */
    CH_XS.forEach((x, i) => addUnit(`chwp-${i + 1}`, x, CHWP_Z, 'default', chwPump()));
    addUnit('chwp-6', STANDBY_X, CHWP_Z, 'default', chwPump());

    /* cooling towers — Evapco-style two-cell crossflow: sage panelled casing,
     * round fan cowl per cell with visible blades (both spin — dataset Fan A/B),
     * dark air-inlet louvres, basin plinth, access ladders, fan-motor boxes. */
    CT_XS.forEach((x, i) => {
      addUnit(`ct-${i + 1}`, x, CT_Z, 'default', (g, mats) => {
        const body = new THREE.MeshStandardMaterial({ color: 0xb9bdaa, roughness: 0.7 });
        const seam = new THREE.MeshStandardMaterial({ color: 0x9aa08e, roughness: 0.7 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.75 });
        const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.5, metalness: 0.3 });
        mats.push(body, seam);

        /* basin plinth + louvre band + upper casing (two joined cells, seamed) */
        const basin = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.5, 5.9), dark);
        basin.position.y = 0.25;
        g.add(basin);
        const louvreBand = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.5, 5.6), body);
        louvreBand.position.y = 1.25;
        g.add(louvreBand);
        [-1, 1].forEach((side) =>
          [-2.25, 2.25].forEach((cx) => {
            const louvre = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.15, 0.08), dark);
            louvre.position.set(cx, 1.22, side * 2.82);
            g.add(louvre);
          }),
        );
        const casing = new THREE.Mesh(new THREE.BoxGeometry(9.2, 2.6, 5.6), body);
        casing.position.y = 3.3;
        g.add(casing);
        const beltline = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.14, 5.7), seam);
        beltline.position.y = 2.1;
        g.add(beltline);
        const midSeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.1, 5.65), seam);
        midSeam.position.y = 2.6;
        g.add(midSeam);

        /* per-cell fan cowl + grille + spinning blades + motor box */
        const fans = new THREE.Group(); // container; each child hub spins
        [-2.25, 2.25].forEach((cx) => {
          const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.1, 0.35, 24), body);
          collar.position.set(cx, 4.78, 0);
          g.add(collar);
          const cowl = new THREE.Mesh(new THREE.CylinderGeometry(1.68, 1.8, 0.95, 24, 1, true), body);
          (cowl.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
          cowl.position.set(cx, 5.4, 0);
          g.add(cowl);
          const grille = new THREE.Mesh(new THREE.CylinderGeometry(1.58, 1.58, 0.06, 24), dark);
          grille.position.set(cx, 5.18, 0);
          g.add(grille);
          const hub = new THREE.Group();
          hub.position.set(cx, 5.32, 0);
          for (let b = 0; b < 5; b++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.4), dark);
            blade.position.x = 0.75;
            const arm = new THREE.Group();
            arm.rotation.y = (b * Math.PI * 2) / 5;
            arm.add(blade);
            hub.add(arm);
          }
          const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 10), dark);
          hub.add(nose);
          fans.add(hub);
          const motor = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 0.55), body);
          motor.position.set(cx + 1.75, 4.55, 1.15);
          g.add(motor);
        });
        g.add(fans);

        /* access ladder leaning on the front of each cell */
        [-2.25, 2.25].forEach((cx) => {
          const ladder = new THREE.Group();
          ladder.position.set(cx, 1.75, 3.0);
          ladder.rotation.x = -0.16;
          [-0.35, 0.35].forEach((lx) => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3.4, 0.07), steel);
            rail.position.set(lx, 0, 0);
            ladder.add(rail);
          });
          for (let r = 0; r < 7; r++) {
            const rung = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.06), steel);
            rung.position.set(0, -1.45 + r * 0.48, 0);
            ladder.add(rung);
          }
          g.add(ladder);
        });

        return { labelY: 6.7, labelRows: 4, labelW: 6.4, fan: fans };
      });
    });

    /* riser buildings — glass curtain-wall towers: window-grid façade with a
     * few lit windows, podium base, parapet, rooftop plant room + mast */
    const makeFacadeTexture = (floors: number, bays: number): THREE.CanvasTexture => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 512;
      const x = c.getContext('2d')!;
      x.fillStyle = '#d7dce1';
      x.fillRect(0, 0, c.width, c.height);
      const fh = c.height / floors;
      const bw = c.width / bays;
      for (let f = 0; f < floors; f++) {
        for (let bIdx = 0; bIdx < bays; bIdx++) {
          const lit = Math.random() < 0.1;
          x.fillStyle = lit ? '#ffe6ae' : Math.random() < 0.5 ? '#a9c9de' : '#9cbed5';
          x.fillRect(bIdx * bw + 3, f * fh + 4, bw - 6, fh - 8);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const buildRiser = (h: number, floors: number) => (g: THREE.Group, mats: THREE.MeshStandardMaterial[]) => {
      const facade = new THREE.MeshStandardMaterial({ map: makeFacadeTexture(floors, 6), roughness: 0.35, metalness: 0.15 });
      const roof = new THREE.MeshStandardMaterial({ color: 0xb2bcc5, roughness: 0.8 });
      const podium = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.7 });
      mats.push(facade);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.6, 7.4), podium);
      pod.position.y = 0.8;
      g.add(pod);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(8, h, 6), [facade, facade, roof, roof, facade, facade]);
      tower.position.y = 1.6 + h / 2;
      g.add(tower);
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(8.35, 0.35, 6.35), podium);
      parapet.position.y = 1.6 + h + 0.12;
      g.add(parapet);
      const plantRoom = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 2.0), roof);
      plantRoom.position.set(-1.6, 1.6 + h + 0.75, -0.8);
      g.add(plantRoom);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x8a929b, roughness: 0.5, metalness: 0.4 }),
      );
      mast.position.set(2.3, 1.6 + h + 1.3, 1.5);
      g.add(mast);
      return { labelY: 1.6 + h + 2.8, labelRows: 1, labelW: 6.6 };
    };
    addUnit('m-rise', RISER.m.x, RISER.m.z, 'default', buildRiser(10, 8));
    addUnit('h-rise', RISER.h.x, RISER.h.z, 'default', buildRiser(15, 12));

    /* vertical pressure tank on legs (glossy barrel, domed heads, tripod legs,
     * bottom drain piping, top vent + lifting lugs) — like the real CWMU tank */
    const buildLeggedTank = (color: number, r: number, h: number, rows: number) =>
      (g: THREE.Group, mats: THREE.MeshStandardMaterial[]) => {
        const legH = 1.4;
        const body = new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.15 });
        const steel = new THREE.MeshStandardMaterial({ color: 0x8a929b, roughness: 0.45, metalness: 0.4 });
        mats.push(body);

        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), body);
        barrel.position.y = legH + h / 2;
        g.add(barrel);
        const domeTop = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), body);
        domeTop.scale.y = 0.55;
        domeTop.position.y = legH + h;
        g.add(domeTop);
        const domeBot = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), body);
        domeBot.scale.y = 0.45;
        domeBot.position.y = legH;
        g.add(domeBot);

        /* three angled legs */
        for (let l = 0; l < 3; l++) {
          const legGroup = new THREE.Group();
          legGroup.rotation.y = (l * Math.PI * 2) / 3 + 0.5;
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, legH + 1.3, 0.14), body);
          leg.position.set(r * 0.92, (legH + 1.1) / 2, 0);
          leg.rotation.z = 0.14;
          legGroup.add(leg);
          g.add(legGroup);
        }

        /* bottom drain: stub, elbow run and small flange */
        const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 10), steel);
        stub.position.y = legH - r * 0.45 + 0.05;
        g.add(stub);
        const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.4, 10), steel);
        drain.rotation.x = Math.PI / 2;
        drain.position.set(0, legH - r * 0.45 - 0.3, 0.7);
        g.add(drain);
        const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 12), steel);
        flange.rotation.x = Math.PI / 2;
        flange.position.set(0, legH - r * 0.45 - 0.3, 1.42);
        g.add(flange);

        /* top vent + lifting lugs */
        const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10), steel);
        vent.position.y = legH + h + r * 0.55 + 0.2;
        g.add(vent);
        [-1, 1].forEach((s) => {
          const lug = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 14), body);
          lug.position.set(s * r * 0.55, legH + h + r * 0.45, 0);
          g.add(lug);
        });

        return { labelY: legH + h + r * 0.55 + 1.0, labelRows: rows, labelW: 5.4 };
      };
    /* expansion tanks — white pressurisation unit on a skid: dished heads,
     * bolted top manway, bottom flange, small inline pumps on the same base */
    const buildExpTank = () => (g: THREE.Group, mats: THREE.MeshStandardMaterial[]) => {
      const white = new THREE.MeshStandardMaterial({ color: 0xeef1f2, roughness: 0.3, metalness: 0.08 });
      const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.45, metalness: 0.4 });
      const pumpDark = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.4, metalness: 0.35 });
      const bolt = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6 });
      mats.push(white);

      const r = 1.4;
      const h = 3.4;
      const baseY = 1.3;
      const skid = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.3, 3.4), white);
      skid.position.set(-0.6, 0.15, 0);
      g.add(skid);
      for (let l = 0; l < 4; l++) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, baseY - 0.3, 0.22), white);
        leg.position.set(Math.cos((l * Math.PI) / 2 + Math.PI / 4) * r * 0.8 + 0.6, (baseY - 0.3) / 2 + 0.3, Math.sin((l * Math.PI) / 2 + Math.PI / 4) * r * 0.8);
        g.add(leg);
      }
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), white);
      barrel.position.set(0.6, baseY + h / 2, 0);
      g.add(barrel);
      const domeTop = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), white);
      domeTop.scale.y = 0.55;
      domeTop.position.set(0.6, baseY + h, 0);
      g.add(domeTop);
      const domeBot = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
      domeBot.scale.y = 0.45;
      domeBot.position.set(0.6, baseY, 0);
      g.add(domeBot);
      /* bolted top manway */
      const manway = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 16), white);
      const topY = baseY + h + r * 0.55;
      manway.position.set(0.6, topY + 0.1, 0);
      g.add(manway);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), steel);
      stem.position.set(0.6, topY + 0.4, 0);
      g.add(stem);
      for (let bIdx = 0; bIdx < 8; bIdx++) {
        const a = (bIdx / 8) * Math.PI * 2;
        const bh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), bolt);
        bh.position.set(0.6 + Math.cos(a) * 0.34, topY + 0.22, Math.sin(a) * 0.34);
        g.add(bh);
      }
      /* bottom flange + nameplate */
      const botFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 14), steel);
      botFlange.position.set(0.6, 0.8, 0);
      g.add(botFlange);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.05), steel);
      plate.position.set(0.6, baseY + h * 0.62, r - 0.02);
      g.add(plate);
      /* two inline pressurisation pumps on the skid */
      [-2.4, -1.5].forEach((px) => {
        const pumpBody = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.75, 12), pumpDark);
        pumpBody.position.set(px, 0.68, 0.5);
        g.add(pumpBody);
        const pumpMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.55, 12), pumpDark);
        pumpMotor.position.set(px, 1.33, 0.5);
        g.add(pumpMotor);
      });
      return { labelY: topY + 1.0, labelRows: 1, labelW: 5.4 };
    };
    addUnit('exptnk-01', EXPTNK_X[0], EXPTNK_Z, 'default', buildExpTank());
    addUnit('exptnk-02', EXPTNK_X[1], EXPTNK_Z, 'default', buildExpTank());
    addUnit('cwmutnk-41-1', TANK.x, TANK.z, 'default', buildLeggedTank(0x2f7fd6, 1.9, 4.0, 1));
    MUP_X.forEach((x, i) => {
      addUnit(`cwmup-${i + 1}`, x, -24, 'default', (g, mats) => {
        const body = new THREE.MeshStandardMaterial({ color: COLOR.pumpBody, roughness: 0.45 });
        mats.push(body);
        const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1, 14), body);
        volute.rotation.x = Math.PI / 2;
        volute.position.y = 0.8;
        g.add(volute);
        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.7, 14), new THREE.MeshStandardMaterial({ color: COLOR.pumpMotor }));
        motor.rotation.x = Math.PI / 2;
        motor.position.set(0, 0.8, 1.3);
        g.add(motor);
        return { labelY: 2.2, labelRows: 1, labelW: 5 };
      });
    });
    /* bypass valves — chrome inline pressure-bypass valve (reference style):
     * body with compression nuts on both ends, rising bonnet, black knurled
     * lock ring and graduated adjustment cap. Sits inline on the bypass run. */
    BV_X.forEach((x, i) => {
      addUnit(`bv-${i + 1}`, x, BV_Z, 'default', (g, mats) => {
        const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.2, metalness: 0.85 });
        const black = new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.5 });
        mats.push(chrome);
        const PY = 0.28; // bypass pipe centreline height

        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.3, 16), chrome);
        tube.rotation.x = Math.PI / 2;
        tube.position.y = PY;
        g.add(tube);
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.72), chrome);
        block.position.y = PY + 0.1;
        g.add(block);
        [-1, 1].forEach((s) => {
          const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.55, 6), chrome);
          nut.rotation.x = Math.PI / 2;
          nut.position.set(0, PY, s * 0.9);
          g.add(nut);
          const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 14), chrome);
          tail.rotation.x = Math.PI / 2;
          tail.position.set(0, PY, s * 1.3);
          g.add(tail);
        });

        /* bonnet + black knurled lock ring + graduated adjustment cap */
        const bonnet = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.95, 14), chrome);
        bonnet.position.y = PY + 0.85;
        g.add(bonnet);
        const lockRing = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12), black);
        lockRing.position.y = PY + 1.42;
        g.add(lockRing);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.31, 0.9, 14), black);
        cap.position.y = PY + 2.0;
        g.add(cap);
        for (let m = 0; m < 3; m++) {
          const mark = new THREE.Mesh(
            new THREE.TorusGeometry(0.295 - m * 0.007, 0.012, 6, 18),
            new THREE.MeshBasicMaterial({ color: 0xe8ecef }),
          );
          mark.rotation.x = Math.PI / 2;
          mark.position.y = PY + 1.75 + m * 0.28;
          g.add(mark);
        }

        return { labelY: 3.1, labelRows: 1, labelW: 5 };
      });
    });

    /* ------------------------------- pipes -------------------------------- */
    const pipes = new THREE.Group();
    const pipeMats = Object.fromEntries(
      Object.entries(LOOP3D).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.3 })]),
    ) as Record<keyof typeof LOOP3D, THREE.MeshStandardMaterial>;

    const run = (loop: keyof typeof LOOP3D, pts: THREE.Vector3[], radius = 0.3, arrows = true) => {
      for (let i = 0; i < pts.length - 1; i++) {
        pipes.add(pipeSegment(pts[i], pts[i + 1], radius, pipeMats[loop]));
        if (arrows && pts[i].distanceTo(pts[i + 1]) > 6) pipes.add(flowArrow(pts[i], pts[i + 1], pipeMats[loop]));
      }
      /* sphere elbows so joints read as connected tube */
      pts.forEach((p) => {
        const elbow = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, 12, 10), pipeMats[loop]);
        elbow.position.copy(p);
        pipes.add(elbow);
      });
    };

    const LO = 0.7;
    const HI = 3.4;
    const UN = 0.28;
    const Y_CWR = 5.2; // condenser-return header height (over the shells, into the tower tops)
    /* pump volute centrelines (volute sits at local z −1.2, faces ±0.67) */
    /* chiller nozzle geometry: evaporator shell (y 1.75, z 0.55, r 1.5) —
     * front-centreline in, bottom out; condenser shell (y 3.6, z −1.15, r 1.15)
     * — lower-back in, top out. */

    /* condenser loop: towers → CWS header → CWP → condenser shell → CWR → towers */
    CT_XS.forEach((tx) => run('cws', [v3(tx, LO, CT_Z + 2.85), v3(tx, LO, -21)], 0.3, false));
    run('cws', [v3(CT_XS[0], LO, -21), v3(STANDBY_X, LO, -21)], 0.36);
    /* suction: header → axial suction flange; discharge: top flange → condenser */
    const CWP_SUC = CWP_Z - 2.62;
    const CWP_DIS = CWP_Z - 1.7;
    CH_XS.forEach((cx) =>
      run('cws', [v3(cx, LO, -21), v3(cx, LO, CWP_SUC - 1.2), v3(cx, 1.35, CWP_SUC - 1.2), v3(cx, 1.35, CWP_SUC)], 0.3, false),
    );
    CH_XS.forEach((cx) =>
      run('cws', [v3(cx, 2.35, CWP_DIS), v3(cx, 3.05, CWP_DIS), v3(cx, 3.05, -2.9), v3(cx, 3.05, -2.1)]),
    );
    CH_XS.forEach((cx) => run('cwr', [v3(cx, 4.55, -1.15), v3(cx, Y_CWR, -1.15), v3(cx, Y_CWR, -17)]));
    run('cwr', [v3(CH_XS[0], Y_CWR, -17), v3(CT_XS[4], Y_CWR, -17)], 0.36);
    CT_XS.forEach((tx) =>
      run('cwr', [v3(tx, Y_CWR, -17), v3(tx, Y_CWR, CT_Z + 4), v3(tx, 4.1, CT_Z + 4), v3(tx, 4.1, CT_Z + 2.75)], 0.3, false),
    );
    /* make-up water: tank bottom drain → make-up pumps → CWS header */
    run(
      'cws',
      [v3(TANK.x, 0.55, TANK.z + 1.4), v3(TANK.x, 0.55, TANK.z + 3), v3(TANK.x, LO, TANK.z + 3), v3(TANK.x, LO, -24), v3(MUP_X[0] - 2, LO, -24)],
      0.22,
      false,
    );
    run('cws', [v3(MUP_X[0] - 2, LO, -24), v3(MUP_X[0] - 2, LO, -21)], 0.22, false);

    /* chilled loop: risers → CHWR header → CHWP → evaporator shell → CHWS → risers */
    ([RISER.m, RISER.h] as const).forEach((r) => run('chwr', [v3(r.x, HI, r.z - 3.2), v3(r.x, HI, 17)]));
    run('chwr', [v3(CH_XS[0], HI, 17), v3(STANDBY_X + 4, HI, 17)], 0.36);
    /* suction: CHWR header → axial flange; discharge: top flange → evaporator */
    const CHWP_SUC = CHWP_Z + 2.62;
    const CHWP_DIS = CHWP_Z + 1.7;
    CH_XS.forEach((px) =>
      run('chwr', [v3(px, HI, 17), v3(px, HI, CHWP_SUC + 1.2), v3(px, 1.35, CHWP_SUC + 1.2), v3(px, 1.35, CHWP_SUC)], 0.3, false),
    );
    CH_XS.forEach((px) =>
      run('chws', [v3(px, 2.35, CHWP_DIS), v3(px, 3.05, CHWP_DIS), v3(px, 3.05, 3.1), v3(px, 1.75, 3.1), v3(px, 1.75, 2.07)]),
    );
    CH_XS.forEach((cx) => run('chws', [v3(cx, 0.45, 1.15), v3(cx, UN, 1.15), v3(cx, UN, 21)]));
    run('chws', [v3(CH_XS[0], UN, 21), v3(STANDBY_X + 4, UN, 21)], 0.36);
    ([RISER.m, RISER.h] as const).forEach((r) => run('chws', [v3(r.x, UN, 21), v3(r.x, UN, r.z - 3.2)]));
    /* bypass valves bridge CHWS ↔ CHWR headers; expansion tanks tee off CHWS */
    BV_X.forEach((bx) => run('chwr', [v3(bx, UN, 21), v3(bx, UN, BV_Z), v3(bx, UN, 17), v3(bx, HI, 17)], 0.22, false));
    EXPTNK_X.forEach((ex) =>
      run('chws', [v3(ex + 0.6, UN, 21), v3(ex + 0.6, UN, EXPTNK_Z), v3(ex + 0.6, 0.7, EXPTNK_Z)], 0.22, false),
    );
    scene.add(pipes);

    /* pipe name tags + branch labels, like the BMS graphic */
    const tag = (text: string, x: number, y: number, z: number, w?: number) => {
      const s = makePipeText(text, w);
      s.position.set(x, y, z);
      scene.add(s);
    };
    tag('CWS', -6, LO + 1.1, -21);
    tag('CWR', -6, Y_CWR + 1.1, -17);
    tag('CHWS', -6, UN + 1.3, 21);
    tag('CHWR', -6, HI + 1.1, 17);
    tag('To Medium Rise', RISER.m.x, 2.2, 25.5, 9);
    tag('To High Rise', RISER.h.x, 2.2, 25.5, 8);

    /* selection ring */
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(6.4, 0.22, 12, 48),
      new THREE.MeshBasicMaterial({ color: COLOR.selected }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    scene.add(ring);
    ringRef.current = ring;

    /* picking */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          const id = o.userData?.equipId as string | undefined;
          if (id) {
            onSelectRef.current(id === selectedRef.current ? null : id);
            return;
          }
          o = o.parent;
        }
      }
      onSelectRef.current(null);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (!reduceMotion) {
        for (const fan of fansRef.current) {
          const spd = (fan.userData.spd ?? 0) * dt;
          for (const hub of fan.children) hub.rotation.y += spd;
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh || (o as THREE.Sprite).isSprite) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => {
            const anyM = m as THREE.MeshStandardMaterial & { map?: THREE.Texture };
            anyM.map?.dispose();
            m?.dispose();
          });
        }
      });
      renderer.dispose();
      container.removeChild(renderer.domElement);
      units.clear();
      fansRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Sync live data → tiles, colours, fans, selection ring. */
  useEffect(() => {
    const units = unitsRef.current;
    if (units.size === 0) return;
    const fmt = (v: unknown, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '—');
    const loadRt = headers?.buildingLoadRt ?? 0;

    units.forEach((unit, id) => {
      const eq = equipment[id] as (PlantEquipment & {
        loadPercent?: number;
        speedPercent?: number;
        frequencyHz?: number;
        fanSpeedPercent?: number;
        levelPercent?: number;
        positionPercent?: number;
        powerKw?: number;
        supplyTemp?: number;
        returnTemp?: number;
        leavingTemp?: number;
        flowRate?: number;
        cells?: { a: { kw: number }; b: { kw: number } };
      }) | undefined;

      const running = eq?.status === 'running';
      const alarm = eq?.status === 'alarm';
      const statusColor = alarm ? '#dc2626' : running ? '#16a34a' : '#94a3b8';

      const selected = id === selectedId;
      unit.bodyMats.forEach((m) => {
        m.emissive.set(selected ? COLOR.selected : 0x000000);
        m.emissiveIntensity = selected ? 0.35 : 0;
      });

      /* rows — same fields/formats as the 2D faceplates + dataset points */
      let title = eq?.name ?? id.toUpperCase();
      let rows: Array<[string, string]> = [];
      if (id.startsWith('ch-')) {
        const dT = (eq?.returnTemp ?? 0) - (eq?.supplyTemp ?? 0);
        const chwTon = ((eq?.flowRate ?? 0) * dT * 1.163) / 3.517;
        const kwPerTon = chwTon > 0 ? (eq?.powerKw ?? 0) / chwTon : 0;
        title = `${eq?.name ?? id} · ${fmt(eq?.loadPercent, 0)}%`;
        rows = [
          ['CHWS', `${fmt(eq?.supplyTemp)} °C`],
          ['CHWR', `${fmt(eq?.returnTemp)} °C`],
          ['CHWF', `${fmt((eq?.flowRate ?? 0) / 3.6)} L/s`],
          ['CHW Ton', `${fmt(chwTon, 0)} RT`],
          ['kW', fmt(eq?.powerKw, 0)],
          ['kW/Ton', fmt(kwPerTon, 3)],
        ];
      } else if (id.startsWith('chwp') || id.startsWith('cwp-')) {
        const hz = eq?.frequencyHz ?? (eq?.speedPercent ?? 0) * 0.5;
        rows = [
          ['VSD', `${fmt(eq?.speedPercent, 0)} %`],
          ['FB', `${fmt(hz, 0)} Hz`],
          ['kW', fmt(eq?.powerKw)],
        ];
      } else if (id.startsWith('ct-')) {
        rows = [
          ['Fan A', `${fmt(eq?.cells?.a?.kw)} kW`],
          ['Fan B', `${fmt(eq?.cells?.b?.kw)} kW`],
          ['VSD', `${fmt(eq?.frequencyHz, 0)} Hz`],
          ['CWS-T', `${fmt(eq?.leavingTemp)} °C`],
        ];
      } else if (id === 'm-rise') {
        title = 'To Medium Rise';
        rows = [['Load', `${fmt(loadRt * 0.55, 0)} RT`]];
      } else if (id === 'h-rise') {
        title = 'To High Rise';
        rows = [['Load', `${fmt(loadRt * 0.45, 0)} RT`]];
      } else if (id.startsWith('exptnk')) {
        title = `ExpTnk ${id.endsWith('01') ? '01' : '02'}`;
        rows = [['Level', `${fmt(eq?.levelPercent, 0)} %`]];
      } else if (id === 'cwmutnk-41-1') {
        title = 'CWMUTnk 41-1';
        rows = [['Level', `${fmt(eq?.levelPercent, 0)} %`]];
      } else if (id.startsWith('cwmup')) {
        title = `CWMUP ${id.endsWith('1') ? '1' : '2'}`;
        rows = [['kW', fmt(eq?.powerKw)]];
      } else if (id.startsWith('bv-')) {
        title = `ByPass Vlv ${id.endsWith('1') ? '1' : '2'}`;
        rows = [['Pos', `${fmt(eq?.positionPercent, 0)} %`]];
      }
      drawFaceplate(unit.label, title, statusColor, rows, unit.variant);

      if (unit.fan) unit.fan.userData.spd = running ? 1.2 + ((eq?.fanSpeedPercent ?? 0) / 100) * 4.5 : 0;

      if (selected && ringRef.current) {
        ringRef.current.position.x = unit.group.position.x;
        ringRef.current.position.z = unit.group.position.z;
      }
    });
    if (ringRef.current) ringRef.current.visible = !!selectedId && units.has(selectedId);
  }, [equipment, headers, selectedId]);

  return (
    <div ref={containerRef} className="chiller-plant-3d">
      <div className="plant3d-legend">
        <div className="plant3d-legend-title">LEGEND</div>
        {([['ON', '#16a34a'], ['OFF', '#94a3b8'], ['MANUAL', '#ca8a04'], ['ALARM', '#dc2626']] as const).map(([t, c]) => (
          <div key={t} className="plant3d-legend-row">
            <span className="plant3d-dot" style={{ background: c }} />
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}
