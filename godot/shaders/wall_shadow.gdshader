// Unified wall shadows (scripts/wall_shadows.gd). One shader, three uses:
//   rim        contact shadow — the dark crease where walls meet the floor
//   cast       a directional shadow a set length away from a light
//              (a fixed sky/moon bearing, or a lightning strike)
//   knockout   no shadow on the art itself (or the whole cell, for tiles
//              flagged "hollow")
// All driven by the ART silhouette, not the 64px cell, so a desk or pillar
// that doesn't fill its cell gets a desk-shaped shadow, not a box.
shader_type canvas_item;
render_mode unshaded;

uniform sampler2D cast_mask : filter_linear;    // alpha = art silhouette (what casts)
uniform sampler2D knock_mask : filter_nearest;  // alpha = where no shadow may land
uniform vec2 room_px = vec2(1536.0);

uniform float rim_strength = 0.0;
uniform float rim_radius = 30.0;        // px

uniform float cast_strength = 0.0;
uniform vec2 cast_dir = vec2(0.447, 0.894);  // the way shadows fall (normalised)
uniform float cast_length = 128.0;      // px
uniform float cast_softness = 10.0;     // px of penumbra at the shadow's tip

uniform vec3 shadow_color = vec3(0.0, 0.0, 0.02);

float occ(vec2 px) {
	return texture(cast_mask, px / room_px).a;
}

void fragment() {
	vec2 p = UV * room_px;
	float a = 0.0;

	if (rim_strength > 0.0) {
		// A cheap blur of the silhouette: three rings of eight taps,
		// nearer rings weighted more.
		float sum = 0.0;
		float wsum = 0.0;
		for (int ring = 1; ring <= 3; ring++) {
			float r = rim_radius * float(ring) / 3.0;
			float w = 1.0 / float(ring);
			for (int k = 0; k < 8; k++) {
				float ang = float(k) * 0.785398 + float(ring) * 0.3;
				sum += occ(p + vec2(cos(ang), sin(ang)) * r) * w;
				wsum += w;
			}
		}
		a = max(a, clamp(sum / wsum * 2.0, 0.0, 1.0) * rim_strength);
	}

	if (cast_strength > 0.0 && cast_length > 0.0) {
		// March back towards the light; three rays fanning apart with
		// distance give a penumbra that widens towards the tip.
		vec2 perp = vec2(-cast_dir.y, cast_dir.x);
		float s = 0.0;
		for (int j = -1; j <= 1; j++) {
			float hit = 0.0;
			for (int i = 1; i <= 16; i++) {
				float t = float(i) / 16.0;
				vec2 q = p - cast_dir * cast_length * t + perp * float(j) * cast_softness * t;
				hit = max(hit, occ(q) * (1.0 - t * 0.35));
			}
			s += hit;
		}
		a = max(a, s / 3.0 * cast_strength);
	}

	a *= 1.0 - texture(knock_mask, UV).a;
	COLOR = vec4(shadow_color, a);
}
