// Stitch / crop / patch / tile the GeoNB airfield photo.
//   swift mosaic.swift stitch <dir> <grid.json> <out.png>
//   swift mosaic.swift crop <mosaic.png> x y w h <out.jpg> [scale]
//   swift mosaic.swift patch <mosaic.png> <patch.png> x y <out.png>
//   swift mosaic.swift tiles <mosaic.png> <grid.json> <outdir> <minZoom>
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func load(_ p: String) -> CGImage {
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}
func save(_ img: CGImage, _ p: String, jpeg: Double? = nil) {
    let type = (p.hasSuffix(".jpg") ? UTType.jpeg : UTType.png).identifier as CFString
    let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: p) as CFURL, type, 1, nil)!
    var props: [CFString: Any] = [:]
    if let q = jpeg { props[kCGImageDestinationLossyCompressionQuality] = q }
    CGImageDestinationAddImage(dst, img, props as CFDictionary)
    CGImageDestinationFinalize(dst)
}
func ctx(_ w: Int, _ h: Int) -> CGContext {
    let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    c.interpolationQuality = .high
    return c
}
struct Grid: Codable { let z: Int; let x0: Int; let y0: Int; let nx: Int; let ny: Int; let chunk: Int }
func grid(_ p: String) -> Grid { try! JSONDecoder().decode(Grid.self, from: Data(contentsOf: URL(fileURLWithPath: p))) }

let a = CommandLine.arguments
switch a[1] {
case "stitch":
    let g = grid(a[3]); let W = g.nx * 256, H = g.ny * 256
    let c = ctx(W, H)
    for f in try! FileManager.default.contentsOfDirectory(atPath: a[2]) where f.hasSuffix(".jpg") {
        let parts = f.dropFirst(2).dropLast(4).split(separator: "_")   // tx, ty, WxH
        let tx = Int(parts[0])!, ty = Int(parts[1])!
        let img = load(a[2] + "/" + f)
        let px = (tx - g.x0) * 256, py = (ty - g.y0) * 256
        c.draw(img, in: CGRect(x: px, y: H - py - img.height, width: img.width, height: img.height))
    }
    save(c.makeImage()!, a[4]); print("stitched", W, H)
case "crop":
    let m = load(a[2]); let x = Int(a[3])!, y = Int(a[4])!, w = Int(a[5])!, h = Int(a[6])!
    let s = a.count > 8 ? Double(a[8])! : 1
    let part = m.cropping(to: CGRect(x: x, y: y, width: w, height: h))!
    let c = ctx(Int(Double(w) * s), Int(Double(h) * s))
    c.draw(part, in: CGRect(x: 0, y: 0, width: c.width, height: c.height))
    save(c.makeImage()!, a[7], jpeg: 0.88)
case "patch":
    let m = load(a[2]); let p = load(a[3]); let x = Int(a[4])!, y = Int(a[5])!
    let c = ctx(m.width, m.height)
    c.draw(m, in: CGRect(x: 0, y: 0, width: m.width, height: m.height))
    c.draw(p, in: CGRect(x: x, y: m.height - y - p.height, width: p.width, height: p.height))
    save(c.makeImage()!, a[6]); print("patched")
case "tiles":
    // z18 is the photo's own grid; each zoom out halves it onto its parent's
    // grid. Where a tile is all photo it is a JPEG; where it reaches past the
    // photo's edge (lower zooms) it is a PNG with that part transparent, so
    // the street map shows beyond the airfield instead of black.
    let g = grid(a[3]); let out = a[4]; let minZ = Int(a[5])!
    func actx(_ w: Int, _ h: Int) -> CGContext {
        let c = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        c.interpolationQuality = .high; c.clear(CGRect(x: 0, y: 0, width: w, height: h)); return c
    }
    var level = load(a[2]); var z = g.z
    var x0 = g.x0, y0 = g.y0, nx = g.nx, ny = g.ny
    var valid = CGRect(x: 0, y: 0, width: level.width, height: level.height)   // top-left origin
    var count = 0
    while z >= minZ {
        for ty in 0..<ny { for tx in 0..<nx {
            let r = CGRect(x: tx * 256, y: ty * 256, width: 256, height: 256)
            if !r.intersects(valid) { continue }
            guard let t = level.cropping(to: r) else { continue }
            let dir = "\(out)/\(z)/\(x0 + tx)"
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            let full = valid.contains(r)
            let c = actx(256, 256)
            c.draw(t, in: CGRect(x: 0, y: 256 - t.height, width: t.width, height: t.height))
            save(c.makeImage()!, "\(dir)/\(y0 + ty)" + (full ? ".jpg" : ".png"), jpeg: full ? 0.82 : nil); count += 1
        } }
        let px0 = x0 / 2, py0 = y0 / 2
        let offX = (x0 - px0 * 2) * 128, offY = (y0 - py0 * 2) * 128
        let pnx = (x0 + nx - 1) / 2 - px0 + 1, pny = (y0 + ny - 1) / 2 - py0 + 1
        let c = actx(pnx * 256, pny * 256)
        let dw = level.width / 2, dh = level.height / 2
        c.draw(level, in: CGRect(x: offX, y: c.height - offY - dh, width: dw, height: dh))
        valid = CGRect(x: CGFloat(offX) + valid.minX / 2, y: CGFloat(offY) + valid.minY / 2, width: valid.width / 2, height: valid.height / 2)
        level = c.makeImage()!; x0 = px0; y0 = py0; nx = pnx; ny = pny; z -= 1
    }
    print("tiles", count)
default: print("?")
}
