# The Algonquin Resort page (gate centre deck, v24148; two watercolours since v24149)

A whole page for The Algonquin Resort, St. Andrews by-the-Sea, New Brunswick, in the centre
deck of a gate screen: on a gate whose flight goes to Moncton (a stop there counts) and on every
gate at Moncton. Three views take turns: the resort today, two watercolours of it (1990 and
1994) side by side in gilt frames with three facts of its history, and a scan code for the
resort's site. Guest information,
not an advertisement: no prices, no offer, no slogan.

Code: `fids-current/js/algonquin-card.js` (the page and its one data table, `ALGONQUIN_HOTEL`),
`fids-current/css/algonquin-card.css`, four hooks in `fids-current/js/fids-core.js`
(`AlgonquinCard` in the deck builder, the skip loop, the dwell and the preloader), nine words in
`fids-current/js/board-strings.js`. Test: `tests/algonquin-card.test.js`.

## The files

| File | What it is | Made from |
| --- | --- | --- |
| `fids-current/assets/hotels/algonquin/bresnen-1990.jpg` | The watercolour of the resort from the front lawn, signed "P. Bresnen 90", the bare sheet with its thin white paper edge and no lettering (1600 x 1073). | A scan of the painting as printed on a 1990 menu of the hotel, restored. Supplied finished for this page at 24056 x 16447 (an enlargement that holds about 1,370 pixels of picture across). The empty margin around the sheet was trimmed and the sheet reduced whole to 1073 high. So that the two pictures are the same size and take identical frames, the file is 1600 wide: the sheet is 1579 of it, and the rest, 21 px, is white paper added at the sides (about a quarter of it on the left and the rest on the right; the white of the sheet's own edge, which also evens that edge). Nothing inside the sheet was cropped, recoloured or redrawn. |
| `fids-current/assets/hotels/algonquin/bresnen-1994.jpg` | The watercolour of the resort from the drive, signed "P. Bresnen 94", the bare sheet with its thin white paper edge and no lettering (1600 x 1073). | A scan of the printed postcard the resort left in its rooms in the 1990s, restored, without the title the card carried under the painting. Supplied finished for this page at 23448 x 15778 (an enlargement that holds about 1,300 pixels of picture across). The empty margin around the sheet was trimmed and the sheet reduced whole to 1600 wide on white; nothing was added to it. It replaces `watercolour-1994.jpg`, the same painting as a titled card, which is no longer in the site. |
| `fids-current/assets/hotels/algonquin/gilt-frame-wide.png` | A gilt carved picture frame with a clear opening (1577 x 1137, opening 1360 x 928), one copy drawn round each watercolour. | A stock vector frame (Vecteezy, Pro licence), supplied for this page at 2850 x 1425 with an opening about twice as wide as a picture. Its backdrop and its baked shadow were left out, and a plain length of rail (399 px) was taken out of each half of the long sides at places where the pattern matches (kept: x 243-712, 1111-1746 and 2145-2618 of the source; the places were chosen by comparing the columns on each side of the cut). The corners, the centre flowers and the two short sides are as drawn. On the page the long rails give by under two percent to meet the picture; the two frames are the same size. It replaces `gilt-frame.png`, the same frame cut for the titled card. |
| `fids-current/assets/hotels/algonquin/resort-aerial.jpg` | The resort from the air (1200 x 800). | The resort's own publicity photograph, `https://algonquinresort.com/wp-content/uploads/Exterior-1.jpg`, saved 2026-11-11, as the file is. The view fills its width and trims top and bottom to fit; nothing is drawn over it. |
| `fids-current/fonts/libre-caslon-text/` | Libre Caslon Text Regular (latin, latin-ext), for the name, the headings and the credit. | Google Fonts build v5. SIL Open Font License 1.1, `OFL.txt` beside the files. |
| `fids-current/fonts/alegreya/` | Alegreya Italic 500 (latin, latin-ext), for everything else. | Google Fonts build v41. SIL Open Font License 1.1, `OFL.txt` beside the files. |

The Autograph Collection file in the foot is the one already in the site
(`fids-current/logos/hotels/marriott/autograph-collection.svg`), through an `img`, unaltered.

## The facts on the page

- Name, address, telephone and web address: as the resort writes them on algonquinresort.com
  (read 2026-11-11). 184 Adolphus Street, St. Andrews by-the-Sea, New Brunswick; 1-855-529-8693.
- 265 km by road from Moncton airport (two routers agree); about 2 h 30 min, the figure the
  resort publishes.
- Open since 1889; rebuilt in Tudor Revival style following the 1914 fire; originally a summer
  retreat, now open year-round: the facts are from the resort's own history page, the wording
  is the page's.
- The scan code holds `https://algonquinresort.com` and nothing else.

## Rights

- The two watercolours are the work of Peter Bresnen (Peter Bresnen Studio, Halifax, by the
  printed credit on the back of the 1990 menu of the hotel that carries the older one). The page
  credits him by name once, under the pair, and says under each picture its year and its
  story: the older one was a commission of 1990, featured on a dinner menu of the
  Passamaquoddy Dining Room; the 1994 one was a commission featured on the postcard left in
  the guest rooms. No written permission is on file.
- The photograph, the name and the Autograph Collection mark are the resort's and Marriott's.
  The page shows them only to say where the resort is and how to reach it.
- The frame is licensed stock art. The two typefaces are open-licensed and credited on the
  credits page.
