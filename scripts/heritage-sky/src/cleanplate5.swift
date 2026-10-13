import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
// cleanplate5 — removes the aircraft from the reference sky clip with a MOTION-COMPENSATED fill, so the clouds that
// pass behind it keep moving, keep their texture and keep their shape (cleanplate.swift filled each frame spatially,
// and every cloud crossing the hole became a soft glow that did not travel).
//
// What the reference is (measured): a still sky painting, white see-through veils crossing it leftward at constant
// speeds with no vertical motion, an aircraft that only bobs vertically (60 px over the 15 s), and a seamless 15 s
// loop. Several veil LAYERS at different speeds overlap in the aircraft's band: about 205 and 395 px/s in the
// fuselage's rows, 455 px/s below them, 165 px/s over the bottom bank (at 1920 wide). Each veil keeps one speed.
//
//  1. Aircraft mask and bob from the clip itself, as cleanplate.swift A–C. The mask's interior holes (letters,
//     windows) are filled and it is dilated (16 px) into the cover; the cover follows the bob.
//  2. Every frame is cropped and scaled to the v23899 geometry (1824 px at x 48, to 1140x674). Pixels outside the
//     cover are the clip's own, untouched.
//  3. Still layer S: per pixel, the mean of its uncovered, veil-free frames. A pixel uncovered for fewer than 150
//     frames (only when the bob lifts the aircraft, often under a passing veil) is not trusted, and it is filled
//     with the pixels the aircraft always hides by a membrane (Laplace) fill. Still, so it cannot glow.
//  4. Veils as optical depth, tau = -ln(1 - beta), beta = (L - S)/(255 - S).
//  5. LAYER MEMBERSHIP. Every visible point of the band gets a soft membership in each layer (165, 205, 300, 395 and
//     455 px/s), from how well its optical depth matches its own past and future shifted at that layer's speed,
//     over a window of 33x17 px and 13 frames. Where the layers hardly differ (a flat, saturated cloud interior), the
//     confident memberships around it (97x49 px, then 321x121 px), and only then the row's prior; otherwise a
//     cloud's interior fell back to the row's usual layer and broke off it as a separate dash.
//  6. TRANSPORT, per layer, from the hole's own edges. For a layer moving left at v, a hidden pixel x at frame t is
//     what the first visible point along its track showed: to its right (x + v d, d frames earlier) and to its left
//     (x - v d, d frames later), in its own row, round the seamless loop. A track ends wherever the hole ends in
//     that row at that moment: the nose and the tail for the fuselage's rows, the fin's edges for the fin's rows,
//     the engine's for the engine's, a few frames back for rows the bob has just covered. The two ends are
//     interpolated along the track, and the layers' optical depths (membership x tau at each end) add. So each veil
//     crosses at its own speed and keeps its shape, and the fill meets the clip at every edge the veils cross.
//     (The first version used one pair of source columns and one speed, 205 px/s, for every row: a 395 px/s cloud
//     carried at 205 px/s was squeezed to half its width and came out a box with straight sides, and short rows
//     (fin, engine) got veils copied from 600 px away, so the fin's outline showed as a cloud.)
//  7. MIRROR near the top and bottom of every hidden run of a column, where the hole's edge runs along x and the
//     tracks end far away: the clip's own pixels reflected about the row just outside it, each weighted against the
//     transport by inverse squared distance (vertically to that end of the run; for the transport, to the row's
//     run end or LAM), so the fill meets the clip there too. Only where the row's run end is at least 1.5-4x farther
//     than the column's: at a slanted edge (the fin's leading edge, the nose) the reflection pulled in sky from beside
//     the edge and drew a line along it, so a slanted edge is left to the transport. Under a narrow notch (the
//     antenna's) the reflection is about the edge beside it, not about the notch's top.
//  8. Colour inside the cover: S + beta (255 - S) per channel (the veils are white), feathered 6 px into the clip.
//  9. H.264 via AVFoundation, frame k = reference frame k, so the reference's own seamless loop carries over.
//
// usage: cleanplate5 in.mp4 out.mp4 [--holdout DY | --holdout-strip X0 X1 T0 T1] [--cache frames.bgra]
//                    [--report dir] [--threads 6] [--layers 165,205,300,395,455] [--layer-map dir]
//   --holdout DY        writes no clip: hides a second copy of the cover DY full-res px lower, where the real veils
//                       are known, rebuilds it the same way, and scores the rebuild against the truth.
//   --holdout-strip     the same, hiding shelf columns X0..X1 during frames T0..T1 in the aircraft's rows.
//   --layer-map dir     also writes the band at a few moments, coloured by layer membership (mem_NNN.png).
let A = CommandLine.arguments
if A.count < 3 { print("usage: cleanplate5 in.mp4 out.mp4 [--holdout DY] [--cache file] [--report dir] [--threads n]"); exit(1) }
func opt(_ k: String) -> [String]? { if let i = A.firstIndex(of: k) { return Array(A[(i+1)...]) }; return nil }
let inPath = A[1], outPath = A[2]
let holdoutDY = opt("--holdout").map { Int($0[0])! } ?? 0
let stripHold = opt("--holdout-strip").map { $0.prefix(4).map { Int($0)! } }
let holdout = holdoutDY != 0 || stripHold != nil
let cachePath = opt("--cache")?.first, reportDir = opt("--report")?.first
let threads = opt("--threads").map { Int($0[0])! } ?? 6
let DIL: Float = 16, FEATHER: Float = 6, MINN: Int32 = 150
let LAM = Float(opt("--lam")?.first ?? "14")!
let refT = 9.5, seedX = 1200, seedY = 640, BX0 = 330, BY0 = 330, BX1 = 1600, BY1 = 790
var report = ""
func say(_ s: String) { print(s); report += s + "\n" }
let t0 = Date()
func stamp(_ s: String) { print(String(format: "[%5.1fs] ", Date().timeIntervalSince(t0)) + s) }
func parallel(_ n: Int, _ body: @escaping (Int) -> Void) {
  let lock = NSLock(); var next = 0
  DispatchQueue.concurrentPerform(iterations: max(1, min(threads, n))) { _ in
    while true { lock.lock(); let j = next; next += 1; lock.unlock(); if j >= n { break }; body(j) } } }
func buffer<T>(_ n: Int, _ z: T) -> UnsafeMutablePointer<T> { let p = UnsafeMutablePointer<T>.allocate(capacity: n); p.initialize(repeating: z, count: n); return p }

