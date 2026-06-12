## diagnostic
title = BRE-02 DIAGNOSTIC
ticker = BRE-02 EXTRACTION SITE // CONVOY QUEUE HOLDING // MASS DELTA REVIEW {spinner} {sweep:20}

## diagnostic.network
state = ok
status = CONVOY NET
level = 78
surface = ROAD RELAY LIVE
relay = BRE-02 CARRIER / CLEAN
drone = YARD WATCH 81%

## diagnostic.generator
state = ok
status = LOAD EVEN
level = 74
core = EXTRACTION BUS
sample_rate = 9.8 kS/s

## diagnostic.power
state = warn
status = GRID SAG
main = 71
reserve = 39

## diagnostic.life
state = warn
status = 1 UNKNOWN
known = 17
unstable = 0
unknown = 1

## facility
title = BRE-02 TOPOGRAPHY
ticker = BRE-02 MAP // HAULER QUEUE // WEST ROAD SENSOR SPOOFING {spinner}

## facility.grid
id = BRE-02
structure = 88
power = 71
reserve = 39
repair = 04 OPEN

## facility.contacts
known = 17
unknown = 1
camera = 11/14 CLEAR
faults = ROAD-W CAM-YARD
routes = yard->scale, scale->vault, vault->road
