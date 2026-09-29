// Vertical gradient fill for the WARDEN title (MenuScene.ts: fillGradient
// white → #88aad0, top to bottom). Only the fill pass is tinted — a Label
// draws its outline in the outline colour, which we leave alone.
shader_type canvas_item;

uniform float height = 260.0;             // the Label's height in px
uniform vec3 top_color = vec3(1.0);
uniform vec3 bottom_color = vec3(0.533, 0.667, 0.816);

varying float v_y;
varying float v_fill;

void vertex() {
	v_y = VERTEX.y / height;
	v_fill = step(2.9, COLOR.r + COLOR.g + COLOR.b);  // white font colour = the fill pass
}

void fragment() {
	if (v_fill > 0.5) {
		COLOR.rgb *= mix(top_color, bottom_color, clamp(v_y, 0.0, 1.0));
	}
}