// ---------- geometry: the v23899 clip's crop, 1824 px wide at x 48, scaled to 1140x674 ----------
let asset = AVURLAsset(url: URL(fileURLWithPath: inPath)); let track = asset.tracks(withMediaType: .video)[0]
let fps = Double(track.nominalFrameRate), FW = Int(track.naturalSize.width), FH = Int(track.naturalSize.height)
let OW = 1140, OH = 674
let cropW = Int((Double(FH) * Double(OW) / 675.0).rounded()), cropX = (FW - cropW) / 2
let sxF = Double(OW) / Double(cropW), syF = Double(OH) / Double(FH)
let cs = CGColorSpaceCreateDeviceRGB(); let BI = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
var keep: [AVAssetReader] = []
func reader() -> AVAssetReaderTrackOutput { let r = try! AVAssetReader(asset: asset)
  let o = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)])
  r.add(o); r.startReading(); keep.append(r); return o }
@inline(__always) func isSky(_ b: UInt8, _ g: UInt8, _ r: UInt8) -> Bool {
  let B = Int(b), R = Int(r), G = Int(g); let lum = (299*R + 587*G + 114*B) / 1000
  return (B - R) > 38 && lum > 95 && B > G - 10 }
@inline(__always) func lumOf(_ p: UnsafePointer<UInt8>) -> Float { 0.114*Float(p[0]) + 0.587*Float(p[1]) + 0.299*Float(p[2]) }

// ---------- 1. the aircraft in a reference frame: non-sky pixels connected to the seed, inside the box ----------
let refIdx = Int(refT * fps)
var refLum = [Float](repeating: 0, count: FW*FH), nonSky0 = [Bool](repeating: false, count: FW*FH)
do { let o = reader(); var n = 0
  while let sb = o.copyNextSampleBuffer() { if n == refIdx, let pb = CMSampleBufferGetImageBuffer(sb) {
      CVPixelBufferLockBaseAddress(pb, .readOnly); let bpr = CVPixelBufferGetBytesPerRow(pb); let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
      for y in 0..<FH { for x in 0..<FW { let i = y*bpr + x*4; refLum[y*FW+x] = lumOf(p + i); nonSky0[y*FW+x] = !isSky(p[i], p[i+1], p[i+2]) } }
      CVPixelBufferUnlockBaseAddress(pb, .readOnly); break }
    n += 1 } }
var comp = [Bool](repeating: false, count: FW*FH); var stack = [(seedX, seedY)]
if !nonSky0[seedY*FW+seedX] { print("seed is sky — adjust"); exit(2) }
while let (x, y) = stack.popLast() { if x < BX0 || x >= BX1 || y < BY0 || y >= BY1 { continue }
  let i = y*FW+x; if comp[i] || !nonSky0[i] { continue }; comp[i] = true
  stack.append((x+1, y)); stack.append((x-1, y)); stack.append((x, y+1)); stack.append((x, y-1)) }
var tpl: [(Int, Int, Float)] = []
for y in BY0..<BY1 { for x in BX0..<BX1 where comp[y*FW+x] && x % 3 == 0 && y % 3 == 0 { tpl.append((x, y, refLum[y*FW+x])) } }
func ncc(_ p: UnsafeMutablePointer<UInt8>, _ bpr: Int, _ dx: Int, _ dy: Int) -> Double {
  var sa = 0.0, sb = 0.0, saa = 0.0, sbb = 0.0, sab = 0.0, n = 0.0; var k = 0
  while k < tpl.count { let (x, y, a) = tpl[k]; let fx = x + dx, fy = y + dy
    if fx >= 0 && fx < FW && fy >= 0 && fy < FH { let b = Double(lumOf(p + fy*bpr + fx*4)); let aa = Double(a)
      sa += aa; sb += b; saa += aa*aa; sbb += b*b; sab += aa*b; n += 1 }
    k += 2 }
  let cov = sab/n - (sa/n)*(sb/n), va = saa/n - (sa/n)*(sa/n), vb = sbb/n - (sb/n)*(sb/n); return cov / max(1e-6, sqrt(va*vb)) }
let grow = 40
var region = [Bool](repeating: false, count: FW*FH)
for y in max(0, BY0-grow)..<min(FH, BY1+grow) { for x in max(0, BX0-grow)..<min(FW, BX1+grow) {
  var hit = false; var yy = y - grow; while yy <= y + grow && !hit { if yy >= 0 && yy < FH { var xx = x - 6; while xx <= x + 6 { if xx >= 0 && xx < FW && comp[yy*FW+xx] { hit = true; break }; xx += 3 } }; yy += 4 }
  region[y*FW+x] = hit } }

// ---------- one pass: bob by NCC, persistence on every 10th frame (clouds move, the aircraft does not), frames scaled ----------
var offs: [(Int, Int, Double)] = []; var count = [Int32](repeating: 0, count: FW*FH); var used = 0
var frameBufs: [UnsafeMutablePointer<UInt8>] = []
var cacheData: Data? = cachePath.flatMap { FileManager.default.contents(atPath: $0) }
do { let o = reader(); var pdx = 0, pdy = 0; var first = true; var n = 0
  while let sb = o.copyNextSampleBuffer(), let pb = CMSampleBufferGetImageBuffer(sb) {
    CVPixelBufferLockBaseAddress(pb, .readOnly); let bpr = CVPixelBufferGetBytesPerRow(pb); let p = CVPixelBufferGetBaseAddress(pb)!.assumingMemoryBound(to: UInt8.self)
    var best = (0, 0, -2.0); let yr = first ? 70 : 6, xr = first ? 8 : 3
    for dy in (pdy-yr)...(pdy+yr) { for dx in (pdx-xr)...(pdx+xr) { let c = ncc(p, bpr, dx, dy); if c > best.2 { best = (dx, dy, c) } } }
    offs.append(best); pdx = best.0; pdy = best.1; first = false
    if n % 10 == 0 { let (dx, dy, _) = best
      for y in 0..<FH { for x in 0..<FW where region[y*FW+x] { let fx = x + dx, fy = y + dy; if fx < 0 || fx >= FW || fy < 0 || fy >= FH { continue }
        let i = fy*bpr + fx*4; if !isSky(p[i], p[i+1], p[i+2]) { count[y*FW+x] += 1 } } }
      used += 1 }
    if cacheData == nil {
      let ctx = CGContext(data: p, width: FW, height: FH, bitsPerComponent: 8, bytesPerRow: bpr, space: cs, bitmapInfo: BI)!
      let img = ctx.makeImage()!.cropping(to: CGRect(x: cropX, y: 0, width: cropW, height: FH))!
      let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: OW*OH*4)
      let octx = CGContext(data: buf, width: OW, height: OH, bitsPerComponent: 8, bytesPerRow: OW*4, space: cs, bitmapInfo: BI)!
      octx.interpolationQuality = .high; octx.draw(img, in: CGRect(x: 0, y: 0, width: OW, height: OH)); frameBufs.append(buf) }
    CVPixelBufferUnlockBaseAddress(pb, .readOnly); n += 1 } }
