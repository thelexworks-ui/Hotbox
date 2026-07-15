'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

// â”€â”€ Palette â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const P = {
  edgeIceBlue:     '#8FE8F5',
  edgeDeep:        '#1A7A8A',
  nodeWhiteHot:    '#F8FEFF',
  nodeFlareHalo:   '#5ADAEE',
  amberNode:       '#FFAF2A',
  amberEdge:       '#E8910A',
  amberBokeh:      '#C87800',
  blueBokeh:       '#1A7AB8',
  nucleusOrange:   '#FFC040',
  nucleusParticle: '#1A3A6A',
  bg:              '#050C14',
  starWhite:       '#D8E8EE',
  edgeStale:       '#3A4855',
  agentEdge:       '#00D4FF',
} as const;

// Module-level drag flag: set true during pointermove > 4px so AgentNodeMesh onClick ignores
// the synthetic click that fires on pointerup after a drag.
const globalDraggedRef = { current: false };

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type NodeState = 'fresh' | 'warming' | 'stale' | 'cold';

interface AgentData {
  id: string;
  name: string;
  state: NodeState;
}

// â”€â”€ Icosphere helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getIcosphereVertices(detail: number): THREE.Vector3[] {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const unique: THREE.Vector3[] = [];
  const EPS = 0.001;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    if (!unique.some((u) => u.distanceTo(v) < EPS)) unique.push(v);
  }
  geo.dispose();
  return unique;
}

