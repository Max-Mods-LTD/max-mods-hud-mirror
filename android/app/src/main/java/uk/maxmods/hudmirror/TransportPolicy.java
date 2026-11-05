// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

/** Fixed spatial detail. Congestion drops old frames, never quarter-sizes capture.
 * Audio remains on BMW's existing Bluetooth/Android Auto route. */
public final class TransportPolicy {
    public static final String AUTO="auto", BLUETOOTH="bluetooth", QUALITY="quality";
    private final FrameStore.Clock clock;
    private String mode=AUTO;
    private boolean bluetooth;
    private int frequency, maxFps=30, fps=30, slow, fast;
    private long adjustedAt;
    public TransportPolicy(){this(new FrameStore.Clock(){public long nanoTime(){return System.nanoTime();}});}
    public TransportPolicy(FrameStore.Clock c){clock=c;}
    public synchronized void setProfile(String p){maxFps="smooth".equals(p)?60:30;fps=maxFps;}
    public synchronized void setMode(String v){mode=BLUETOOTH.equals(v)||QUALITY.equals(v)?v:AUTO;}
    public synchronized void radio(boolean bt,int mhz){bluetooth=bt;frequency=mhz;}
    private boolean audioPriority(){return BLUETOOTH.equals(mode)||AUTO.equals(mode)&&bluetooth&&frequency<4900;}
    public synchronized int capturePercent(){return 100;}
    public synchronized int targetFps(){return fps;}
    public synchronized int level(){return 0;}
    public synchronized String mode(){return mode;}
    public synchronized int jpegQuality(){return QUALITY.equals(mode)?93:audioPriority()?87:90;}
    public synchronized long bytesPerSecond(){return QUALITY.equals(mode)?0:audioPriority()?3L*1024*1024:8L*1024*1024;}
    public synchronized long intervalNs(int bytes){long rate=bytesPerSecond();return Math.max(1000000000L/fps,rate==0?0:((long)bytes*1000000000L+rate-1)/rate);}
    public synchronized void sent(int bytes,long ns){
        long now=clock.nanoTime(),rate=bytesPerSecond(),cost=Math.max(ns,rate==0?0:(long)bytes*1000000000L/rate);
        if(cost>1000000000L/fps*5/4){slow++;fast=0;}else{fast++;slow=0;}
        if(slow>=4&&now-adjustedAt>500000000L){fps=Math.max(15,fps-5);slow=0;adjustedAt=now;}
        if(fast>=60&&now-adjustedAt>2000000000L){fps=Math.min(maxFps,fps+5);fast=0;adjustedAt=now;}
    }
    public synchronized void idle(){}
    public synchronized String description(){return "JPEG video · target "+fps+" fps · full capture detail";}
}