let N = offs.count
let (rx, ry, _) = offs[min(refIdx, N-1)]; let bob = offs.map { $0.1 - ry }
if offs.contains(where: { $0.0 - rx != 0 }) { say("note: the aircraft moves sideways in some frames; only its vertical bob is followed") }
var plane = [Bool](repeating: false, count: FW*FH); var mpx = 0
for i in 0..<(FW*FH) where region[i] && Double(count[i]) >= 0.8 * Double(used) { plane[i] = true; mpx += 1 }
let F = UnsafeMutablePointer<UInt8>.allocate(capacity: N*OW*OH*4)          // every frame at output size, BGRA
if let d = cacheData, d.count == N*OW*OH*4 { d.withUnsafeBytes { F.update(from: $0.bindMemory(to: UInt8.self).baseAddress!, count: d.count) } }
else { for (k, b) in frameBufs.enumerated() { (F + k*OW*OH*4).update(from: b, count: OW*OH*4) }
  if let c = cachePath { FileManager.default.createFile(atPath: c, contents: Data(bytes: F, count: N*OW*OH*4)) } }
for b in frameBufs { b.deallocate() }; frameBufs = []; cacheData = nil
let nccs = offs.map { $0.2 }.sorted()
say(String(format: "aircraft: %d px; bob %d..%d px (first frame %d, last %d); NCC min %.3f, median %.3f; %d frames at %.0f fps", mpx, bob.min()!, bob.max()!, bob[0], bob[N-1], nccs[0], nccs[N/2], N, fps))
stamp("decoded and tracked")

// ---------- the cover: holes filled, dilated; depth = distance in from its edge ----------
func fillHoles(_ m: [Bool], _ W: Int, _ H: Int) -> [Bool] {
  var outside = [Bool](repeating: false, count: W*H); var st: [Int] = []
  for x in 0..<W { st.append(x); st.append((H-1)*W+x) }; for y in 0..<H { st.append(y*W); st.append(y*W+W-1) }
  while let i = st.popLast() { if outside[i] || m[i] { continue }; outside[i] = true; let x = i % W, y = i / W
    if x > 0 { st.append(i-1) }; if x < W-1 { st.append(i+1) }; if y > 0 { st.append(i-W) }; if y < H-1 { st.append(i+W) } }
  return outside.map { !$0 } }
func edt(_ seed: [Bool], _ W: Int, _ H: Int) -> [Float] {   // exact Euclidean distance to the nearest seed pixel (Felzenszwalb)
  let INF: Float = 1e12
  func dt1(_ f: [Float]) -> [Float] { let n = f.count; var d = [Float](repeating: 0, count: n), v = [Int](repeating: 0, count: n), z = [Float](repeating: 0, count: n+1)
    var k = 0; z[0] = -INF; z[1] = INF
    for q in 1..<n { var s: Float = 0
      repeat { let p = v[k]; s = ((f[q] + Float(q*q)) - (f[p] + Float(p*p))) / Float(2*q - 2*p); if s <= z[k] { k -= 1 } else { break } } while k >= 0
      k += 1; v[k] = q; z[k] = s; z[k+1] = INF }
    k = 0; for q in 0..<n { while z[k+1] < Float(q) { k += 1 }; let p = v[k]; d[q] = Float((q-p)*(q-p)) + f[p] }
    return d }
  var g = [Float](repeating: 0, count: W*H)
  for x in 0..<W { var col = [Float](repeating: 0, count: H); for y in 0..<H { col[y] = seed[y*W+x] ? 0 : INF }; let d = dt1(col); for y in 0..<H { g[y*W+x] = d[y] } }
  var out = [Float](repeating: 0, count: W*H)
  for y in 0..<H { let d = dt1(Array(g[(y*W)..<(y*W+W)])); for x in 0..<W { out[y*W+x] = sqrt(d[x]) } }
  return out }
let filled = fillHoles(plane, FW, FH)
let coverFR = edt(filled, FW, FH).map { $0 <= DIL }
let depthFR = edt(coverFR.map { !$0 }, FW, FH)
say(String(format: "cover: holes filled %d px, dilated %.0f px: %d px at 1920x1080", filled.filter { $0 }.count, DIL, coverFR.filter { $0 }.count))
let xrOf = (0..<OW).map { cropX + Int(((Double($0) + 0.5) / sxF - 0.5).rounded()) }
let yrOf = (0..<OH).map { Int(((Double($0) + 0.5) / syF - 0.5).rounded()) }
@inline(__always) func depthAt(_ xs: Int, _ ys: Int, _ t: Int, _ shift: Int) -> Float {
  let xr = xrOf[xs], yr = yrOf[ys] - bob[t] - shift
  if xr < 0 || xr >= FW || yr < 0 || yr >= FH { return 0 }
  return depthFR[yr*FW + xr] * Float(sxF) }
@inline(__always) func realDepth(_ xs: Int, _ ys: Int, _ t: Int) -> Float { depthAt(xs, ys, t, 0) }
func rowsWhere(_ f: (Int, Int, Int) -> Float) -> [Int] { (0..<OH).filter { ys in
  for t in 0..<N { for xs in stride(from: 0, to: OW, by: 1) where f(xs, ys, t) > 0 { return true } }; return false } }
let realRows = Set(rowsWhere(realDepth))
@inline(__always) func fakeDepth(_ xs: Int, _ ys: Int, _ t: Int) -> Float {
  if let h = stripHold { return xs >= h[0] && xs < h[1] && t >= h[2] && t < h[3] && realRows.contains(ys) ? 50 : 0 }
  return holdoutDY != 0 ? depthAt(xs, ys, t, holdoutDY) : 0 }
@inline(__always) func hidDepth(_ xs: Int, _ ys: Int, _ t: Int) -> Float { holdout ? max(realDepth(xs, ys, t), fakeDepth(xs, ys, t)) : realDepth(xs, ys, t) }
let hidRows = holdout ? rowsWhere(hidDepth) : realRows.sorted()
let EXT = 60   // rows kept beyond the hole, for the mirror
let Y0 = max(0, hidRows.first! - EXT), Y1 = min(OH, hidRows.last! + EXT + 1), BH = Y1 - Y0
say(String(format: "hidden output rows %d–%d%@", hidRows.first!, hidRows.last!, holdout ? " (hold-out)" : ""))

