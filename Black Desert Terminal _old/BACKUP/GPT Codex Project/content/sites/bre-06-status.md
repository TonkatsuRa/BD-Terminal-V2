## diagnostic
title = BRE-06 DIAGNOSTIC
ticker = BRE-06 DEEP LAB // ORPHEUS LOCK CYCLE // UNPAIRED DESCENT {spinner} {sweep:20}

## diagnostic.network
state = alert
status = DEEP LINK
level = 44
surface = ELEVATOR RELAY
relay = BRE-06 CARRIER / COMPRESSED
drone = NO SURFACE WATCH

## diagnostic.generator
state = warn
status = DEEP LOAD
level = 67
core = ORPHEUS BUS
sample_rate = 21.5 kS/s

## diagnostic.power
state = alert
status = VAULT DRAW
main = 59
reserve = 28

## diagnostic.life
state = alert
status = 1 DESCENT
known = 8
unstable = 1
unknown = 1

## facility
title = BRE-06 TOPOGRAPHY
ticker = BRE-06 MAP // DEEP ELEVATOR MISMATCH // ORPHEUS CHAMBER LOCKED {spinner}

## facility.grid
id = BRE-06
structure = 71
power = 59
reserve = 28
repair = 05 OPEN

## facility.contacts
known = 8
unknown = 1
camera = 03/12 DARK
faults = ELEVATOR-01 ORPHEUS-LOCK
routes = lift->hub, hub->lab, lab->orpheus
