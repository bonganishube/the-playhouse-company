/**
 * Derives the header logo from the supplied brand asset.
 *
 * The supplied file is designed to sit on a white card: it paints its own
 * panel and sets the wordmark in black. Over the dark header band that panel
 * reads as a white box, and removing it alone would leave the black type
 * illegible. This produces a reversed variant instead:
 *
 *   .fil0   the panel            -> none      (removed)
 *   .fil13  wordmark + strapline -> #FFFFFF   (reversed for a dark ground)
 *
 * Nothing else is altered. The mask artwork carries its own white outlines and
 * reads correctly as supplied, and the tan departmental line has sufficient
 * contrast on the header purple. Which classes carry type was established by
 * recolouring each black class in isolation and rendering the result, not by
 * assumption: fil6, fil7, fil10 and fil12 are artwork detail, fil13 is type.
 *
 * The source file is never modified. If The Playhouse Company supplies an
 * official reversed or white logo, use that in preference to this derivation
 * and delete this script.
 *
 * Run:  node scripts/build-header-logo.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "public/playhouse_logo_svg_bg.svg";
const TARGET = "public/playhouse_logo_header.svg";

const EDITS = [
  // [what it is, find, replace]
  ["white panel removed", ".fil0 {fill:url(#id0)", ".fil0 {fill:none"],
  ["wordmark reversed to white", ".fil13 {fill:black", ".fil13 {fill:#FFFFFF"],
];

let svg = readFileSync(SOURCE, "utf8");

for (const [label, find, replace] of EDITS) {
  if (!svg.includes(find)) {
    console.error(
      `Could not apply "${label}": expected "${find}" in ${SOURCE}.\n` +
        `The brand asset has probably been replaced. Re-check which classes ` +
        `carry the type before trusting this script.`,
    );
    process.exit(1);
  }
  svg = svg.split(find).join(replace);
  console.log(`  ${label}`);
}

writeFileSync(TARGET, svg);
console.log(`\nwrote ${TARGET} (source left untouched)`);
