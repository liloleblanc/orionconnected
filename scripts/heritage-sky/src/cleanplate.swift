import AVFoundation
import CoreGraphics
import Foundation
// Removes the aircraft from a sky clip using a mask taken from the clip itself.
//  A. In a reference frame, the aircraft = non-sky pixels (not blue, or dark) inside a box, connected to a seed.
//  B. Its own pixels are the template; every frame's offset (bob) is found by NCC against it.
//  C. Over frames spread through the clip, aligned by that offset, a pixel that is non-sky in nearly all of them
//     is aircraft; clouds move, so they fall out. That is the mask.
//  D. Per frame: mask shifted by the offset, dilated and feathered, filled by a push-pull pyramid from the
//     surrounding sky and cloud. Then centre-cropped to the output aspect and scaled.
// args: in.mp4 out.mp4 outW outH refTime seedX seedY boxX0 boxY0 boxX1 boxY1
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1])); let outPath = a[2]; let OW = Int(a[3])!, OH = Int(a[4])!
let refT = Double(a[5])!, seedX = Int(a[6])!, seedY = Int(a[7])!
let BX0 = Int(a[8])!, BY0 = Int(a[9])!, BX1 = Int(a[10])!, BY1 = Int(a[11])!
let track = asset.tracks(withMediaType: .video)[0]; let fps = Double(track.nominalFrameRate)
let W = Int(track.naturalSize.width), H = Int(track.naturalSize.height)
func reader() -> AVAssetReaderTrackOutput { let r = try! AVAssetReader(asset: asset)
  let o = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)])
  r.add(o); r.startReading(); keep.append(r); return o }
var keep: [AVAssetReader] = []
// sky test on BGRA bytes
@inline(__always) func isSky(_ b: UInt8, _ g: UInt8, _ r: UInt8) -> Bool {
  let B = Int(b), R = Int(r), G = Int(g); let lum = (299*R + 587*G + 114*B) / 1000
  return (B - R) > 38 && lum > 95 && B > G - 10 }
@inline(__always) func lumOf(_ p: UnsafeMutablePointer<UInt8>, _ i: Int) -> Float { 0.114*Float(p[i]) + 0.587*Float(p[i+1]) + 0.299*Float(p[i+2]) }
let refIdx = Int(refT * fps)
// A. reference frame
var refLum = [Float](repeating: 0, count: W*H); var nonSky0 = [Bool](repeating: false, count: W*H)
do { let o = reader(); var n = 0
  while let sb = o.copyNextSampleBuffer() { if n == refIdx, let pb = CMSampleBufferGetImageBuffer(sb) {
      CVPixelBufferLockBaseAddress(pb, .readOnly); let bpr = CVPixelBufferGetBytesPerRow(pb); let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
      for y in 0..<H { for x in 0..<W { let i = y*bpr + x*4; refLum[y*W+x] = lumOf(p, i); nonSky0[y*W+x] = !isSky(p[i], p[i+1], p[i+2]) } }
      CVPixelBufferUnlockBaseAddress(pb, .readOnly); break }
    n += 1 } }
// connected component from the seed within the box
var comp = [Bool](repeating: false, count: W*H); var stack = [(seedX, seedY)]
if !nonSky0[seedY*W+seedX] { print("seed is sky — adjust"); exit(2) }
while let (x, y) = stack.popLast() { if x < BX0 || x >= BX1 || y < BY0 || y >= BY1 { continue }
  let i = y*W+x; if comp[i] || !nonSky0[i] { continue }; comp[i] = true
  stack.append((x+1, y)); stack.append((x-1, y)); stack.append((x, y+1)); stack.append((x, y-1)) }
var tpl: [(Int, Int, Float)] = []; var cnt0 = 0
for y in BY0..<BY1 { for x in BX0..<BX1 where comp[y*W+x] { cnt0 += 1; if (x % 3 == 0) && (y % 3 == 0) { tpl.append((x, y, refLum[y*W+x])) } } }
print("component px:", cnt0, "template samples:", tpl.count)
// B. offsets per frame
func ncc(_ p: UnsafeMutablePointer<UInt8>, _ bpr: Int, _ dx: Int, _ dy: Int, _ step: Int) -> Double {
  var sa = 0.0, sb = 0.0, saa = 0.0, sbb = 0.0, sab = 0.0, n = 0.0; var k = 0
  while k < tpl.count { let (x, y, A) = tpl[k]; let fx = x + dx, fy = y + dy
    if fx >= 0 && fx < W && fy >= 0 && fy < H { let B = Double(lumOf(p, fy*bpr + fx*4)); let AA = Double(A)
      sa += AA; sb += B; saa += AA*AA; sbb += B*B; sab += AA*B; n += 1 }
    k += step }
  let cov = sab/n - (sa/n)*(sb/n), va = saa/n - (sa/n)*(sa/n), vb = sbb/n - (sb/n)*(sb/n); return cov / max(1e-6, sqrt(va*vb)) }
