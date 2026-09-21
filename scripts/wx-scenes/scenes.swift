// The generator for the studio monitor's weather loops
// (fids-current/logos/Backgrounds/video/wx-scene-*.mp4).
//
//   swiftc -O -o scenes scenes.swift && ./scenes <outdir> [one-scene-name]
//
// Needs only macOS (AVFoundation + CoreGraphics); no ffmpeg. Every motion is
// periodic in the 8-second loop, so the last frame hands to the first.
// Eight seamless weather loops for the studio monitor: cloud / rain / snow /
// storm, each by day and by night. 1280x704 (the screen's own 1.82), 8s, and
// every motion is periodic in those 8s so the last frame hands to the first.
import AVFoundation
import AppKit

let W = 1280, H = 704, FPS: Int32 = 30, DUR = 8.0
let cs = CGColorSpaceCreateDeviceRGB()
func C(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> CGColor { CGColor(red: r/255, green: g/255, blue: b/255, alpha: a) }
struct Rng { var s: UInt64
  init(_ seed: UInt64) { s = seed &* 6364136223846793005 &+ 1442695040888963407 }
  mutating func next() -> Double { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return Double(s % 1_000_000) / 1_000_000.0 } }
func fmod(_ a: Double, _ b: Double) -> Double { let r = a.truncatingRemainder(dividingBy: b); return r < 0 ? r + b : r }

func sky(_ ctx: CGContext, _ top: CGColor, _ mid: CGColor, _ bot: CGColor) {
  let g = CGGradient(colorsSpace: cs, colors: [top, mid, bot] as CFArray, locations: [0, 0.55, 1])!
  ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: Double(H)), end: CGPoint(x: 0, y: 0), options: [])
}
func glow(_ ctx: CGContext, _ cx: Double, _ cy: Double, _ r: Double, _ col: CGColor) {
  let g = CGGradient(colorsSpace: cs, colors: [col, col.copy(alpha: 0)!] as CFArray, locations: [0, 1])!
  ctx.drawRadialGradient(g, startCenter: CGPoint(x: cx, y: cy), startRadius: 0, endCenter: CGPoint(x: cx, y: cy), endRadius: r, options: [])
}
// a soft cloud: three overlapping discs on a rounded base, drawn twice (shadow + body)
func puff(_ ctx: CGContext, _ x: Double, _ y: Double, _ s: Double, _ body: CGColor, _ shade: CGColor) {
  func discs(_ dx: Double, _ dy: Double, _ col: CGColor) {
    ctx.setFillColor(col)
    ctx.fill(CGRect(x: x - s + dx, y: y - 0.22*s + dy, width: 2*s, height: 0.5*s))
    for (lx, ly, r) in [(-0.5, 0.05, 0.42), (0.05, 0.22, 0.6), (0.55, 0.02, 0.4)] {
      ctx.fillEllipse(in: CGRect(x: x + lx*s - r*s + dx, y: y + ly*s - r*s + dy, width: 2*r*s, height: 2*r*s))
    }
  }
  discs(0, -0.06*s, shade); discs(0, 0, body)
}
func clouds(_ ctx: CGContext, _ t: Double, _ body: CGColor, _ shade: CGColor, _ n: Int, _ seed: UInt64, _ yLo: Double, _ yHi: Double) {
  var r = Rng(seed)
  for i in 0..<n {
    let s = 70 + r.next()*90, y0 = yLo + r.next()*(yHi - yLo), x0 = r.next()*Double(W)
    let span = Double(W) + 2.6*s
    let k = Double(1 + i % 2)                      // one or two crossings per loop → seamless
    let x = fmod(x0 + span*k*t/DUR, span) - 1.3*s
    puff(ctx, x, y0, s, body, shade)
  }
}
func rain(_ ctx: CGContext, _ t: Double, _ col: CGColor, _ n: Int, _ seed: UInt64, _ slant: Double) {
  var r = Rng(seed)
  ctx.setStrokeColor(col); ctx.setLineCap(.round)
  for _ in 0..<n {
    let x0 = r.next()*Double(W)*1.2 - 0.1*Double(W), y0 = r.next()*Double(H), len = 26 + r.next()*30
    let k = Double(2 + Int(r.next()*3))            // 2–4 falls per loop
    let span = Double(H) + len + 40
    let y = Double(H) + len - fmod(y0 + span*k*t/DUR, span)   // falling = y decreasing in CG space
    let x = x0 + (Double(H) - y)*slant
    ctx.setLineWidth(1.2 + r.next()*1.4)
    ctx.move(to: CGPoint(x: x, y: y)); ctx.addLine(to: CGPoint(x: x - len*slant, y: y + len)); ctx.strokePath()
  }
}
func snow(_ ctx: CGContext, _ t: Double, _ col: CGColor, _ n: Int, _ seed: UInt64) {
  var r = Rng(seed)
  ctx.setFillColor(col)
  for _ in 0..<n {
    let x0 = r.next()*Double(W), y0 = r.next()*Double(H), rad = 1.6 + r.next()*3.2
    let k = Double(1 + Int(r.next()*2)), span = Double(H) + 24
    let y = Double(H) + 12 - fmod(y0 + span*k*t/DUR, span)
    let sw = (8 + r.next()*14) * sin(2*Double.pi*(Double(1 + Int(r.next()*2))*t/DUR) + r.next()*6.28)
    ctx.fillEllipse(in: CGRect(x: x0 + sw - rad, y: y - rad, width: 2*rad, height: 2*rad))
  }
}
func bolt(_ ctx: CGContext, _ x: Double, _ seed: UInt64) {
  var r = Rng(seed)
  ctx.setStrokeColor(C(255, 250, 230, 0.95)); ctx.setLineWidth(3); ctx.setLineCap(.round); ctx.setLineJoin(.round)
  var px = x, py = Double(H) - 40
  ctx.move(to: CGPoint(x: px, y: py))
  while py > Double(H)*0.25 { px += (r.next() - 0.5)*90; py -= 50 + r.next()*40; ctx.addLine(to: CGPoint(x: px, y: py)) }
  ctx.strokePath()
}
func flash(_ t: Double, _ at: Double) -> Double { let d = t - at; return (d >= 0 && d < 0.35) ? (1 - d/0.35) : 0 }

