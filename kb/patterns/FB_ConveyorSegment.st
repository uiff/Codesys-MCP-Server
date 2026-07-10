(*
  FB_ConveyorSegment — wiederverwendbarer Foerderband-Baustein.

  Verhalten: Das Band laeuft, solange Freigabe anliegt, kein Not-Halt aktiv ist
  und kein Stopp-Impuls laeuft. Eine steigende Flanke an einem der beiden Sensoren
  loest einen Stopp von tStopTime aus (Impuls-Timer TP -> fester Puls ab Flanke,
  nicht retriggerbar).

  Warum TP und nicht TON: TON(IN := R_TRIG.Q) waere falsch, weil R_TRIG.Q nur
  einen Zyklus TRUE ist und TON.ET dann sofort zuruecksetzt. TP haelt den Puls.

  AKZEPTANZTEST (KB-CI, menschlich abgenommen):
    T1 Grundlauf:    xEnable=TRUE, xEStop=FALSE, keine Flanke  => xRun=TRUE
    T2 Teil an S1:   steigende Flanke xSensor1                 => xRun=FALSE,
                     nach tStopTime wieder xRun=TRUE
    T3 Not-Halt:     xEStop=TRUE                               => xRun=FALSE (sofort)
    T4 Freigabe weg: xEnable=FALSE                             => xRun=FALSE
  INVARIANTE: nach jeder Flanke ist xRun fuer >= tStopTime ununterbrochen FALSE.
*)
FUNCTION_BLOCK FB_ConveyorSegment
VAR_INPUT
    xSensor1  : BOOL;
    xSensor2  : BOOL;
    xEnable   : BOOL;
    xEStop    : BOOL;
    tStopTime : TIME := T#1S;
END_VAR
VAR_OUTPUT
    xRun          : BOOL;
    xPartDetected : BOOL;
END_VAR
VAR
    trigS1 : R_TRIG;
    trigS2 : R_TRIG;
    tpStop : TP;
END_VAR

trigS1(CLK := xSensor1);
trigS2(CLK := xSensor2);
xPartDetected := trigS1.Q OR trigS2.Q;

tpStop(IN := xPartDetected, PT := tStopTime);

xRun := xEnable AND NOT xEStop AND NOT tpStop.Q;

END_FUNCTION_BLOCK
