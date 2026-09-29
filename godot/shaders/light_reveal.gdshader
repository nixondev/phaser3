// "Visible only where lit" — used by the spectra reveal (Hidden + Spectra).
//
// Why not CanvasItemMaterial LIGHT_ONLY / plain `render_mode light_only`:
// Godot decides light-only visibility per ITEM, not per pixel — any item
// overlapping a matching light's bounding box is drawn whole, ignoring the
// light's texture (godot#98375, godot#82183). A spectra mark behind the
// player showed up while the beam pointed away. Writing LIGHT here makes the
// alpha follow the light actually reaching each pixel (and shadows still
// apply on top).
shader_type canvas_item;
render_mode light_only;

void light() {
	float lit = max(LIGHT_COLOR.r, max(LIGHT_COLOR.g, LIGHT_COLOR.b)) * LIGHT_ENERGY;
	LIGHT = vec4(COLOR.rgb * LIGHT_COLOR.rgb * LIGHT_ENERGY, COLOR.a * clamp(lit, 0.0, 1.0));
}
