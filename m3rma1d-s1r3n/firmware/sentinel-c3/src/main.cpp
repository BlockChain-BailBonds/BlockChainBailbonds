#include <Arduino.h>
static constexpr int CORE_HB=4,ENABLE=5,ESTOP=6,LED=7;static uint32_t lastEdge=0;static bool last=false;
void setup(){pinMode(CORE_HB,INPUT);pinMode(ENABLE,OUTPUT);digitalWrite(ENABLE,LOW);pinMode(ESTOP,INPUT_PULLUP);pinMode(LED,OUTPUT);lastEdge=millis();}
void loop(){bool hb=digitalRead(CORE_HB);if(hb!=last){last=hb;lastEdge=millis();}bool ok=digitalRead(ESTOP)==HIGH&&millis()-lastEdge<2000;digitalWrite(ENABLE,ok?HIGH:LOW);digitalWrite(LED,ok?LOW:HIGH);delay(10);}
