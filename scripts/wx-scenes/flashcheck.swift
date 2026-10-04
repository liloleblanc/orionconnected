import AVFoundation
import Foundation
import CoreVideo

// General-flash count per WCAG 2.3.1 / ITU-R BT.1702, measured on the DECODED clip.
//
//  * Every frame is decoded (AVAssetReader, BGRA) and cut into CELL x CELL pixel cells;
//    a cell's relative luminance is the mean of the WCAG sRGB->linear Y of its pixels.
//  * Per cell, a TRANSITION is a swing between consecutive luminance extrema of
//    >= 0.10 (10% of max relative luminance) whose darker end is < 0.80 (zig-zag
//    with a 0.10 reversal threshold, so a sub-threshold wobble never splits one
//    swing in two). Only the ACTIVE part of the swing is kept: from the last
//    frame within 10% of its start to the first frame within 10% of its end, so
//    a long flat dark stretch is not counted as part of the flash.
//  * Concurrent area at frame f = the cells whose up (or down) transition is in
//    progress at f. A run of frames whose area clears the area rule is ONE
//    transition (event) of that direction.
//  * The clip plays with `loop`, so the series is tiled 3x and every 1 s window
//    that starts in the middle copy is counted (windows straddle the seam).
//  * A flash is a pair of opposing transitions; the limit is 3 flashes = 6
//    transitions in any 1 s, so 7 or more fails. Reported two ways:
//      raw  = every qualifying transition event;
//      alt  = consecutive same-direction events folded into one (a strict
//             "pair of OPPOSING changes" reading); C's PASS/FAIL is on alt.
//
// Two methods, both reported; F is the verdict:
//  F  the MEAN luminance of each 10-degree field through the same 0.10 zig-zag
//     (robust to noise and sparkle; no false alarms on the calm takes).
//  C  per cell, as above, with the concurrent-area rules below.
// Area rules for C (all three reported):
//  A  >= 25% of the whole clip frame.
//  B  >= 21,824 screen px combined, at the size the clip is drawn on a
//     1680x1050 board (drawnW x drawnH on the command line).
//  C  >= 25% of ANY 10-degree field: a 341x256 screen-px window (the standard's
//     field on a 1024x768 screen at normal distance) slid over the clip at
//     board scale.
// The clip is drawn with object-fit: cover into an element drawnW x drawnH
// screen px; only the part of the clip that is actually visible is measured,
// at the scale it is actually drawn.
// Usage: swiftc -O flashcheck.swift -o flashcheck
//        ./flashcheck <clip.mp4> <elemW> <elemH> [speed]
//   the weather card draws its scene at 842 x 849 on a 1680x1050 board.
// A take may join a night slot of _WX_SCENE_TAKES only at F <= 6, and goes
// into MEASURED in tests/storm-night-flash-limit.test.js with its number.

let CELL = 8
let TH = 0.10
func lin(_ c: Double) -> Double { let s = c / 255.0; return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4) }
var LUT = [Double](repeating: 0, count: 256); for i in 0..<256 { LUT[i] = lin(Double(i)) }

