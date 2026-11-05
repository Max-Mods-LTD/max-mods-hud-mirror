// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

/** Fixed picture dimensions; adapt compressed traffic to the measured link.
 * Audio remains on BMW's existing Bluetooth/Android Auto route. */
public final class TransportPolicy {
    public static final String AUTO="auto", BLUETOOTH="bluetooth", QUALITY="quality";
    public static final int AVC_MIN=600000;
    private final FrameStore.Clock clock;
    private String mode=AUTO;
    private boolean bluetooth,mediaPlaying;
    private int frequency=-1,maxFps=30,fps=30,slow,fast,jpegPenalty;
    private long jpegWindowAt;
    private int avcRate,avcSlow,avcFast;
    private long adjustedAt,avcAdjustedAt;
    public TransportPolicy(){this(new FrameStore.Clock(){public long nanoTime(){return System.nanoTime();}});}
    public TransportPolicy(FrameStore.Clock c){clock=c;}
    public synchronized void setProfile(String p){maxFps="smooth".equals(p)?60:30;fps=maxFps;slow=fast=jpegPenalty=0;jpegWindowAt=0;}
    public synchronized void setMode(String v){mode=BLUETOOTH.equals(v)||QUALITY.equals(v)?v:AUTO;clampAvc();}
    public synchronized void radio(boolean bt,int mhz){radio(bt,mhz,false);}
    public synchronized void radio(boolean bt,int mhz,boolean playing){bluetooth=bt;frequency=mhz;mediaPlaying=playing;clampAvc();}
    private boolean audioPriority(){return BLUETOOTH.equals(mode)||AUTO.equals(mode)&&(bluetooth||mediaPlaying)&&frequency<4900;}
    private int avcCeiling(){
        if(QUALITY.equals(mode))return 3000000;
        if(audioPriority())return 1200000;
        return bluetooth||mediaPlaying?1800000:2400000;
    }
    private void clampAvc(){int cap=avcCeiling();if(avcRate==0)avcRate=cap;else avcRate=Math.max(AVC_MIN,Math.min(avcRate,cap));}
    public synchronized int avcBitrate(){clampAvc();return avcRate;}
    public synchronized int capturePercent(){return 100;}
    public synchronized int targetFps(){return fps;}
    public synchronized int level(){return 0;}
    public synchronized String mode(){return mode;}
    public synchronized int jpegQuality(){return Math.max(75,(QUALITY.equals(mode)?93:audioPriority()?87:90)-jpegPenalty);}
    public synchronized long bytesPerSecond(){return QUALITY.equals(mode)?0:audioPriority()?3L*1024*1024:8L*1024*1024;}
    // Capture owns the fps clock. A second socket fps clock introduces
    // jitter/delay and drops useful frames; only the byte budget paces writes.
    public synchronized long intervalNs(int bytes){long rate=bytesPerSecond();return rate==0?0:((long)bytes*1000000000L+rate-1)/rate;}
    public synchronized void sent(int bytes,long ns){
        long now=clock.nanoTime(),rate=bytesPerSecond(),cost=Math.max(ns,rate==0?0:(long)bytes*1000000000L/rate);
        if(jpegWindowAt==0)jpegWindowAt=now;
        if(cost>1000000000L/fps*5/4)slow++;else fast++;
        long elapsed=now-jpegWindowAt;int samples=slow+fast;
        // Bluetooth produces short bursts. Judge a window, not an unbroken
        // run of fast writes; a single burst must not trap the target at 15.
        if(elapsed<1000000000L||samples<4)return;
        if(slow*2>=samples){
            // Try smaller compressed frames before reducing frame rate.
            if(jpegPenalty<12)jpegPenalty=Math.min(12,jpegPenalty+3);
            else fps=Math.max(30,fps-5);
            adjustedAt=now;
        }
        if(fast*5>=samples*4&&now-adjustedAt>1500000000L){
            if(fps<maxFps)fps=Math.min(maxFps,fps+5);else jpegPenalty=Math.max(0,jpegPenalty-3);
            adjustedAt=now;
        }
        slow=fast=0;jpegWindowAt=now;
    }
    private void reduceAvc(long now){
        if(now-avcAdjustedAt<500000000L)return;
        avcRate=Math.max(AVC_MIN,avcBitrate()*3/4);avcAdjustedAt=now;avcSlow=avcFast=0;
    }
    public synchronized void avcBacklog(){reduceAvc(clock.nanoTime());}
    public synchronized void sentAvc(int bytes,long ns,long ageNs){
        if(bytes<=0||ns<0||ageNs<0)return;
        long now=clock.nanoTime(),rate=avcBitrate();
        long throughput=ns==0?Long.MAX_VALUE:(long)bytes*8L*1000000000L/ns;
        boolean delayed=ageNs>220000000L||ns>Math.max(40000000L,2000000000L/maxFps)&&throughput<rate*6/5;
        if(delayed){avcSlow++;avcFast=0;if(avcSlow>=3)reduceAvc(now);}
        else{
            avcFast++;avcSlow=0;
            if(avcFast>=120&&now-avcAdjustedAt>4000000000L){
                avcRate=Math.min(avcCeiling(),avcBitrate()+Math.max(100000,avcBitrate()/10));avcAdjustedAt=now;avcFast=0;
            }
        }
        // AVC feedback changes the encoder rate, never a second JPEG fps clock.
    }
    public synchronized void idle(){}
    public synchronized String description(){return "JPEG video · target "+fps+" fps · full capture detail";}
}
