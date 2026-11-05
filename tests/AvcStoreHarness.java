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
  System.out.println("PASS Annex B conversion, malformed NAL rejection, bounded ordered AVC references and hidden/stopped cleanup");
 }
}
