// Illustrator: open each pack's EPS and save it as SVG next to it
// (outlined text, 3-decimal coords). Set `base` first, then run:
//   osascript -e 'tell application "Adobe Illustrator" to do javascript (POSIX file "/path/to/export.jsx")'
var base = "/path/to/wxicons/";   // a folder holding solid/src.eps, flat/src.eps, line/src.eps
var sets = ["solid", "flat", "line"];
var out = [];
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
for (var i = 0; i < sets.length; i++) {
  var doc = app.open(new File(base + sets[i] + "/src.eps"));
  var o = new ExportOptionsSVG();
  o.embedRasterImages = true;
  o.fontType = SVGFontType.OUTLINEFONT;
  o.coordinatePrecision = 3;
  o.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
  o.documentEncoding = SVGDocumentEncoding.UTF8;
  doc.exportFile(new File(base + sets[i] + "/sheet.svg"), ExportType.SVG, o);
  out.push(sets[i] + ":" + doc.pageItems.length);
  doc.close(SaveOptions.DONOTSAVECHANGES);
}
out.join(" ");