// ---------- 3. still layer ----------
let S = buffer(BH*OW*3, Float(0)), SL = buffer(BH*OW, Float(0)), Sn = buffer(BH*OW, Int32(0))
parallel(BH) { r in let ys = Y0 + r; var lum = [Float](repeating: 0, count: N), vis = [Bool](repeating: false, count: N)
  for xs in 0..<OW { var v: [Float] = []
    for t in 0..<N { vis[t] = hidDepth(xs, ys, t) <= 0; if vis[t] { lum[t] = lumOf(F + ((t*OH + ys)*OW + xs)*4); v.append(lum[t]) } }
    let j = r*OW + xs; Sn[j] = Int32(v.count); if v.isEmpty { continue }
    v.sort(); let thr = v[Int(0.15*Double(v.count-1))] + 4
    var sb = 0.0, sg = 0.0, sr = 0.0, m = 0.0
    for t in 0..<N where vis[t] && lum[t] <= thr { let p = F + ((t*OH + ys)*OW + xs)*4; sb += Double(p[0]); sg += Double(p[1]); sr += Double(p[2]); m += 1 }
    S[j*3] = Float(sb/m); S[j*3+1] = Float(sg/m); S[j*3+2] = Float(sr/m) } }
for j in 0..<(BH*OW) where Sn[j] < MINN { Sn[j] = 0 }
let never = (0..<(BH*OW)).filter { Sn[$0] == 0 }
for c in 0..<3 {   // membrane fill, per channel: a row-wise linear start, then SOR
  for r in 0..<BH { var x = 0; while x < OW { if Sn[r*OW+x] != 0 { x += 1; continue }
    var e = x; while e < OW && Sn[r*OW+e] == 0 { e += 1 }
    let a = x > 0 ? S[(r*OW+x-1)*3+c] : (e < OW ? S[(r*OW+e)*3+c] : 0), b = e < OW ? S[(r*OW+e)*3+c] : a
    for k in x..<e { let f = Float(k - x + 1) / Float(e - x + 1); S[(r*OW+k)*3+c] = a*(1-f) + b*f }; x = e } }
  for _ in 0..<600 { for j in never { let r = j / OW, x = j % OW
    var s: Float = 0, n: Float = 0
    if x > 0 { s += S[(j-1)*3+c]; n += 1 }; if x < OW-1 { s += S[(j+1)*3+c]; n += 1 }
    if r > 0 { s += S[(j-OW)*3+c]; n += 1 }; if r < BH-1 { s += S[(j+OW)*3+c]; n += 1 }
    S[j*3+c] += 1.9 * (s/n - S[j*3+c]) } } }
for j in 0..<(BH*OW) { SL[j] = 0.114*S[j*3] + 0.587*S[j*3+1] + 0.299*S[j*3+2] }
say(String(format: "still layer: %d px membrane-filled (hidden in every frame, or uncovered in fewer than %d)", never.count, MINN))
stamp("still layer")
@inline(__always) func tauAt(_ ys: Int, _ x: Int, _ t: Int) -> Float { let r = ys - Y0
  let L = lumOf(F + ((t*OH + ys)*OW + x)*4), s = SL[r*OW + x]; return max(0, -log(1 - min(0.95, (L - s) / max(8, 255 - s)))) }

// ---------- 5. which veil layer each visible point belongs to ----------
// Several veil layers at different speeds overlap in the aircraft's band (about 205 and 395 px/s in the fuselage's
// rows). A veil carried through the hole at the wrong speed is squeezed or stretched along x by the ratio of the two
// speeds, so its soft sides turn into steep straight ones: a cloud at 395 px/s carried at 205 px/s came out a box.
// So every visible point of the band is given a membership per layer, from how well it matches its own past and
// future shifted at that layer's speed (optical depth, over a window around it), and the fill carries every layer at
// its own speed.
let SPF = (opt("--layers")?.first ?? "165,205,300,395,455").split(separator: ",").map { Double($0)! }
let K = SPF.count, VK = SPF.map { Float($0 * sxF / fps) }
let DT = Int(opt("--dt")?.first ?? "2")!
let BXW = Int(opt("--bx")?.first ?? "16")!, BYW = Int(opt("--by")?.first ?? "8")!, BTW = Int(opt("--bt")?.first ?? "6")!
let T0 = Float(opt("--t0")?.first ?? "0.002")!, T1 = Float(opt("--t1")?.first ?? "0.8")!
@inline(__always) func bi(_ t: Int, _ r: Int, _ x: Int) -> Int { (t*BH + r)*OW + x }
let HB = buffer(N*BH*OW, UInt8(0))
parallel(N) { t in for r in 0..<BH { for x in 0..<OW where hidDepth(x, Y0 + r, t) > 0 { HB[bi(t, r, x)] = 1 } } }
let TF = buffer(N*BH*OW, Float16(-1))
parallel(N) { t in for r in 0..<BH { for x in 0..<OW where HB[bi(t, r, x)] == 0 { TF[bi(t, r, x)] = Float16(tauAt(Y0 + r, x, t)) } } }
@inline(__always) func tauX(_ t: Int, _ r: Int, _ x: Float) -> Float {   // tau at a fractional column; -1 where hidden
  let xi = Int(floor(x)); if xi < 0 || xi >= OW - 1 { return -1 }
  let a = Float(TF[bi(t, r, xi)]), b = Float(TF[bi(t, r, xi + 1)]); if a < 0 || b < 0 { return -1 }
  let w = x - Float(xi); return a*(1-w) + b*w }
@inline(__always) func tauC(_ t: Int, _ r: Int, _ x: Float) -> Float {   // the same with a Catmull-Rom kernel, which keeps the veils' fine texture
  let xi = Int(floor(x)); if xi < 1 || xi >= OW - 2 { return tauX(t, r, x) }
  let p0 = Float(TF[bi(t, r, xi - 1)]), p1 = Float(TF[bi(t, r, xi)]), p2 = Float(TF[bi(t, r, xi + 1)]), p3 = Float(TF[bi(t, r, xi + 2)])
  if p1 < 0 || p2 < 0 { return -1 }; if p0 < 0 || p3 < 0 { return tauX(t, r, x) }
  let u = x - Float(xi), u2 = u*u, u3 = u2*u
  return max(0, 0.5 * (2*p1 + (p2 - p0)*u + (2*p0 - 5*p1 + 4*p2 - p3)*u2 + (3*p1 - p0 - 3*p2 + p3)*u3)) }
