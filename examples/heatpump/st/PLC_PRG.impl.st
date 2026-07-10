fbHeatPump(
	rTempOutside  := GVL_IO.rTempOutside,
	rTempFlow     := GVL_IO.rTempFlow,
	rTempReturn   := GVL_IO.rTempReturn,
	rTempDHW      := GVL_IO.rTempDHW,
	rTempSource   := GVL_IO.rTempSource,
	xHighPressure := GVL_IO.xHighPressure,
	xLowPressure  := GVL_IO.xLowPressure,
	xFlowSwitch   := GVL_IO.xFlowSwitch,
	xDemand       := GVL_IO.xDemand,
	xReset        := GVL_IO.xReset);

GVL_IO.xCompressor   := fbHeatPump.xCompressor;
GVL_IO.xSourcePump   := fbHeatPump.xSourcePump;
GVL_IO.xSinkPump     := fbHeatPump.xSinkPump;
GVL_IO.xValveDHW     := fbHeatPump.xValveDHW;
GVL_IO.xBackupHeater := fbHeatPump.xBackupHeater;
GVL_IO.xFaultLamp    := fbHeatPump.xFault;
