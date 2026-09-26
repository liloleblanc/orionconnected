import AppKit
// Flip an alpha PNG vertically and horizontally, crop rows, tint, resize to a width. args: in out rowFrom rowTo outW tintR tintG tintB
let a = CommandLine.arguments; let src = a[1], out = a[2], r0 = Int(a[3])!, r1 = Int(a[4])!, outW = Double(a[5])!
let tr = Double(a[6])!, tg = Double(a[7])!, tb = Double(a[8])!
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let W = cg.width, H = cg.height
// flipped image: draw with both axes negated
let f = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
f.translateBy(x: CGFloat(W), y: CGFloat(H)); f.scaleBy(x: -1, y: -1); f.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
// crop rows r0..<r1 (top-down): in CG coords the crop rect y = H - r1
let cropped = f.makeImage()!.cropping(to: CGRect(x: 0, y: H - r1, width: W, height: r1 - r0))!
let s = outW / Double(W); let oW = Int(outW), oH = Int(Double(r1 - r0) * s)
let o = CGContext(data: nil, width: oW, height: oH, bitsPerComponent: 8, bytesPerRow: oW*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
o.interpolationQuality = .high; o.draw(cropped, in: CGRect(x: 0, y: 0, width: oW, height: oH))
let p = o.data!.bindMemory(to: UInt8.self, capacity: oW*oH*4)
for i in stride(from: 0, to: oW*oH*4, by: 4) { p[i] = UInt8(Double(p[i]) * tr); p[i+1] = UInt8(Double(p[i+1]) * tg); p[i+2] = UInt8(Double(p[i+2]) * tb) }
try! NSBitmapImageRep(cgImage: o.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out)); print(out, oW, oH)
