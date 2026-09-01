from dataclasses import dataclass
ALLOW={'help','device_info','storage_info','loader_list','ir_transmit','gpio_read'}
APPROVAL={'ir_transmit'}
@dataclass
class Sentinel:
    heartbeat_age_ms:int=0
    estop:bool=False
    @property
    def enable(self): return not self.estop and self.heartbeat_age_ms<2000

def dispatch(cap,sentinel,approved=False):
    if not sentinel.enable:return 'INTERLOCK'
    if cap not in ALLOW:return 'DENY'
    if cap in APPROVAL and not approved:return 'APPROVAL_REQUIRED'
    return 'EXECUTE'

def test_paths():
    s=Sentinel();assert dispatch('device_info',s)=='EXECUTE';assert dispatch('raw_shell',s)=='DENY';assert dispatch('ir_transmit',s)=='APPROVAL_REQUIRED';assert dispatch('ir_transmit',s,True)=='EXECUTE';s.estop=True;assert dispatch('device_info',s)=='INTERLOCK';s=Sentinel(heartbeat_age_ms=2501);assert dispatch('device_info',s)=='INTERLOCK'
if __name__=='__main__':test_paths();print('integration simulation: PASS')
