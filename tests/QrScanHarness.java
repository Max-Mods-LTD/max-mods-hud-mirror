// SPDX-License-Identifier: GPL-3.0-or-later
import javax.imageio.ImageIO;
import java.io.File;
import java.awt.image.BufferedImage;
import java.util.*;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
public class QrScanHarness {
 public static void main(String[] args)throws Exception{
  BufferedImage im=ImageIO.read(new File("docs/images/pairing.png"));int w=im.getWidth(),h=im.getHeight();byte[] luma=new byte[w*h];
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){int c=im.getRGB(x,y),r=c>>16&255,g=c>>8&255,b=c&255;luma[y*w+x]=(byte)((77*r+150*g+29*b)>>8);}
  Map<DecodeHintType,Object> hints=new EnumMap<>(DecodeHintType.class);hints.put(DecodeHintType.POSSIBLE_FORMATS,Collections.singletonList(BarcodeFormat.QR_CODE));
  Result result=new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new PlanarYUVLuminanceSource(luma,w,h,0,0,w,h,false))),hints);
  if(!result.getText().equals("maxmods://pair?v=2&host=10.232.70.1&hosts=10.232.70.1,192.168.1.1,172.16.1.1,10.0.0.1&port=8477&key="+String.join("",Collections.nCopies(48,"a"))))throw new AssertionError("QR changed");
  System.out.println("PASS actual car dashboard QR raster decodes using the phone's ZXing/luma pipeline");
 }
}
