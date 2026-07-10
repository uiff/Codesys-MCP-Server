// Aussentemperatur auf den Kurvenbereich begrenzen
rX := LIMIT(rOutMin, rOutside, rOutMax);
// lineare Interpolation zwischen (rOutMin,rFlowMax) und (rOutMax,rFlowMin)
IF (rOutMax - rOutMin) <> 0.0 THEN
	rSlope := (rFlowMin - rFlowMax) / (rOutMax - rOutMin);
	rFlowSet := rFlowMax + rSlope * (rX - rOutMin);
ELSE
	rFlowSet := rFlowMax;
END_IF
