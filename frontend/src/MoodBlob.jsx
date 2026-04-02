import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gsap } from 'gsap'

// Simplex-style noise inline (classic 3D noise, no extra dep)
const NOISE_GLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+10.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`

const vertexShader = `
  ${NOISE_GLSL}
  uniform float uTime;
  uniform float uSpeed;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normal;
    vPosition = position;
    float t = uTime * uSpeed;
    float displacement = snoise(position * 1.2 + t) * uIntensity * 0.35;
    vec3 newPos = position + normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`

const fragmentShader = `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    float mixFactor = (vPosition.y + 1.0) * 0.5 + sin(uTime * 0.5) * 0.2;
    vec3 color = mix(uColor1, uColor2, clamp(mixFactor, 0.0, 1.0));
    // Rim lighting for glow effect
    float rim = 1.0 - max(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 0.0);
    color += rim * rim * uColor2 * 0.6;
    gl_FragColor = vec4(color, 0.92);
  }
`

// MoodBlob exposes a punch() method via ref for submit animation
const MoodBlob = forwardRef(function MoodBlob(
  { speed = 1.0, intensity = 1.0, color1 = '#7b2fff', color2 = '#00ffcc', scale = 1.0 },
  ref
) {
  const meshRef = useRef()

  useImperativeHandle(ref, () => ({
    punch() {
      if (!meshRef.current) return
      gsap.timeline()
        .to(meshRef.current.scale, { x: 1.4, y: 1.4, z: 1.4, duration: 0.15, ease: 'power2.out' })
        .to(meshRef.current.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 0.3, ease: 'elastic.out(1, 0.5)' })
    },
  }))

  const uniforms = useMemo(
    () => ({
      uTime:      { value: 0 },
      uSpeed:     { value: speed },
      uIntensity: { value: intensity },
      uColor1:    { value: new THREE.Color(color1) },
      uColor2:    { value: new THREE.Color(color2) },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // Update uniforms when props change
  useFrame((_, delta) => {
    uniforms.uTime.value += delta
    uniforms.uSpeed.value = speed
    uniforms.uIntensity.value = intensity
    uniforms.uColor1.value.set(color1)
    uniforms.uColor2.value.set(color2)
  })

  return (
    <mesh ref={meshRef} scale={scale}>
      <icosahedronGeometry args={[1.8, 6]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
      />
    </mesh>
  )
})

export default MoodBlob
