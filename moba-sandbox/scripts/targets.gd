extends RefCounted
## Finding things to hit. Anything damageable is in the "units" group (see
## unit.gd); `team` is the attacker's side, so allies are never returned.


## Live enemy units whose body overlaps a circle at `at` of `radius`.
static func enemies_in(tree: SceneTree, at: Vector2, radius: float, team: int) -> Array:
	return tree.get_nodes_in_group("units").filter(func(u: Node2D) -> bool:
		return u.is_enemy_of(team) and u.is_targetable() and u.position.distance_to(at) <= radius + u.radius)


## Live enemy units touching the segment a→b (a line `half_width` thick).
static func enemies_on_line(tree: SceneTree, a: Vector2, b: Vector2, half_width: float, team: int) -> Array:
	return tree.get_nodes_in_group("units").filter(func(u: Node2D) -> bool:
		var closest := Geometry2D.get_closest_point_to_segment(u.position, a, b)
		return u.is_enemy_of(team) and u.is_targetable() and u.position.distance_to(closest) <= half_width + u.radius)
