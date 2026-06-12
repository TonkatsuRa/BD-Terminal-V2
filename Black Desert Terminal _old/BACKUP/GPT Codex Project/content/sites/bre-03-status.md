## diagnostic
title = BRE-03 DIAGNOSTIC
ticker = BRE-03 OBSERVATION POST // NORTH BLIND MOTION // THERMAL NEGATIVE {spinner} {sweep:20}

## diagnostic.network
state = warn
status = RIDGE ARRAY
level = 64
surface = PASSIVE ONLY
relay = BRE-03 CARRIER / THIN
drone = RIDGE WATCH 52%

## diagnostic.generator
state = ok
status = QUIET BUS
level = 66
core = OBSERVATION BUS
sample_rate = 7.2 kS/s

## diagnostic.power
state = ok
status = BATTERY GOOD
main = 69
reserve = 57

## diagnostic.life
state = warn
status = 3 GHOSTS
known = 6
unstable = 0
unknown = 3

## facility
title = BRE-03 TOPOGRAPHY
ticker = BRE-03 MAP // SENSOR GHOSTS // WATCH GLASS EVENT FLAGGED {spinner}

## facility.grid
id = BRE-03
structure = 79
power = 69
reserve = 57
repair = 01 OPEN

## facility.contacts
known = 6
unknown = 3
camera = 07/10 FOGGED
faults = NORTH-BLIND GLASS-01
routes = ridge->watch, watch->relay, relay->north
