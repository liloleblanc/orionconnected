// The generator for the studio set loop (fids-current/logos/Backgrounds/video/wx-studio-set.mp4):
// the steady stretch of the licensed studio clip, cover-cropped to the panel's
// 976 x 857, the monitor's green keyed to opaque navy (the scene loop plays over
// that rectangle on the board), played forward then back so the loop has no seam.
//
//   swiftc -O -o setloop setloop.swift && ./setloop <clip.mp4> 17.0 20.8 wx-studio-set.mp4
//
// The source clip is not in the repository (Vecteezy Pro licence); the loop is.
import AppKit
let src = CommandLine.arguments[1]; let t0 = Double(CommandLine.arguments[2])!; let t1 = Double(CommandLine.arguments[3])!
let out = CommandLine.arguments[4]
let PW = 976, PH = 857, FPS: Int32 = 30
let a = AVURLAsset(url: URL(fileURLWithPath: src))
let g = AVAssetImageGenerator(asset: a); g.appliesPreferredTrackTransform = true
g.requestedTimeToleranceBefore = .zero; g.requestedTimeToleranceAfter = .zero
g.maximumSize = CGSize(width: 1953, height: 1714)     // half the 4K source is plenty for 976 wide
let cs = CGColorSpaceCreateDeviceRGB()
func greenness(_ r: Int, _ gg: Int, _ b: Int) -> Double { let d = Double(gg - max(r, b)); return d <= 14 ? 0 : min(1, (d - 14) / 30) }
try? FileManager.default.removeItem(atPath: out)
let writer = try! AVAssetWriter(url: URL(fileURLWithPath: out), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: PW, AVVideoHeightKey: PH,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_600_000, AVVideoMaxKeyFrameIntervalKey: 60]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32ARGB), kCVPixelBufferWidthKey as String: PW, kCVPixelBufferHeightKey as String: PH])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let F = Int((t1 - t0) * Double(FPS)); let total = 2 * F
var i = 0, minX = PW, maxX = -1, minY = PH, maxY = -1
while i < total {
  guard input.isReadyForMoreMediaData else { usleep(2000); continue }
  let k = i < F ? i : (2 * F - 1 - i)                         // forward, then back
  let t = t0 + Double(k) / Double(FPS)
  guard let cg = try? g.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) else { i += 1; continue }
  let W = CGFloat(cg.width), H = CGFloat(cg.height), aspect = CGFloat(PW) / CGFloat(PH)
  var cw = W, ch = H; if W / H > aspect { cw = H * aspect } else { ch = W / aspect }
  let crop = cg.cropping(to: CGRect(x: (W - cw) / 2, y: (H - ch) / 2, width: cw, height: ch))!
  var pb: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb); guard let buf = pb else { break }
  CVPixelBufferLockBaseAddress(buf, [])
  let rb = CVPixelBufferGetBytesPerRow(buf)
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: PW, height: PH, bitsPerComponent: 8, bytesPerRow: rb, space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
  ctx.interpolationQuality = .high
  ctx.draw(crop, in: CGRect(x: 0, y: 0, width: PW, height: PH))
  let p = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)   // ARGB
  for y in 0..<PH { for x in 0..<PW {
    let o = y * rb + x * 4
    let r = Int(p[o+1]), gg = Int(p[o+2]), b = Int(p[o+3])
    let kk = greenness(r, gg, b)
    if kk > 0 {
      p[o+1] = UInt8(Double(r) * (1 - kk) + 6 * kk); p[o+2] = UInt8(min(Double(gg), Double(r + b) / 2 + 10) * (1 - kk) + 21 * kk); p[o+3] = UInt8(Double(b) * (1 - kk) + 44 * kk)
      if kk > 0.6 && i == 0 { if x < minX { minX = x }; if x > maxX { maxX = x }; if y < minY { minY = y }; if y > maxY { maxY = y } }
    }
  } }
  CVPixelBufferUnlockBaseAddress(buf, [])
  adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: FPS)); i += 1
}
input.markAsFinished(); let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
// the buffer is bottom-up in CG terms? No — CVPixelBuffer rows are top-down; y here is top-down.
print("frames \(i)  loop \(Double(total)/Double(FPS))s  screen (top-left px, first frame): x \(minX)…\(maxX) y \(minY)…\(maxY)  status \(writer.status == .completed ? "OK" : "FAILED")")
