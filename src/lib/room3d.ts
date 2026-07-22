// 모둠 공간 아이템의 three.js(procedural) 렌더 매니저.
//
// 설계 요점(성능·버퍼링 대비):
//  - three.js 는 **동적 import** 로 코드 스플릿 → 모둠 공간을 처음 열 때 1회만 로드(메인 번들 무관).
//  - **다운로드하는 3D 에셋이 없다.** 지오메트리를 코드로 생성(LatheGeometry 회전체 등)하므로
//    네트워크 로딩·버퍼링이 원천적으로 없다. 늘어나는 건 코드 스플릿된 three 청크뿐이다.
//  - **공유 렌더러 1개**(WebGL 컨텍스트 1개)로 각 아이템을 그려 2D 캔버스에 복사한다.
//    (아이템마다 canvas/컨텍스트를 만들면 브라우저 컨텍스트 한도(~16)에 걸린다)
//  - 방 아이템은 회전·이동 시에만, 프리뷰는 rAF 로만 그린다(온디맨드 → 배터리·발열↓).
//  - WebGL 을 못 쓰면 호출측(RoomItem3D)이 순수 CSS 폴백(RoomItemCSS)으로 되돌린다.
import type * as THREE_NS from 'three'

// three 모듈 전체의 값 타입(동적 import 결과)
type TS = typeof import('three')

// 내부 렌더 해상도(물리 px). 화면에는 더 작게 표시되므로 축소 샘플링돼 선명하다.
const S = 300

let T: TS | null = null
let renderer: THREE_NS.WebGLRenderer | null = null
let scene: THREE_NS.Scene | null = null
let camera: THREE_NS.PerspectiveCamera | null = null
let current: THREE_NS.Object3D | null = null
let currentType = ''
const cache = new Map<string, THREE_NS.Object3D>()

let readyPromise: Promise<boolean> | null = null
let ok = false

/** three.js 로드 + 렌더러 초기화. 성공하면 true, WebGL 실패면 false. 여러 번 호출해도 1회만. */
export function ensureRoom3d(): Promise<boolean> {
  if (readyPromise) return readyPromise
  readyPromise = (async () => {
    try {
      T = await import('three')
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      renderer.setSize(S, S, false)
      renderer.setPixelRatio(1)
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = T.SRGBColorSpace

      scene = new T.Scene()
      camera = new T.PerspectiveCamera(30, 1, 0.1, 100)
      camera.position.set(0, 1.12, 3.15)
      camera.lookAt(0, 0.62, 0)

      // 부드러운 실내광: 위(하늘)–아래(바닥) 반구광 + 살짝 위에서 비추는 키라이트
      const hemi = new T.HemisphereLight(0xffffff, 0xcfe3d6, 1.05)
      scene.add(hemi)
      const key = new T.DirectionalLight(0xffffff, 1.15)
      key.position.set(2.2, 3.4, 2.6)
      scene.add(key)
      const fill = new T.DirectionalLight(0xeaf4ee, 0.35)
      fill.position.set(-2.5, 1.2, -1.5)
      scene.add(fill)

      ok = true
    } catch {
      ok = false
    }
    return ok
  })()
  return readyPromise
}

/** 지정 타입을 rotationDeg 만큼 돌려 target(2D 캔버스)에 그린다. 준비 전이면 아무것도 안 한다. */
export function drawRoomItem(target: HTMLCanvasElement, type: string, rotationDeg: number) {
  if (!ok || !T || !renderer || !scene || !camera) return
  // 타입이 바뀌면 모델 교체(캐시 재사용)
  if (currentType !== type || !current) {
    if (current) scene.remove(current)
    let g = cache.get(type)
    if (!g) {
      g = buildModel(T, type)
      frameModel(T, g)
      cache.set(type, g)
    }
    current = g
    scene.add(current)
    currentType = type
  }
  const model = current
  if (!model) return
  model.rotation.y = (rotationDeg * Math.PI) / 180
  renderer.render(scene, camera)

  // GL 캔버스를 2D 캔버스로 복사(컨텍스트 1개 공유)
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.drawImage(renderer.domElement, 0, 0, target.width, target.height)
}

// ── 모델을 정규화: 높이 1.2, 바닥 y=0, x·z 중심 정렬 ──────────────
function frameModel(t: TS, group: THREE_NS.Object3D) {
  const box = new t.Box3().setFromObject(group)
  const size = new t.Vector3()
  box.getSize(size)
  const s = 1.2 / (size.y || 1)
  group.scale.setScalar(s)
  const box2 = new t.Box3().setFromObject(group)
  const c = new t.Vector3()
  box2.getCenter(c)
  group.position.x -= c.x
  group.position.z -= c.z
  group.position.y -= box2.min.y
}

