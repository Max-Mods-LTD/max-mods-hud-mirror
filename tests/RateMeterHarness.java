// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
public final class RateMeterHarness{
 private static void check(boolean v,String reason){if(!v)throw new AssertionError(reason);}
 public static void main(String[] args){
  final long[] now={1000000000L};RateMeter r=new RateMeter(new FrameStore.Clock(){public long nanoTime(){return now[0];}});
  check(r.fps()==0&&r.kbps()==0,"Empty statistics fabricated traffic");
  for(int i=0;i<101;i++){r.record(1000);now[0]+=20000000L;}
  check(r.fps()==50&&r.kbps()>=390&&r.kbps()<=420,"Actual frame/write statistics");
  now[0]+=1100000000L;check(r.fps()==0&&r.kbps()==0,"Idle statistics fabricated repeated frames");
  r.clear();check(r.fps()==0,"Clear retained old traffic");
  for(int i=0;i<1000;i++)r.record(600000);check(r.fps()<=240&&r.fps()>=0&&r.kbps()<=1000000,"Burst counters were unbounded");
  FrameStore f=new FrameStore(new FrameStore.Clock(){public long nanoTime(){return now[0];}});f.heartbeat();
  for(int i=0;i<100;i++){now[0]+=20000000L;f.heartbeat();}check(f.captureRate.fps()==0,"Capture heartbeat fabricated frame rate");
  f.setFormat("h264-annexb");for(int i=0;i<31;i++){f.publishAvc(new byte[]{0,0,1,0x65});now[0]+=33333333L;}
  check(f.captureRate.fps()==30,"Published capture rate missing");f.clear();check(f.captureRate.fps()==0,"Stopped capture kept its rate");
  System.out.println("PASS real capture/write rate, bounded traffic counters, idle/stop expiry and no heartbeat-generated fps");
 }
}
