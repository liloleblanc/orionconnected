import AppKit
// White cloud over a vertical sky gradient: fit the gradient from the top/bottom margins, unmix per row.
let a = CommandLine.arguments; let src = a[1], out = a[2]
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
let p = ctx.data!.bindMemory(to: UInt8.self, capacity: W*H*4)
// sample sky rows: top 12% and bottom 10%, columns 0..20 and W-20..W, fit quadratic per channel in y
var ys: [Double] = [], vs: [[Double]] = [[], [], []]
for y in stride(from: 0, to: H, by: 4) where y < H*12/100 || y > H*90/100 {
  for x in [2, 6, 10, 14, W-15, W-11, W-7, W-3] { ys.append(Double(y)); for c in 0..<3 { vs[c].append(Double(p[(y*W+x)*4+c])) } }
}
func fit(_ y: [Double], _ v: [Double]) -> (Double, Double, Double) {
  // least squares for v = a + b y + c y^2
  var S = [[Double]](repeating: [0,0,0], count: 3), T = [0.0, 0.0, 0.0]
  for i in 0..<y.count { let yy = y[i]; let r = [1.0, yy, yy*yy]; for j in 0..<3 { T[j] += r[j]*v[i]; for k in 0..<3 { S[j][k] += r[j]*r[k] } } }
  // solve 3x3 by Cramer's rule
  func det(_ m: [[Double]]) -> Double { m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) - m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) + m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]) }
  let D = det(S); var sol = [0.0, 0.0, 0.0]
  for j in 0..<3 { var M = S; for i in 0..<3 { M[i][j] = T[i] }; sol[j] = det(M)/D }
  return (sol[0], sol[1], sol[2])
}
let coef = (0..<3).map { fit(ys, vs[$0]) }
var outPx = [UInt8](repeating: 0, count: W*H*4)
for y in 0..<H {
  let yy = Double(y)
  let bg = coef.map { $0.0 + $0.1*yy + $0.2*yy*yy }
  for x in 0..<W {
    let i = (y*W+x)*4
    // alpha from the channel with the most lever (usually red); average the two best
    var best: [Double] = []
    for c in 0..<3 { let lever = 255 - bg[c]; if lever > 40 { best.append(max(0, min(1, (Double(p[i+c]) - bg[c]) / lever))) } }
    var al = best.isEmpty ? 0 : best.reduce(0, +) / Double(best.count)
    if al < 0.03 { al = 0 }
    let v = UInt8(min(255, al*255))
    outPx[i] = v; outPx[i+1] = v; outPx[i+2] = v; outPx[i+3] = v
  }
}
let octx = CGContext(data: &outPx, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
try! NSBitmapImageRep(cgImage: octx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print("bg top/bottom red:", Int(coef[0].0), Int(coef[0].0 + coef[0].1*Double(H) + coef[0].2*Double(H*H)))
