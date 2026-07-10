{attribute 'qualified_only'}
VAR_GLOBAL CONSTANT
	// Heizkurve: Vorlauf-Sollwert linear ueber Aussentemperatur
	rHC_OutMin  : REAL := -15.0;
	rHC_FlowMax : REAL := 45.0;
	rHC_OutMax  : REAL := 18.0;
	rHC_FlowMin : REAL := 25.0;
	rFlowHyst   : REAL := 3.0;
	// Warmwasser
	rDHW_Set    : REAL := 50.0;
	rDHW_Hyst   : REAL := 5.0;
	rDHW_Max    : REAL := 60.0;
	// Zusatzheizung (Bivalenzpunkt)
	rBackupOn   : REAL := -7.0;
	// Quelle
	rSourceMin  : REAL := -5.0;
	// Zeiten
	tPrePump    : TIME := T#30S;
	tPostPump   : TIME := T#60S;
	tMinRun     : TIME := T#5M;
	tMinOff     : TIME := T#5M;
	tFlowFault  : TIME := T#10S;
END_VAR
