// ━━ CUT THE NASA PICTURES INTO THE EARTH FLOOR'S SQUARES (build time only) ━━━
//
//   swift scripts/earth/tile.swift <EARTH_CACHE> <out: fids-current/earth/v1> [layer …]
//
// For each layer (day-01 … day-12, night) the source picture in the cache
// (fetch.mjs) is decoded straight to 11520×5760 (32 px a degree) with ImageIO,
// then written out as:
//
//   world/<layer>.jpg            the whole Earth, 2048×1024
//   t16/<layer>/<S>_<W>.jpg      60° squares, 960 px (16 px a degree), 18 of them
//   t32/<layer>/<S>_<W>.jpg      30° squares, 960 px (32 px a degree), 72 of them
//
// Plate carrée, row 0 at the north. A square named <S>_<W> covers latitude
// [S, S+span] and longitude [W, W+span], its pixels CENTRED half a pixel in from
// each edge: the same pixel-area convention the floor samples with
// (fids-earth.js, sampleInto). sRGB JPEG at quality 0.82; the APP1 (Exif/XMP)
// APP2 (ICC) and APP13 (Photoshop) segments are stripped, so each file is the picture and
// nothing else (an untagged JPEG is read as sRGB by every browser).
//
// No ffmpeg, no PIL: ImageIO and CoreGraphics only, the house toolchain.

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let QUALITY = 0.82
let LAYERS = (1...12).map { String(format: "day-%02d", $0) } + ["night"]

func fail(_ s: String) -> Never { FileHandle.standardError.write((s + "\n").data(using: .utf8)!); exit(1) }

func sourceFile(_ cache: String, _ layer: String) -> String {
    let dir = cache + "/" + layer
    guard let files = try? FileManager.default.contentsOfDirectory(atPath: dir),
          let f = files.first(where: { $0.hasSuffix(".jpg") }) else { fail("no source picture in " + dir + " (run fetch.mjs first)") }
    return dir + "/" + f
}

func sRGB(_ w: Int, _ h: Int) -> CGContext {
    guard let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
    else { fail("cannot make a \(w)×\(h) canvas") }
    c.interpolationQuality = .high
    return c
}

// Decode the source to exactly w×h (ImageIO scales while it decodes, so the
// 21600-pixel original is never held whole), drawn into sRGB.
func decode(_ path: String, _ w: Int, _ h: Int) -> CGImage {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { fail("cannot open " + path) }
    let opts: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: w,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true
    ]
    guard let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { fail("cannot decode " + path) }
    if img.width == w && img.height == h && img.colorSpace?.name == CGColorSpace.sRGB { return img }
    let c = sRGB(w, h)
    c.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return c.makeImage()!
}

func scaled(_ img: CGImage, _ w: Int, _ h: Int) -> CGImage {
    let c = sRGB(w, h)
    c.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return c.makeImage()!
}

// JPEG bytes with every APP1, APP2 and APP13 segment removed.
func strip(_ d: Data) -> Data {
    let b = [UInt8](d)
    guard b.count > 4, b[0] == 0xFF, b[1] == 0xD8 else { return d }
    var out: [UInt8] = [0xFF, 0xD8]
    var i = 2
    while i + 4 <= b.count {
        guard b[i] == 0xFF else { break }
        let m = b[i + 1]
        if m == 0xDA { break }                                       // start of scan: the rest is the picture
        let len = Int(b[i + 2]) << 8 | Int(b[i + 3])
        if m != 0xE1 && m != 0xE2 && m != 0xED { out.append(contentsOf: b[i..<(i + 2 + len)]) }
        i += 2 + len
    }
    out.append(contentsOf: b[i...])
    return Data(out)
}

func write(_ img: CGImage, _ path: String) -> Int {
    let data = NSMutableData()
    guard let dst = CGImageDestinationCreateWithData(data as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil) else { fail("cannot encode " + path) }
    CGImageDestinationAddImage(dst, img, [kCGImageDestinationLossyCompressionQuality: QUALITY] as CFDictionary)
    guard CGImageDestinationFinalize(dst) else { fail("cannot encode " + path) }
    let bytes = strip(data as Data)
    try? FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    do { try bytes.write(to: URL(fileURLWithPath: path)) } catch { fail("cannot write " + path) }
    return bytes.count
}

// The squares of one level: span degrees each, 960 px, from a plate carrée
// picture of (360/span·960) × (180/span·960).
func cut(_ img: CGImage, span: Int, into dir: String) -> (Int, Int) {
    var n = 0, total = 0
    let rows = 180 / span, cols = 360 / span
    for i in 0..<rows {
        let latS = 90 - (i + 1) * span
        for j in 0..<cols {
            let lonW = -180 + j * span
            guard let sq = img.cropping(to: CGRect(x: j * 960, y: i * 960, width: 960, height: 960)) else { fail("cannot cut \(latS)_\(lonW)") }
            total += write(sq, dir + "/\(latS)_\(lonW).jpg"); n += 1
        }
    }
    return (n, total)
}

let args = CommandLine.arguments
if args.count < 3 { fail("swift tile.swift <EARTH_CACHE> <out dir: fids-current/earth/v1> [layer …]") }
let cache = args[1], out = args[2]
let only = args.count > 3 ? Array(args[3...]) : LAYERS
for layer in only {
    guard LAYERS.contains(layer) else { fail("unknown layer " + layer) }
    let t0 = Date()
    autoreleasepool {
        let full = decode(sourceFile(cache, layer), 11520, 5760)
        let (n32, b32) = cut(full, span: 30, into: out + "/t32/" + layer)
        let half = scaled(full, 5760, 2880)
        let (n16, b16) = cut(half, span: 60, into: out + "/t16/" + layer)
        let bw = write(scaled(full, 2048, 1024), out + "/world/" + layer + ".jpg")
        print(String(format: "%@  t32 %d (%.1f MB)  t16 %d (%.1f MB)  world %.0f KB  %.1f s", layer, n32, Double(b32) / 1e6, n16, Double(b16) / 1e6, Double(bw) / 1e3, Date().timeIntervalSince(t0)))
    }
}