var offs: [(Int, Int, Double)] = []
do { let o = reader(); var pdx = 0, pdy = 0; var first = true
  while let sb = o.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
    CVPixelBufferLockBaseAddress(pb, .readOnly); let bpr = CVPixelBufferGetBytesPerRow(pb); let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    var best = (0, 0, -2.0)
    let yr = first ? 70 : 6, xr = first ? 8 : 3
    for dy in (pdy-yr)...(pdy+yr) { for dx in (pdx-xr)...(pdx+xr) { let c = ncc(p, bpr, dx, dy, 4); if c > best.2 { best = (dx, dy, c) } } }
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    offs.append(best); pdx = best.0; pdy = best.1; first = false } }
// offsets are relative to the reference frame; re-anchor so the reference frame is (0,0)
let (rx, ry, _) = offs[min(refIdx, offs.count-1)]
offs = offs.map { ($0.0 - rx, $0.1 - ry, $0.2) }
print("offsets:", stride(from: 0, to: offs.count, by: 25).map { String(format: "%d:(%d,%d) %.3f", $0, offs[$0].0, offs[$0].1, offs[$0].2) }.joined(separator: " "))
// C. persistent non-sky within the dilated component
var count = [Int](repeating: 0, count: W*H); var used = 0
let grow = 40
var region = [Bool](repeating: false, count: W*H)
for y in max(0, BY0-grow)..<min(H, BY1+grow) { for x in max(0, BX0-grow)..<min(W, BX1+grow) {
  var hit = false; var yy = y - grow; while yy <= y + grow && !hit { if yy >= 0 && yy < H { var xx = x - 6; while xx <= x + 6 { if xx >= 0 && xx < W && comp[yy*W+xx] { hit = true; break }; xx += 3 } }; yy += 4 }
  region[y*W+x] = hit } }
do { let o = reader(); var n = 0
  while let sb = o.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
    if n % 10 == 0 { CVPixelBufferLockBaseAddress(pb, .readOnly); let bpr = CVPixelBufferGetBytesPerRow(pb); let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
      let (dx, dy, _) = offs[n]
      for y in 0..<H { for x in 0..<W where region[y*W+x] { let fx = x + dx, fy = y + dy; if fx < 0 || fx >= W || fy < 0 || fy >= H { continue }
        let i = fy*bpr + fx*4; if !isSky(p[i], p[i+1], p[i+2]) { count[y*W+x] += 1 } } }
      CVPixelBufferUnlockBaseAddress(pb, .readOnly); used += 1 }
    n += 1 } }
var plane = [Bool](repeating: false, count: W*H); var mpx = 0
for i in 0..<(W*H) where region[i] && Double(count[i]) >= 0.8 * Double(used) { plane[i] = true; mpx += 1 }
print("frames sampled:", used, "plane px:", mpx)
// mask bbox
var mx0 = W, my0 = H, mx1 = 0, my1 = 0
for y in 0..<H { for x in 0..<W where plane[y*W+x] { mx0 = min(mx0, x); my0 = min(my0, y); mx1 = max(mx1, x); my1 = max(my1, y) } }
print("mask bbox:", mx0, my0, mx1, my1)
// dilate + feather into a float mask over the bbox + margin
let D = 7, F = 6, R = D + F
let MX0 = mx0 - R, MY0 = my0 - R, MW = (mx1 - mx0 + 1) + 2*R, MH = (my1 - my0 + 1) + 2*R
var mask = [Float](repeating: 0, count: MW*MH)
var disk: [(Int, Int, Double)] = []; for dy in -R...R { for dx in -R...R { let d = sqrt(Double(dx*dx+dy*dy)); if d <= Double(R) { disk.append((dx, dy, d)) } } }
disk.sort { $0.2 < $1.2 }
for y in 0..<MH { for x in 0..<MW { let gx = MX0 + x, gy = MY0 + y
  for (dx, dy, d) in disk { let xx = gx + dx, yy = gy + dy; if xx >= 0 && xx < W && yy >= 0 && yy < H && plane[yy*W+xx] {
      let v: Float = d <= Double(D) ? 1 : { let t = 1 - (d - Double(D)) / Double(F); return Float(t*t*(3-2*t)) }(); mask[y*MW+x] = v; break } } } }
