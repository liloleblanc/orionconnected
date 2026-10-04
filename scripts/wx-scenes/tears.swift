import AVFoundation
import Foundation
import CoreVideo

// Rolling-shutter "tear" finder. A lightning flash shorter than the sensor's
// readout lights only part of a CMOS frame, so that frame shows a lit band with
// a hard horizontal edge — on the board it reads as a glitch, not weather.
// Per frame: the row-mean relative luminance of the visible 842x849 crop,
// minus the clip's median row profile (so a horizon or a gradient that is
// always there cancels). A tear is a step of >= STEP in that difference
// across <= 4 rows that runs most of the width (row means already average the
// whole width, so a step here is a full-width edge).
// usage: tears <clip.mp4> [step=0.03]
let args = CommandLine.arguments
let url = URL(fileURLWithPath: args[1])
let STEP = args.count > 2 ? Double(args[2])! : 0.03
func lin(_ c: Double) -> Double { let s = c / 255.0; return s <= 0.03928 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4) }
var LUT = [Double](repeating: 0, count: 256); for i in 0..<256 { LUT[i] = lin(Double(i)) }
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0); var track: AVAssetTrack?
Task { track = try? await asset.loadTracks(withMediaType: .video).first; sem.signal() }; sem.wait()
guard let tr = track else { print("NOTRACK"); exit(1) }
let reader = try! AVAssetReader(asset: asset)
let out = AVAssetReaderTrackOutput(track: tr, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(out); reader.startReading()
var rows: [[Double]] = []; var times: [Double] = []
while let sb = out.copyNextSampleBuffer() {
  guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
  CVPixelBufferLockBaseAddress(pb, .readOnly)
  let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), bpr = CVPixelBufferGetBytesPerRow(pb)
  let sc = max(842.0 / Double(w), 849.0 / Double(h)); let vw = Int(842.0 / sc), x0 = (w - vw) / 2
  let base = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
  var r = [Double](repeating: 0, count: h / 2)
  for yy in 0..<(h / 2) { let y = yy * 2; var s = 0.0; var n = 0; var x = x0
    while x < x0 + vw { let p = base + y * bpr + x * 4; s += 0.2126 * LUT[Int(p[2])] + 0.7152 * LUT[Int(p[1])] + 0.0722 * LUT[Int(p[0])]; n += 1; x += 4 }
    r[yy] = s / Double(n) }
  CVPixelBufferUnlockBaseAddress(pb, .readOnly)
  rows.append(r); times.append(CMSampleBufferGetPresentationTimeStamp(sb).seconds)
}
let n = rows.count, H = rows[0].count
var med = [Double](repeating: 0, count: H)
for y in 0..<H { var c = rows.map { $0[y] }; c.sort(); med[y] = c[c.count / 2] }
var hits: [String] = []
var worst = 0.0
for f in 0..<n {
  var best = 0.0, at = 0
  for y in 2..<(H - 2) {
    let d = abs((rows[f][y + 2] - med[y + 2]) - (rows[f][y - 2] - med[y - 2]))
    if d > best { best = d; at = y }
  }
  worst = max(worst, best)
  if best >= STEP { hits.append(String(format: "%.2fs(%.3f@%d%%)", times[f], best, at * 100 / H)) }
}
print(String(format: "%@\tframes=%d\tworstStep=%.3f\ttearFrames=%d\t%@", url.lastPathComponent, n, worst, hits.count, hits.prefix(12).joined(separator: " ")))