function getIcosphereEdges(
  detail: number,
  verts: THREE.Vector3[],
): [THREE.Vector3, THREE.Vector3][] {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const EPS = 0.001;

  const findIdx = (x: number, y: number, z: number) => {
    const v = new THREE.Vector3(x, y, z);
    return verts.findIndex((u) => u.distanceTo(v) < EPS);
  };

  const seen = new Set<string>();
  const edges: [THREE.Vector3, THREE.Vector3][] = [];

  for (let i = 0; i < pos.count; i += 3) {
    const tri = [0, 1, 2].map((k) => ({
      x: pos.getX(i + k), y: pos.getY(i + k), z: pos.getZ(i + k),
      idx: findIdx(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k)),
    }));
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as [number, number][]) {
      const ia = tri[a].idx, ib = tri[b].idx;
      if (ia < 0 || ib < 0) continue;
      const key = `${Math.min(ia, ib)},${Math.max(ia, ib)}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([verts[ia], verts[ib]]);
      }
    }
  }
  geo.dispose();
  return edges;
}

// â”€â”€ Node state helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function stateHaloColor(s: NodeState): string {
  switch (s) {
    case 'fresh':   return P.nodeFlareHalo;
    case 'warming': return P.amberNode;
    case 'stale':   return P.amberNode;
    case 'cold':    return P.edgeStale;
  }
}

function nodeEmissive(s: NodeState, t: number, animate: boolean): number {
  if (!animate) {
    return s === 'fresh' ? 1.3 : s === 'warming' ? 0.78 : s === 'stale' ? 0.26 : 0.10;
  }
  const base = s === 'fresh' ? 2.0 : s === 'warming' ? 1.2 : s === 'stale' ? 0.4 : 0.15;
  if (s !== 'fresh' && s !== 'warming') return base;
  const freq = s === 'fresh' ? (Math.PI * 2 / 3) : (Math.PI * 2 / 5);
  const pulse = 0.5 + 0.5 * Math.sin(t * freq);
  return base * (0.6 + pulse * 0.4);
}

// â”€â”€ Native star field (replaces @react-three/drei Stars â€” react@18 compatible) â”€â”€

function NativeStars({ count = 2400, radius = 17, factor = 0.8 }: { count?: number; radius?: number; factor?: number }) {
  const geo = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = radius * (0.8 + Math.random() * 0.2);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const bright = 0.70 + Math.random() * 0.30;
      colors[i * 3]     = bright * 0.85;
      colors[i * 3 + 1] = bright * 0.92;
      colors[i * 3 + 2] = bright;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    return g;
  }, [count, radius]);

  return (
    <points geometry={geo}>
      <pointsMaterial
        size={factor * 0.12}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

// â”€â”€ Soft-circle canvas texture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeSoftCircle(): THREE.CanvasTexture {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = s; cv.height = s;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0,    'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.40)');
  g.addColorStop(0.7,  'rgba(255,255,255,0.08)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(cv);
}

// â”€â”€ Bokeh layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface BokehDef {
  pos: [number, number, number];
  color: string;
  opacity: number;
  size: number;
  offset: number;
}

function BokehLayer({ animate }: { animate: boolean }) {
  const tex = useMemo(() => makeSoftCircle(), []);

  const circles = useMemo<BokehDef[]>(() => {
    return Array.from({ length: 48 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 2.5;
      const z = -2.0 - Math.random() * 3.0;
      return {
        pos: [r * Math.cos(angle), (Math.random() - 0.4) * 2.5, z + r * Math.sin(angle) * 0.3] as [number, number, number],
        color: Math.random() < 0.65 ? P.amberBokeh : P.blueBokeh,
        opacity: 0.12 + Math.random() * 0.23,
        size: 0.15 + Math.random() * 0.45,
        offset: Math.random() * 100,
      };
    });
  }, []);

  return (
    <>
      {circles.map((c, i) => (
        <BokehSprite key={i} def={c} tex={tex} animate={animate} />
      ))}
    </>
  );
}

function BokehSprite({ def, tex, animate }: { def: BokehDef; tex: THREE.CanvasTexture; animate: boolean }) {
  const ref = useRef<THREE.Sprite>(null);
  const posRef = useRef(new THREE.Vector3(...def.pos));

  useFrame(({ clock }) => {
    if (!animate || !ref.current) return;
    const t = clock.elapsedTime;
    const n = def.offset;
    posRef.current.x += Math.sin(t * 0.15 + n) * 0.0004;
    posRef.current.y += Math.cos(t * 0.12 + n * 1.4) * 0.0003;
    ref.current.position.copy(posRef.current);
  });

  return (
    <sprite ref={ref} position={def.pos} scale={[def.size, def.size, 1]}>
      <spriteMaterial
        map={tex}
        color={def.color}
        transparent
        opacity={def.opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  );
}

// â”€â”€ Org nucleus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function OrgNucleus({ animate }: { animate: boolean }) {
  const rimRef = useRef<THREE.Mesh>(null);

  const particleGeo = useMemo(() => {
    const count = 500;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 0.08 + Math.random() * 0.22;
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8;
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame(({ clock }) => {
    if (!rimRef.current) return;
    const mat = rimRef.current.material as THREE.MeshBasicMaterial;
    if (animate) {
      const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * (Math.PI * 2 / 4));
      mat.opacity = 0.55 + pulse * 0.30;
      rimRef.current.scale.setScalar(1 + pulse * 0.08);
    } else {
      mat.opacity = 0.70;
    }
  });

  return (
    <group>
      <points geometry={particleGeo}>
        <pointsMaterial
          color={P.nucleusParticle}
          size={0.014}
          sizeAttenuation
          opacity={0.75}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <mesh ref={rimRef}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial
          color={P.nucleusOrange}
          transparent
          opacity={0.65}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.030, 16, 16]} />
        <meshBasicMaterial
          color={P.nucleusOrange}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// â”€â”€ Agent node â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function AgentNodeMesh({
  position, agent, animate, flashing, onSelect,
}: {
  position: THREE.Vector3;
  agent: AgentData;
  animate: boolean;
  flashing: boolean;
  onSelect?: (sx: number, sy: number) => void;
}) {
  const coreRef  = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { camera, size } = useThree();

  const handleSelect = useCallback(() => {
    if (!onSelect) return;
    const projected = position.clone().project(camera);
    const sx = (projected.x * 0.5 + 0.5) * size.width;
    const sy = (-(projected.y * 0.5) + 0.5) * size.height;
    onSelect(sx, sy);
  }, [position, camera, size, onSelect]);

  useEffect(() => {
    document.body.style.cursor = hovered && onSelect ? 'pointer' : 'auto';
    return () => { document.body.style.cursor = 'auto'; };
  }, [hovered, onSelect]);
  const haloTex  = useMemo(() => makeSoftCircle(), []);
  const haloColor = stateHaloColor(agent.state);
  const haloSize  = agent.state === 'fresh' ? 0.12 : agent.state === 'warming' ? 0.10 : 0.05;
  const haloOp    = agent.state === 'cold' ? 0 : agent.state === 'stale' ? 0.2 : 0.55;

  useFrame(({ clock }) => {
    if (!coreRef.current) return;
    const mat = coreRef.current.material as THREE.MeshBasicMaterial;
    if (flashing) {
      mat.color.set(P.nodeFlareHalo);
      coreRef.current.scale.setScalar(1.8);
      return;
    }
    coreRef.current.scale.setScalar(1);
    const intensity = nodeEmissive(agent.state, clock.elapsedTime, animate);
    const b = Math.min(1, intensity / 2.0);
    mat.color.setRGB(b, b, Math.min(1, b * 1.02));
  });

  return (
    <group position={position.toArray() as [number, number, number]}>
      <mesh
        ref={coreRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopPropagation(); if (!globalDraggedRef.current) handleSelect(); }}
      >
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshBasicMaterial
          color={P.nodeWhiteHot}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {haloOp > 0 && (
        <sprite scale={[haloSize, haloSize, 1]}>
          <spriteMaterial
            map={haloTex}
            color={haloColor}
            transparent
            opacity={haloOp}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      )}
    </group>
  );
}

// â”€â”€ Wireframe + nucleus edges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function IcosphereWireframe({
  edges, nucleusPositions,
}: {
  edges: [THREE.Vector3, THREE.Vector3][];
  nucleusPositions: THREE.Vector3[];
}) {
  const wireGeo = useMemo(() => {
    const flat: number[] = [];
    edges.forEach(([a, b]) => { flat.push(a.x, a.y, a.z, b.x, b.y, b.z); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    return g;
  }, [edges]);

  const nucleusGeo = useMemo(() => {
    const flat: number[] = [];
    nucleusPositions.forEach((p) => { flat.push(0, 0, 0, p.x, p.y, p.z); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    return g;
  }, [nucleusPositions]);

  return (
    <>
      <lineSegments geometry={wireGeo}>
        <lineBasicMaterial
          color={P.edgeIceBlue}
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      {nucleusPositions.length > 0 && (
        <lineSegments geometry={nucleusGeo}>
          <lineBasicMaterial
            color={P.amberEdge}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </>
  );
}

// â”€â”€ Packet system â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PACKET_SPEED = 0.35;
const TRAIL_POINTS = 8;
const MAX_PACKETS  = 16;

interface PacketDef {
  id: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  toNucleus: boolean;
}

let _packetId = 0;

function SinglePacket({
  from, to, toNucleus, onDone,
}: PacketDef & { onDone(): void }) {
  const meshRef  = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Points>(null);
  const tRef     = useRef(0);
  const doneRef  = useRef(false);
  const len      = useMemo(() => Math.max(0.001, from.distanceTo(to)), [from, to]);

  const trailGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
    return g;
  }, []);

  useFrame((_, delta) => {
    if (doneRef.current) return;
    tRef.current = Math.min(1, tRef.current + (delta * PACKET_SPEED) / len);
    if (tRef.current >= 1) { doneRef.current = true; onDone(); return; }

    const pos = from.clone().lerp(to, tRef.current);
    if (meshRef.current) meshRef.current.position.copy(pos);

    if (trailRef.current) {
      const attr = trailRef.current.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const t2 = Math.max(0, tRef.current - k * 0.018);
        const tp = from.clone().lerp(to, t2);
        attr.setXYZ(k, tp.x, tp.y, tp.z);
      }
      attr.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={meshRef} position={from.toArray() as [number, number, number]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshBasicMaterial
          color={toNucleus ? P.amberEdge : P.nodeWhiteHot}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <points ref={trailRef} geometry={trailGeo}>
        <pointsMaterial
          color={toNucleus ? P.amberEdge : P.edgeIceBlue}
          size={0.012}
          sizeAttenuation
          opacity={0.55}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}

function PacketLayer({
  edges, nucleusPositions, animate,
}: {
  edges: [THREE.Vector3, THREE.Vector3][];
  nucleusPositions: THREE.Vector3[];
  animate: boolean;
}) {
  const [packets, setPackets] = useState<PacketDef[]>([]);
  const timerRef = useRef(0);

  useFrame((_, delta) => {
    if (!animate || edges.length === 0) return;
    timerRef.current -= delta;
    if (timerRef.current > 0) return;
    timerRef.current = 2 + Math.random() * 3;

    if (packets.length >= MAX_PACKETS) return;

    const useNucleus = nucleusPositions.length > 0 && Math.random() < 0.3;
    let from: THREE.Vector3, to: THREE.Vector3, toNucleus = false;

    if (useNucleus) {
      const np = nucleusPositions[Math.floor(Math.random() * nucleusPositions.length)];
      from = np.clone(); to = new THREE.Vector3(0, 0, 0); toNucleus = true;
    } else {
      const [a, b] = edges[Math.floor(Math.random() * edges.length)];
      [from, to] = Math.random() < 0.5 ? [a.clone(), b.clone()] : [b.clone(), a.clone()];
    }

    setPackets((prev) => [
      ...prev,
      { id: ++_packetId, from, to, toNucleus },
    ]);
  });

  const removePacket = useCallback((id: number) => {
    setPackets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <>
      {packets.map((pkt) => (
        <SinglePacket
          key={pkt.id}
          {...pkt}
          onDone={() => removePacket(pkt.id)}
        />
      ))}
    </>
  );
}

// â”€â”€ Data hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function presenceToState(s: string): NodeState {
  if (s === 'online')  return 'fresh';
  if (s === 'crashed') return 'stale';
  return 'cold';
}

function useAgentData(): AgentData[] {
  const [agents, setAgents] = useState<AgentData[]>([]);

  const load = useCallback(async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        fetch('/api/hotbox/members'),
        fetch('/api/hotbox/presence'),
      ]);
      const members: { id: string; name: string }[] = await mRes.json();
      const presence: Record<string, string> = await pRes.json();
      const padded = [...members];
      while (padded.length < 8) padded.push({ id: `ghost-${padded.length}`, name: '' });
      setAgents(
        padded.slice(0, 40).map((m) => ({
          id: m.id, name: m.name,
          state: presenceToState(presence[m.id] ?? presence[m.name] ?? 'offline'),
        }))
      );
    } catch {
      setAgents(
        Array.from({ length: 8 }, (_, i) => ({ id: `ghost-${i}`, name: '', state: 'cold' as NodeState }))
      );
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  return agents;
}

// â”€â”€ Scene â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// -- Agent-to-agent curved bezier edges -----------------------------------------

function CurvedAgentEdges({ edges }: { edges: [THREE.Vector3, THREE.Vector3][] }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const SEGS = 24;
    for (const [a, b] of edges) {
      const mid  = a.clone().lerp(b, 0.5);
      const ctrl = mid.clone().multiplyScalar(1.55 + mid.length() * 0.25);
      const curve = new THREE.QuadraticBezierCurve3(a, ctrl, b);
      const samples = curve.getPoints(SEGS);
      for (let i = 0; i < samples.length - 1; i++) {
        const p = samples[i], q = samples[i + 1];
        pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [edges]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={P.agentEdge} transparent opacity={0.22}
        blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

function Scene({ animate, onNodeSelect }: { animate: boolean; onNodeSelect?: (agent: AgentData, sx: number, sy: number) => void }) {
  const agents = useAgentData();
  const [flashSet, setFlashSet] = useState<Set<number>>(new Set());
  const { scene } = useThree();

  useEffect(() => { scene.background = new THREE.Color(P.bg); }, [scene]);

  const { agentPositions, edges, nucleusNearby } = useMemo(() => {
    if (agents.length === 0) return { agentPositions: [], edges: [], nucleusNearby: [] };

    const detail = agents.length <= 20 ? 2 : 3;
    const allVerts  = getIcosphereVertices(detail);
    const hemiVerts = allVerts.filter((v) => v.y >= -0.1);
    const allEdges  = getIcosphereEdges(detail, allVerts)
      .filter(([a, b]) => a.y >= -0.1 || b.y >= -0.1);

    const count = Math.min(agents.length, hemiVerts.length);
    const positions = hemiVerts.slice(0, count).map((v) => v.clone());

    const nearby = [...positions].sort((a, b) => a.length() - b.length()).slice(0, 10);

    return { agentPositions: positions, edges: allEdges, nucleusNearby: nearby };
  }, [agents]);

  const agentEdges = useMemo<[THREE.Vector3, THREE.Vector3][]>(() => {
    if (agentPositions.length < 2) return [];
    const result: [THREE.Vector3, THREE.Vector3][] = [];
    const seen = new Set<string>();
    for (let i = 0; i < agentPositions.length; i++) {
      const a = agentPositions[i];
      const sorted = agentPositions
        .map((b, j) => ({ j, d: a.distanceTo(b) }))
        .filter(({ j }) => j !== i)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2);
      for (const { j } of sorted) {
        const key = `${Math.min(i, j)},${Math.max(i, j)}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push([a, agentPositions[j]]);
        }
      }
    }
    return result;
  }, [agentPositions]);

  if (agents.length === 0) return null;

  return (
    <>
      <NativeStars radius={17} count={2400} factor={0.8} />
      <BokehLayer animate={animate} />
      <OrgNucleus animate={animate} />
      <IcosphereWireframe edges={edges} nucleusPositions={nucleusNearby} />
      <CurvedAgentEdges edges={agentEdges} />
      {agents.slice(0, agentPositions.length).map((agent, i) => (
        <AgentNodeMesh
          key={agent.id}
          position={agentPositions[i]}
          agent={agent}
          animate={animate}
          flashing={flashSet.has(i)}
          onSelect={onNodeSelect ? (sx, sy) => onNodeSelect(agent, sx, sy) : undefined}
        />
      ))}
      {animate && (
        <PacketLayer edges={edges} nucleusPositions={nucleusNearby} animate={animate} />
      )}
    </>
  );
}