stamp("tau field")
let SX = 4, SY = 2, GW = (OW + SX - 1) / SX, GH = (BH + SY - 1) / SY
@inline(__always) func gi(_ k: Int, _ t: Int, _ j: Int, _ i: Int) -> Int { ((k*N + t)*GH + j)*GW + i }
let EK = buffer(K*N*GH*GW, Float16(-1))          // mean residual per layer on the grid; -1 = not enough evidence
do { let SUM = buffer(N*GH*GW, Float(0)), CNT = buffer(N*GH*GW, Float(0))
  for k in 0..<K { let vk = VK[k]
    parallel(N) { t in
      var P = [Double](repeating: 0, count: (BH+1)*(OW+1)), Q = P
      let tb = (t - DT + N) % N, tf = (t + DT) % N
      for r in 0..<BH { var rs = 0.0, rc = 0.0
        for x in 0..<OW { let p = TF[bi(t, r, x)]
          if p >= 0 { let pf = Float(p)
            let b = tauX(tb, r, Float(x) + vk*Float(DT)); if b >= 0 { rs += Double((pf-b)*(pf-b)); rc += 1 }
            let f = tauX(tf, r, Float(x) - vk*Float(DT)); if f >= 0 { rs += Double((pf-f)*(pf-f)); rc += 1 } }
          P[(r+1)*(OW+1) + x+1] = P[r*(OW+1) + x+1] + rs; Q[(r+1)*(OW+1) + x+1] = Q[r*(OW+1) + x+1] + rc } }
      for j in 0..<GH { let r = j*SY, r0 = max(0, r - BYW), r1 = min(BH, r + BYW + 1)
        for i in 0..<GW { let x = i*SX, x0 = max(0, x - BXW), x1 = min(OW, x + BXW + 1)
          let s = P[r1*(OW+1)+x1] - P[r0*(OW+1)+x1] - P[r1*(OW+1)+x0] + P[r0*(OW+1)+x0]
          let c = Q[r1*(OW+1)+x1] - Q[r0*(OW+1)+x1] - Q[r1*(OW+1)+x0] + Q[r0*(OW+1)+x0]
          SUM[(t*GH + j)*GW + i] = Float(s); CNT[(t*GH + j)*GW + i] = Float(c) } } }
    parallel(GH) { j in for i in 0..<GW { for t in 0..<N { var s: Float = 0, c: Float = 0
      for d in -BTW...BTW { let tt = (t + d + N) % N; s += SUM[(tt*GH + j)*GW + i]; c += CNT[(tt*GH + j)*GW + i] }
      EK[gi(k, t, j, i)] = c >= 40 ? Float16(s / c) : -1 } } } }
  SUM.deallocate(); CNT.deallocate() }
stamp("layer residuals")
// memberships: a soft choice by residual; where the residuals hardly differ (flat optical depth), the row's prior
let MEM = buffer(K*N*GH*GW, Float16(0))
var prior = [[Double]](repeating: [Double](repeating: 0, count: K), count: GH)
do { var acc = [[Double]](repeating: [Double](repeating: 1e-6, count: K), count: GH)
  for j in 0..<GH { for t in stride(from: 0, to: N, by: 3) { for i in 0..<GW {
    var e = [Float](repeating: 0, count: K), ok = true
    for k in 0..<K { e[k] = Float(EK[gi(k, t, j, i)]); if e[k] < 0 { ok = false } }
    if !ok { continue }
    let lo = e.min()!, hi = e.max()!; if hi - lo < 0.004 { continue }
    let x = min(OW-1, i*SX), r = min(BH-1, j*SY); let tv = Float(TF[bi(t, r, x)]); if tv < 0.05 { continue }
    for k in 0..<K where e[k] == lo { acc[j][k] += Double(tv) } } } }
  for j in 0..<GH { let jj = (max(0, j-6)...min(GH-1, j+6)); var s = [Double](repeating: 0, count: K)
    for q in jj { for k in 0..<K { s[k] += acc[q][k] } }; let tot = s.reduce(0, +); prior[j] = s.map { $0 / tot } } }
// first the confident choices; then, where the residuals hardly differ (a flat, saturated cloud interior), the
// confident memberships around it at two scales (the cloud's own edges), and only then the row's prior
let CF = buffer(N*GH*GW, Float16(0)), MC = buffer(K*N*GH*GW, Float16(0))
parallel(N) { t in for j in 0..<GH { for i in 0..<GW {
  var e = [Float](repeating: 0, count: K), ok = true
  for k in 0..<K { e[k] = Float(EK[gi(k, t, j, i)]); if e[k] < 0 { ok = false } }
  if !ok { continue }
  let lo = e.min()!, hi = e.max()!
  var w = e.map { exp(-($0 - lo) / (T0 + T1*lo)) }; let sw = w.reduce(0, +); w = w.map { $0 / sw }
  let conf = (hi - lo) / (hi - lo + 0.004); CF[(t*GH + j)*GW + i] = Float16(conf)
  for k in 0..<K { MC[gi(k, t, j, i)] = Float16(conf * w[k]) } } } }
func neighbourhood(_ hx: Int, _ hy: Int, _ ht: Int) -> (UnsafeMutablePointer<Float16>, UnsafeMutablePointer<Float16>) {
  let M = buffer(K*N*GH*GW, Float16(0)), D = buffer(N*GH*GW, Float16(0))
  let cx = max(1, hx / SX), cy = max(1, hy / SY)
  parallel(N) { t in
    var acc = [Float](repeating: 0, count: (K+1)*GH*GW)
    for d in -ht...ht { let tt = (t + d + N) % N
      for c in 0..<(GH*GW) { acc[K*GH*GW + c] += Float(CF[tt*GH*GW + c]); for k in 0..<K { acc[k*GH*GW + c] += Float(MC[gi(k, tt, 0, 0) + c]) } } }
    var P = [Double](repeating: 0, count: (GH+1)*(GW+1))
    for ch in 0...K {
      for j in 0..<GH { var rs = 0.0; for i in 0..<GW { rs += Double(acc[ch*GH*GW + j*GW + i]); P[(j+1)*(GW+1) + i+1] = P[j*(GW+1) + i+1] + rs } }
      for j in 0..<GH { let j0 = max(0, j - cy), j1 = min(GH, j + cy + 1)
        for i in 0..<GW { let i0 = max(0, i - cx), i1 = min(GW, i + cx + 1)
          let s = P[j1*(GW+1)+i1] - P[j0*(GW+1)+i1] - P[j1*(GW+1)+i0] + P[j0*(GW+1)+i0]
          acc[ch*GH*GW + j*GW + i] = Float(s / Double((j1-j0)*(i1-i0)*(2*ht+1))) } } }
    for c in 0..<(GH*GW) { let dn = acc[K*GH*GW + c]; D[t*GH*GW + c] = Float16(dn)
      if dn > 1e-4 { for k in 0..<K { M[gi(k, t, 0, 0) + c] = Float16(acc[k*GH*GW + c] / dn) } } } }
  return (M, D) }
