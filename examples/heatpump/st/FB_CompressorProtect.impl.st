// Taktschutz: Mindestlaufzeit + Mindeststillstand (Anti-Short-Cycle)
tonRun(IN := xCompressor, PT := tMinRun);
tonOff(IN := NOT xCompressor, PT := tMinOff);
xReady := tonOff.Q;
IF xCompressor THEN
	// laeuft: erst nach Mindestlaufzeit abschalten, wenn nicht mehr angefordert
	IF (NOT xRequest) AND tonRun.Q THEN
		xCompressor := FALSE;
	END_IF
ELSE
	// steht: erst nach Mindeststillstand und bei Anforderung starten
	IF xRequest AND xReady THEN
		xCompressor := TRUE;
	END_IF
END_IF
