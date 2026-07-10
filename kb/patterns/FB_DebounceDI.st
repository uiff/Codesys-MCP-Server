(*
  FB_DebounceDI — entprellt einen digitalen Eingang.
  xOut uebernimmt xIn erst, wenn xIn fuer tDebounce ununterbrochen stabil war.
  Vor der Flankenerkennung einsetzen (gegen Prellen/Stoerimpulse).

  AKZEPTANZTEST (KB-CI):
    Puls kuerzer als tDebounce  => xOut unveraendert
    xIn stabil >= tDebounce     => xOut folgt xIn
*)
FUNCTION_BLOCK FB_DebounceDI
VAR_INPUT
    xIn       : BOOL;
    tDebounce : TIME := T#20MS;
END_VAR
VAR_OUTPUT
    xOut : BOOL;
END_VAR
VAR
    tonStable : TON;
END_VAR

tonStable(IN := (xIn <> xOut), PT := tDebounce);
IF tonStable.Q THEN
    xOut := xIn;
END_IF

END_FUNCTION_BLOCK
