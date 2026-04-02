import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'

const ORB_COLORS = ['#ff0080', '#00ffcc', '#7b2fff', '#ffd700', '#00ff88']

function SatelliteOrb({ track, index, total, onSelect }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const angle = useRef((index / total) * Math.PI * 2)

  const orbitRadius = 3.5 + index * 0.6
  const orbitSpeed = 0.25 - index * 0.03
  const orbScale = 0.15 + track.score * 0.25
  const color = ORB_COLORS[index % ORB_COLORS.length]

  useFrame((_, delta) => {
    angle.current += delta * orbitSpeed
    if (meshRef.current) {
      meshRef.current.position.x = Math.cos(angle.current) * orbitRadius
      meshRef.current.position.z = Math.sin(angle.current) * orbitRadius
      meshRef.current.position.y = Math.sin(angle.current * 0.5 + index) * 0.8
    }
  })

  return (
    <mesh
      ref={meshRef}
      scale={hovered ? orbScale * 1.5 : orbScale}
      onClick={() => onSelect(track)}
      onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
    >
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={hovered ? 3 : 1.5}
        roughness={0.1}
        metalness={0.8}
      />
      {hovered && (
        <Html distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div style={{
            background: 'rgba(10,0,30,0.85)',
            border: '1px solid rgba(123,47,255,0.5)',
            borderRadius: '8px',
            padding: '6px 10px',
            color: '#fff',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ fontWeight: 600 }}>{track.title}</div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>{track.artist}</div>
          </div>
        </Html>
      )}
    </mesh>
  )
}

export default function SatelliteOrbs({ tracks = [], onSelect }) {
  return (
    <group>
      {tracks.map((track, i) => (
        <SatelliteOrb
          key={track.spotify_url || i}
          track={track}
          index={i}
          total={tracks.length}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}
