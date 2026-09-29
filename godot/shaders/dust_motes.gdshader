// Style experiment 1: dust motes, drawn procedurally across the whole room
// and rendered LIGHT-ONLY — so they only exist where the flashlight beam
// hits them, and wall shadows hide them too.
// light() makes visibility per-pixel — plain light_only is per-item, so a
// room-sized rect overlapping the beam anywhere would show everywhere
// (godot#98375; see light_reveal.gdshader).
shader_type canvas_item;
render_mode light_only, blend_add;

uniform vec2 rect_size = vec2(1536.0);   // world px covered (set by style_lab.gd)
uniform float cell = 22.0;               // grid spacing of potential motes, px
uniform float density = 0.35;            // fraction of cells holding a mote
uniform float drift = 5.0;               // px per second
uniform vec3 tint = vec3(1.0, 0.96, 0.88);

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
	vec2 p = UV * rect_size;
	float a = 0.0;
	for (int layer = 0; layer < 3; layer++) {
		float fl = float(layer);
		vec2 q = p + vec2(TIME * drift * (1.0 + fl * 0.6), sin(TIME * 0.25 + fl * 2.0) * 12.0) + fl * 97.0;
		vec2 id = floor(q / cell);
		vec2 f = fract(q / cell) - 0.5;
		float h = hash(id + fl * 17.0);
		if (h < density) {
			vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;
			float d = length(f - off * 0.7) * cell;
			float r = 0.7 + h * 1.6 / density * 0.35;
			float twinkle = 0.55 + 0.45 * sin(TIME * (1.0 + h * 3.0) + h * 40.0);
			a += smoothstep(r, 0.0, d) * twinkle;
		}
	}
	COLOR = vec4(tint, clamp(a, 0.0, 1.0));
}

void light() {
	float lit = max(LIGHT_COLOR.r, max(LIGHT_COLOR.g, LIGHT_COLOR.b)) * LIGHT_ENERGY;
	LIGHT = vec4(COLOR.rgb * LIGHT_COLOR.rgb * LIGHT_ENERGY, COLOR.a * clamp(lit, 0.0, 1.0));
}
