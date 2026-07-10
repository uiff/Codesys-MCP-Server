// === 1) Flanken und Zeiten (einmal pro Zyklus) ===
rtReset(CLK := xReset);
tonFlow(IN := xSinkPump AND NOT xFlowSwitch, PT := GVL_Param.tFlowFault);
tonPre(IN := (eState = E_HpState.PREPUMP), PT := GVL_Param.tPrePump);
tonPost(IN := (eState = E_HpState.POSTPUMP), PT := GVL_Param.tPostPump);

// === 2) Sicherheits-Sammelmeldung ===
xSafeOk := (NOT xHighPressure) AND (NOT xLowPressure)
           AND (NOT tonFlow.Q) AND (rTempSource > GVL_Param.rSourceMin);

// === 3) Sollwerte und Anforderungen ===
fbCurve(rOutside := rTempOutside,
        rOutMin := GVL_Param.rHC_OutMin, rFlowMax := GVL_Param.rHC_FlowMax,
        rOutMax := GVL_Param.rHC_OutMax, rFlowMin := GVL_Param.rHC_FlowMin);
rFlowSet := fbCurve.rFlowSet;

fbHeatHy(rActual := rTempFlow, rSet := rFlowSet, rHyst := GVL_Param.rFlowHyst);
xHeatReq := fbHeatHy.xDemand AND xDemand;

fbDhwHy(rActual := rTempDHW, rSet := GVL_Param.rDHW_Set, rHyst := GVL_Param.rDHW_Hyst);
xDhwReq := fbDhwHy.xDemand;

xCompReq := FALSE;

// === 4) Zustandsautomat ===
CASE eState OF

	E_HpState.OFF:
		xCompressor := FALSE; xSourcePump := FALSE; xSinkPump := FALSE;
		xBackupHeater := FALSE; xValveDHW := FALSE;
		IF xSafeOk THEN
			eState := E_HpState.STANDBY;
		END_IF

	E_HpState.STANDBY:
		xSourcePump := FALSE;
		xSinkPump := xHeatReq;
		xBackupHeater := FALSE;
		IF NOT xSafeOk THEN
			eState := E_HpState.FAULT;
		ELSIF xDhwReq OR xHeatReq THEN
			eState := E_HpState.PREPUMP;
		END_IF

	E_HpState.PREPUMP:
		xSourcePump := TRUE; xSinkPump := TRUE;
		xValveDHW := xDhwReq;
		IF NOT xSafeOk THEN
			eState := E_HpState.FAULT;
		ELSIF NOT (xDhwReq OR xHeatReq) THEN
			eState := E_HpState.POSTPUMP;
		ELSIF tonPre.Q THEN
			IF xDhwReq THEN
				eState := E_HpState.DHW;
			ELSE
				eState := E_HpState.HEATING;
			END_IF
		END_IF

	E_HpState.HEATING:
		xValveDHW := FALSE;
		xSourcePump := TRUE; xSinkPump := TRUE;
		xCompReq := xHeatReq;
		xBackupHeater := xHeatReq AND (rTempOutside <= GVL_Param.rBackupOn);
		IF NOT xSafeOk THEN
			eState := E_HpState.FAULT;
		ELSIF xDhwReq THEN
			eState := E_HpState.DHW;
		ELSIF NOT xHeatReq THEN
			eState := E_HpState.POSTPUMP;
		END_IF

	E_HpState.DHW:
		xValveDHW := TRUE;
		xSourcePump := TRUE; xSinkPump := TRUE;
		xCompReq := xDhwReq AND (rTempDHW < GVL_Param.rDHW_Max);
		xBackupHeater := FALSE;
		IF NOT xSafeOk THEN
			eState := E_HpState.FAULT;
		ELSIF NOT xDhwReq THEN
			IF xHeatReq THEN
				eState := E_HpState.HEATING;
			ELSE
				eState := E_HpState.POSTPUMP;
			END_IF
		END_IF

	E_HpState.POSTPUMP:
		xBackupHeater := FALSE;
		xSourcePump := TRUE; xSinkPump := TRUE;
		IF NOT xSafeOk THEN
			eState := E_HpState.FAULT;
		ELSIF xDhwReq OR xHeatReq THEN
			eState := E_HpState.PREPUMP;
		ELSIF tonPost.Q THEN
			eState := E_HpState.STANDBY;
		END_IF

	E_HpState.FAULT:
		xSourcePump := FALSE; xSinkPump := FALSE; xBackupHeater := FALSE;
		xFault := TRUE;
		IF rtReset.Q AND xSafeOk THEN
			xFault := FALSE;
			eState := E_HpState.OFF;
		END_IF

END_CASE

// === 5) Verdichter mit Taktschutz ===
xCompReq := xCompReq AND xSafeOk AND (eState <> E_HpState.FAULT);
fbProtect(xRequest := xCompReq, tMinRun := GVL_Param.tMinRun, tMinOff := GVL_Param.tMinOff);
xCompressor := fbProtect.xCompressor;

// === 6) Harte Sicherheits-Abschaltung hat immer Vorrang ===
IF NOT xSafeOk THEN
	xCompressor := FALSE;
	xBackupHeater := FALSE;
END_IF
