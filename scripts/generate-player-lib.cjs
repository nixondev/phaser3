/**
 * Shared Player Generation Logic for WARDEN.
 * Improved version with multiple player variants, darker/grimier options,
 * and slightly different silhouettes/contours.
 */

const zlib = require('zlib');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodePNG(width, height, pixels) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * rowBytes + 1 + x * 4;
      raw[di] = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }

  const compressed = zlib.deflateSync(raw);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, c]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(px, w, h, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

const PLAYER_VARIANTS = {
  warden: {
    skin: [228, 190, 150],
    hair: [70, 45, 25],
    eye: [15, 15, 25],
    shirt: [45, 75, 155],
    shirtHi: [72, 108, 190],
    accent: [180, 205, 255],
    pants: [56, 67, 96],
    pantsHi: [76, 90, 122],
    shoes: [35, 30, 25],
    hairStyle: 'short',
    build: 'standard',
    grime: false,
    beard: false,
  },

  ranger: {
    skin: [198, 158, 118],
    hair: [56, 34, 20],
    eye: [18, 18, 18],
    shirt: [58, 110, 66],
    shirtHi: [82, 138, 90],
    accent: [186, 214, 124],
    pants: [72, 82, 56],
    pantsHi: [94, 108, 74],
    shoes: [45, 38, 28],
    hairStyle: 'hood',
    hood: [44, 86, 52],
    build: 'lean',
    grime: false,
    beard: false,
  },

  rogue: {
    skin: [220, 176, 138],
    hair: [24, 24, 28],
    eye: [10, 10, 16],
    shirt: [88, 52, 52],
    shirtHi: [122, 72, 72],
    accent: [205, 170, 110],
    pants: [52, 52, 62],
    pantsHi: [74, 74, 90],
    shoes: [22, 22, 24],
    hairStyle: 'parted',
    build: 'lean',
    grime: false,
    beard: false,
  },

  mystic: {
    skin: [212, 184, 170],
    hair: [205, 215, 235],
    eye: [35, 30, 55],
    shirt: [104, 72, 156],
    shirtHi: [132, 98, 188],
    accent: [222, 205, 255],
    pants: [70, 60, 110],
    pantsHi: [94, 82, 144],
    shoes: [42, 34, 60],
    hairStyle: 'long',
    build: 'standard',
    grime: false,
    beard: false,
  },

  // Darker / dirtier variants
  drifter: {
    skin: [186, 154, 126],
    hair: [58, 44, 34],
    eye: [18, 16, 14],
    shirt: [92, 82, 66],
    shirtHi: [120, 108, 88],
    accent: [138, 122, 98],
    pants: [70, 66, 58],
    pantsHi: [96, 90, 78],
    shoes: [40, 33, 26],
    hairStyle: 'long',
    build: 'hunched',
    grime: true,
    beard: true,
  },

  scavenger: {
    skin: [160, 134, 110],
    hair: [42, 32, 24],
    eye: [16, 16, 16],
    shirt: [72, 78, 62],
    shirtHi: [96, 106, 84],
    accent: [118, 112, 84],
    pants: [58, 60, 52],
    pantsHi: [78, 82, 70],
    shoes: [34, 30, 25],
    hairStyle: 'hood',
    hood: [54, 58, 44],
    build: 'stocky',
    grime: true,
    beard: false,
  },

  cultist: {
    skin: [194, 170, 156],
    hair: [20, 16, 16],
    eye: [28, 18, 18],
    shirt: [46, 36, 42],
    shirtHi: [70, 52, 62],
    accent: [108, 82, 92],
    pants: [38, 32, 38],
    pantsHi: [58, 50, 58],
    shoes: [24, 20, 22],
    hairStyle: 'hood',
    hood: [34, 24, 30],
    build: 'cloak',
    grime: true,
    beard: false,
  },

  ashwalker: {
    skin: [172, 160, 152],
    hair: [88, 84, 84],
    eye: [20, 20, 24],
    shirt: [62, 62, 68],
    shirtHi: [90, 90, 98],
    accent: [118, 112, 108],
    pants: [52, 52, 56],
    pantsHi: [74, 74, 80],
    shoes: [28, 28, 30],
    hairStyle: 'parted',
    build: 'lean',
    grime: true,
    beard: true,
  },
};

function generatePlayer(localS = 1, variant = 'warden') {
  const preset =
    typeof variant === 'string'
      ? (PLAYER_VARIANTS[variant] || PLAYER_VARIANTS.warden)
      : { ...PLAYER_VARIANTS.warden, ...variant };

  const W = Math.round(64 * localS);
  const H = Math.round(64 * localS);
  const px = new Uint8Array(W * H * 4);

  function dot(x, y, color, a = 255) {
    const [r, g, b] = color;
    for (let py = Math.floor(y * localS); py <= Math.ceil((y + 1) * localS - 1); py++) {
      for (let pxCoord = Math.floor(x * localS); pxCoord <= Math.ceil((x + 1) * localS - 1); pxCoord++) {
        setPixel(px, W, H, pxCoord, py, r, g, b, a);
      }
    }
  }

  function rect(x1, y1, x2, y2, color, a = 255) {
    const [r, g, b] = color;
    for (let py = Math.floor(y1 * localS); py <= Math.ceil((y2 + 1) * localS - 1); py++) {
      for (let pxCoord = Math.floor(x1 * localS); pxCoord <= Math.ceil((x2 + 1) * localS - 1); pxCoord++) {
        setPixel(px, W, H, pxCoord, py, r, g, b, a);
      }
    }
  }

  function darken(color, amt = 20) {
    return [
      Math.max(0, color[0] - amt),
      Math.max(0, color[1] - amt),
      Math.max(0, color[2] - amt),
    ];
  }

  function getBuildMetrics(build, bobY, legOffset) {
    switch (build) {
      case 'lean':
        return {
          torsoLeft: 6,
          torsoRight: 9,
          torsoTop: 8 + bobY,
          torsoBottom: 10 + bobY,
          armLeftX: 5,
          armRightX: 10,
          legLeft1: 6 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 9 - legOffset,
          shadowLeft: 4,
          shadowRight: 11,
        };

      case 'stocky':
        return {
          torsoLeft: 4,
          torsoRight: 11,
          torsoTop: 8 + bobY,
          torsoBottom: 10 + bobY,
          armLeftX: 3,
          armRightX: 12,
          legLeft1: 5 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 10 - legOffset,
          shadowLeft: 3,
          shadowRight: 12,
        };

      case 'hunched':
        return {
          torsoLeft: 5,
          torsoRight: 10,
          torsoTop: 9 + bobY,
          torsoBottom: 11 + bobY,
          armLeftX: 4,
          armRightX: 11,
          legLeft1: 5 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 10 - legOffset,
          shadowLeft: 4,
          shadowRight: 11,
        };

      case 'cloak':
        return {
          torsoLeft: 4,
          torsoRight: 11,
          torsoTop: 8 + bobY,
          torsoBottom: 11 + bobY,
          armLeftX: 4,
          armRightX: 11,
          legLeft1: 6 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 9 - legOffset,
          shadowLeft: 3,
          shadowRight: 12,
        };

      case 'standard':
      default:
        return {
          torsoLeft: 5,
          torsoRight: 10,
          torsoTop: 8 + bobY,
          torsoBottom: 10 + bobY,
          armLeftX: 4,
          armRightX: 11,
          legLeft1: 5 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 10 - legOffset,
          shadowLeft: 4,
          shadowRight: 11,
        };
    }
  }

  function drawHair(ox, oy, bobY, facing) {
    const hs = preset.hairStyle || 'short';
    const hoodColor = preset.hood || preset.hair;

    if (hs === 'hood') {
      rect(ox + 4, oy + 1 + bobY, ox + 11, oy + 4 + bobY, hoodColor);
      if (facing === 'up') {
        rect(ox + 5, oy + 5 + bobY, ox + 10, oy + 5 + bobY, hoodColor);
      }
      return;
    }

    if (hs === 'parted') {
      rect(ox + 5, oy + 1 + bobY, ox + 10, oy + 2 + bobY, preset.hair);
      dot(ox + 5, oy + 3 + bobY, preset.hair);
      dot(ox + 10, oy + 3 + bobY, preset.hair);
      if (facing === 'left') dot(ox + 10, oy + 4 + bobY, preset.hair);
      if (facing === 'right') dot(ox + 5, oy + 4 + bobY, preset.hair);
      return;
    }

    if (hs === 'long') {
      rect(ox + 5, oy + 1 + bobY, ox + 10, oy + 3 + bobY, preset.hair);
      dot(ox + 4, oy + 4 + bobY, preset.hair);
      dot(ox + 11, oy + 4 + bobY, preset.hair);

      if (facing !== 'up') {
        dot(ox + 4, oy + 5 + bobY, preset.hair);
        dot(ox + 11, oy + 5 + bobY, preset.hair);
      }
      return;
    }

    // default short hair
    rect(ox + 5, oy + 1 + bobY, ox + 10, oy + 3 + bobY, preset.hair);
  }

  function drawFace(ox, oy, bobY, facing) {
    if (facing === 'down') {
      dot(ox + 6, oy + 5 + bobY, preset.eye);
      dot(ox + 9, oy + 5 + bobY, preset.eye);
      dot(ox + 7, oy + 6 + bobY, [200, 160, 130]);
      dot(ox + 8, oy + 6 + bobY, [200, 160, 130]);
      return;
    }

    if (facing === 'up') {
      rect(
        ox + 5,
        oy + 3 + bobY,
        ox + 10,
        oy + 4 + bobY,
        preset.hairStyle === 'hood' ? (preset.hood || preset.hair) : preset.hair
      );
      return;
    }

    if (facing === 'left') {
      dot(ox + 5, oy + 5 + bobY, preset.eye);
      dot(ox + 10, oy + 3 + bobY, preset.hair);
      return;
    }

    if (facing === 'right') {
      dot(ox + 10, oy + 5 + bobY, preset.eye);
      dot(ox + 5, oy + 3 + bobY, preset.hair);
    }
  }

  function drawBeard(ox, oy, bobY, facing) {
    if (!preset.beard) return;
    const beardColor = darken(preset.hair, 8);

    if (facing === 'down') {
      dot(ox + 6, oy + 6 + bobY, beardColor);
      dot(ox + 7, oy + 7 + bobY, beardColor);
      dot(ox + 8, oy + 7 + bobY, beardColor);
      dot(ox + 9, oy + 6 + bobY, beardColor);
    } else if (facing === 'left') {
      dot(ox + 5, oy + 6 + bobY, beardColor);
    } else if (facing === 'right') {
      dot(ox + 10, oy + 6 + bobY, beardColor);
    }
  }

  function drawGrime(ox, oy, bobY) {
    if (!preset.grime) return;

    const grime = darken(preset.shirt, 26);
    const mud = darken(preset.pants, 18);
    const scuff = darken(preset.shoes, 10);

    // torso dirt
    dot(ox + 5, oy + 10 + bobY, grime);
    dot(ox + 8, oy + 9 + bobY, grime);
    dot(ox + 10, oy + 10 + bobY, grime);

    // pants dirt
    dot(ox + 6, oy + 13, mud);
    dot(ox + 9, oy + 13, mud);

    // shoe scuffs
    dot(ox + 5, oy + 14, scuff);
    dot(ox + 10, oy + 14, scuff);
  }

  function drawCharacter(col, row, facing, walkPhase) {
    const ox = col * 16;
    const oy = row * 16;

    const legOffset = walkPhase === 1 ? -1 : walkPhase === 3 ? 1 : 0;
    const bobY = (walkPhase === 1 || walkPhase === 3) ? -1 : 0;
    const armSwing = walkPhase === 1 ? 1 : walkPhase === 3 ? -1 : 0;
    const m = getBuildMetrics(preset.build || 'standard', bobY, legOffset);

    // shadow
    rect(ox + m.shadowLeft, oy + 14, ox + m.shadowRight, oy + 15, [0, 0, 0], 40);

    // head
    drawHair(ox, oy, bobY, facing);
    rect(ox + 5, oy + 3 + bobY, ox + 10, oy + 6 + bobY, preset.skin);
    dot(ox + 4, oy + 4 + bobY, preset.skin);
    dot(ox + 11, oy + 4 + bobY, preset.skin);

    // neck
    if (preset.build !== 'cloak') {
      rect(ox + 7, oy + 7 + bobY, ox + 8, oy + 7 + bobY, preset.skin);
    }

    // torso
    rect(
      ox + m.torsoLeft,
      oy + m.torsoTop,
      ox + m.torsoRight,
      oy + m.torsoBottom,
      preset.shirt
    );

    rect(
      ox + m.torsoLeft + 1,
      oy + m.torsoTop,
      ox + Math.min(m.torsoLeft + 2, m.torsoRight),
      oy + Math.min(m.torsoTop + 1, m.torsoBottom),
      preset.shirtHi
    );

    if (preset.build === 'cloak') {
      rect(ox + 5, oy + 11 + bobY, ox + 10, oy + 12 + bobY, darken(preset.shirt, 6));
      dot(ox + 4, oy + 12 + bobY, darken(preset.shirt, 10));
      dot(ox + 11, oy + 12 + bobY, darken(preset.shirt, 10));
    } else {
      rect(
        ox + m.torsoLeft,
        oy + m.torsoBottom,
        ox + m.torsoRight,
        oy + m.torsoBottom,
        preset.accent
      );
    }

    // arms
    dot(ox + m.armLeftX, oy + 8 + bobY + armSwing, preset.shirt);
    dot(ox + m.armLeftX, oy + 9 + bobY + armSwing, preset.skin);

    dot(ox + m.armRightX, oy + 8 + bobY - armSwing, preset.shirt);
    dot(ox + m.armRightX, oy + 9 + bobY - armSwing, preset.skin);

    // legs
    rect(ox + m.legLeft1, oy + 11, ox + m.legLeft2, oy + 13, preset.pants);
    rect(ox + m.legRight1, oy + 11, ox + m.legRight2, oy + 13, preset.pantsHi);

    // shoes
    rect(ox + m.legLeft1, oy + 13, ox + m.legLeft2, oy + 14, preset.shoes);
    rect(ox + m.legRight1, oy + 13, ox + m.legRight2, oy + 14, preset.shoes);

    drawFace(ox, oy, bobY, facing);
    drawBeard(ox, oy, bobY, facing);
    drawGrime(ox, oy, bobY);
  }

  for (let row = 0; row < 4; row++) {
    const facing = ['down', 'left', 'right', 'up'][row];
    for (let col = 0; col < 4; col++) {
      drawCharacter(col, row, facing, col);
    }
  }

  return encodePNG(W, H, px);
}

module.exports = {
  generatePlayer,
  PLAYER_VARIANTS,
};