let (M1, D1) = neighbourhood(48, 24, 4), (M2, D2) = neighbourhood(160, 60, 8)
parallel(N) { t in for j in 0..<GH { for i in 0..<GW { let c = (t*GH + j)*GW + i
  let conf = Float(CF[c]), d1 = Float(D1[c]), d2 = Float(D2[c])
  let c1 = d1 / (d1 + 0.05), c2 = d2 / (d2 + 0.02)
  for k in 0..<K { let far = c2 * Float(M2[gi(k, t, j, i)]) + (1 - c2) * Float(prior[j][k])
    let near = c1 * Float(M1[gi(k, t, j, i)]) + (1 - c1) * far
    MEM[gi(k, t, j, i)] = Float16(Float(MC[gi(k, t, j, i)]) + (1 - conf) * near) } } } }
M1.deallocate(); D1.deallocate(); M2.deallocate(); D2.deallocate(); CF.deallocate(); MC.deallocate()
say("layers " + SPF.map { String(format: "%.0f", $0) }.joined(separator: "/") + " px/s; row priors (top, middle, bottom of the band): " +
  [GH/6, GH/2, 5*GH/6].map { j in prior[j].map { String(format: "%.2f", $0) }.joined(separator: " ") }.joined(separator: " | "))
@inline(__always) func memAt(_ k: Int, _ t: Int, _ r: Int, _ x: Float) -> Float {   // bilinear on the grid
  let gx = max(0, min(Float(GW - 1), x / Float(SX))), gy = max(0, min(Float(GH - 1), Float(r) / Float(SY)))
  let i0 = min(GW - 2, Int(gx)), j0 = min(GH - 2, Int(gy)); let fx = gx - Float(i0), fy = gy - Float(j0)
  let a = Float(MEM[gi(k, t, j0, i0)]), b = Float(MEM[gi(k, t, j0, i0+1)]), c = Float(MEM[gi(k, t, j0+1, i0)]), d = Float(MEM[gi(k, t, j0+1, i0+1)])
  return (a*(1-fx) + b*fx)*(1-fy) + (c*(1-fx) + d*fx)*fy }
