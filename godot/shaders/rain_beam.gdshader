// Weather: rain streaks + ground splashes that exist only in the flashlight
// beam. Procedural across a room-sized rect (not particles — Godot's batched
// particle drawing ignores per-pixel light-only), revealed per pixel by the
// light() function exactly like light_reveal.gdshader (godot#98375).
shader_type canvas_item;
render_mode light_only, blend_add;

uniform vec2 rect_size = vec2(1536.0);  // world px covered (set by weather_lab.gd)
uniform float spacing = 9.0;            // px between streak columns
uniform float density = 0.55;           // share of columns raining at any moment
uniform float speed = 1100.0;           // px per second
uniform float streak_len = 34.0;        // px
uniform float slant = 0.36;             // x drift per y (matches Phaser rain-hard)
uniform float splash_density = 0.25;
uniform vec3 tint = vec3(0.8, 0.9, 1.0);

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void fragment() {
	vec2 p = UV * rect_size;
	float a = 0.0;

	// Streaks: shear space so columns follow the slant, then scroll each
	// column at its own speed and phase.
	for (int layer = 0; layer < 2; layer++) {
		float fl = float(layer);
		vec2 q = vec2(p.x - p.y * slant + fl * 4.3, p.y);
		float col = floor(q.x / spacing);
		float h = hash(col + fl * 91.0);
		if (h < density) {
			float x = fract(q.x / spacing) - 0.5;
			float spd = speed * (0.8 + 0.4 * hash(col * 3.1 + fl));
			float period = streak_len * (3.0 + 5.0 * hash(col * 7.7 + fl));
			float y = fract((q.y - TIME * spd) / period + h * 10.0) * period;
			float body = smoothstep(streak_len, 0.0, y) * step(0.0, y);
			a += body * smoothstep(0.18, 0.0, abs(x)) * (0.5 + 0.5 * fl);
		}
	}

	// Splashes: an expanding ring now and then in some ground cells.
	vec2 cell = floor(p / 40.0);
	float hs = hash2(cell);
	if (hs < splash_density) {
		float t = fract(TIME * (0.9 + hs) + hs * 13.0);
		vec2 c = (cell + 0.2 + 0.6 * vec2(hash2(cell + 1.7), hash2(cell + 4.1))) * 40.0;
		float d = length((p - c) * vec2(1.0, 1.6));  // squashed = lying on the ground
		float ring = smoothstep(1.2, 0.0, abs(d - t * 9.0));
		a += ring * (1.0 - t) * 0.8;
	}

	COLOR = vec4(tint, clamp(a, 0.0, 1.0));
}

void light() {
	float lit = max(LIGHT_COLOR.r, max(LIGHT_COLOR.g, LIGHT_COLOR.b)) * LIGHT_ENERGY;
	LIGHT = vec4(COLOR.rgb * LIGHT_COLOR.rgb * LIGHT_ENERGY, COLOR.a * clamp(lit, 0.0, 1.0));
}
