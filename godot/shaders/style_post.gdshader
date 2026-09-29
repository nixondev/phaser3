// Style experiments 3 + 4: colour grade and retro pass, one full-screen shader.
// (Two separate screen-reading passes would both read the same pre-effect
// copy of the screen, so they share one shader.) Uniforms are driven by
// scripts/style_lab.gd; the HUD sits on a higher CanvasLayer, so it's untouched.
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_nearest;

// ── Grade ─────────────────────────────────────────────
uniform bool grade_on = false;
uniform vec3 tint = vec3(1.0);        // multiply
uniform vec3 lift = vec3(0.0);        // added to shadows
uniform float saturation = 1.0;
uniform float contrast = 1.0;

// ── Retro ─────────────────────────────────────────────
uniform bool retro_on = false;
uniform float levels = 6.0;           // colour steps per channel
uniform float dither_px = 2.0;        // size of one Bayer dither cell, screen px
uniform float scanline = 0.18;        // darkening of every other line
uniform float vignette = 0.45;
uniform float grain = 0.05;

float bayer4(vec2 p) {
	int x = int(mod(p.x, 4.0));
	int y = int(mod(p.y, 4.0));
	int i = x + y * 4;
	// 4x4 ordered-dither matrix, normalised to [0,1)
	float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
	return (m[i] + 0.5) / 16.0;
}

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec3 c = texture(screen_tex, SCREEN_UV).rgb;

	if (grade_on) {
		float l = dot(c, vec3(0.299, 0.587, 0.114));
		c = mix(vec3(l), c, saturation);
		c = (c - 0.5) * contrast + 0.5;
		c = c * tint + lift * (1.0 - l);
	}

	if (retro_on) {
		vec2 cell = floor(FRAGCOORD.xy / dither_px);
		float d = bayer4(cell) - 0.5;
		c = floor(c * levels + d + 0.5) / levels;
		if (mod(floor(FRAGCOORD.y / dither_px), 2.0) == 1.0) {
			c *= 1.0 - scanline;
		}
		vec2 v = SCREEN_UV - 0.5;
		c *= 1.0 - vignette * dot(v, v) * 2.0;
		c += (hash(FRAGCOORD.xy + fract(TIME) * 100.0) - 0.5) * grain;
	}

	COLOR = vec4(clamp(c, 0.0, 1.0), 1.0);
}
