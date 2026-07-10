FUNCTION_BLOCK FB_CompressorProtect
VAR_INPUT
	xRequest : BOOL;
	tMinRun  : TIME;
	tMinOff  : TIME;
END_VAR
VAR_OUTPUT
	xCompressor : BOOL;
	xReady      : BOOL;
END_VAR
VAR
	tonRun : TON;
	tonOff : TON;
END_VAR
