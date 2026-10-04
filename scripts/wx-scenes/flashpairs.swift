import AVFoundation
import Foundation
import CoreVideo

// General-flash count, frame PAIRS (WCAG 2.3.1 / ITU-R BT.1702), measured on the
// DECODED clip. The second, independent check beside flashcheck.swift.
//
// For every 10-degree field (341x256 screen px, at the scale the clip is drawn
// on a 1680x1050 board) and every 1 s window (the loop seam included), find the
// longest chain of frames f0 < f1 < ... < fk inside the window where each step
// f(m) -> f(m+1) is a qualifying transition:
//   * at least 25% of the field's 8x8 cells change by >= 0.10 relative
//     luminance in the same direction, the darker side below 0.80, and
//   * the field's MEAN luminance moves the same way by at least 0.025 (25% of
//     the field x 0.10, the least any qualifying flash can move it). Texture
//     sliding past (clouds over stars, rain) lights some cells and darkens
//     others and leaves the mean flat; a flash does not. Without this gate a
//     fast cloud timelapse reads as ten transitions a second.
// Directions alternate. k is the transition count; a flash is a pair, so more
// than three flashes is k > 6, and that fails.
//
// Usage: swiftc -O flashpairs.swift -o flashpairs
//        ./flashpairs <clip.mp4> <drawnW> <drawnH> [fieldStride=3] [meanGate=0.025] [speed=1]
//   the weather card draws its scene at 842 x 849 on a 1680x1050 board.
//   speed < 1 plays the cut slower, blending neighbour frames as takes.swift
//   does, to size a proposed slow-down before re-cutting anything.