stamp("memberships")
if let vd = opt("--layer-map")?.first {
  let cols: [(Float, Float, Float)] = [(1, 0.2, 0.2), (1, 0.8, 0.1), (0.2, 0.9, 0.2), (0.2, 0.6, 1), (0.8, 0.3, 1), (1, 1, 1), (0.5, 0.5, 0.5)]
  for t in [37, 45, 60, 75, 90, 112, 120, 150, 187] where t < N {
    let img = buffer(OW*BH*4, UInt8(0))
    for r in 0..<BH { for x in 0..<OW { let o = (r*OW + x)*4; img[o+3] = 255
      let tv = Float(TF[bi(t, r, x)]); if tv < 0 { img[o] = 0; img[o+1] = 0; img[o+2] = 0; continue }
      var rr: Float = 0, gg: Float = 0, bb: Float = 0
      for k in 0..<K { let m = memAt(k, t, r, Float(x)); rr += m*cols[k].0; gg += m*cols[k].1; bb += m*cols[k].2 }
      let br = min(1, 0.15 + tv*1.5)
      img[o+2] = UInt8(min(255, rr*br*255)); img[o+1] = UInt8(min(255, gg*br*255)); img[o] = UInt8(min(255, bb*br*255)) } }
    let ctx = CGContext(data: img, width: OW, height: BH, bitsPerComponent: 8, bytesPerRow: OW*4, space: cs, bitmapInfo: BI)!
    let d = CGImageDestinationCreateWithURL(URL(fileURLWithPath: vd + String(format: "/mem_%03d.png", t)) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(d, ctx.makeImage()!, nil); CGImageDestinationFinalize(d); img.deallocate() } }
// ---------- 6. every layer carried through the hole at its own speed, from the hole's own edges ----------
// A hidden pixel x at frame t is, for a layer moving left at v, what the first visible point along its track showed:
// to the right of it (x + v d, d frames earlier) and to the left (x - v d, d frames later), in its own row. The track
// ends at the hole's edge in that row at that moment (the fin, the engine, the nose and tail, or a few frames back
// for a row the bob has just covered), so the fill meets the clip at every edge, and a veil keeps its shape because
// it moves at its own speed.
// The two ends are interpolated along the track; the layers' optical depths add.
let HR = hidRows.count, rowIdx = buffer(OH, -1); for (k, ys) in hidRows.enumerated() { rowIdx[ys] = k }
let TAUH = buffer(HR*N*OW, Float(0))     // the rebuilt optical depth of the hidden pixels
let MAXR = 12
let RUNA = buffer(N*BH*MAXR, Int16(0)), RUNB = buffer(N*BH*MAXR, Int16(-1)), RUNN = buffer(N*BH, UInt8(0))
parallel(N) { t in for r in 0..<BH { var n = 0, x = 0
  while x < OW { if HB[bi(t, r, x)] == 0 { x += 1; continue }
    var e = x; while e + 1 < OW && HB[bi(t, r, e + 1)] != 0 { e += 1 }
    if n < MAXR { RUNA[(t*BH + r)*MAXR + n] = Int16(x); RUNB[(t*BH + r)*MAXR + n] = Int16(e); n += 1 }
    x = e + 1 }
  RUNN[t*BH + r] = UInt8(n) } }
@inline(__always) func visR(_ t: Int, _ r: Int, _ x: Int) -> Int {   // first visible column >= x
  let o = (t*BH + r)*MAXR; for q in 0..<Int(RUNN[t*BH + r]) { if x >= Int(RUNA[o+q]) && x <= Int(RUNB[o+q]) { return Int(RUNB[o+q]) + 1 } }; return x }
@inline(__always) func visL(_ t: Int, _ r: Int, _ x: Int) -> Int {   // last visible column <= x
  let o = (t*BH + r)*MAXR; for q in 0..<Int(RUNN[t*BH + r]) { if x >= Int(RUNA[o+q]) && x <= Int(RUNB[o+q]) { return Int(RUNA[o+q]) - 1 } }; return x }
// the end of the track of layer k from (x, t), on side s (+1: to the right, earlier; -1: to the left, later):
// returns (layer optical depth there, distance along x) or nil if the track leaves the frame first
@inline(__always) func trackEnd(_ k: Int, _ r: Int, _ x: Int, _ t: Int, _ s: Int) -> (Float, Float)? {
  let v = VK[k]; var d = 1
  for _ in 0..<12 {
    let tt = ((t - s*d) % N + N) % N, px = Float(x) + Float(s) * v * Float(d)
    if px < 1 || px > Float(OW - 2) { return nil }
    let xi = Int(floor(px)); let c = s > 0 ? visR(tt, r, xi) : visL(tt, r, xi + 1)
    if s > 0 ? (c == xi && visR(tt, r, xi + 1) == xi + 1) : (c == xi + 1 && visL(tt, r, xi) == xi) {
      // visible at whole frame d: the edge was crossed between d - 1 and d; place it from the edge column at d
      let edge = s > 0 ? visR(tt, r, x) : visL(tt, r, x)
      let u = max(Float(d - 1), min(Float(d), abs(Float(edge - x)) / v))
      var acc: Float = 0, ws: Float = 0
      let d1 = max(1, Int(ceil(u)))
      for dd in [d1, d1 + 1] { let w = 1 - abs(u - Float(dd - 1)); if w <= 0 { continue }
        let t2 = ((t - s*dd) % N + N) % N, p2 = Float(x) + Float(s) * v * Float(dd)
        let tv = tauC(t2, r, p2); if tv < 0 { continue }
        acc += w * memAt(k, t2, r, p2) * tv; ws += w }
      if ws <= 0 { let tv = tauX(tt, r, px); if tv < 0 { return nil }; return (memAt(k, tt, r, px) * tv, max(0.5, v*u)) }
      return (acc / ws, max(0.5, v*u)) }
    d = max(d + 1, Int(ceil(abs(Float(c - x)) / v))) }
  return nil }
parallel(HR) { hk in let ys = hidRows[hk]; let r = ys - Y0
  for t in 0..<N { for xs in 0..<OW where HB[bi(t, r, xs)] != 0 {
    var tot: Float = 0
    for k in 0..<K {
      let a = trackEnd(k, r, xs, t, +1), b = trackEnd(k, r, xs, t, -1)
      if let a = a, let b = b { tot += (a.0 * b.1 + b.0 * a.1) / (a.1 + b.1) }
      else if let a = a { tot += a.0 } else if let b = b { tot += b.0 } }
    TAUH[(hk*N + t)*OW + xs] = tot } } }
stamp("layer transport")

// ---------- 7. mirror near the top and bottom of every hidden run ----------
// Where the hole's edge runs along x (the fuselage's top and bottom lines, the engine), the tracks end far away, so
// near those edges the clip's own pixels reflected about the row just outside take over. Under a narrow notch (the
// antenna's: the edge is lower on both sides within MW px) the row reflected about is the edge beside it, and where
// the reflection lands in the notch it takes the notch's own fill (the transport).
// Each reflection and the transport are weighted by inverse squared distance: to that edge, and, for the transport,
// to the row's run end (where the track already meets the clip) or LAM, and a reflection counts only where the row's
// run end is much farther than the column's, so a slanted edge (the fin's, the nose's) is left to the transport and
// the far side of a run never reaches across.
let MW = Int(opt("--mw")?.first ?? "24")!
parallel(N) { t in
  var top = [Int16](repeating: -1, count: BH*OW), bot = top, T0v = [Float](repeating: 0, count: HR*OW)
  for hk in 0..<HR { for x in 0..<OW { T0v[hk*OW + x] = TAUH[(hk*N + t)*OW + x] } }
  for x in 0..<OW { var r = 0
    while r < BH { if HB[bi(t, r, x)] == 0 { r += 1; continue }
      var e = r; while e + 1 < BH && HB[bi(t, e + 1, x)] != 0 { e += 1 }
      for q in r...e { top[q*OW + x] = Int16(r); bot[q*OW + x] = Int16(e) }
      r = e + 1 } }
  @inline(__always) func src(_ r: Int, _ x: Int) -> Float? {   // the clip where visible, else the transport's fill
    if r < 0 || r >= BH { return nil }; if HB[bi(t, r, x)] == 0 { return Float(TF[bi(t, r, x)]) }
    let k = rowIdx[Y0 + r]; return k >= 0 ? T0v[k*OW + x] : nil }
  for r in 0..<BH { let yy = Y0 + r, k = rowIdx[yy]; if k < 0 { continue }
    for xs in 0..<OW where HB[bi(t, r, xs)] != 0 {
      // a narrow notch: the edge is lower (higher, for the bottom) on BOTH sides within MW px; a slope (the fin, the
      // nose) is lower on one side only and keeps its own edge
      var a = Int(top[r*OW + xs]), b = Int(bot[r*OW + xs])
      var aL = -1, aR = -1, bL = Int.max, bR = Int.max
      for dx in -MW...MW where dx != 0 { let x2 = xs + dx; if x2 < 0 || x2 >= OW || HB[bi(t, r, x2)] == 0 { continue }
        let ta = Int(top[r*OW + x2]), tb = Int(bot[r*OW + x2])
        if dx < 0 { aL = max(aL, ta); bL = min(bL, tb) } else { aR = max(aR, ta); bR = min(bR, tb) } }
      if aL >= 0 && aR >= 0 && min(aL, aR) > a { a = min(aL, aR) }
      if bL < Int.max && bR < Int.max && max(bL, bR) < b { b = max(bL, bR) }
      let dT = r - a + 1, dB = b - r + 1
      let vT = src(a - dT, xs), vB = src(b + dB, xs)
      if vT == nil && vB == nil { continue }
      let o = (t*BH + r)*MAXR; var dH: Float = 1e6
      for q in 0..<Int(RUNN[t*BH + r]) { let ra = Int(RUNA[o+q]), rb = Int(RUNB[o+q]); if xs >= ra && xs <= rb { dH = Float(min(xs - ra + 1, rb + 1 - xs)) } }
      let i = (k*N + t)*OW + xs
      var wsum = 1 / (dH*dH) + 1 / (LAM*LAM), acc = wsum * T0v[k*OW + xs]
      // only where the edge runs along x: a slanted edge (the fin's leading edge, the nose) has its row's run end
      // about as near as the column's, and there the reflection would pull in sky from beside the edge, not across it
      @inline(__always) func along(_ d: Int) -> Float { let q = min(1, max(0, (dH / Float(d) - 1.5) / 2.5)); return q*q*(3 - 2*q) }
      if let v = vT { let w = along(dT) / Float(dT*dT); acc += w * v; wsum += w }
      if let v = vB { let w = along(dB) / Float(dB*dB); acc += w * v; wsum += w }
      TAUH[i] = acc / wsum } } }
stamp("mirror")

// ---------- 8. colour, feathered into the clip ----------
let truth: UnsafeMutablePointer<UInt8>? = holdout ? { let c = UnsafeMutablePointer<UInt8>.allocate(capacity: N*OW*OH*4); c.update(from: F, count: N*OW*OH*4); return c }() : nil
parallel(HR) { k in let ys = hidRows[k]; let r = ys - Y0
  for t in 0..<N { for xs in 0..<OW { let d = hidDepth(xs, ys, t); if d <= 0 { continue }
    let beta = 1 - exp(-min(3, TAUH[(k*N + t)*OW + xs])); let j = r*OW + xs
    let wgt = d >= FEATHER ? Float(1) : { let q = d / FEATHER; return q*q*(3 - 2*q) }()
    let p = F + ((t*OH + ys)*OW + xs)*4
    for c in 0..<3 { let s = S[j*3+c]; let v = s + beta * (255 - s); p[c] = UInt8(max(0, min(255, (Float(p[c])*(1-wgt) + v*wgt).rounded()))) } } } }
stamp("rebuilt")

// ---------- hold-out score ----------
if let T = truth {
  func box9(_ img: UnsafeMutablePointer<UInt8>, _ t: Int, _ ys: Int, _ xs: Int) -> Float { var s: Float = 0, n: Float = 0
    for y in max(0, ys-4)...min(OH-1, ys+4) { for x in max(0, xs-4)...min(OW-1, xs+4) { s += lumOf(img + ((t*OH + y)*OW + x)*4); n += 1 } }; return s/n }
  var ae = 0.0, aeS = 0.0, n = 0, hpR = 0.0, hpT = 0.0, nv = 0, aeV = 0.0, mcR = 0.0, m0R = 0.0, mcT = 0.0, m0T = 0.0
  let sp = [165.0, 205.0, 395.0, 455.0].map { $0 * sxF / fps * 2 }
  for t in stride(from: 0, to: N-2, by: 2) { for ys in Y0..<Y1 { let r = ys - Y0; for xs in 4..<(OW-4) {
    if fakeDepth(xs, ys, t) <= 0 || realDepth(xs, ys, t) > 0 { continue }
    let lr = lumOf(F + ((t*OH + ys)*OW + xs)*4), lt = lumOf(T + ((t*OH + ys)*OW + xs)*4); ae += Double(abs(lr - lt)); aeS += Double(abs(SL[r*OW+xs] - lt)); n += 1
    if lt - SL[r*OW+xs] > 8 && (xs + ys + t) % 3 == 0 {
      nv += 1; aeV += Double(abs(lr - lt)); hpR += Double(abs(lr - box9(F, t, ys, xs))); hpT += Double(abs(lt - box9(T, t, ys, xs)))
      if fakeDepth(xs, ys, t+2) > 0 && realDepth(xs, ys, t+2) <= 0 {
        func mc(_ img: UnsafeMutablePointer<UInt8>) -> (Double, Double) { let l0 = lumOf(img + ((t*OH + ys)*OW + xs)*4); var best: Float = .infinity
          for s in sp { let x2 = Double(xs) - s; let x0 = Int(floor(x2)); if x0 < 0 || x0+1 >= OW { continue }; let w = Float(x2 - Double(x0))
            let q = lumOf(img + (((t+2)*OH + ys)*OW + x0)*4)*(1-w) + lumOf(img + (((t+2)*OH + ys)*OW + x0+1)*4)*w; best = min(best, abs(l0 - q)) }
          return (Double(best), Double(abs(l0 - lumOf(img + (((t+2)*OH + ys)*OW + xs)*4)))) }
        let a = mc(F), b = mc(T); mcR += a.0; m0R += a.1; mcT += b.0; m0T += b.1 } } } } }
  say(String(format: "HOLD-OUT (%@; scored only where the truth is known): %d px", stripHold != nil ? "columns \(stripHold![0])–\(stripHold![1]) hidden in frames \(stripHold![2])–\(stripHold![3])" : "cover copy \(holdoutDY) px lower", n))
  say(String(format: "  mean abs error %.2f grey (still layer alone %.2f); on veil px %.2f grey", ae/Double(n), aeS/Double(n), aeV/Double(max(1, nv))))
  say(String(format: "  texture |L - box9(L)| on veil px: rebuilt %.2f vs truth %.2f, ratio %.2f", hpR/Double(max(1, nv)), hpT/Double(max(1, nv)), hpR/max(1e-9, hpT)))
  if mcR > 0 { say(String(format: "  translation gain (2 frames, layer speeds): rebuilt %.2fx vs truth %.2fx", m0R/mcR, m0T/max(1e-9, mcT))) }
  if let d = reportDir { try? report.write(toFile: d + "/holdout.txt", atomically: true, encoding: .utf8) }
  exit(0) }

// ---------- 9. encode ----------
try? FileManager.default.removeItem(atPath: outPath)
let writer = try! AVAssetWriter(outputURL: URL(fileURLWithPath: outPath), fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: OW, AVVideoHeightKey: OH,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_200_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA), kCVPixelBufferWidthKey as String: OW, kCVPixelBufferHeightKey as String: OH])
writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
for n in 0..<N {
  var ob: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &ob); CVPixelBufferLockBaseAddress(ob!, [])
  let base = CVPixelBufferGetBaseAddress(ob!)!.assumingMemoryBound(to: UInt8.self), bpr = CVPixelBufferGetBytesPerRow(ob!)
  for y in 0..<OH { (base + y*bpr).update(from: F + ((n*OH + y)*OW)*4, count: OW*4) }
  CVPixelBufferUnlockBaseAddress(ob!, [])
  while !input.isReadyForMoreMediaData { usleep(2000) }
  adaptor.append(ob!, withPresentationTime: CMTime(value: CMTimeValue(n), timescale: CMTimeScale(fps.rounded()))) }
input.markAsFinished(); let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
say("\(outPath) \(OW)x\(OH) \(N) frames " + (writer.status == .completed ? "ok" : "FAILED"))
if let d = reportDir { try? report.write(toFile: d + "/cleanplate5.txt", atomically: true, encoding: .utf8) }
stamp("encoded")
