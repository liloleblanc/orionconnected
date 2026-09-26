import AppKit
import CoreImage
// Gaussian-blur an alpha PNG; optionally clear alpha below a floor. args: in out radius [alphaFloor]
let a = CommandLine.arguments; let src = a[1], out = a[2], r = Double(a[3])!, floor = a.count > 4 ? Double(a[4])! : 0
guard let cg = NSImage(contentsOfFile: src)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else { exit(1) }
let ci = CIImage(cgImage: cg)
let f = CIFilter(name: "CIGaussianBlur")!; f.setValue(ci, forKey: kCIInputImageKey); f.setValue(r, forKey: kCIInputRadiusKey)
let outCI = f.outputImage!.cropped(to: ci.extent)
let cictx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
guard let res = cictx.createCGImage(outCI, from: ci.extent) else { exit(2) }
let W = res.width, H = res.height
let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(res, in: CGRect(x: 0, y: 0, width: W, height: H))
if floor > 0 { let p = ctx.data!.bindMemory(to: UInt8.self, capacity: W*H*4); let fl = UInt8(floor*255)
  for i in stride(from: 0, to: W*H*4, by: 4) where p[i+3] < fl { p[i] = 0; p[i+1] = 0; p[i+2] = 0; p[i+3] = 0 } }
try! NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out)); print(out, W, H)
