// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
import java.util.Arrays;
public final class AvcStoreHarness{
 private static void check(boolean v,String why){if(!v)throw new AssertionError(why);}
 public static void main(String[] args)throws Exception{
  byte[] annex={0,0,0,1,0x65,12};check(Arrays.equals(AnnexB.normalize(annex),annex),"Annex B changed");
  byte[] length={0,0,0,2,0x67,12,0,0,0,2,0x65,13};
  check(Arrays.equals(AnnexB.normalize(length),new byte[]{0,0,0,1,0x67,12,0,0,0,1,0x65,13}),"NAL length conversion");
  for(byte[] bad:new byte[][]{new byte[]{2,3},new byte[]{0,0,0,20,0x65},new byte[]{0,0,0,0}}){
   boolean rejected=false;try{AnnexB.normalize(bad);}catch(Exception e){rejected=true;}check(rejected,"Malformed AVC accepted");
  }
  FrameStore store=new FrameStore();store.heartbeat();store.setFormat("h264-annexb");
  for(int i=1;i<=20;i++){annex[5]=(byte)i;store.publishAvc(annex);}
  annex[5]=99;FrameStore.Frame frame=store.snapshot(0).frame;check(frame.id==9&&frame.compressed[5]==9,"Bounded immutable reference queue");
  for(long i=9;i<20;i++)check(store.snapshot(i).frame.id==i+1,"Reference frame skipped");
  check(store.snapshot(20).frame==null,"Frame repeated");
  store.visible(false);check(store.snapshot(0).frame==null,"Hidden AVC exposed");store.visible(true);check(store.snapshot(0).frame==null,"Hidden screenshot replayed");
  store.setFormat("jpeg");store.publishAvc(annex);check(store.snapshot(0).frame==null,"Wrong codec frame accepted");
  store.clear();store.setFormat("h264-annexb");store.publishAvc(annex);check(store.snapshot(0).state.equals("stopped"),"Stopped capture reopened");
  final long[] now={1000000000L};
  FrameStore delayed=new FrameStore(new FrameStore.Clock(){public long nanoTime(){return now[0];}});delayed.heartbeat();delayed.setFormat("h264-annexb");
  for(int i=0;i<6;i++){delayed.publishAvc(annex);now[0]+=33000000L;}
  FrameStore.Frame newest=delayed.snapshot(5).frame;
  check(!delayed.trimAvcBacklog(0,300),"Fresh references were discarded");
  now[0]+=200000000L;check(delayed.trimAvcBacklog(0,300),"Delayed backlog not discarded");
  FrameStore.Frame retained=delayed.snapshot(0).frame;
  check(retained.id==6&&retained.createdNs==newest.createdNs,"Backlog trim fabricated a capture/sequence");
  check(delayed.snapshot(6).frame==null&&!delayed.trimAvcBacklog(0,300),"Single latest access unit repeated/discarded");
  now[0]=1000000000L+(FrameStore.LIVENESS_MS+1)*1000000L;
  check(delayed.snapshot(0).state.equals("stalled")&&delayed.snapshot(0).frame==null,"Backlog trim renewed capture liveness");
  delayed.heartbeat();delayed.visible(false);check(!delayed.trimAvcBacklog(0,300)&&delayed.snapshot(0).frame==null,"Hidden backlog exposed");
  delayed.visible(true);check(delayed.snapshot(0).state.equals("waiting"),"Showing capture replayed trimmed frame");
  delayed.clear();check(!delayed.trimAvcBacklog(0,300),"Stopped backlog touched");
  System.out.println("PASS Annex B, bounded ordered references, age-limited backlog discard, real sequence/capture time and hidden/stopped/liveness cleanup");
 }
}