// â”€â”€ Camera auto-orbit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CameraRig({ animate }: { animate: boolean }) {
  const { camera, gl } = useThree();
  const thetaRef    = useRef(0);
  const autoRef     = useRef(animate);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (camera as THREE.PerspectiveCamera).fov = 55;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, delta) => {
    if (!autoRef.current || !animate) return;
    thetaRef.current += 0.010 * delta;
    const r = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
    camera.position.x = r * Math.sin(thetaRef.current);
    camera.position.z = r * Math.cos(thetaRef.current);
    camera.lookAt(0, 0, 0);
  });

  useEffect(() => {
    const canvas = gl.domElement;
    let pressed    = false;
    let startX     = 0;
    let startTheta = 0;

    const scheduleResume = () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        autoRef.current = animate;
      }, 2000);
    };

    const onDown = (e: PointerEvent) => {
      pressed = true;
      startX  = e.clientX;
      startTheta = Math.atan2(camera.position.x, camera.position.z);
      autoRef.current = false;
      globalDraggedRef.current = false;
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };

    const onMove = (e: PointerEvent) => {
      if (!pressed) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) globalDraggedRef.current = true;
      thetaRef.current = startTheta - dx * 0.005;
      const r = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
      camera.position.x = r * Math.sin(thetaRef.current);
      camera.position.z = r * Math.cos(thetaRef.current);
      camera.lookAt(0, 0, 0);
    };

    const onUp = () => {
      if (!pressed) return;
      pressed = false;
      scheduleResume();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup',     onUp);
    canvas.addEventListener('pointerleave',  onUp);
    canvas.addEventListener('pointercancel', onUp);

    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup',     onUp);
      canvas.removeEventListener('pointerleave',  onUp);
      canvas.removeEventListener('pointercancel', onUp);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [animate, camera, gl]);

  return null;
}

