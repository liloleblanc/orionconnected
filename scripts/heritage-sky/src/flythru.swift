import AppKit
import AVFoundation
import CoreGraphics

// ── A 2.5D cloud fly-through, rendered to MP4 ────────────────────────────────
//
// This is what After Effects does with 3D layers and a camera, computed
// directly: every cloud is a billboard at its own depth, and a camera tracks
// past them. Parallax, scale and draw order all fall out of the projection
// rather than being hand-tuned per band, which is why it can do the one thing
// the CSS version cannot — put cloud genuinely in FRONT of and BEHIND the
// aeroplane, at arbitrary depths, instead of in five fixed layers.
//
// SEAMLESS LOOP, BY CONSTRUCTION. The world repeats every `period` world units
// and the camera travels exactly one period over the clip. A cloud at world_x
// and one at world_x+period are the same cloud, so after a full period every
// element has been replaced by its identical neighbour — at EVERY depth at
// once. No cross-fade, no ping-pong, no matching of first and last frames.
//
// ATMOSPHERIC PERSPECTIVE. Distant cloud is hazed toward the sky colour and
// softened. That is the cue the reference uses and the flat CSS layers have no
// way to express. It is baked per element once, not per frame.

func arg(_ n: String, _ d: Double) -> Double {
    guard let i = CommandLine.arguments.firstIndex(of: "--" + n), i + 1 < CommandLine.arguments.count,
          let v = Double(CommandLine.arguments[i + 1]) else { return d }
    return v
}
func argS(_ n: String) -> String? {
    guard let i = CommandLine.arguments.firstIndex(of: "--" + n), i + 1 < CommandLine.arguments.count
    else { return nil }
    return CommandLine.arguments[i + 1]
}

let OUTP   = argS("out") ?? "/tmp/flythru.mp4"
let ELEMS  = argS("elements") ?? ""
let PLANEP = argS("plane") ?? ""
let W      = Int(arg("w", 1600)), H = Int(arg("h", 960))
let FPS    = Int(arg("fps", 30))
let DUR    = arg("dur", 20)
let PERIOD = arg("period", 2000)
let FOCAL  = arg("focal", 1000)
let PLANE_DEPTH = arg("planeDepth", 1000)
let PLANE_FRAC  = arg("planeWidth", 0.62)     // fraction of frame width
// bobSec must divide the duration or the aeroplane jumps at the seam: at
// 14s over a 20s loop it ended 0.83 of the way up a cycle it started at zero.
let BOB_PX = arg("bob", 22), BOB_SEC = arg("bobSec", 10), PITCH = arg("pitch", -1.8)
let SEED   = UInt64(arg("seed", 7))
let DIR    = arg("dir", -1)   // -1 = world streams right, for nose-left art

let cs = CGColorSpaceCreateDeviceRGB()

// deterministic RNG — the same seed must always give the same sky
var rngState = SEED &* 6364136223846793005 &+ 1442695040888963407
func rnd() -> Double {
    rngState ^= rngState << 13; rngState ^= rngState >> 7; rngState ^= rngState << 17
    return Double(rngState % 100000) / 100000.0
}
func rnd(_ a: Double, _ b: Double) -> Double { a + (b - a) * rnd() }

