## diagnostic
title = BRE-04 DIAGNOSTIC
ticker = BRE-04 CONTAINMENT // GLASSHOUSE Q-2 LOCKED // INTERIOR IMPACT ALERT {spinner} {sweep:20}

## diagnostic.network
state = alert
status = QUARANTINE
level = 55
surface = RESTRICTED
relay = BRE-04 CARRIER / FILTERED
drone = INTERNAL WATCH 42%

## diagnostic.generator
state = warn
status = SEAL LOAD
level = 61
core = GLASSHOUSE BUS
sample_rate = 15.4 kS/s

## diagnostic.power
state = warn
status = LOCK DRAW
main = 64
reserve = 32

## diagnostic.life
state = alert
status = ROOM EMPTY
known = 12
unstable = 2
unknown = 4

## facility
title = BRE-04 TOPOGRAPHY
ticker = BRE-04 MAP // AIRLOCK Q-2 SEALED // CONTAINMENT GLASS PRESSURE {spinner}

## facility.grid
id = BRE-04
structure = 73
power = 64
reserve = 32
repair = 07 OPEN

## facility.contacts
known = 12
unknown = 4
camera = 09/16 DIRTY
faults = Q2-LOCK GLASS-04
routes = intake->glass, glass->contain, contain->airlock