// â”€â”€ Post-processing â€” UnsignedByteType framebuffer for iOS Safari compatibility â”€â”€
// Default HalfFloatType render targets fail on mobile Safari (texture format not
// guaranteed). mipmapBlur dropped â€” requires MRT not available on all WebGL 2 impls.

function PostFX() {
  const chromaOffset = useRef(new THREE.Vector2(0.0004, 0.0003));
  return (
    <EffectComposer frameBufferType={THREE.UnsignedByteType}>
      <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.1} intensity={1.8} />
      <ChromaticAberration
        offset={chromaOffset.current}
        radialModulation={false}
        modulationOffset={0}
      />
      <Vignette darkness={0.60} offset={0.45} eskil={false} />
    </EffectComposer>
  );
}

// â”€â”€ Root â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ORG = process.env.NEXT_PUBLIC_HOTBOX_ORG ?? 'toadsage';

// -- Node popover ---------------------------------------------------------------

function NodePopover({
  agent, sx, sy, containerW, containerH, onClose,
}: {
  agent: AgentData;
  sx: number;
  sy: number;
  containerW: number;
  containerH?: number;
  onClose(): void;
}) {
  const router = useRouter();
  const popLeft = sx > containerW * 0.6;
  const channelId = agent.id.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const POPOVER_W = 220;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const posStyle: React.CSSProperties = popLeft
    ? { right: containerW - sx + 12 }
    : { left: sx + 12 };

  return (
    <div
      style={{
        position: 'absolute',
        top: Math.min(sy, Math.max(0, (containerH ?? 600) - 180)),
        ...posStyle,
        width: POPOVER_W,
        background: 'rgba(5,12,20,0.92)',
        border: '1px solid rgba(143,232,245,0.18)',
        borderRadius: 12,
        padding: '14px 16px',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: '#C8ECF4',
        fontFamily: 'monospace',
        fontSize: 12,
        letterSpacing: '0.04em',
        zIndex: 30,
        boxShadow: '0 0 32px rgba(0,212,255,0.08)',
        pointerEvents: 'all',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ color: '#8FE8F5', fontWeight: 700, fontSize: 13 }}>{agent.name}</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#8FE8F5', cursor: 'pointer',
            fontSize: 14, opacity: 0.6, lineHeight: 1, padding: '0 0 0 8px' }}
        >
          ✕
        </button>
      </div>
      <div style={{ marginBottom: 4, opacity: 0.7 }}>
        state:{' '}
        <span style={{ color: agent.state === 'fresh' ? '#00D4FF' : agent.state === 'warming' ? '#FFAF2A' : '#8FE8F5' }}>
          {agent.state}
        </span>
      </div>
      <div style={{ marginBottom: 12, opacity: 0.5, wordBreak: 'break-all' }}>id: {agent.id}</div>
      <button
        onClick={() => { router.push(`/channels/${channelId}`); onClose(); }}
        style={{
          width: '100%',
          background: 'rgba(0,212,255,0.12)',
          border: '1px solid rgba(0,212,255,0.3)',
          borderRadius: 6,
          color: '#00D4FF',
          fontFamily: 'monospace',
          fontSize: 11,
          letterSpacing: '0.06em',
          padding: '6px 10px',
          cursor: 'pointer',
          textTransform: 'uppercase',
        }}
      >
        → Hotbox channel
      </button>
    </div>
  );
}

