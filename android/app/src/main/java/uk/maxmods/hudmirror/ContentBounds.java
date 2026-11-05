// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
/** Describe only encoder-added padding; preserve the complete captured phone.
 * A private JPEG APP15 marker travels with its frame, including on rotation. */
public final class ContentBounds {
 private ContentBounds(){}
 public static int[] fit(int sourceW,int sourceH,int w,int h){
  if(sourceW<=0||sourceH<=0||w<2||h<2||(w&1)!=0||(h&1)!=0)throw new IllegalArgumentException("Invalid phone bounds");
  float scale=Math.min((float)w/sourceW,(float)h/sourceH),dw=sourceW*scale,dh=sourceH*scale;
  // Round OUT to even YUV edges, retaining any fractional boundary pixels.
  int x=Math.max(0,(int)Math.floor((w-dw)/2)/2*2),y=Math.max(0,(int)Math.floor((h-dh)/2)/2*2);
  int right=Math.min(w,(int)Math.ceil((w+dw)/4)*2),bottom=Math.min(h,(int)Math.ceil((h+dh)/4)*2);
  return new int[]{x,y,right-x,bottom-y,w,h};
 }
 public static byte[] attach(byte[] jpeg,int[] bounds){
  if(jpeg==null||jpeg.length<2||(jpeg[0]&255)!=255||(jpeg[1]&255)!=216||bounds==null||bounds.length!=6)throw new IllegalArgumentException("Invalid JPEG bounds");
  byte[] out=new byte[jpeg.length+20];out[0]=(byte)255;out[1]=(byte)216;out[2]=(byte)255;out[3]=(byte)239;out[4]=0;out[5]=18;
  out[6]='M';out[7]='M';out[8]='C';out[9]='R';
  for(int i=0;i<6;i++){out[10+i*2]=(byte)(bounds[i]>>>8);out[11+i*2]=(byte)bounds[i];}
  System.arraycopy(jpeg,2,out,22,jpeg.length-2);return out;
 }
}