// ── 재질·형태 헬퍼 ──────────────────────────────────────────────
function mat(t: TS, color: number, roughness = 0.72, metalness = 0) {
  return new t.MeshStandardMaterial({ color, roughness, metalness })
}

/** 회전체(화분·화병·컵·갓·기둥). profile = [반지름, 높이] 쌍(아래→위). */
function lathe(t: TS, profile: [number, number][], material: THREE_NS.Material, seg = 28) {
  const pts = profile.map(([r, y]) => new t.Vector2(r, y))
  return new t.Mesh(new t.LatheGeometry(pts, seg), material)
}

/** 유기적 덩어리(나뭇잎·인형): 아이코스피어에 잔물결을 줘 매끈한 곡면으로. */
function blob(t: TS, r: number, color: number, seed: number, rough = 0.85) {
  const g = new t.IcosahedronGeometry(r, 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n = 1 + 0.11 * Math.sin(x * 8 + seed) * Math.cos(y * 7 + seed) + 0.07 * Math.sin(z * 9 + seed * 1.7)
    p.setXYZ(i, x * n, y * n, z * n)
  }
  g.computeVertexNormals()
  return new t.Mesh(g, mat(t, color, rough))
}

function box(t: TS, w: number, h: number, d: number, color: number, rough = 0.7) {
  return new t.Mesh(new t.BoxGeometry(w, h, d), mat(t, color, rough))
}

