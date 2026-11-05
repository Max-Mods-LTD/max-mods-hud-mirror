// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
import java.io.ByteArrayOutputStream;
/** AVC access units: normalize length prefixes without dropping reference frames. */
public final class AnnexB {
 public static byte[] normalize(byte[] input){
  if(input.length>=4&&input[0]==0&&input[1]==0&&(input[2]==1||input[2]==0&&input[3]==1))return input;
  ByteArrayOutputStream out=new ByteArrayOutputStream();int at=0,count=0;
  while(at<input.length){if(input.length-at<4||++count>128)throw new IllegalArgumentException("Invalid AVC unit");int n=(input[at]&255)<<24|(input[at+1]&255)<<16|(input[at+2]&255)<<8|input[at+3]&255;at+=4;
   if(n<1||n>input.length-at)throw new IllegalArgumentException("Invalid AVC length");out.write(0);out.write(0);out.write(0);out.write(1);out.write(input,at,n);at+=n;
  }return out.toByteArray();
 }
}
