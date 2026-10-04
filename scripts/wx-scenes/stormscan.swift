import AVFoundation
import Foundation
import CoreVideo

// Scan a WHOLE licensed source for lightning, to find windows a scene take
// can be cut from without breaking the general-flash limit.
//
// Geometry follows takes.swift exactly: the source is cover-cropped to the
// 1280x704 take frame. Here it is decoded at half that (640 wide) so one 8x8
// cell of the take is a 4x4 block here. Then, for each scene size the card
// draws (842x849 and the older 903x496, cover), the visible part is cut into
// 10-degree fields exactly as flashcheck.swift does (341x256 screen px, stride
// 3 cells), each field's mean relative luminance is run through the 0.10
// zig-zag (method F), and every completed swing is a transition.
//
// Output (TSV): one row per source frame:
//   t  meanY(visible, 842x849)  F842(1s)  F903(1s)  F842(0.65s) F903(0.65s) F842(0.5s) F903(0.5s)
// where Fxxx(w) = max over fields of transitions inside [t, t+w) of SOURCE
// time (w = 1 s at speed 1; 0.65/0.5 s of source fill one screen second when
// the take is slowed to that speed). Also writes <out>.events: every
// transition time (any field) per size, for listing strikes.
//
// Usage: stormscan <src> <out.tsv>
//
// RE-CUTTING A LIGHTNING SOURCE (how the v23943 storm-night takes were made):
//   1. stormscan <src> scan.tsv          whole source, both scene sizes
//   2. python3 windows.py scan.tsv       candidate windows per speed (1, 0.65, 0.5)
//   3. takes <src> <t0> <L> 1 <out.mp4> <speed>      cut it (takes.swift)
//   4. flashcheck <out.mp4> 842 849  and  903 496    F_field column
//      flashpairs <out.mp4> 842 849 1  and  903 496 1  (stride 1: every field)
//      the worst of the four must be 6 or fewer (three flashes)
//   5. tears <out.mp4>  then look at every flagged frame: a step held for many
//      frames on a cloud edge is structure; a one-to-three-frame band across
//      the width on a strike is a rolling-shutter tear, and the cut is dropped
//   6. record the four readings in tests/storm-night-flash-limit.test.js

let CELL = 4                      // 8 px of the 1280x704 take, at half scale
let TH = 0.10
func lin(_ c: Double) -> Double { let s = c / 255.0; return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4) }
var LUT = [Double](repeating: 0, count: 256); for i in 0..<256 { LUT[i] = lin(Double(i)) }

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let outPath = args[2]
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
var track: AVAssetTrack?
var natural = CGSize.zero
Task {
  track = try? await asset.loadTracks(withMediaType: .video).first
  if let t = track { natural = (try? await t.load(.naturalSize)) ?? .zero }
  sem.signal()
}
sem.wait()
guard let tr = track, natural.width > 0 else { print("NOTRACK"); exit(1) }
let OW = 640
let OH = Int((Double(OW) * Double(natural.height) / Double(natural.width) / 2).rounded()) * 2
let reader = try! AVAssetReader(asset: asset)
let out = AVAssetReaderTrackOutput(track: tr, outputSettings: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: OW, kCVPixelBufferHeightKey as String: OH])
out.alwaysCopiesSampleData = false
reader.add(out); reader.startReading()
// take frame at half scale: 640 x 352, centre crop of the decoded frame
let TW = 640, TH2 = 352
let GXT = TW / CELL, GYT = TH2 / CELL   // 160 x 88 cells of the take
var frames: [[Float]] = []
var times: [Double] = []
var cropX0 = 0, cropY0 = 0
while let sb = out.copyNextSampleBuffer() {
  guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
  let t = CMSampleBufferGetPresentationTimeStamp(sb).seconds
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
  // cover-crop to 1280:704
  let aspect = 1280.0 / 704.0
  var cw = Double(w), ch = Double(h)
  if cw / ch > aspect { cw = ch * aspect } else { ch = cw / aspect }
  let sx = cw / Double(TW), sy = ch / Double(TH2)
  cropX0 = Int((Double(w) - cw) / 2); cropY0 = Int((Double(h) - ch) / 2)
  let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
  var cells = [Float](repeating: 0, count: GXT * GYT)
  for cy in 0..<GYT { for cx in 0..<GXT {
    var s = 0.0; var c = 0
    for yy in 0..<CELL { for xx in 0..<CELL {
      let px = cropX0 + Int(Double(cx * CELL + xx) * sx), py = cropY0 + Int(Double(cy * CELL + yy) * sy)
      if px >= w || py >= h { continue }
      let p = base + py * bpr + px * 4
      s += 0.2126 * LUT[Int(p[2])] + 0.7152 * LUT[Int(p[1])] + 0.0722 * LUT[Int(p[0])]; c += 1
    } }
    cells[cy * GXT + cx] = Float(s / Double(max(c, 1)))
  } }
  CVPixelBufferUnlockBaseAddress(pb, .readOnly)
  frames.append(cells); times.append(t)
}
let n = frames.count
guard n > 10 else { print("NOFRAMES"); exit(1) }
let fps = Double(n - 1) / (times[n - 1] - times[0])