let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let drawnW = args.count > 2 ? Double(args[2])! : 855
let drawnH = args.count > 3 ? Double(args[3])! : 470
// Optional playback speed (0.5 = half speed): a 1 s window on screen then
// covers SPEED seconds of the clip. Used only to size a proposed slow-down.
let SPEED = args.count > 4 ? Double(args[4])! : 1.0
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
var track: AVAssetTrack?
Task { track = try? await asset.loadTracks(withMediaType: .video).first; sem.signal() }
sem.wait()
guard let tr = track else { print("NOTRACK"); exit(1) }
let reader = try! AVAssetReader(asset: asset)
let out = AVAssetReaderTrackOutput(track: tr, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(out); reader.startReading()
var frames: [[Double]] = []
var times: [Double] = []
var GX = 0, GY = 0, PW = 0, PH = 0, CX0 = 0, CY0 = 0
var SC = 1.0
while let sb = out.copyNextSampleBuffer() {
  guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
  let t = CMSampleBufferGetPresentationTimeStamp(sb).seconds
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
  if GX == 0 {
    PW = w; PH = h
    SC = max(drawnW / Double(w), drawnH / Double(h))         // cover
    let visW = drawnW / SC, visH = drawnH / SC                // source px visible
    let x0 = (Double(w) - visW) / 2, y0 = (Double(h) - visH) / 2
    CX0 = Int(ceil(x0 / Double(CELL))); CY0 = Int(ceil(y0 / Double(CELL)))
    GX = Int(floor((x0 + visW) / Double(CELL))) - CX0
    GY = Int(floor((y0 + visH) / Double(CELL))) - CY0
  }
  let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
  var cells = [Double](repeating: 0, count: GX * GY)
  for cy in 0..<GY {
    for cx in 0..<GX {
      var s = 0.0; var c = 0
      let sy0 = (cy + CY0) * CELL, sx0 = (cx + CX0) * CELL
      var y = sy0
      while y < sy0 + CELL { var x = sx0
        while x < sx0 + CELL { let p = base + y * bpr + x * 4
          s += 0.2126 * LUT[Int(p[2])] + 0.7152 * LUT[Int(p[1])] + 0.0722 * LUT[Int(p[0])]; c += 1; x += 2 }
        y += 2 }
      cells[cy * GX + cx] = s / Double(c)
    }
  }
  CVPixelBufferUnlockBaseAddress(pb, .readOnly)
  frames.append(cells); times.append(t)
}
let n0 = frames.count
guard n0 > 4 else { print("NOFRAMES"); exit(1) }
let fps = Double(n0 - 1) / (times[n0 - 1] - times[0])
let NC = GX * GY
let n = n0 * 3  // tiled for the loop
func L(_ f: Int, _ c: Int) -> Double { return frames[f % n0][c] }
var actUp = [[Bool]](repeating: [Bool](repeating: false, count: NC), count: n)
var actDn = [[Bool]](repeating: [Bool](repeating: false, count: NC), count: n)
func mark(_ up: Bool, _ c: Int, _ i0: Int, _ i1: Int, _ a: Double, _ b: Double) {
  // a = start value, b = end value
  let sw = b - a
  var s = i0, e = i1
  for j in i0...i1 { if (L(j, c) - a) / sw <= 0.1 { s = j } }
  for j in stride(from: i1, through: i0, by: -1) { if (b - L(j, c)) / sw <= 0.1 { e = j } }
  if e <= s { e = s + 1 }
  for j in (s + 1)...min(e, n - 1) { if up { actUp[j][c] = true } else { actDn[j][c] = true } }
}
for c in 0..<NC {
  var trend = 0
  var pivot = L(0, c), pivotI = 0
  var lo = pivot, hi = pivot, loI = 0, hiI = 0
  var cand = pivot, candI = 0
  for f in 1..<n {
    let x = L(f, c)
    if trend == 0 {
      if x < lo { lo = x; loI = f }
      if x > hi { hi = x; hiI = f }
      if hi - lo >= TH {
        if hiI > loI { trend = 1; pivot = lo; pivotI = loI; cand = hi; candI = hiI }
        else { trend = -1; pivot = hi; pivotI = hiI; cand = lo; candI = loI }
      }
      continue
    }
    if trend == 1 {
      if x > cand { cand = x; candI = f }
      else if cand - x >= TH {
        if cand - pivot >= TH && min(cand, pivot) < 0.8 { mark(true, c, pivotI, candI, pivot, cand) }
        pivot = cand; pivotI = candI; trend = -1; cand = x; candI = f
      }
    } else {
      if x < cand { cand = x; candI = f }
      else if x - cand >= TH {
        if pivot - cand >= TH && min(cand, pivot) < 0.8 { mark(false, c, pivotI, candI, pivot, cand) }
        pivot = cand; pivotI = candI; trend = 1; cand = x; candI = f
      }
    }
  }
  if trend == 1 && cand - pivot >= TH && min(cand, pivot) < 0.8 { mark(true, c, pivotI, candI, pivot, cand) }
  if trend == -1 && pivot - cand >= TH && min(cand, pivot) < 0.8 { mark(false, c, pivotI, candI, pivot, cand) }
}
let sx = SC, sy = SC  // screen px per clip px (cover)
let cellScreenArea = Double(CELL) * sx * Double(CELL) * sy
let fieldW = max(1, min(GX, Int((341.0 / sx / Double(CELL)).rounded())))
let fieldH = max(1, min(GY, Int((256.0 / sy / Double(CELL)).rounded())))
func areas(_ act: [[Bool]], _ f: Int) -> (Double, Double, Double) {
  let m = act[f]
  var tot = 0
  for c in 0..<NC where m[c] { tot += 1 }
  if tot == 0 { return (0, 0, 0) }
  var I = [Int](repeating: 0, count: (GX + 1) * (GY + 1))
  for y in 0..<GY { var row = 0; for x in 0..<GX { row += m[y * GX + x] ? 1 : 0; I[(y + 1) * (GX + 1) + x + 1] = I[y * (GX + 1) + x + 1] + row } }
  var best = 0
  for y in 0...(GY - fieldH) { for x in 0...(GX - fieldW) {
    let s = I[(y + fieldH) * (GX + 1) + x + fieldW] - I[y * (GX + 1) + x + fieldW] - I[(y + fieldH) * (GX + 1) + x] + I[y * (GX + 1) + x]
    if s > best { best = s } } }
  return (Double(tot) / Double(NC), Double(tot) * cellScreenArea, Double(best) / Double(fieldW * fieldH))
}
var aUp: [(Double, Double, Double)] = [], aDn: [(Double, Double, Double)] = []
for f in 0..<n { aUp.append(areas(actUp, f)); aDn.append(areas(actDn, f)) }
func val(_ a: (Double, Double, Double), _ rule: Int) -> Double { return rule == 0 ? a.0 : (rule == 1 ? a.1 : a.2) }
func ok(_ a: (Double, Double, Double), _ rule: Int) -> Bool { return rule == 0 ? a.0 >= 0.25 : (rule == 1 ? a.1 >= 21824 : a.2 >= 0.25) }
func events(_ rule: Int) -> [(Int, Int)] {
  var ev: [(Int, Int)] = []
  for (dir, arr) in [(1, aUp), (-1, aDn)] {
    var f = 0
    while f < n {
      if ok(arr[f], rule) {
        var best = f; var g = f
        while g < n && ok(arr[g], rule) { if val(arr[g], rule) > val(arr[best], rule) { best = g }; g += 1 }
        ev.append((best, dir)); f = g
      } else { f += 1 }
    }
  }
  return ev.sorted { $0.0 < $1.0 }
}
func alternate(_ ev: [(Int, Int)]) -> [(Int, Int)] {
  var o: [(Int, Int)] = []
  for e in ev { if let l = o.last, l.1 == e.1 { continue }; o.append(e) }
  return o
}
func maxPerSecond(_ ev: [(Int, Int)]) -> (Int, Double) {
  var mx = 0; var at = 0.0
  let win = Int((fps * SPEED).rounded())
  for s in n0..<(2 * n0) {
    let c = ev.filter { $0.0 >= s && $0.0 < s + win }.count
    if c > mx { mx = c; at = Double(s - n0) / fps }
  }
  return (mx, at)
}
let meanL = frames.map { $0.reduce(0, +) / Double(NC) }
var maxJump = 0.0
for f in 1..<n0 { maxJump = max(maxJump, abs(meanL[f] - meanL[f - 1])) }
var peakA = 0.0, peakC = 0.0, peakB = 0.0
for f in n0..<(2 * n0) { peakA = max(peakA, aUp[f].0, aDn[f].0); peakB = max(peakB, aUp[f].1, aDn[f].1); peakC = max(peakC, aUp[f].2, aDn[f].2) }
var cols: [String] = []
for rule in 0..<3 {
  let ev = events(rule), al = alternate(ev)
  let r = maxPerSecond(ev), a = maxPerSecond(al)
  cols.append(String(format: "%@ raw=%d alt=%d@%.2fs %@", ["A", "B", "C"][rule], r.0, a.0, a.1, a.0 > 6 ? "FAIL" : "pass"))
}

// ── Method F: the field's own average. The mean luminance of a window is
// run through the same 0.10 zig-zag; every swing it completes is a
// transition of that whole window. Robust to noise and to sparkle (small
// bright points average away); it can only miss a flash that lights barely
// a quarter of a field by barely 10%. Windows: the whole visible clip, and
// every 10-degree field (stride 3 cells).
func zigzagCount(_ series: [Double]) -> (Int, Double, [Int]) {
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
  var mx = 0; var at = 0.0
  let win = Int((fps * SPEED).rounded())
  for st in n0..<(2 * n0) { let c = tr.filter { $0 >= st && $0 < st + win }.count; if c > mx { mx = c; at = Double(st - n0) / fps } }
  return (mx, at, tr.filter { $0 >= n0 && $0 < 2 * n0 }.map { $0 - n0 })
}
func winSeries(_ x0: Int, _ y0: Int, _ ww: Int, _ hh: Int) -> [Double] {
  var out = [Double](repeating: 0, count: n)
  let a = Double(ww * hh)
  for f in 0..<n0 { var t = 0.0; for y in y0..<(y0 + hh) { for x in x0..<(x0 + ww) { t += frames[f][y * GX + x] } }; out[f] = t / a }
  for f in n0..<n { out[f] = out[f % n0] }
  return out
}
let fWhole = zigzagCount(winSeries(0, 0, GX, GY))
var fField = (0, 0.0, [Int]()); var fAt = (0, 0)
var fy = 0
while fy + fieldH <= GY { var fx = 0
  while fx + fieldW <= GX { let r = zigzagCount(winSeries(fx, fy, fieldW, fieldH)); if r.0 > fField.0 { fField = r; fAt = (fx, fy) }; fx += 3 }
  fy += 3 }
let fCol = String(format: "F_whole=%d@%.2fs %@\tF_field=%d@%.2fs %@ (cell %d,%d)\tF_field_trans=[%@]", fWhole.0, fWhole.1, fWhole.0 > 6 ? "FAIL" : "pass", fField.0, fField.1, fField.0 > 6 ? "FAIL" : "pass", fAt.0, fAt.1, fField.2.map { String(format: "%.2f", Double($0) / fps) }.joined(separator: " "))
let evC = alternate(events(2)).filter { $0.0 >= n0 && $0.0 < 2 * n0 }.map { String(format: "%@%.2f", $0.1 > 0 ? "+" : "-", Double($0.0 - n0) / fps) }.joined(separator: " ")
print(String(format: "%@\t%dx%d vis=%dx%d cells scale=%.3f\tframes=%d\tfps=%.2f\tdur=%.2fs\tmeanY=%.3f..%.3f\tmaxFrameJump=%.3f\tpeakArea frame=%.0f%% px=%.0f field=%.0f%%\t%@\t%@\t%@\tfield=%dx%d cells\tC_events=[%@]\t%@",
  url.lastPathComponent, PW, PH, GX, GY, SC, n0, fps, times[n0-1] - times[0] + 1.0 / fps, meanL.min()!, meanL.max()!, maxJump, peakA * 100, peakB, peakC * 100,
  cols[0], cols[1], cols[2], fieldW, fieldH, evC, fCol))
