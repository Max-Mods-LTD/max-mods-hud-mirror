// SPDX-License-Identifier: GPL-3.0-or-later
import uk.maxmods.hudmirror.ContentBounds;
import java.util.*;
public class ContentBoundsHarness {
 private static void check(boolean value,String reason){if(!value)throw new AssertionError(reason);}
 public static void main(String[] args){
  Random random=new Random(5);
  for(int[] canvas:new int[][]{{768,432},{576,324}})for(int n=0;n<5000;n++){
   int sw=n==0?canvas[0]:1+random.nextInt(5000),sh=n==0?canvas[1]:1+random.nextInt(5000),w=canvas[0],h=canvas[1];
   int[] c=ContentBounds.fit(sw,sh,w,h);float scale=Math.min((float)w/sw,(float)h/sh),dw=sw*scale,dh=sh*scale;
   for(int v:c)check(v>=0&&v%2==0,"Bounds must use nonnegative even YUV coordinates");
   check(c[2]>=2&&c[3]>=2&&c[0]+c[2]<=w&&c[1]+c[3]<=h,"Bounds exceed frame");
   check(c[0]<=Math.max(0,(w-dw)/2)&&c[1]<=Math.max(0,(h-dh)/2)&&c[0]+c[2]>=Math.min(w,(w+dw)/2)&&c[1]+c[3]>=Math.min(h,(h+dh)/2),"Phone edge cropped");
   byte[] jpeg={(byte)255,(byte)216,7,8,(byte)255,(byte)217},marked=ContentBounds.attach(jpeg,c);
   check(marked.length==jpeg.length+20&&marked[2]==(byte)255&&marked[3]==(byte)239&&marked[5]==18,"Invalid JPEG APP15 record");
   check(new String(marked,6,4).equals("MMCR"),"Bounds magic");
   for(int i=0;i<6;i++)check(((marked[10+i*2]&255)*256+(marked[11+i*2]&255))==c[i],"Bounds field changed");
   check(Arrays.equals(Arrays.copyOfRange(marked,22,marked.length),Arrays.copyOfRange(jpeg,2,jpeg.length)),"JPEG pixels were changed");
  }
  System.out.println("PASS 10,000 portrait/landscape/ultrawide bounds preserve every phone edge, align YUV and attach exact per-frame metadata");
 }
}
