extends RefCounted
## The playable area of the lane map: a long, tall field. Its north and south
## edges run as far out as the towers' range circles (±HALF_HEIGHT = the tower
## range) between the towers, swing out round each tower's range circle, and
## close into the well circles (the bases) at the ends. In shapes: the band
## |x| ≤ TOWER_X, |y| ≤ HALF_HEIGHT, plus both tower range circles, plus both
## wells. Heroes and creeps are kept inside (unit.gd), the lane draws it, the
## minimap shows it. Only on while a lane is up (`active`); Training is open.
##
## WELL_X / WELL_R must match lane.gd's BASE_X / BASE_RADIUS; TOWER_X /
## TOWER_R lane.gd's TOWER_X and tower.gd's RANGE.

const WELL_X := 2600.0
const WELL_R := 300.0
const TOWER_X := 2000.0
const TOWER_R := 650.0
const HALF_HEIGHT := 650.0   # north / south edges between the towers (= the tower range)

static var active := false


## Half the field's height at `x` (each column is one span, centred on y = 0).
static func half_height(x: float) -> float:
	var ax := absf(x)
	var h := HALF_HEIGHT if ax <= TOWER_X else 0.0
	h = maxf(h, _circle_half(ax, TOWER_X, TOWER_R))
	return maxf(h, _circle_half(ax, WELL_X, WELL_R))


static func _circle_half(ax: float, cx: float, r: float) -> float:
	var dx := ax - cx
	return sqrt(r * r - dx * dx) if absf(dx) < r else 0.0


## How far the field reaches east / west.
static func half_length() -> float:
	return maxf(TOWER_X + TOWER_R, WELL_X + WELL_R)


## Is a body of radius `r` at `p` fully inside?
static func inside(p: Vector2, r := 0.0) -> bool:
	if absf(p.x) <= TOWER_X and absf(p.y) <= HALF_HEIGHT - r:
		return true
	for c: Vector2 in _circles():
		if p.distance_to(c) <= c_radius(c) - r:
			return true
	return false


static func _circles() -> Array:
	return [Vector2(-TOWER_X, 0.0), Vector2(TOWER_X, 0.0), Vector2(-WELL_X, 0.0), Vector2(WELL_X, 0.0)]


static func c_radius(c: Vector2) -> float:
	return TOWER_R if absf(c.x) == TOWER_X else WELL_R


## The nearest spot to `p` where a body of radius `r` fits.
static func clamp_point(p: Vector2, r := 0.0) -> Vector2:
	if inside(p, r):
		return p
	var lim := maxf(0.0, HALF_HEIGHT - r)
	var best := Vector2(clampf(p.x, -TOWER_X, TOWER_X), clampf(p.y, -lim, lim))
	for c: Vector2 in _circles():
		var off := p - c
		var q: Vector2 = c + (off.normalized() if off.length() > 0.01 else Vector2.RIGHT) * maxf(0.0, c_radius(c) - r)
		if q.distance_to(p) < best.distance_to(p):
			best = q
	return best


## The outline: the north edge west to east, then the south edge back.
static func outline(step := 40.0) -> PackedVector2Array:
	var pts := PackedVector2Array()
	var end := half_length()
	pts.append(Vector2(-end, 0.0))  # the west tip (once — a repeated point breaks filling)
	var x := -end + step
	while x < end - 0.5:
		pts.append(Vector2(x, -half_height(x)))
		x += step
	pts.append(Vector2(end, 0.0))  # the east tip
	x = end - step
	while x > -end + 0.5:
		pts.append(Vector2(x, half_height(x)))
		x -= step
	return pts
