#include <Arduino.h>
static constexpr int ESTOP_UI_PIN=27;volatile bool stopped=true;
void setup(){Serial.begin(115200);pinMode(ESTOP_UI_PIN,INPUT_PULLUP);stopped=true;Serial.println("M3rMa1d S1r3n Deck: fail-closed UI; bind CYD TFT/XPT2046 profile and approval transport");}
void loop(){if(digitalRead(ESTOP_UI_PIN)==LOW)stopped=true;delay(20);}