// D. render
func pushPull(_ c: inout [[Float]], _ w: [Float], _ Wd: Int, _ Hd: Int) {
  if Wd <= 2 || Hd <= 2 { return }
  let W2 = (Wd + 1) / 2, H2 = (Hd + 1) / 2
  var c2 = [[Float]](repeating: [Float](repeating: 0, count: W2*H2), count: 3), w2 = [Float](repeating: 0, count: W2*H2)
  for y in 0..<H2 { for x in 0..<W2 { var sw: Float = 0; var sc: [Float] = [0, 0, 0]
    for dy in 0..<2 { for dx in 0..<2 { let xx = min(Wd-1, 2*x+dx), yy = min(Hd-1, 2*y+dy); let ww = w[yy*Wd+xx]; sw += ww; for k in 0..<3 { sc[k] += c[k][yy*Wd+xx] * ww } } }
    let i = y*W2+x; if sw > 0 { for k in 0..<3 { c2[k][i] = sc[k] / sw } }; w2[i] = min(1, sw) } }
  pushPull(&c2, w2, W2, H2)
  for y in 0..<Hd { for x in 0..<Wd { let i = y*Wd+x; let ww = w[i]; if ww >= 1 { continue }
    let fx = max(0, min(Float(W2-1), (Float(x) - 0.5) / 2)), fy = max(0, min(Float(H2-1), (Float(y) - 0.5) / 2))
    let x0 = Int(fx), y0 = Int(fy), x1 = min(W2-1, x0+1), y1 = min(H2-1, y0+1); let tx = fx - Float(x0), ty = fy - Float(y0)
    for k in 0..<3 { let v = (c2[k][y0*W2+x0]*(1-tx) + c2[k][y0*W2+x1]*tx)*(1-ty) + (c2[k][y1*W2+x0]*(1-tx) + c2[k][y1*W2+x1]*tx)*ty
      c[k][i] = c[k][i]*ww + v*(1-ww) } } } }
let cropW = Int((Double(H) * Double(OW) / Double(OH)).rounded()), cropX = (W - cropW) / 2
try? FileManager.default.removeItem(atPath: outPath)
let writer = try! AVAssetWriter(outputURL: URL(fileURLWithPath: outPath), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: OW, AVVideoHeightKey: OH,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_200_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA), kCVPixelBufferWidthKey as String: OW, kCVPixelBufferHeightKey as String: OH])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let cs = CGColorSpaceCreateDeviceRGB(); let PAD = 80
do { let o = reader(); var n = 0
  while let sb = o.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
    let (dx, dy, _) = offs[min(n, offs.count-1)]
    let RX0 = max(0, MX0 + dx - PAD), RY0 = max(0, MY0 + dy - PAD), RX1 = min(W, MX0 + dx + MW + PAD), RY1 = min(H, MY0 + dy + MH + PAD)
    let RW = RX1 - RX0, RH = RY1 - RY0
    CVPixelBufferLockBaseAddress(pb, []); let bpr = CVPixelBufferGetBytesPerRow(pb); let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    var c = [[Float]](repeating: [Float](repeating: 0, count: RW*RH), count: 3), w = [Float](repeating: 1, count: RW*RH), mr = [Float](repeating: 0, count: RW*RH)
    for y in 0..<RH { for x in 0..<RW { let fx = RX0 + x, fy = RY0 + y, i = fy*bpr + fx*4, j = y*RW + x
      for k in 0..<3 { c[k][j] = Float(p[i+k]) }
      let mx = fx - dx - MX0, my = fy - dy - MY0
      if mx >= 0 && mx < MW && my >= 0 && my < MH { let m = mask[my*MW+mx]; mr[j] = m; if m > 0.02 { w[j] = 0 } } } }
    let orig = c
    pushPull(&c, w, RW, RH)
    for y in 0..<RH { for x in 0..<RW { let j = y*RW + x; let m = mr[j]; if m <= 0 { continue }
      let i = (RY0 + y)*bpr + (RX0 + x)*4; for k in 0..<3 { p[i+k] = UInt8(max(0, min(255, orig[k][j]*(1-m) + c[k][j]*m))) } } }
    let ctx = CGContext(data: p, width: W, height: H, bitsPerComponent: 8, bytesPerRow: bpr, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    let img = ctx.makeImage()!.cropping(to: CGRect(x: cropX, y: 0, width: cropW, height: H))!
    CVPixelBufferUnlockBaseAddress(pb, [])
    var ob: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &ob); CVPixelBufferLockBaseAddress(ob!, [])
    let octx = CGContext(data: CVPixelBufferGetBaseAddress(ob!), width: OW, height: OH, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(ob!), space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    octx.interpolationQuality = .high; octx.draw(img, in: CGRect(x: 0, y: 0, width: OW, height: OH)); CVPixelBufferUnlockBaseAddress(ob!, [])
    while !input.isReadyForMoreMediaData { usleep(2000) }
    adaptor.append(ob!, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(fps.rounded()))); n += 1 } }
input.markAsFinished(); let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
print(outPath, OW, OH, writer.status == .completed ? "ok" : "FAILED")