func load(_ path: String) -> CGImage? {
    guard let im = NSImage(contentsOfFile: path) else { return nil }
    return im.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

// Sky, high key and pale — the reference is low contrast, not saturated.
let skyTop = (r: 0.16, g: 0.47, b: 0.82)
let skyBot = (r: 0.55, g: 0.78, b: 0.95)

// Haze + soften an element for its depth, once, and cache it.
var hazeCache: [String: CGImage] = [:]
func weathered(_ img: CGImage, _ key: String, haze: Double, blur: Int, whiten: Double = 0) -> CGImage {
    let ck = key + "|" + String(format: "%.2f", haze) + "|\(blur)|" + String(format: "%.2f", whiten)
    if let c = hazeCache[ck] { return c }
    let w = img.width, h = img.height
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                              space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return img }
    ctx.interpolationQuality = .high
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    guard let p = ctx.data?.bindMemory(to: UInt8.self, capacity: w * h * 4) else { return img }
    // toward the sky's own colour, not toward white: distance desaturates AND
    // tints, which is what makes a far cloud read as far rather than as faint.
    let hz = (r: skyTop.r * 0.35 + skyBot.r * 0.65, g: skyTop.g * 0.35 + skyBot.g * 0.65,
              b: skyTop.b * 0.35 + skyBot.b * 0.65)
    for i in stride(from: 0, to: w * h * 4, by: 4) {
        let a = Double(p[i+3]) / 255.0
        // Un-premultiplying divides by alpha, so at a=0.01 a stored value is
        // multiplied by 100. Left unchecked that lifts the near-transparent
        // skirt of an element into a visible wash across its whole bounding
        // box — which is the faint RECTANGLE in the sky, and it came from here
        // rather than from the crop or the feather. Anything this sheer is
        // cleared outright, and what survives is clamped before the blend.
        if a <= 0.035 { p[i] = 0; p[i+1] = 0; p[i+2] = 0; p[i+3] = 0; continue }
        let tgt = [hz.r, hz.g, hz.b]
        for c in 0..<3 {
            let v = max(0.0, min(1.0, Double(p[i+c]) / 255.0 / a))
            // WHITEN lifts the artwork's own shading toward white. Reducing
            // haze cannot do this: haze blends toward the SKY, so backing it
            // off leaves a grey cloud grey. The near layers need it because a
            // vector element's underside shading, correct at full size, reads
            // as a dark smudge once it is drawn small and passed across a
            // bright aeroplane.
            var out = max(0.0, min(1.0, v * (1 - haze) + tgt[c] * haze))
            out = out * (1 - whiten) + whiten
            p[i+c] = UInt8(max(0, min(255, out * a * 255)))
        }
    }
    if blur > 0 {
        var src = [UInt8](repeating: 0, count: w * h * 4)
        for i in 0..<(w * h * 4) { src[i] = p[i] }
        for y in 0..<h { for x in 0..<w {
            var acc = [Double](repeating: 0, count: 4); var n = 0.0
            for dy in -blur...blur { let yy = y + dy; if yy < 0 || yy >= h { continue }
                for dx in -blur...blur { let xx = x + dx; if xx < 0 || xx >= w { continue }
                    let j = (yy * w + xx) * 4
                    for c in 0..<4 { acc[c] += Double(src[j+c]) }; n += 1 } }
            let i = (y * w + x) * 4
            for c in 0..<4 { p[i+c] = UInt8(max(0, min(255, acc[c] / n))) }
        } }
    }
    let out = ctx.makeImage() ?? img
    hazeCache[ck] = out
    return out
}

struct Billboard { var img: CGImage; var wx: Double; var wy: Double; var depth: Double
                   var worldW: Double; var flip: Bool; var alpha: Double; var still: Bool; var sway: Double }

// ── build the world ──────────────────────────────────────────────────────────
// Each element is measured for COVERAGE — mean alpha over its box. A dense
// cumulus scores high, a torn wisp scores low. Bands then draw from a coverage
// range instead of picking at random, because a towering cumulus dropped into
// the nearest band at near-field scale is an enormous shape across the whole
// frame, in front of the aeroplane, which is exactly wrong for that layer.
func coverage(_ g: CGImage) -> Double {
    let w = min(g.width, 200), h = max(1, g.height * w / max(1, g.width))
    guard let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return 1 }
    c.draw(g, in: CGRect(x: 0, y: 0, width: w, height: h))
    guard let p = c.data?.bindMemory(to: UInt8.self, capacity: w * h * 4) else { return 1 }
    var sum = 0.0
    for i in stride(from: 0, to: w * h * 4, by: 4) { sum += Double(p[i+3]) / 255.0 }
    return sum / Double(w * h)
}
var srcs: [(String, CGImage, Double)] = []
for p in ELEMS.split(separator: ";").map(String.init) {
    if let g = load(p) { srcs.append((p, g, coverage(g))) }
}
guard !srcs.isEmpty else { print("no elements"); exit(1) }
for s in srcs.sorted(by: { $0.2 > $1.2 }) {
    FileHandle.standardError.write("  coverage \(String(format: "%.3f", s.2))  \((s.0 as NSString).lastPathComponent)\n".data(using: .utf8)!)
}

