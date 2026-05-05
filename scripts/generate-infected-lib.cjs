/**
 * Shared Infected Generation Logic for WARDEN.
 * Creates 4x4 infected spritesheets with multiple variants.
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
    raw[y * rowBytes] = 0;

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
  ihdr[8] = 8;
  ihdr[9] = 6;

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

const INFECTED_VARIANTS = {
  walker: {
    skin: [124, 142, 104],
    skinHi: [148, 162, 124],
    wound: [95, 38, 36],
    eye: [210, 230, 160],
    cloth: [72, 66, 58],
    clothHi: [94, 86, 74],
    pants: [48, 52, 46],
    shoes: [30, 28, 24],
    build: 'standard',
    posture: 'slump',
    gore: 'light',
  },

  bloater: {
    skin: [112, 132, 96],
    skinHi: [138, 154, 112],
    wound: [112, 42, 40],
    eye: [225, 240, 155],
    cloth: [76, 62, 52],
    clothHi: [98, 80, 66],
    pants: [54, 50, 44],
    shoes: [32, 28, 24],
    build: 'wide',
    posture: 'heavy',
    gore: 'medium',
  },

  crawler: {
    skin: [98, 116, 92],
    skinHi: [124, 138, 110],
    wound: [88, 34, 34],
    eye: [190, 220, 130],
    cloth: [54, 50, 46],
    clothHi: [72, 68, 60],
    pants: [42, 42, 38],
    shoes: [26, 24, 22],
    build: 'low',
    posture: 'crouch',
    gore: 'medium',
  },

  husk: {
    skin: [154, 148, 126],
    skinHi: [176, 168, 140],
    wound: [92, 44, 38],
    eye: [230, 218, 150],
    cloth: [66, 60, 50],
    clothHi: [90, 82, 66],
    pants: [50, 48, 42],
    shoes: [30, 28, 24],
    build: 'lean',
    posture: 'slump',
    gore: 'light',
  },

  spitter: {
    skin: [102, 150, 92],
    skinHi: [130, 176, 112],
    wound: [70, 112, 42],
    eye: [210, 255, 120],
    cloth: [48, 64, 46],
    clothHi: [68, 88, 60],
    pants: [38, 46, 38],
    shoes: [24, 28, 22],
    build: 'lean',
    posture: 'jut',
    gore: 'acid',
  },

  brute: {
    skin: [104, 122, 94],
    skinHi: [132, 146, 112],
    wound: [120, 44, 38],
    eye: [240, 230, 150],
    cloth: [64, 52, 46],
    clothHi: [88, 70, 58],
    pants: [48, 42, 38],
    shoes: [28, 24, 22],
    build: 'brute',
    posture: 'heavy',
    gore: 'heavy',
  },

  ashrot: {
    skin: [112, 112, 108],
    skinHi: [142, 142, 136],
    wound: [76, 54, 50],
    eye: [205, 205, 170],
    cloth: [54, 54, 56],
    clothHi: [78, 78, 82],
    pants: [42, 42, 46],
    shoes: [24, 24, 26],
    build: 'standard',
    posture: 'slump',
    gore: 'ash',
  },

  veinhost: {
    skin: [120, 104, 122],
    skinHi: [150, 128, 152],
    wound: [92, 38, 88],
    eye: [238, 172, 255],
    cloth: [48, 42, 52],
    clothHi: [70, 60, 76],
    pants: [40, 36, 44],
    shoes: [24, 22, 26],
    build: 'twisted',
    posture: 'jut',
    gore: 'veins',
  },
};

function generateInfected(localS = 1, variant = 'walker') {
  const preset =
    typeof variant === 'string'
      ? (INFECTED_VARIANTS[variant] || INFECTED_VARIANTS.walker)
      : { ...INFECTED_VARIANTS.walker, ...variant };

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

  function getMetrics(build, bobY, legOffset) {
    switch (build) {
      case 'wide':
        return {
          headLeft: 4,
          headRight: 11,
          torsoLeft: 4,
          torsoRight: 11,
          torsoTop: 7 + bobY,
          torsoBottom: 11 + bobY,
          armLeftX: 3,
          armRightX: 12,
          legLeft1: 5 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 10 - legOffset,
          shadowLeft: 3,
          shadowRight: 12,
        };

      case 'brute':
        return {
          headLeft: 4,
          headRight: 11,
          torsoLeft: 3,
          torsoRight: 12,
          torsoTop: 7 + bobY,
          torsoBottom: 11 + bobY,
          armLeftX: 2,
          armRightX: 13,
          legLeft1: 5 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 10 - legOffset,
          shadowLeft: 2,
          shadowRight: 13,
        };

      case 'lean':
        return {
          headLeft: 5,
          headRight: 10,
          torsoLeft: 6,
          torsoRight: 9,
          torsoTop: 8 + bobY,
          torsoBottom: 11 + bobY,
          armLeftX: 5,
          armRightX: 10,
          legLeft1: 6 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 9 - legOffset,
          shadowLeft: 4,
          shadowRight: 11,
        };

      case 'low':
        return {
          headLeft: 5,
          headRight: 10,
          torsoLeft: 5,
          torsoRight: 10,
          torsoTop: 9 + bobY,
          torsoBottom: 12 + bobY,
          armLeftX: 4,
          armRightX: 11,
          legLeft1: 5 + legOffset,
          legLeft2: 7 + legOffset,
          legRight1: 8 - legOffset,
          legRight2: 10 - legOffset,
          shadowLeft: 3,
          shadowRight: 12,
        };

      case 'twisted':
        return {
          headLeft: 5,
          headRight: 10,
          torsoLeft: 5,
          torsoRight: 10,
          torsoTop: 8 + bobY,
          torsoBottom: 11 + bobY,
          armLeftX: 4,
          armRightX: 12,
          legLeft1: 5 + legOffset,
          legLeft2: 6 + legOffset,
          legRight1: 9 - legOffset,
          legRight2: 10 - legOffset,
          shadowLeft: 4,
          shadowRight: 12,
        };

      case 'standard':
      default:
        return {
          headLeft: 5,
          headRight: 10,
          torsoLeft: 5,
          torsoRight: 10,
          torsoTop: 8 + bobY,
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
    }
  }

  function getPostureOffset(posture, facing) {
    if (posture === 'heavy') return 0;
    if (posture === 'crouch') return 1;
    if (posture === 'jut') {
      if (facing === 'left') return -1;
      if (facing === 'right') return 1;
    }
    if (posture === 'slump') {
      if (facing === 'left') return -1;
      if (facing === 'right') return 1;
    }
    return 0;
  }

  function drawHead(ox, oy, bobY, facing, m) {
    const headShift = getPostureOffset(preset.posture, facing);

    rect(ox + m.headLeft + headShift, oy + 2 + bobY, ox + m.headRight + headShift, oy + 6 + bobY, preset.skin);
    rect(ox + m.headLeft + 1 + headShift, oy + 2 + bobY, ox + m.headLeft + 2 + headShift, oy + 2 + bobY, preset.skinHi);

    // uneven skull / torn silhouette
    dot(ox + m.headLeft - 1 + headShift, oy + 4 + bobY, preset.skin);
    dot(ox + m.headRight + 1 + headShift, oy + 5 + bobY, darken(preset.skin, 12));

    if (facing === 'down') {
      dot(ox + 6 + headShift, oy + 5 + bobY, preset.eye);
      dot(ox + 9 + headShift, oy + 5 + bobY, preset.eye);
      dot(ox + 7 + headShift, oy + 6 + bobY, darken(preset.skin, 24));
      dot(ox + 9 + headShift, oy + 3 + bobY, preset.wound);
    } else if (facing === 'up') {
      rect(ox + 6 + headShift, oy + 2 + bobY, ox + 10 + headShift, oy + 3 + bobY, darken(preset.skin, 18));
      dot(ox + 5 + headShift, oy + 4 + bobY, preset.wound);
    } else if (facing === 'left') {
      dot(ox + 5 + headShift, oy + 5 + bobY, preset.eye);
      dot(ox + 6 + headShift, oy + 6 + bobY, darken(preset.skin, 22));
      dot(ox + 10 + headShift, oy + 3 + bobY, preset.wound);
    } else if (facing === 'right') {
      dot(ox + 10 + headShift, oy + 5 + bobY, preset.eye);
      dot(ox + 9 + headShift, oy + 6 + bobY, darken(preset.skin, 22));
      dot(ox + 5 + headShift, oy + 3 + bobY, preset.wound);
    }
  }

  function drawDamage(ox, oy, bobY, facing) {
    const woundDark = darken(preset.wound, 20);

    if (preset.gore === 'light') {
      dot(ox + 6, oy + 9 + bobY, preset.wound);
      dot(ox + 9, oy + 11 + bobY, woundDark);
      return;
    }

    if (preset.gore === 'medium') {
      dot(ox + 6, oy + 9 + bobY, preset.wound);
      dot(ox + 7, oy + 10 + bobY, woundDark);
      dot(ox + 10, oy + 11 + bobY, preset.wound);
      dot(ox + 5, oy + 13, woundDark);
      return;
    }

    if (preset.gore === 'heavy') {
      dot(ox + 5, oy + 8 + bobY, preset.wound);
      dot(ox + 6, oy + 9 + bobY, woundDark);
      dot(ox + 9, oy + 10 + bobY, preset.wound);
      dot(ox + 10, oy + 11 + bobY, woundDark);
      dot(ox + 4, oy + 12 + bobY, preset.wound);
      return;
    }

    if (preset.gore === 'acid') {
      dot(ox + 7, oy + 9 + bobY, preset.wound);
      dot(ox + 8, oy + 10 + bobY, preset.wound);
      dot(ox + 10, oy + 12 + bobY, darken(preset.wound, 10));
      return;
    }

    if (preset.gore === 'ash') {
      dot(ox + 5, oy + 9 + bobY, darken(preset.skin, 35));
      dot(ox + 8, oy + 10 + bobY, darken(preset.cloth, 18));
      dot(ox + 10, oy + 12 + bobY, darken(preset.pants, 18));
      return;
    }

    if (preset.gore === 'veins') {
      dot(ox + 6, oy + 8 + bobY, preset.wound);
      dot(ox + 7, oy + 9 + bobY, preset.wound);
      dot(ox + 8, oy + 10 + bobY, darken(preset.wound, 14));
      dot(ox + 10, oy + 8 + bobY, preset.wound);
    }
  }

  function drawCharacter(col, row, facing, walkPhase) {
    const ox = col * 16;
    const oy = row * 16;

    const legOffset = walkPhase === 1 ? -1 : walkPhase === 3 ? 1 : 0;
    const bobY = walkPhase === 1 || walkPhase === 3 ? -1 : 0;
    const armSwing = walkPhase === 1 ? 1 : walkPhase === 3 ? -1 : 0;

    const m = getMetrics(preset.build || 'standard', bobY, legOffset);

    // shadow
    rect(ox + m.shadowLeft, oy + 14, ox + m.shadowRight, oy + 15, [0, 0, 0], 50);

    // head
    drawHead(ox, oy, bobY, facing, m);

    // torso / torn shirt
    rect(ox + m.torsoLeft, oy + m.torsoTop, ox + m.torsoRight, oy + m.torsoBottom, preset.cloth);
    rect(ox + m.torsoLeft + 1, oy + m.torsoTop, ox + Math.min(m.torsoLeft + 2, m.torsoRight), oy + m.torsoTop + 1, preset.clothHi);

    // exposed infected skin around neckline / tears
    dot(ox + 7, oy + 7 + bobY, preset.skin);
    dot(ox + 8, oy + 7 + bobY, darken(preset.skin, 10));
    dot(ox + m.torsoRight, oy + m.torsoBottom, darken(preset.cloth, 18));

    // arms, uneven and awkward
    dot(ox + m.armLeftX, oy + 8 + bobY + armSwing, preset.skin);
    dot(ox + m.armLeftX, oy + 9 + bobY + armSwing, darken(preset.skin, 12));

    dot(ox + m.armRightX, oy + 8 + bobY - armSwing, preset.skin);
    dot(ox + m.armRightX, oy + 9 + bobY - armSwing, darken(preset.skin, 12));

    if (preset.build === 'brute') {
      dot(ox + m.armLeftX, oy + 10 + bobY + armSwing, preset.skin);
      dot(ox + m.armRightX, oy + 10 + bobY - armSwing, preset.skin);
    }

    // legs
    rect(ox + m.legLeft1, oy + 11, ox + m.legLeft2, oy + 13, preset.pants);
    rect(ox + m.legRight1, oy + 11, ox + m.legRight2, oy + 13, darken(preset.pants, 8));

    // shoes / feet
    rect(ox + m.legLeft1, oy + 13, ox + m.legLeft2, oy + 14, preset.shoes);
    rect(ox + m.legRight1, oy + 13, ox + m.legRight2, oy + 14, darken(preset.shoes, 8));

    // extra crooked foot on walk frames
    if (walkPhase === 1) dot(ox + m.legLeft1 - 1, oy + 14, preset.shoes);
    if (walkPhase === 3) dot(ox + m.legRight2 + 1, oy + 14, preset.shoes);

    drawDamage(ox, oy, bobY, facing);
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
  generateInfected,
  INFECTED_VARIANTS,
};