typealias Draw = (CGContext, Double) -> Void
let scenes: [(String, Draw)] = [
  ("wx-scene-cloud-day", { ctx, t in
    sky(ctx, C(122, 178, 236), C(168, 208, 246), C(214, 232, 250))
    glow(ctx, 1080, 560, 300, C(255, 246, 200, 0.55))
    clouds(ctx, t, C(232, 240, 250), C(196, 212, 232), 5, 11, 200, 520)
    clouds(ctx, t, C(250, 253, 255), C(214, 226, 242), 4, 23, 120, 460) }),
  ("wx-scene-cloud-night", { ctx, t in
    sky(ctx, C(8, 18, 44), C(16, 32, 68), C(28, 46, 84))
    var r = Rng(5); ctx.setFillColor(C(255, 255, 255, 0.85))
    for _ in 0..<90 { let x = r.next()*Double(W), y = 300 + r.next()*400, s = 0.8 + r.next()*1.4; ctx.fillEllipse(in: CGRect(x: x, y: y, width: s, height: s)) }
    glow(ctx, 1000, 540, 170, C(255, 244, 214, 0.35)); ctx.setFillColor(C(255, 246, 222)); ctx.fillEllipse(in: CGRect(x: 962, y: 502, width: 76, height: 76))
    clouds(ctx, t, C(58, 76, 108), C(34, 48, 76), 5, 31, 180, 500)
    clouds(ctx, t, C(84, 104, 138), C(54, 70, 100), 3, 47, 100, 420) }),
  ("wx-scene-rain-day", { ctx, t in
    sky(ctx, C(96, 112, 134), C(140, 156, 176), C(178, 190, 204))
    clouds(ctx, t, C(126, 140, 160), C(96, 108, 128), 6, 71, 420, 640)
    rain(ctx, t, C(226, 236, 248, 0.62), 420, 13, 0.18) }),
  ("wx-scene-rain-night", { ctx, t in
    sky(ctx, C(10, 16, 30), C(22, 32, 54), C(38, 50, 74))
    clouds(ctx, t, C(44, 56, 80), C(26, 36, 56), 6, 71, 420, 640)
    rain(ctx, t, C(168, 196, 236, 0.55), 420, 13, 0.18) }),
  ("wx-scene-snow-day", { ctx, t in
    sky(ctx, C(176, 190, 206), C(206, 216, 228), C(232, 238, 244))
    clouds(ctx, t, C(222, 228, 236), C(196, 206, 218), 4, 91, 440, 640)
    snow(ctx, t, C(255, 255, 255, 0.92), 260, 17) }),
  ("wx-scene-snow-night", { ctx, t in
    sky(ctx, C(14, 24, 48), C(28, 42, 72), C(44, 60, 92))
    clouds(ctx, t, C(52, 66, 96), C(34, 46, 72), 4, 91, 440, 640)
    snow(ctx, t, C(255, 255, 255, 0.9), 260, 17) }),
  ("wx-scene-storm-day", { ctx, t in
    let f = max(flash(t, 2.1), flash(t, 2.32), flash(t, 5.7))
    sky(ctx, C(52, 60, 78), C(84, 94, 112), C(116, 126, 142))
    clouds(ctx, t, C(74, 82, 100), C(48, 56, 72), 7, 71, 400, 640)
    if f > 0 { ctx.setFillColor(C(255, 252, 240, 0.55*f)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H)); if f > 0.5 { bolt(ctx, t < 4 ? 420 : 860, t < 4 ? 3 : 9) } }
    rain(ctx, t, C(220, 230, 244, 0.6), 520, 13, 0.28) }),
  ("wx-scene-storm-night", { ctx, t in
    let f = max(flash(t, 2.1), flash(t, 2.32), flash(t, 5.7))
    sky(ctx, C(4, 8, 18), C(12, 18, 34), C(24, 32, 52))
    clouds(ctx, t, C(28, 36, 56), C(16, 22, 38), 7, 71, 400, 640)
    if f > 0 { ctx.setFillColor(C(236, 240, 255, 0.7*f)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H)); if f > 0.5 { bolt(ctx, t < 4 ? 420 : 860, t < 4 ? 3 : 9) } }
    rain(ctx, t, C(170, 196, 240, 0.55), 520, 13, 0.28) }),
]

let outDir = CommandLine.arguments[1]
let only = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : ""
for (name, draw) in scenes where only.isEmpty || name == only {
  let path = "\(outDir)/\(name).mp4"; try? FileManager.default.removeItem(atPath: path)
  let writer = try! AVAssetWriter(url: URL(fileURLWithPath: path), fileType: .mp4)
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_200_000, AVVideoMaxKeyFrameIntervalKey: 60]])
  input.expectsMediaDataInRealTime = false
  let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB), kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
  writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
  let total = Int(DUR * Double(FPS)); var i = 0
  while i < total {
    guard input.isReadyForMoreMediaData else { usleep(2000); continue }
    var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb); guard let buf = pb else { break }
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.setAllowsAntialiasing(true); ctx.setShouldAntialias(true)
    draw(ctx, Double(i)/Double(FPS))
    CVPixelBufferUnlockBaseAddress(buf, [])
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: FPS)); i += 1
  }
  input.markAsFinished(); let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
  let sz = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? Int) ?? 0
  print("\(name): \(i) frames, \(sz/1024) KB, \(writer.status == .completed ? "OK" : "FAILED")"); fflush(stdout)
}