var world: [Billboard] = []
// depth bands: far deck, mid, near, and a couple of very near wisps that will
// pass in front of the aeroplane.
// Four layers, by speed and weight. Screen speed is FOCAL/depth, so depth is
// the only thing that sets it — a far cloud cannot be made to hurry and a near
// one cannot be made to dawdle. Sizes are world units, so the size a cloud
// APPEARS is worldW * FOCAL/depth; a big background cloud therefore needs a
// large world size to survive its own distance.
//
//   background  big, low AND along the top, barely moving
//   mid         big but not huge, a little faster
//   thin behind }  thin and quick, one just behind the aeroplane
//   thin front  }  and one in front of it — same character, nearer and faster
//
// The thin layers draw only from LOW-COVERAGE elements. That is what stops a
// towering cumulus being dropped in at near-field scale straight across the
// aircraft, which is what went wrong before.
// Four layers, by speed and weight. Screen speed is FOCAL/depth, so depth is
// the only thing that sets it — a far cloud cannot be made to hurry and a near
// one cannot be made to dawdle.
//
// THE BACKGROUND BANKS RUN OFF THE FRAME. A big cloud with its underside
// visible reads as an object floating in the middle of the picture; a bank
// whose bottom you never see reads as weather going on past the edges. The low
// band therefore sits far enough down that its lower half is off-frame, and
// the high band far enough up that its top is. At depth ~3200 the scale is
// about 0.31, so a world y of -850 puts the centre roughly 265px below the
// middle — below the half-height of the cloud itself, which is what takes the
// edge out of shot.
//
// THE THIN LAYERS CARRY THE TRAFFIC. They are what you actually notice passing,
// so they are the ones worth having several of; at 3 apiece the frame went
// quiet for long stretches between them.
// Four layers, by SIZE as well as speed. Screen speed is FOCAL/depth, so depth
// alone sets it.
//
//   bottom   BIG, dropped far enough that the underside runs off-frame
//   top      BIG, raised far enough that the top runs off-frame
//   middle   MEDIUM — this is the band the eye reads as "the sky", and big
//            clouds here make the picture feel like four objects rather than
//            weather. Roughly half the world size of the banks.
//   thin x2  one behind the aeroplane and one in front, and these have to be
//            SEEN. They were drawing from a coverage window of 0.03-0.26,
//            which matched only 3 of the 17 elements and the faintest at that,
//            at alphas down to 0.15 — so nothing appeared to pass at all. The
//            window is now 0.14-0.45 (ten elements) at much higher alpha.
// Layers by APPARENT size, which is worldW x (FOCAL/depth) — not by world
// size, which is the mistake that produced small clouds in the background.
// Setting a modest world size on a near layer still yields an enormous cloud,
// because a near layer is scaled up; the previous table had the front drawing
// at 452-748px while the middle drew at 205-332px, so the gradient ran
// backwards and the small forms appeared to be in the distance.
//
// The gradient must fall monotonically from back to front:
//
//   background   ~400-620 px   big banks, off-frame top and bottom
//   mid          ~300-460 px
//   thin behind  ~190-300 px   and kept near the aeroplane's own altitude
//   thin front   ~120-220 px   so that it CROSSES the aircraft rather than
//                              drifting past above or below it
// Layers by APPARENT size — worldW x (FOCAL/depth) — falling monotonically
// from back to front, because setting world sizes instead is what once made
// the front draw larger than the middle.
//
// COVERAGE IS WHAT KEEPS EACH KIND OF CLOUD IN ITS OWN LAYER, and the floor
// matters more than it looks. At 0.28 the banks could take p08 (0.281),
// p14_02 (0.285), p11 (0.303), p07 (0.362) and p10 (0.403) — every one a thin
// streaky element — and draw it at background scale. That is what put flat
// grey smears along the top of the frame. At 0.41 the banks get only real
// cumulus and the streaky elements go back to the thin layers, which is the
// only place they read correctly.
// Layers by APPARENT size — worldW x (FOCAL/depth) — falling from back to
// front. Setting world sizes instead is what once made the front draw larger
// than the middle.
//
// THE BIG CLOUDS LIVE AT THE BOTTOM ONLY. A matching bank along the top edge
// closes the frame in and leaves no sky; the upper half is carried by the
// MEDIUM band instead, which reaches high enough to put something up there
// without it being a wall. The bottom bank still sits low enough that its
// underside runs off-frame, so it reads as weather continuing past the edge
// rather than as an object.
//
// COVERAGE KEEPS EACH KIND IN ITS OWN LAYER. The banks take only elements at
// 0.41 and above — real cumulus. Below that are the thin streaky ones, which
// read as flat grey smears at background scale and belong in the thin layers.
//
// Counts are deliberately low. Every layer added a few and the sky closed up;
// 21 billboards against 32.
// Layers differ by SIZE and SPEED, not by kind of cloud. That distinction was
// got wrong for a while: the near layers were called "thin" and so were fed
// the low-coverage streaky elements, which drew as wispy smears. What a near
// layer wants is the SAME fluffy cumulus as everything else, simply drawn
// small and moving quickly. So every band now draws from the cumulus pool
// (coverage 0.40+) and the streaky elements go unused — they never suited
// this scene at any size.
//
// APPARENT size is worldW x (FOCAL/depth) and falls from back to front;
// setting world sizes instead once made the front draw larger than the middle.
//
// Big cloud is BOTTOM-ONLY — a matching bank on top closes the frame in and
// leaves no sky. The upper half is carried by the medium band.
// Each band NAMES the elements it may use. Coverage was standing in for
// "what kind of cloud is this", and it is a poor proxy: it cannot tell a soft
// smooth puff from a flat grey streak, and both sit around 0.25-0.30. Tuning
// the number kept swapping one wrong answer for another. These lists were
// chosen by looking at the elements.
//
//   BANK      the big textured cauliflower cumulus — back only, never in front
//   MEDIUM    mid-weight cumulus
//   NEAR      soft, smooth, light cloud WITH some body: no heavy texture,
//             because textured cumulus in front of the aeroplane reads as a
//             mass sitting on the lens, and no flat streaks either
//
// Deliberately unused: p14_01 and p14_02, the flat horizontal streaks. They
// smear at background scale and barely read as cloud in front.
let bankArt   = ["p04_01", "p05_01", "p02_01", "p06_01", "p09_01", "p13_03"]
let mediumArt = ["p01_01", "p03_01", "p13_01", "p10_01", "p07_01"]
// The Adobe Stock vector set, recovered from its checkerboard preview. Soft
// volumetric forms with real body and no hard bezier edge — the character the
// near layers want, which the photographic library only had in its thinnest
// and most streak-like elements.
let nearArt   = ["ai_01", "ai_02", "ai_03", "ai_04", "ai_05"]

