{attribute 'qualified_only'}
VAR_GLOBAL
	// --- Eingaenge (Analog, degC) ---
	rTempOutside  : REAL;   // Aussentemperatur
	rTempFlow     : REAL;   // Vorlauftemperatur
	rTempReturn   : REAL;   // Ruecklauftemperatur
	rTempDHW      : REAL;   // Warmwasser-Speicher
	rTempSource   : REAL;   // Quelle (Sole/Verdampfer)
	// --- Eingaenge (Digital) ---
	xHighPressure : BOOL;   // Hochdruckwaechter (TRUE=Stoerung)
	xLowPressure  : BOOL;   // Niederdruckwaechter (TRUE=Stoerung)
	xFlowSwitch   : BOOL;   // Stroemungswaechter (TRUE=Durchfluss ok)
	xDemand       : BOOL;   // Externe Heizanforderung / Thermostat
	xReset        : BOOL;   // Stoerungs-Quittierung
	// --- Ausgaenge (Digital) ---
	xCompressor   : BOOL;   // Verdichter-Schuetz
	xSourcePump   : BOOL;   // Quellenpumpe / Ventilator
	xSinkPump     : BOOL;   // Heizkreispumpe
	xValveDHW     : BOOL;   // 3-Wege-Ventil (TRUE=Warmwasser)
	xBackupHeater : BOOL;   // Elektro-Zusatzheizung
	xFaultLamp    : BOOL;   // Stoermeldeleuchte
END_VAR
