FUNCTION_BLOCK FB_HeatCurve
VAR_INPUT
	rOutside : REAL;
	rOutMin  : REAL;
	rFlowMax : REAL;
	rOutMax  : REAL;
	rFlowMin : REAL;
END_VAR
VAR_OUTPUT
	rFlowSet : REAL;
END_VAR
VAR
	rX     : REAL;
	rSlope : REAL;
END_VAR