func zigzag(_ series: [Double]) -> [Int] {
  var tr: [Int] = []
  var trend = 0, pivot = series[0], lo = series[0], hi = series[0], loI = 0, hiI = 0, cand = series[0], candI = 0
  for f in 1..<series.count {
    let x = series[f]
    if trend == 0 {
      if x < lo { lo = x; loI = f }; if x > hi { hi = x; hiI = f }
      if hi - lo >= TH { if hiI > loI { trend = 1; pivot = lo; cand = hi; candI = hiI } else { trend = -1; pivot = hi; cand = lo; candI = loI } }
      continue
    }
    if trend == 1 { if x > cand { cand = x; candI = f } else if cand - x >= TH { if min(cand, pivot) < 0.8 { tr.append(candI) }; pivot = cand; trend = -1; cand = x; candI = f } }
    else { if x < cand { cand = x; candI = f } else if x - cand >= TH { if min(cand, pivot) < 0.8 { tr.append(candI) }; pivot = cand; trend = 1; cand = x; candI = f } }
  }
  if trend != 0 && abs(cand - pivot) >= TH && min(cand, pivot) < 0.8 { tr.append(candI) }
  return tr
}

struct SizeResult { var dens: [[Int]]; var events: [Int]; var meanY: [Double] }
func analyse(_ drawnW: Double, _ drawnH: Double) -> SizeResult {
  // take px (1280x704) -> screen: cover
  let SC = max(drawnW / 1280.0, drawnH / 704.0)
  let visW = drawnW / SC, visH = drawnH / SC
  let x0 = (1280.0 - visW) / 2, y0 = (704.0 - visH) / 2
  let C8 = 8.0
  let CX0 = Int(ceil(x0 / C8)), CY0 = Int(ceil(y0 / C8))
  let GX = Int(floor((x0 + visW) / C8)) - CX0
  let GY = Int(floor((y0 + visH) / C8)) - CY0
  let fW = max(1, min(GX, Int((341.0 / SC / C8).rounded())))
  let fH = max(1, min(GY, Int((256.0 / SC / C8).rounded())))
  // integral image per frame over the visible cell grid
  var meanY = [Double](repeating: 0, count: n)
  var fieldSeries: [[Double]] = []
  var fys: [Int] = []; var fy = 0; while fy + fH <= GY { fys.append(fy); fy += 3 }
  var fxs: [Int] = []; var fx = 0; while fx + fW <= GX { fxs.append(fx); fx += 3 }
  let nf = fys.count * fxs.count
  fieldSeries = [[Double]](repeating: [Double](repeating: 0, count: n), count: nf)
  for f in 0..<n {
    var I = [Double](repeating: 0, count: (GX + 1) * (GY + 1))
    for y in 0..<GY { var row = 0.0
      for x in 0..<GX { row += Double(frames[f][(y + CY0) * GXT + (x + CX0)]); I[(y + 1) * (GX + 1) + x + 1] = I[y * (GX + 1) + x + 1] + row } }
    meanY[f] = I[GY * (GX + 1) + GX] / Double(GX * GY)
    var k = 0
    for yy in fys { for xx in fxs {
      let s = I[(yy + fH) * (GX + 1) + xx + fW] - I[yy * (GX + 1) + xx + fW] - I[(yy + fH) * (GX + 1) + xx] + I[yy * (GX + 1) + xx]
      fieldSeries[k][f] = s / Double(fW * fH); k += 1
    } }
  }
  var trs: [[Int]] = []
  var all = Set<Int>()
  for k in 0..<nf { let t = zigzag(fieldSeries[k]); trs.append(t); for x in t { all.insert(x) } }
  var dens: [[Int]] = []
  for w in [1.0, 0.65, 0.5] {
    let win = Int((fps * w).rounded())
    var d = [Int](repeating: 0, count: n)
    for k in 0..<nf {
      let t = trs[k]; if t.isEmpty { continue }
      var j0 = 0
      for s in 0..<n {
        while j0 < t.count && t[j0] < s { j0 += 1 }
        var j1 = j0; while j1 < t.count && t[j1] < s + win { j1 += 1 }
        let c = j1 - j0
        if c > d[s] { d[s] = c }
      }
    }
    dens.append(d)
  }
  return SizeResult(dens: dens, events: all.sorted(), meanY: meanY)
}
let a = analyse(842, 849)
let b = analyse(903, 496)
var txt = "t\tmeanY\tF842_1\tF903_1\tF842_065\tF903_065\tF842_05\tF903_05\n"
for f in 0..<n {
  txt += String(format: "%.3f\t%.4f\t%d\t%d\t%d\t%d\t%d\t%d\n", times[f] - times[0], a.meanY[f], a.dens[0][f], b.dens[0][f], a.dens[1][f], b.dens[1][f], a.dens[2][f], b.dens[2][f])
}
try! txt.write(toFile: outPath, atomically: true, encoding: .utf8)
var ev = "fps\t\(fps)\nsrc\t\(Int(natural.width))x\(Int(natural.height))\n"
ev += "e842\t" + a.events.map { String(format: "%.3f", times[$0] - times[0]) }.joined(separator: " ") + "\n"
ev += "e903\t" + b.events.map { String(format: "%.3f", times[$0] - times[0]) }.joined(separator: " ") + "\n"
try! ev.write(toFile: outPath + ".events", atomically: true, encoding: .utf8)
print(String(format: "%@\t%dx%d\tframes=%d\tfps=%.2f\tdur=%.2fs\tmaxF842=%d\tmaxF903=%d", url.lastPathComponent, Int(natural.width), Int(natural.height), n, fps, times[n-1] - times[0] + 1/fps, a.dens[0].max()!, b.dens[0].max()!))
