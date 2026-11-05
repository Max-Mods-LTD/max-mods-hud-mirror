// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
/** Bounded statistics from actual frames/writes, never a capture heartbeat. */
public final class RateMeter {
    private final FrameStore.Clock clock;
    private final long[] time=new long[128];
    private final int[] bytes=new int[128];
    private int count,next;
    public RateMeter(){this(new FrameStore.Clock(){public long nanoTime(){return System.nanoTime();}});}
    public RateMeter(FrameStore.Clock c){clock=c;}
    public synchronized void record(int size){if(size<0)return;time[next]=clock.nanoTime();bytes[next]=size;next=(next+1)%time.length;if(count<time.length)count++;}
    public synchronized void clear(){count=next=0;}
    private long[] window(){
        long now=clock.nanoTime(),first=0,last=0,total=0;int n=0;
        for(int i=count;i>0;i--){int at=(next-i+time.length)%time.length;long age=now-time[at];if(age<0||age>2000000000L)continue;if(n++==0)first=time[at];last=time[at];total+=bytes[at];}
        if(n<2||now-last>1000000000L)return new long[]{0,0};
        return new long[]{Math.round((n-1)*1000000000.0/Math.max(1,last-first)),Math.round(total*8000000.0/Math.max(100000000L,now-first))};
    }
    public synchronized int fps(){return (int)Math.min(240,window()[0]);}
    public synchronized int kbps(){return (int)Math.min(1000000,window()[1]);}
}
