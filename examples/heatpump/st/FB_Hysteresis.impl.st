// Bistabile 2-Punkt-Hysterese: Anforderung EIN unter (Soll-Hyst), AUS bei Soll
IF rActual <= (rSet - rHyst) THEN
	xDemand := TRUE;
ELSIF rActual >= rSet THEN
	xDemand := FALSE;
END_IF
