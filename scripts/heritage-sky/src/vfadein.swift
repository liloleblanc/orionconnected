import AppKit
// Multiply alpha by a ramp from 0 at row r0 to 1 at row r1 (top-down). args: in out r0 r1
let a = CommandLine.arguments; let src = a[1], out = a[2], r0 = Int(a[3])!, r1 = Int(a[4])!
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
let p = ctx.data!.bindMemory(to: UInt8.self, capacity: W*H*4)
for row in 0..<H { let y = H - 1 - row; var k = 1.0
  if y < r0 { k = 0 } else if y < r1 { let t = Double(y - r0) / Double(r1 - r0); k = t*t*(3 - 2*t) }
  if k < 1 { for x in 0..<W { let i = (row*W + x)*4; for c in 0..<4 { p[i+c] = UInt8(Double(p[i+c]) * k) } } } }
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out)); print(out)
