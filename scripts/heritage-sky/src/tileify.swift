import AppKit
// Crossfade the right end of an image onto its left start so it tiles horizontally. args: in out overlapPx
let a = CommandLine.arguments; let src = a[1], out = a[2], ov = Int(a[3])!
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height, Wo = W - ov
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
let p = ctx.data!.bindMemory(to: UInt8.self, capacity: W*H*4)
var o = [UInt8](repeating: 0, count: Wo*H*4)
for y in 0..<H { for x in 0..<Wo {
  let i = (y*W+x)*4, j = (y*Wo+x)*4
  if x < ov { let t = Double(x)/Double(ov); let tt = t*t*(3-2*t); let k = (y*W + x + Wo)*4
    for c in 0..<4 { o[j+c] = UInt8(min(255, Double(p[k+c])*(1-tt) + Double(p[i+c])*tt)) } }
  else { for c in 0..<4 { o[j+c] = p[i+c] } }
} }
let octx = CGContext(data: &o, width: Wo, height: H, bitsPerComponent: 8, bytesPerRow: Wo*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
try! NSBitmapImageRep(cgImage: octx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
print(out, Wo, H)