/** 앞면 장식 텍스처(액자 그림·창문·시계 문자판) */
function canvasTexture(t: TS, draw: (ctx: CanvasRenderingContext2D, n: number) => void) {
  const n = 128
  const cv = document.createElement('canvas')
  cv.width = n
  cv.height = n
  const c = cv.getContext('2d')!
  draw(c, n)
  const tex = new t.CanvasTexture(cv)
  tex.colorSpace = t.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// 색
const K = {
  wood: 0xb98a5a,
  woodDark: 0x8a5a34,
  terra: 0xcf7f52,
  green: 0x57b877,
  greenDeep: 0x3f9c63,
  greenMoss: 0x4caf6e,
  soil: 0x5a4632,
  sage: 0x86b798,
  sageDark: 0x6f9e82,
  rug: 0xcf7f7f,
  rugLight: 0xe0a0a0,
  frame: 0xdfe6e0,
  glass: 0xbfe3f2,
  gold: 0xe8c25a,
  goldDark: 0xc9a63f,
  metal: 0x94a3b8,
  metalDark: 0x64748b,
  lampWarm: 0xf4dc8f,
  bear: 0xc79a6b,
  bearLight: 0xd6ac80,
  bearDark: 0x5a3d22,
  white: 0xf6faf8,
  ink: 0x334155,
}

function put(m: THREE_NS.Object3D, x: number, y: number, z = 0) {
  m.position.set(x, y, z)
  return m
}

// ── 아이템별 모델 ───────────────────────────────────────────────
function buildModel(t: TS, type: string): THREE_NS.Object3D {
  const g = new t.Group()
  switch (type) {
    case 'plant': {
      const pot = lathe(t, [[0, 0], [0.34, 0], [0.3, 0.05], [0.44, 0.52], [0.46, 0.6], [0.42, 0.6]], mat(t, K.terra, 0.6))
      g.add(put(pot, 0, 0, 0))
      g.add(put(lathe(t, [[0, 0.56], [0.4, 0.56], [0.4, 0.6]], mat(t, K.soil, 0.95)), 0, 0, 0))
      g.add(put(blob(t, 0.5, K.green, 1.3), 0, 1.02, 0))
      g.add(put(blob(t, 0.34, K.greenDeep, 4.1), -0.28, 0.86, 0.12))
      g.add(put(blob(t, 0.32, K.greenMoss, 7.7), 0.3, 0.9, -0.1))
      g.add(put(blob(t, 0.3, 0x6bc98a, 2.2), 0.02, 1.32, 0.05))
      break
    }
    case 'plant_big': {
      const pot = lathe(t, [[0, 0], [0.34, 0], [0.3, 0.04], [0.4, 0.42], [0.42, 0.48], [0.38, 0.48]], mat(t, K.terra, 0.6))
      g.add(pot)
      g.add(put(lathe(t, [[0.1, 0.44], [0.09, 0.9], [0.11, 1.35]], mat(t, K.woodDark, 0.8)), 0, 0, 0))
      g.add(put(blob(t, 0.72, K.greenDeep, 3.3), 0, 1.75, 0))
      g.add(put(blob(t, 0.48, K.green, 6.6), -0.42, 1.5, 0.15))
      g.add(put(blob(t, 0.46, K.greenMoss, 9.1), 0.44, 1.55, -0.12))
      g.add(put(blob(t, 0.4, 0x6bc98a, 1.9), 0.05, 2.15, 0.05))
      break
    }
    case 'desk': {
      g.add(put(box(t, 1.7, 0.16, 1.0, K.wood), 0, 1.18, 0))
      const legY = 0.58
      for (const [dx, dz] of [[-0.72, 0.38], [0.72, 0.38], [-0.72, -0.38], [0.72, -0.38]])
        g.add(put(box(t, 0.14, 1.16, 0.14, K.woodDark), dx, legY, dz))
      break
    }
    case 'sofa': {
      g.add(put(box(t, 1.5, 0.42, 0.9, K.sage), 0, 0.5, 0))
      g.add(put(box(t, 1.5, 0.7, 0.22, K.sageDark), 0, 0.72, -0.34))
      g.add(put(box(t, 0.22, 0.62, 0.9, K.sage), -0.64, 0.6, 0))
      g.add(put(box(t, 0.22, 0.62, 0.9, K.sage), 0.64, 0.6, 0))
      break
    }
    case 'frame': {
      g.add(put(box(t, 1.1, 1.4, 0.16, K.wood), 0, 0.7, 0))
      const tex = canvasTexture(t, (c, n) => {
        const sky = c.createLinearGradient(0, 0, 0, n)
        sky.addColorStop(0, '#bfe3f2')
        sky.addColorStop(0.55, '#d9f0e0')
        c.fillStyle = sky
        c.fillRect(0, 0, n, n * 0.6)
        c.fillStyle = '#57b877'
        c.beginPath()
        c.moveTo(0, n * 0.62)
        c.quadraticCurveTo(n * 0.5, n * 0.42, n, n * 0.62)
        c.lineTo(n, n)
        c.lineTo(0, n)
        c.closePath()
        c.fill()
        c.fillStyle = '#ffe9a8'
        c.beginPath()
        c.arc(n * 0.76, n * 0.2, n * 0.08, 0, Math.PI * 2)
        c.fill()
      })
      const pic = new t.Mesh(new t.PlaneGeometry(0.86, 1.16), new t.MeshStandardMaterial({ map: tex, roughness: 0.9 }))
      g.add(put(pic, 0, 0.7, 0.09))
      break
    }
    case 'rug': {
      g.add(put(box(t, 1.9, 0.08, 1.3, K.rug), 0, 0.04, 0))
      g.add(put(box(t, 1.5, 0.1, 1.0, K.rugLight), 0, 0.06, 0))
      break
    }
    case 'window': {
      g.add(put(box(t, 1.5, 1.3, 0.16, K.frame), 0, 0.65, 0))
      const glass = new t.Mesh(new t.PlaneGeometry(1.24, 1.04), new t.MeshStandardMaterial({ color: K.glass, roughness: 0.25, metalness: 0.1 }))
      g.add(put(glass, 0, 0.65, 0.09))
      g.add(put(box(t, 0.08, 1.04, 0.06, K.frame), 0, 0.65, 0.11))
      g.add(put(box(t, 1.24, 0.08, 0.06, K.frame), 0, 0.65, 0.11))
      break
    }
    case 'bookshelf': {
      g.add(put(box(t, 1.3, 1.85, 0.75, K.wood), 0, 0.93, 0))
      g.add(put(box(t, 1.1, 1.65, 0.4, 0x5a4630), 0, 0.93, 0.2))
      const rows = [
        [0xe57373, 0x64b5f6, 0x81c784, 0xffb74d],
        [0x9575cd, 0x4db6ac, 0xf06292, 0xfff176],
        [0x4fc3f7, 0xaed581, 0xff8a65, 0xba68c8],
      ]
      rows.forEach((row, ri) => {
        const shelfY = 0.35 + ri * 0.58
        row.forEach((col, ci) => {
          const h = 0.34 + ((ri + ci) % 3) * 0.05
          g.add(put(box(t, 0.2, h, 0.28, col, 0.6), -0.42 + ci * 0.28, shelfY + h / 2, 0.32))
        })
      })
      break
    }
    case 'clock': {
      const body = lathe(t, [[0, 0], [0.6, 0], [0.62, 0.12], [0.6, 0.24], [0, 0.24]], mat(t, K.greenDeep, 0.5))
      body.rotation.x = Math.PI / 2 // 면이 앞을 보도록 눕힌다
      g.add(put(body, 0, 0.6, 0))
      const tex = canvasTexture(t, (c, n) => {
        c.fillStyle = '#f6faf8'
        c.beginPath()
        c.arc(n / 2, n / 2, n / 2 - 2, 0, Math.PI * 2)
        c.fill()
        c.strokeStyle = '#334155'
        c.lineCap = 'round'
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2
          const r1 = n / 2 - 8
          const r2 = n / 2 - (i % 3 === 0 ? 18 : 13)
          c.lineWidth = i % 3 === 0 ? 3 : 1.5
          c.beginPath()
          c.moveTo(n / 2 + Math.cos(a) * r1, n / 2 + Math.sin(a) * r1)
          c.lineTo(n / 2 + Math.cos(a) * r2, n / 2 + Math.sin(a) * r2)
          c.stroke()
        }
        c.strokeStyle = '#334155'
        c.lineWidth = 4
        c.beginPath()
        c.moveTo(n / 2, n / 2)
        c.lineTo(n / 2 + 22, n / 2 - 12)
        c.stroke()
        c.lineWidth = 3
        c.beginPath()
        c.moveTo(n / 2, n / 2)
        c.lineTo(n / 2 - 6, n / 2 - 34)
        c.stroke()
        c.fillStyle = '#334155'
        c.beginPath()
        c.arc(n / 2, n / 2, 4, 0, Math.PI * 2)
        c.fill()
      })
      const face = new t.Mesh(new t.CircleGeometry(0.55, 40), new t.MeshStandardMaterial({ map: tex, roughness: 0.6 }))
      g.add(put(face, 0, 0.6, 0.13))
      break
    }
    case 'lamp': {
      g.add(lathe(t, [[0, 0], [0.4, 0], [0.42, 0.06], [0.1, 0.08]], mat(t, K.metalDark, 0.5, 0.3)))
      g.add(put(lathe(t, [[0.06, 0.08], [0.06, 1.0]], mat(t, K.metal, 0.4, 0.4)), 0, 0, 0))
      const shade = lathe(t, [[0.28, 1.0], [0.5, 1.0], [0.34, 1.42]], new t.MeshStandardMaterial({ color: K.lampWarm, roughness: 0.6, emissive: 0x6b5a1e, emissiveIntensity: 0.35, side: t.DoubleSide }))
      g.add(put(shade, 0, 0, 0))
      break
    }
    case 'plush': {
      g.add(put(blob(t, 0.5, K.bear, 2.1, 0.9), 0, 0.5, 0))
      g.add(put(blob(t, 0.15, K.bear, 3.3, 0.9), -0.32, 0.9, 0.14))
      g.add(put(blob(t, 0.15, K.bear, 5.5, 0.9), 0.32, 0.9, 0.14))
      g.add(put(blob(t, 0.4, K.bearLight, 8.2, 0.9), 0, 1.2, 0.05))
      const eyeMat = mat(t, K.bearDark, 0.5)
      g.add(put(new t.Mesh(new t.SphereGeometry(0.05, 12, 12), eyeMat), -0.14, 1.26, 0.36))
      g.add(put(new t.Mesh(new t.SphereGeometry(0.05, 12, 12), eyeMat), 0.14, 1.26, 0.36))
      g.add(put(new t.Mesh(new t.SphereGeometry(0.07, 12, 12), eyeMat), 0, 1.14, 0.4))
      break
    }
    case 'trophy': {
      g.add(put(box(t, 0.85, 0.22, 0.85, K.goldDark, 0.4), 0, 0.11, 0))
      g.add(put(lathe(t, [[0.12, 0.22], [0.1, 0.5]], mat(t, K.gold, 0.3, 0.8)), 0, 0, 0))
      const cup = lathe(t, [[0, 0.5], [0.2, 0.5], [0.5, 1.15], [0.5, 1.2], [0.44, 1.2], [0.44, 0.62]], new t.MeshStandardMaterial({ color: K.gold, roughness: 0.28, metalness: 0.85, side: t.DoubleSide }))
      g.add(put(cup, 0, 0, 0))
      break
    }
    default:
      g.add(put(blob(t, 0.6, K.sage, 1.1, 0.7), 0, 0.6, 0))
  }
  return g
}
