import AppKit
// Sky plate: a JPG background with alpha layers drawn at (x, y, alpha). args: out W H bg.jpg layer,x,y,alpha ...
let a = CommandLine.arguments; let out = a[1], W = Int(a[2])!, H = Int(a[3])!
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.interpolationQuality = .high
let bg = NSImage(contentsOfFile: a[4])!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
ctx.draw(bg, in: CGRect(x: 0, y: 0, width: W, height: H))
for spec in a.dropFirst(5) {
  let f = spec.split(separator: ",").map(String.init)
  let img = NSImage(contentsOfFile: f[0])!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
  let x = Double(f[1])!, y = Double(f[2])!, al = CGFloat(Double(f[3])!)
  ctx.saveGState(); ctx.setAlpha(al)
  ctx.draw(img, in: CGRect(x: x, y: Double(H) - y - Double(img.height), width: Double(img.width), height: Double(img.height)))
  ctx.restoreGState()
}
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .jpeg, properties: [.compressionFactor: 0.88])!.write(to: URL(fileURLWithPath: out)); print(out, W, H)
