#include "protocol.hpp"
namespace s1r3n { uint32_t crc32(const uint8_t* data,size_t len){uint32_t crc=0xFFFFFFFFu;for(size_t i=0;i<len;i++){crc^=data[i];for(int b=0;b<8;b++)crc=(crc>>1)^(0xEDB88320u & (-(int32_t)(crc&1)));}return ~crc;} }
