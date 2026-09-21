// Cuts one licensed weather clip into a scene take for the board's monitor:
// cover-cropped to 1280 x 704 (the 1.82 letterbox the scene plays in), H.264,
// 30 fps, and looped with a crossfade seam rather than forward-and-back —
// rain and snow played backwards fall upwards, which is the one thing a
// weather scene must never do. The last X seconds of the source window are
// faded into the first X, so the clip lands back on its own first frame.
//
//   swiftc -O -o takes takes.swift
//   ./takes <src> <t0|auto> <L> <X> <out.mp4> [speed]
//     speed  1 = as shot; 0.5 = half speed. Below 1 the source is sampled at
//            fractional frames and the two neighbours are BLENDED, so the
//            slow-down is smooth rather than a stutter of repeated frames,
//            and close-up rain reads softer instead of harsher.
//     t0   start in the source, or "auto": find the biggest brightness jump
//          (a lightning flash) and start the window 2.5s before it.
//     L    loop length written, seconds.   X  crossfade, seconds.
import AppKit
import AVFoundation
let args = CommandLine.arguments
let src = args[1], L = Double(args[3])!, X = Double(args[4])!, out = args[5]
let SPEED = args.count > 6 ? (Double(args[6]) ?? 1.0) : 1.0
let PW = 1280, PH = 704, FPS: Int32 = 30
let asset = AVURLAsset(url: URL(fileURLWithPath: src))
let sem0 = DispatchSemaphore(value: 0); var dur = 0.0
Task { dur = (try? await asset.load(.duration).seconds) ?? 0; sem0.signal() }; sem0.wait()
guard dur > 1 else { print("{\"error\":\"unreadable\"}"); exit(1) }

func gen(_ maxPx: CGFloat) -> AVAssetImageGenerator {
  let g = AVAssetImageGenerator(asset: asset); g.appliesPreferredTrackTransform = true
  g.requestedTimeToleranceBefore = .zero; g.requestedTimeToleranceAfter = .zero
  g.maximumSize = CGSize(width: maxPx, height: maxPx); return g
}
func luma(_ cg: CGImage) -> Double {
  let w = cg.width, h = cg.height; var buf = [UInt8](repeating: 0, count: w * h)
  let cs = CGColorSpaceCreateDeviceGray()
  guard let c = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: cs, bitmapInfo: 0) else { return 0 }
  c.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
  return buf.reduce(0.0) { $0 + Double($1) } / Double(max(1, w * h))
}
var t0: Double
if args[2] == "auto" {
  let g = gen(96); var prev = -1.0, bestAt = 0.0, bestJump = -1.0; var t = 0.0
  while t < dur { if let cg = try? g.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) {
      let v = luma(cg); if prev >= 0 && v - prev > bestJump { bestJump = v - prev; bestAt = t }; prev = v }
    t += 0.25 }
  t0 = bestAt - 2.5
} else { t0 = Double(args[2])! }
let NEED = (L + X) * SPEED                       // source seconds the loop consumes
t0 = max(0, min(t0, dur - NEED - 0.05))
guard dur - t0 >= NEED else { print("{\"error\":\"too short\",\"seconds\":\(dur)}"); exit(1) }
// source frame interval, for blending between neighbours when slowed
var srcFps = 30.0
do { let sem1 = DispatchSemaphore(value: 0)
  Task { if let t = try? await asset.loadTracks(withMediaType: .video).first, let r = try? await t.load(.nominalFrameRate), r > 1 { srcFps = Double(r) }; sem1.signal() }
  sem1.wait() }
let FI = 1.0 / srcFps

let g = gen(2560)
try? FileManager.default.removeItem(atPath: out)
let writer = try! AVAssetWriter(url: URL(fileURLWithPath: out), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: PW, AVVideoHeightKey: PH,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 2_800_000, AVVideoMaxKeyFrameIntervalKey: 60,
                                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB),
  kCVPixelBufferWidthKey as String: PW, kCVPixelBufferHeightKey as String: PH])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let cs = CGColorSpaceCreateDeviceRGB()
func frame(_ t: Double) -> CGImage? { try? g.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) }
// Draw source time τ into ctx over rect r at alpha a. At full speed that is
// one frame. Slowed, τ falls between two source frames: draw the earlier one,
// then the later one at the fractional weight, so motion is smoothed.
func drawSrc(_ ctx: CGContext, _ tau: Double, _ r: CGRect, _ a: CGFloat) -> Bool {
  if SPEED >= 0.999 {
    guard let cg = frame(tau) else { return false }
    ctx.setAlpha(a); ctx.draw(cover(cg), in: r); ctx.setAlpha(1); return true
  }
  let k = floor(tau / FI); let frac = tau / FI - k
  let tA = k * FI + FI * 0.5, tB = tA + FI          // frame centres
  guard let A = frame(tA) else { return false }
  ctx.setAlpha(a); ctx.draw(cover(A), in: r)
  if frac > 0.02, let B = frame(tB) { ctx.setAlpha(a * CGFloat(frac)); ctx.draw(cover(B), in: r) }
  ctx.setAlpha(1); return true
}
func cover(_ cg: CGImage) -> CGImage {
  let Wd = CGFloat(cg.width), Hd = CGFloat(cg.height), aspect = CGFloat(PW) / CGFloat(PH)
  var cw = Wd, ch = Hd; if Wd / Hd > aspect { cw = Hd * aspect } else { ch = Wd / aspect }
  return cg.cropping(to: CGRect(x: (Wd - cw) / 2, y: (Hd - ch) / 2, width: cw, height: ch)) ?? cg
}
let n = Int(L * Double(FPS)); var written = 0, missed = 0
for i in 0..<n {
  while !input.isReadyForMoreMediaData { usleep(1500) }
  let t = Double(i) / Double(FPS)
  var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb); guard let buf = pb else { break }
  CVPixelBufferLockBaseAddress(buf, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: PW, height: PH, bitsPerComponent: 8,
                      bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  ctx.interpolationQuality = .high
  let r = CGRect(x: 0, y: 0, width: PW, height: PH)
  if t < X {
    // the seam: the tail beyond the loop fades into the head
    let a = CGFloat(t / X)
    if !drawSrc(ctx, t0 + (L + t) * SPEED, r, 1) { missed += 1 }
    if !drawSrc(ctx, t0 + t * SPEED, r, a) { missed += 1 }
  } else if !drawSrc(ctx, t0 + t * SPEED, r, 1) { missed += 1 }
  CVPixelBufferUnlockBaseAddress(buf, [])
  adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: FPS)); written += 1
}
input.markAsFinished(); let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
let ok = writer.status == .completed
let size = (try? FileManager.default.attributesOfItem(atPath: out)[.size] as? Int) ?? 0
print("{\"ok\":\(ok),\"t0\":\(String(format: "%.2f", t0)),\"loop\":\(L),\"frames\":\(written),\"missed\":\(missed),\"bytes\":\(size),\"src_seconds\":\(String(format: "%.1f", dur)),\"speed\":\(SPEED)}")