let CELL = 8
let TH: Float = 0.10
func lin(_ c: Double) -> Double { let s = c / 255.0; return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4) }
var LUT = [Float](repeating: 0, count: 256); for i in 0..<256 { LUT[i] = Float(lin(Double(i))) }

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let drawnW = Double(args[2])!, drawnH = Double(args[3])!
let STRIDE = args.count > 4 ? Int(args[4])! : 3
// The mean gate (see the header); 0 turns it off.
let MEANGATE: Float = args.count > 5 ? Float(args[5])! : 0.025
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
var track: AVAssetTrack?
Task { track = try? await asset.loadTracks(withMediaType: .video).first; sem.signal() }
sem.wait()
guard let tr = track else { print("NOTRACK"); exit(1) }
let reader = try! AVAssetReader(asset: asset)
let out = AVAssetReaderTrackOutput(track: tr, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(out); reader.startReading()
var frames: [[Float]] = []
var times: [Double] = []
var GX = 0, GY = 0, CX0 = 0, CY0 = 0
var SC = 1.0
while let sb = out.copyNextSampleBuffer() {
  guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
  times.append(CMSampleBufferGetPresentationTimeStamp(sb).seconds)
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
  if GX == 0 {
    SC = max(drawnW / Double(w), drawnH / Double(h))
    let visW = drawnW / SC, visH = drawnH / SC
    let x0 = (Double(w) - visW) / 2, y0 = (Double(h) - visH) / 2
    CX0 = Int(ceil(x0 / Double(CELL))); CY0 = Int(ceil(y0 / Double(CELL)))
    GX = Int(floor((x0 + visW) / Double(CELL))) - CX0
    GY = Int(floor((y0 + visH) / Double(CELL))) - CY0
  }
  let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
  var cells = [Float](repeating: 0, count: GX * GY)
  for cy in 0..<GY { for cx in 0..<GX {
    var s: Float = 0; var c = 0
    let sy0 = (cy + CY0) * CELL, sx0 = (cx + CX0) * CELL
    var y = sy0
    while y < sy0 + CELL { var x = sx0
      while x < sx0 + CELL { let p = base + y * bpr + x * 4
        s += 0.2126 * LUT[Int(p[2])] + 0.7152 * LUT[Int(p[1])] + 0.0722 * LUT[Int(p[0])]; c += 1; x += 2 }
      y += 2 }
    cells[cy * GX + cx] = s / Float(c)
  } }
  CVPixelBufferUnlockBaseAddress(pb, .readOnly)
  frames.append(cells)
}
// SPEED < 1: play the cut slower, blending neighbour frames (as takes.swift does).
let SPEED: Double = args.count > 6 ? Double(args[6])! : 1
if SPEED < 1 {
  let m0 = frames.count, m = Int(Double(m0) / SPEED)
  var nf: [[Float]] = []
  for k in 0..<m {
    let src = Double(k) * SPEED; let i0 = Int(src); let w = Float(src - Double(i0))
    let a = frames[i0 % m0], b = frames[(i0 + 1) % m0]
    var c = [Float](repeating: 0, count: a.count)
    for j in 0..<a.count { c[j] = (1 - w) * a[j] + w * b[j] }
    nf.append(c)
  }
  let dt = times[1] - times[0]
  frames = nf; times = (0..<m).map { Double($0) * dt }
}
let n0 = frames.count
let fps = Double(n0 - 1) / (times[n0 - 1] - times[0])
let WIN = Int(fps.rounded())          // frames in a 1 s window
let fW = max(1, min(GX, Int((341.0 / SC / Double(CELL)).rounded())))
let fH = max(1, min(GY, Int((256.0 / SC / Double(CELL)).rounded())))
let need = Int(ceil(0.25 * Double(fW * fH)))

var bestK = 0, bestAt = 0.0, bestField = (0, 0), bestChain: [Int] = []
var fy = 0
var ys: [Int] = []; while fy + fH <= GY { ys.append(fy); fy += STRIDE }; if ys.last! != GY - fH { ys.append(GY - fH) }
var xs: [Int] = []; var fx0 = 0; while fx0 + fW <= GX { xs.append(fx0); fx0 += STRIDE }; if xs.last! != GX - fW { xs.append(GX - fW) }
// q[i][d] : +1 up qualifies, -1 down qualifies, 0 none (both cannot exceed 50%+... keep both bits)
for fy in ys { for fx in xs {
  var idx: [Int] = []
  for y in fy..<(fy + fH) { for x in fx..<(fx + fW) { idx.append(y * GX + x) } }
  var fm = [Float](repeating: 0, count: n0)
  for i in 0..<n0 { var t: Float = 0; for c in idx { t += frames[i][c] }; fm[i] = t / Float(idx.count) }
  var up = [[Bool]](repeating: [Bool](repeating: false, count: WIN), count: n0)
  var dn = [[Bool]](repeating: [Bool](repeating: false, count: WIN), count: n0)
  for i in 0..<n0 {
    let a = frames[i]
    for d in 1..<WIN {
      let b = frames[(i + d) % n0]
      var u = 0, v = 0
      for c in idx {
        let x = a[c], z = b[c]
        let df = z - x
        if df >= TH { if x < 0.8 { u += 1 } } else if df <= -TH { if z < 0.8 { v += 1 } }
      }
      let dm = fm[(i + d) % n0] - fm[i]
      up[i][d] = u >= need && (MEANGATE <= 0 || dm >= MEANGATE)
      dn[i][d] = v >= need && (MEANGATE <= 0 || dm <= -MEANGATE)
    }
  }
  for s in 0..<n0 {
    // dpU[t], dpD[t]: longest chain (transitions) ending at frame s+t with last dir up/down
    var dpU = [Int](repeating: -1, count: WIN), dpD = [Int](repeating: -1, count: WIN)
    var prU = [Int](repeating: -1, count: WIN), prD = [Int](repeating: -1, count: WIN)
    for t in 1..<WIN {
      for u in 0..<t {
        let i = (s + u) % n0, d = t - u
        if up[i][d] { let base = max(0, dpD[u]); if base + 1 > dpU[t] { dpU[t] = base + 1; prU[t] = u } }
        if dn[i][d] { let base = max(0, dpU[u]); if base + 1 > dpD[t] { dpD[t] = base + 1; prD[t] = u } }
      }
      let k = max(dpU[t], dpD[t])
      if k > bestK {
        bestK = k; bestAt = Double(s) / fps; bestField = (fx, fy)
        // reconstruct
        var chain: [Int] = [t]; var cur = t; var dirUp = dpU[t] >= dpD[t]
        while true {
          let p = dirUp ? prU[cur] : prD[cur]
          if p < 0 { break }
          chain.append(p)
          let prevLen = dirUp ? dpD[p] : dpU[p]
          if prevLen <= 0 { break }
          cur = p; dirUp.toggle()
        }
        bestChain = chain.reversed().map { (s + $0) % n0 }
      }
    }
  }
} }
let verdict = bestK > 6 ? "FAIL" : "pass"
print(String(format: "%@\tfps=%.2f frames=%d field=%dx%d cells (need %d)\tmaxTransitions1s=%d (%.1f flashes) @%.2fs field(%d,%d)\t%@\tchain=[%@]",
  url.lastPathComponent, fps, n0, fW, fH, need, bestK, Double(bestK) / 2, bestAt, bestField.0, bestField.1, verdict,
  bestChain.map { String(format: "%.2f", Double($0) / fps) }.joined(separator: " ")))
