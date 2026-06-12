## diagnostic
title = BRE-01 DIAGNOSTIC
ticker = BRE-01 ANNEX LINK LIVE // GATE RAIL WATCH // COOLANT A-3 SERVICE {spinner} {sweep:20}

## diagnostic.network
state = warn
status = ANNEX LINK
level = 72
surface = REMOTE HANDSHAKE
relay = BRE-01 CARRIER / STABLE
drone = LOCAL WATCH 63%

## diagnostic.generator
state = warn
status = COOLANT A-3
level = 58
core = GATE RAIL HOT
sample_rate = 12.6 kS/s

## diagnostic.power
state = warn
status = RESERVE DRAW
main = 68
reserve = 41

## diagnostic.life
state = ok
status = 2 DELAYED
known = 9
unstable = 1
unknown = 2

## facility
title = BRE-01 TOPOGRAPHY
ticker = BRE-01 ANNEX MAP // CAMERA RAIL 02 DEGRADED // GATE MONITOR NOMINAL {spinner}

## facility.grid
id = BRE-01
structure = 82
power = 68
reserve = 41
repair = 02 OPEN

## facility.contacts
known = 9
unknown = 2
camera = 06/08 DIRTY
faults = COOLANT-A3 CAM-02
routes = core->lab, lab->service, service->gate
