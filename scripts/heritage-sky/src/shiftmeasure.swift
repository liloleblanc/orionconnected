import AppKit
import CoreGraphics
// Measures how far a band of the frame has moved between two stills, by
// cross-correlating a 1-D luminance profile. Horizontal by default; --vertical
// measures rise/fall instead (for the aircraft's bob).
let a = CommandLine.arguments
let pathA = a[1], pathB = a[2]
let yLo = Double(a[3])!, yHi = Double(a[4])!, xLo = Double(a[5])!, xHi = Double(a[6])!
let maxShift = Int(a[7])!
let vertical = a.contains("--vertical")
func load(_ p: String) -> (CGContext, Int, Int)? {
    guard let im = NSImage(contentsOfFile: p),
          let cg = im.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
    let W = cg.width / 2, H = cg.height / 2          // half-res is plenty and 4x faster
    let cs = CGColorSpaceCreateDeviceRGB()
    guard let c = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4,
                            space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    c.interpolationQuality = .high
    c.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
    return (c, W, H)
}
guard let (ca, W, H) = load(pathA), let (cb, _, _) = load(pathB),
      let pa = ca.data?.bindMemory(to: UInt8.self, capacity: W*H*4),
      let pb = cb.data?.bindMemory(to: UInt8.self, capacity: W*H*4) else { exit(1) }
// context rows are bottom-up; fractions given top-down
let y0 = Int((1 - yHi) * Double(H)), y1 = Int((1 - yLo) * Double(H))
let x0 = Int(xLo * Double(W)), x1 = Int(xHi * Double(W))
func lum(_ p: UnsafeMutablePointer<UInt8>, _ x: Int, _ y: Int) -> Double {
    let i = (y*W + x)*4; return Double(p[i])*0.299 + Double(p[i+1])*0.587 + Double(p[i+2])*0.114
}
func profile(_ p: UnsafeMutablePointer<UInt8>) -> [Double] {
    if vertical {
        return (y0..<y1).map { y in (x0..<x1).reduce(0.0) { $0 + lum(p, $1, y) } / Double(x1 - x0) }
    } else {
        return (x0..<x1).map { x in (y0..<y1).reduce(0.0) { $0 + lum(p, x, $1) } / Double(y1 - y0) }
    }
}
let A = profile(pa), B = profile(pb)
var best = 0, bestErr = Double.infinity
for sh in -maxShift...maxShift {
    var e = 0.0, n = 0
    for i in 0..<A.count { let j = i + sh; if j < 0 || j >= B.count { continue }; e += abs(A[i] - B[j]); n += 1 }
    if n > A.count/2 { let m = e / Double(n); if m < bestErr { bestErr = m; best = sh } }
}
// shift is in half-res px; report full-res. Context is bottom-up, so a
// positive vertical shift means the content moved DOWN on screen.
let full = best * 2
print(vertical ? "\(full)" : "\(-full)")   // horizontal: negative = moved LEFT
