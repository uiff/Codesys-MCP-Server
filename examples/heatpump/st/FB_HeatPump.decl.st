FUNCTION_BLOCK FB_HeatPump
VAR_INPUT
	rTempOutside  : REAL;
	rTempFlow     : REAL;
	rTempReturn   : REAL;
	rTempDHW      : REAL;
	rTempSource   : REAL;
	xHighPressure : BOOL;
	xLowPressure  : BOOL;
	xFlowSwitch   : BOOL;
	xDemand       : BOOL;
	xReset        : BOOL;
END_VAR
VAR_OUTPUT
	xCompressor   : BOOL;
	xSourcePump   : BOOL;
	xSinkPump     : BOOL;
	xValveDHW     : BOOL;
	xBackupHeater : BOOL;
	xFault        : BOOL;
	eState        : E_HpState;
	rFlowSet      : REAL;
END_VAR
VAR
	fbCurve   : FB_HeatCurve;
	fbHeatHy  : FB_Hysteresis;
	fbDhwHy   : FB_Hysteresis;
	fbProtect : FB_CompressorProtect;
	tonPre    : TON;
	tonPost   : TON;
	tonFlow   : TON;
	rtReset   : R_TRIG;
	xHeatReq  : BOOL;
	xDhwReq   : BOOL;
	xCompReq  : BOOL;
	xSafeOk   : BOOL;
END_VAR
