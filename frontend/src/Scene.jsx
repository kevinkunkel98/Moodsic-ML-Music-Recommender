import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { EffectComposer, ChromaticAberration, Bloom } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { Vector2 } from 'three'
import { gsap } from 'gsap'
import MoodBlob from './MoodBlob'
import SatelliteOrbs from './SatelliteOrbs'

// Inner component that has access to R3F context
function SceneInner({ moodConfig, results, onSelectTrack, aberrationRef }) {
  const aberrationOffsetRef = useRef(new Vector2(0.001, 0.001))

  // Expose aberration control to parent via ref
  useImperativeHandle(aberrationRef, () => ({
    flash() {
      // GSAP animate the aberration offset
      gsap.timeline()
        .to(aberrationOffsetRef.current, { x: 0.008, y: 0.004, duration: 0.2, ease: 'power2.in' })
        .to(aberrationOffsetRef.current, { x: 0.001, y: 0.001, duration: 0.3, ease: 'power2.out' })

      // Scanline flash on body
      document.body.classList.add('scanline-flash')
      setTimeout(() => document.body.classList.remove('scanline-flash'), 150)
    },
  }))

  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[0, 0, 0]} intensity={2} color="#7b2fff" />
      <pointLight position={[5, 5, 5]} intensity={1} color="#00ffcc" />

      <Stars radius={100} depth={60} count={10000} factor={4} saturation={0} fade speed={0.5} />

      {/* Nebula glow spheres */}
      <mesh position={[-4, 2, -8]}>
        <sphereGeometry args={[3, 16, 16]} />
        <meshStandardMaterial color="#7b2fff" emissive="#7b2fff" emissiveIntensity={0.15} transparent opacity={0.08} />
      </mesh>
      <mesh position={[4, -2, -10]}>
        <sphereGeometry args={[4, 16, 16]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={0.1} transparent opacity={0.06} />
      </mesh>

      <MoodBlob
        speed={moodConfig.speed}
        intensity={moodConfig.intensity}
        color1={moodConfig.color1}
        color2={moodConfig.color2}
      />

      <SatelliteOrbs tracks={results} onSelect={onSelectTrack} />

      <EffectComposer>
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={aberrationOffsetRef.current}
        />
        <Bloom
          luminanceThreshold={0.3}
          luminanceSmoothing={0.9}
          intensity={1.5}
        />
      </EffectComposer>
    </>
  )
}

// Wrap SceneInner with forwardRef so aberrationRef is accessible
const SceneInnerWithRef = forwardRef(function SceneInnerWithRef(props, ref) {
  return <SceneInner {...props} aberrationRef={ref} />
})

export default function Scene({ moodConfig, results, onSelectTrack, onFlashRef }) {
  const aberrationRef = useRef()

  // Pass flash function up to App via callback ref
  useEffect(() => {
    if (onFlashRef) onFlashRef.current = aberrationRef
  }, [onFlashRef])

  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 60 }}
      style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <SceneInnerWithRef
        ref={aberrationRef}
        moodConfig={moodConfig}
        results={results}
        onSelectTrack={onSelectTrack}
      />
    </Canvas>
  )
}
