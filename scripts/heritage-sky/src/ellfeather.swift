import AppKit
// Multiply alpha by an elliptical falloff so a rectangular crop has no straight edges. args: in out innerFrac(0..1)
let a = CommandLine.arguments; let src = a[1], out = a[2], inner = Double(a[3])!
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
let p = ctx.data!.bindMemory(to: UInt8.self, capacity: W*H*4)
let cx = Double(W)/2, cy = Double(H)/2
for y in 0..<H { for x in 0..<W {
  let nx = (Double(x) + 0.5 - cx) / cx, ny = (Double(y) + 0.5 - cy) / cy
  let r = sqrt(nx*nx + ny*ny)              // 1 at the ellipse touching the box edges
  var k = 1.0
  if r > inner { k = max(0, 1 - (r - inner) / (1 - inner)); k = k*k*(3-2*k) }
  if k < 1 { let i = (y*W+x)*4; for c in 0..<4 { p[i+c] = UInt8(Double(p[i+c]) * k) } }
} }
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out)); print(out)