let bands: [(n: Int, dLo: Double, dHi: Double, yLo: Double, yHi: Double,
             sLo: Double, sHi: Double, aLo: Double, aHi: Double,
             art: [String], whiten: Double, still: Bool, sway: Double)] = [
  // n   depth         height          world size    alpha         artwork     whiten  still
  //
  // MEASURED OFF THE REFERENCE: bottom bank ~1 px/s, top band ~2 px/s, veils
  // ~171 px/s, aircraft no bob. That is a STILL sky with thin veils passing
  // across the aeroplane — one moving layer, not five.
  //
  // A still layer must be drawn as still, not as a very slow scroller. The
  // loop works by repeating the world every PERIOD units and moving the
  // camera exactly one period; a layer pushed far back to slow it down also
  // has its period shrink on screen (2000 x 1000/30000 = 67px), and every
  // 500px cloud is then repeated every 67px — wallpaper. So the banks keep
  // their original depths for size and haze, and are simply placed once.
  ( 5, 2800, 3600, -1020, -720, 1300, 2000, 0.84, 0.97, bankArt,   0.05, true,  10),  // bank — still, gentle sway
  ( 5, 1700, 2400,  -360,  420,  620,  940, 0.58, 0.76, mediumArt, 0.18, true,  16),  // medium — still, a little more sway
  ( 4, 1150, 1350,  -140,  140,  150,  280, 0.36, 0.52, nearArt,   0.55, false,  0),  // thin veil, just BEHIND
  ( 6,  560,  610,  -140,  140,   64,  113, 0.30, 0.46, nearArt,   0.62, false,  0),  // thin veil, in FRONT — 171 px/s
]
for b in bands {
    for _ in 0..<b.n {
        // draw only from the elements this band names
        var pool = srcs.filter { s in b.art.contains(where: { (s.0 as NSString).lastPathComponent == $0 + ".png" }) }
        if pool.isEmpty { pool = srcs }
        let pick = pool[Int(rnd() * Double(pool.count)) % pool.count]
        let key = pick.0, img = pick.1
        let depth = rnd(b.dLo, b.dHi)
        // haze and softness grow with distance
        // depth is pushed far out to make the banks still, not to make them
        // distant-looking; cap the haze at the old 3400 so they stay white.
        let t = max(0, min(1, (depth - 400) / 3000))
        let hz = 0.10 + 0.62 * t
        let bl = depth > 2200 ? 2 : (depth > 1400 ? 1 : 0)
        world.append(Billboard(img: weathered(img, key, haze: hz, blur: bl, whiten: b.whiten),
                               wx: rnd(0, PERIOD), wy: rnd(b.yLo, b.yHi), depth: depth,
                               worldW: rnd(b.sLo, b.sHi), flip: rnd() < 0.5,
                               alpha: rnd(b.aLo, b.aHi), still: b.still, sway: b.sway))
    }
}
world.sort { $0.depth > $1.depth }          // far first