export default function NeuralGlobe({ prefersReduced }: { prefersReduced: boolean }) {
  const animate = !prefersReduced;
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNode, setSelectedNode] = useState<{
    agent: AgentData; sx: number; sy: number;
  } | null>(null);

  const handleNodeSelect = useCallback((agent: AgentData, sx: number, sy: number) => {
    setSelectedNode((prev) => (prev?.agent.id === agent.id ? null : { agent, sx, sy }));
  }, []);

  const handleClose = useCallback(() => setSelectedNode(null), []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}
      onClick={handleClose}
    >
      <Canvas
        camera={{ fov: 55, near: 0.1, far: 100, position: [0, 0.4, 2.8] }}
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        dpr={[1, 2]}
      >
        <Scene animate={animate} onNodeSelect={handleNodeSelect} />
        <CameraRig animate={animate} />
        <PostFX />
      </Canvas>

      {selectedNode && containerRef.current && (
        <NodePopover
          agent={selectedNode.agent}
          sx={selectedNode.sx}
          sy={selectedNode.sy}
          containerW={containerRef.current.clientWidth}
          containerH={containerRef.current.clientHeight}
          onClose={handleClose}
        />
      )}

      <div style={{
        position: 'absolute', top: 16, left: 20,
        fontSize: 11, fontFamily: 'monospace', color: P.edgeIceBlue,
        opacity: 0.55, letterSpacing: '0.08em', textTransform: 'uppercase',
        pointerEvents: 'none', userSelect: 'none',
      }}>
        {ORG} Â· neural link v2
      </div>

      {prefersReduced && (
        <div aria-live="polite" style={{
          position: 'absolute', bottom: 16, right: 16,
          fontSize: 10, fontFamily: 'monospace', color: P.edgeDeep,
          padding: '4px 8px', border: `1px solid ${P.edgeDeep}`,
          borderRadius: 4, pointerEvents: 'none',
        }}>
          3D view â€” motion paused
        </div>
      )}
    </div>
  );
}
