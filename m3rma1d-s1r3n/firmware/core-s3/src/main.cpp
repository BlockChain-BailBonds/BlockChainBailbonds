#include <Arduino.h>
#include "protocol.hpp"
using namespace s1r3n;
HardwareSerial Flipper(1);
static constexpr int FLIP_RX=18,FLIP_TX=17,SENTINEL_ENABLE=4,SENTINEL_HB=5;
uint32_t lastSentinelEdge=0;bool lastHb=false;
String commandFor(const JobRequest& j){switch(j.capability){case Capability::Help:return "help\r";case Capability::DeviceInfo:return "device_info\r";case Capability::StorageInfo:return "storage_info\r";case Capability::LoaderList:return "loader list\r";case Capability::IrTransmit:return String("ir tx ")+j.argument+"\r";case Capability::GpioRead:return String("gpio read ")+j.argument+"\r";default:return "";}}
bool sentinelHealthy(){bool v=digitalRead(SENTINEL_HB);if(v!=lastHb){lastHb=v;lastSentinelEdge=millis();}return digitalRead(SENTINEL_ENABLE)==HIGH&&millis()-lastSentinelEdge<2500;}
bool executeJob(const JobRequest& j,bool approved,JobResult& out){out.job_id=j.job_id;if(!sentinelHealthy()){out.code=-10;strncpy(out.text,"sentinel interlock open",sizeof(out.text));return false;}if(!capabilityAllowed(j.capability)){out.code=-11;strncpy(out.text,"capability denied",sizeof(out.text));return false;}if(needsApproval(j.capability)&&!approved){out.code=-12;strncpy(out.text,"approval required",sizeof(out.text));return false;}String cmd=commandFor(j);if(!cmd.length()){out.code=-13;return false;}Flipper.print(cmd);uint32_t until=millis()+min<uint16_t>(j.timeout_ms,5000);String r;while((int32_t)(until-millis())>0){while(Flipper.available()){char c=Flipper.read();if(c=='\n'&&r.length())goto done;r+=c;}delay(1);}done:out.code=r.length()?0:-14;snprintf(out.text,sizeof(out.text),"%s",r.c_str());return out.code==0;}
void setup(){Serial.begin(115200);pinMode(SENTINEL_ENABLE,INPUT);pinMode(SENTINEL_HB,INPUT);Flipper.begin(230400,SERIAL_8N1,FLIP_RX,FLIP_TX);Serial.println("M3rMa1d S1r3n Core ready");}
void loop(){sentinelHealthy();delay(10);}