let planeImg = PLANEP.isEmpty ? nil : load(PLANEP)
let nFrames = Int(DUR * Double(FPS))

// ── encoder ──────────────────────────────────────────────────────────────────
try? FileManager.default.removeItem(atPath: OUTP)
let writer = try! AVAssetWriter(outputURL: URL(fileURLWithPath: OUTP), fileType: .mp4)
let vset: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: Int(arg("bitrate", 7_000_000)),
        AVVideoMaxKeyFrameIntervalKey: FPS * 2,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: vset)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input,
    sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
        kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func renderFrame(_ f: Int) -> CGImage {
    let t = Double(f) / Double(nFrames)          // 0..1 over exactly one period
    // DIRECTION. The aeroplane art is nose-LEFT, so it is travelling left, so
    // the world must stream RIGHTWARD past it. sx = W/2 + (wx - camX)*s, so a
    // camera whose x INCREASES pushes cloud left — the same way the nose
    // points, which reads as the aircraft being carried backwards. The camera
    // therefore moves in the negative direction. dir flips it for nose-right
    // artwork. The loop is unaffected either way: the world is periodic, so a
    // full period in either direction lands on an identical frame.
    let camX = DIR * t * PERIOD
    guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4,
                              space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { fatalError("ctx") }
    ctx.interpolationQuality = .high
    // sky
    let grad = CGGradient(colorsSpace: cs, colors: [
        CGColor(red: skyBot.r, green: skyBot.g, blue: skyBot.b, alpha: 1),
        CGColor(red: skyTop.r, green: skyTop.g, blue: skyTop.b, alpha: 1)] as CFArray,
        locations: [0, 1])!
    ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: H), options: [])

    var drewPlane = false
    func drawPlane() {
        guard let pi = planeImg, !drewPlane else { return }
        drewPlane = true
        let pw = Double(W) * PLANE_FRAC
        let ph = pw * Double(pi.height) / Double(pi.width)
        let bob = sin(Double(f) / Double(FPS) / BOB_SEC * 2 * Double.pi) * BOB_PX
        ctx.saveGState()
        ctx.translateBy(x: CGFloat(Double(W) / 2), y: CGFloat(Double(H) / 2 + bob))
        ctx.rotate(by: CGFloat(PITCH * Double.pi / 180))
        ctx.draw(pi, in: CGRect(x: -pw / 2, y: -ph / 2, width: pw, height: ph))
        ctx.restoreGState()
    }

    for b in world {
        if !drewPlane && b.depth < PLANE_DEPTH { drawPlane() }
        let s = FOCAL / b.depth
        let dw = b.worldW * s
        let dh = dw * Double(b.img.height) / Double(b.img.width)
        let sy = Double(H) / 2 + b.wy * s
        if b.still {
            // Fixed on screen, plus a SWAY: one sine over the whole loop, so it
            // is back where it started at the seam. Reads as the chase camera
            // drifting — the sky breathes without scrolling, which is what
            // keeps a still layer from wallpapering. Medium leads the banks by
            // a third of a cycle so the two do not move as one sheet.
            let ph = b.depth < 2600 ? 2.0 * Double.pi / 3.0 : 0.0
            let swx = b.sway * sin(2 * Double.pi * t + ph)
            let swy = b.sway * 0.3 * sin(2 * Double.pi * t + ph + 1.1)
            let sx = (b.wx / PERIOD) * Double(W) + swx
            let syS = sy + swy
            ctx.saveGState()
            ctx.setAlpha(CGFloat(b.alpha))
            if b.flip {
                ctx.translateBy(x: CGFloat(sx), y: 0); ctx.scaleBy(x: -1, y: 1)
                ctx.draw(b.img, in: CGRect(x: -dw / 2, y: syS - dh / 2, width: dw, height: dh))
            } else {
                ctx.draw(b.img, in: CGRect(x: sx - dw / 2, y: syS - dh / 2, width: dw, height: dh))
            }
            ctx.restoreGState()
            continue
        }
        // every copy of this cloud that lands on screen
        let base = camX - b.wx
        let kLo = Int(floor((base - (Double(W) / 2 + dw) / s) / PERIOD))
        let kHi = Int(ceil((base + (Double(W) / 2 + dw) / s) / PERIOD))
        if kLo > kHi { continue }
        for k in kLo...kHi {
            let sx = Double(W) / 2 + (b.wx + Double(k) * PERIOD - camX) * s
            if sx + dw / 2 < -2 || sx - dw / 2 > Double(W) + 2 { continue }
            ctx.saveGState()
            ctx.setAlpha(CGFloat(b.alpha))
            if b.flip {
                ctx.translateBy(x: CGFloat(sx), y: 0); ctx.scaleBy(x: -1, y: 1)
                ctx.draw(b.img, in: CGRect(x: -dw / 2, y: sy - dh / 2, width: dw, height: dh))
            } else {
                ctx.draw(b.img, in: CGRect(x: sx - dw / 2, y: sy - dh / 2, width: dw, height: dh))
            }
            ctx.restoreGState()
        }
    }
    drawPlane()
    return ctx.makeImage()!
}

var pool: CVPixelBufferPool?
CVPixelBufferPoolCreate(nil, nil, [
    kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
    kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H] as CFDictionary, &pool)

for f in 0..<nFrames {
    while !input.isReadyForMoreMediaData { usleep(3000) }
    let img = renderFrame(f)
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool!, &pb)
    guard let buf = pb else { continue }
    CVPixelBufferLockBaseAddress(buf, [])
    if let base = CVPixelBufferGetBaseAddress(buf),
       let bctx = CGContext(data: base, width: W, height: H, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: cs,
                            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                                      | CGBitmapInfo.byteOrder32Little.rawValue) {
        bctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
    }
    CVPixelBufferUnlockBaseAddress(buf, [])
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(f), timescale: CMTimeScale(FPS)))
    if f % 60 == 0 { FileHandle.standardError.write("frame \(f)/\(nFrames)\n".data(using: .utf8)!) }
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
print("\(OUTP)  \(W)x\(H)  \(nFrames) frames  \(DUR)s  loop=seamless  billboards=\(world.count)")
