// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
import android.media.*;
import android.os.*;
import android.view.Surface;
import java.nio.ByteBuffer;
import java.io.ByteArrayOutputStream;
/** Hardware AVC surface encoder. Android owns screen scaling/letterboxing. */
final class CodecCapture {
 interface Failure {void failed(String reason);}
 private MediaCodec codec;private Surface surface;private byte[] config=new byte[0];private boolean closed;
 final int width=1280,height=720;int fps;
 Surface start(int requested,Handler handler,FrameStore frames,Failure failure)throws Exception{
  if(Build.VERSION.SDK_INT<32)throw new IllegalStateException("Hardware whole-screen fit requires Android 12L or later; use JPEG");
  MediaFormat format=MediaFormat.createVideoFormat("video/avc",width,height);
  format.setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
  format.setInteger(MediaFormat.KEY_BIT_RATE,3000000);format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,1);
  format.setInteger(MediaFormat.KEY_MAX_B_FRAMES,0);
  format.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER,250000);
  String encoder=null;
  for(MediaCodecInfo info:new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()){
   if(!info.isEncoder())continue;String name=info.getName().toLowerCase();if(name.startsWith("omx.google.")||name.startsWith("c2.android."))continue;
   if(Build.VERSION.SDK_INT>=29&&!info.isHardwareAccelerated())continue;
   try{MediaCodecInfo.VideoCapabilities caps=info.getCapabilitiesForType("video/avc").getVideoCapabilities();int rate=caps.areSizeAndRateSupported(width,height,requested)?requested:caps.areSizeAndRateSupported(width,height,30)?30:0;if(rate>0){encoder=info.getName();fps=rate;break;}}catch(Exception ignored){}
  }
  if(encoder==null)throw new IllegalStateException("No supported hardware AVC encoder; use JPEG");format.setInteger(MediaFormat.KEY_FRAME_RATE,fps);
  codec=MediaCodec.createByCodecName(encoder);codec.setCallback(new MediaCodec.Callback(){
   public void onInputBufferAvailable(MediaCodec c,int index){}
   public void onOutputFormatChanged(MediaCodec c,MediaFormat f){
    try{ByteArrayOutputStream bytes=new ByteArrayOutputStream();for(String key:new String[]{"csd-0","csd-1"}){ByteBuffer b=f.getByteBuffer(key);if(b!=null){byte[] data=new byte[b.remaining()];b.get(data);bytes.write(AnnexB.normalize(data));}}config=bytes.toByteArray();}catch(Exception ignored){}
   }
   public void onOutputBufferAvailable(MediaCodec c,int index,MediaCodec.BufferInfo info){
    try{if(closed)return;ByteBuffer buffer=c.getOutputBuffer(index);if(buffer==null||info.size==0)return;buffer.position(info.offset);buffer.limit(info.offset+info.size);byte[] raw=new byte[info.size];buffer.get(raw);byte[] bytes=AnnexB.normalize(raw);
     if((info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)!=0){config=bytes;return;}
     if((info.flags&MediaCodec.BUFFER_FLAG_KEY_FRAME)!=0&&config.length>0){byte[] joined=new byte[config.length+bytes.length];System.arraycopy(config,0,joined,0,config.length);System.arraycopy(bytes,0,joined,config.length,bytes.length);bytes=joined;}
     frames.publishAvc(bytes);
    }catch(Exception e){if(!closed)failure.failed("AVC capture: "+e.getMessage());}
    finally{try{c.releaseOutputBuffer(index,false);}catch(Exception ignored){}}
   }
   public void onError(MediaCodec c,MediaCodec.CodecException e){if(!closed)failure.failed("Hardware video encoder stopped; use JPEG mode");}
  },handler);
  try{codec.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);surface=codec.createInputSurface();codec.start();return surface;}catch(Exception e){close();throw e;}
 }
 void keyframe(){if(codec!=null&&!closed)try{Bundle values=new Bundle();values.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME,0);codec.setParameters(values);}catch(Exception ignored){}}
 void close(){closed=true;if(codec!=null){try{codec.stop();}catch(Exception ignored){}codec.release();codec=null;}if(surface!=null){surface.release();surface=null;}config=new byte[0];}
}
