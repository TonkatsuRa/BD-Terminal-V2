## diagnostic
title = BRE-05 DIAGNOSTIC
ticker = BRE-05 RELAY STATION // PACKET LOSS WINDOW // MIDNIGHT LOOP {spinner} {sweep:20}

## diagnostic.network
state = warn
status = PACKET LOSS
level = 48
surface = DEAD-NET BRIDGE
relay = BRE-05 CARRIER / DECAY
drone = RELAY WATCH 38%

## diagnostic.generator
state = ok
status = COOL BUS
level = 70
core = RELAY PROCESSOR
sample_rate = 18.0 kS/s

## diagnostic.power
state = ok
status = LOW DRAW
main = 76
reserve = 62

## diagnostic.life
state = ok
status = STAFFED
known = 5
unstable = 0
unknown = 0

## facility
title = BRE-05 TOPOGRAPHY
ticker = BRE-05 MAP // BORELINE RELAY // CARRIER DECAY IN WINDOW {spinner}

## facility.grid
id = BRE-05
structure = 84
power = 76
reserve = 62
repair = 03 OPEN

## facility.contacts
known = 5
unknown = 0
camera = 04/06 CLEAR
faults = CARRIER-LOSS PROC-LOOP
routes = relay->processor, processor->dish, dish->line
