// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.media.projection.*;
import android.net.*;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;
import java.net.*;
import java.io.*;
import org.json.*;

public final class MainActivity extends Activity {
    private static final int CAPTURE=70;
    private static final int BG=0xff000000,PANEL=0xff191b21,MUTED=0xffa1a5af,RED=0xffc8121b;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private TextView state,pair,link;private Button start;private String selectedAddress;private int tab;private boolean guideOpen;
    private LinearLayout content;
    private final Runnable update=new Runnable(){public void run(){render();handler.postDelayed(this,500);}};
    public static Inet4Address wifiAddress(Context context){
        ConnectivityManager cm=(ConnectivityManager)context.getSystemService(CONNECTIVITY_SERVICE);
        for(Network network:cm.getAllNetworks()){
            NetworkCapabilities caps=cm.getNetworkCapabilities(network);if(caps==null||!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))continue;
            LinkProperties links=cm.getLinkProperties(network);if(links==null)continue;
            for(LinkAddress link:links.getLinkAddresses()){InetAddress ip=link.getAddress();if(ip instanceof Inet4Address&&ip.isSiteLocalAddress())return (Inet4Address)ip;}
        }return null;
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(Math.max(18,size+2));v.setTextColor(color);v.setPadding(0,dp(7),0,dp(7));return v;}
    private GradientDrawable background(int color){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(15));return d;}
    private StateListDrawable buttonBackground(boolean primary){StateListDrawable d=new StateListDrawable();d.addState(new int[]{android.R.attr.state_pressed},background(0xffe1424b));d.addState(new int[]{android.R.attr.state_selected},background(0xff246b4c));d.addState(new int[]{android.R.attr.state_focused},background(0xff444a56));d.addState(new int[]{},background(primary?RED:PANEL));return d;}
    private LinearLayout card(){LinearLayout v=new LinearLayout(this);v.setOrientation(1);v.setPadding(dp(20),dp(15),dp(20),dp(15));v.setBackground(background(PANEL));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(15),0,dp(12));content.addView(v,p);return v;}
    private Button button(String label,boolean primary,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setTextSize(22);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setBackground(buttonBackground(primary));b.setBackgroundTintList(null);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(64));p.setMargins(0,dp(7),0,dp(7));content.addView(b,p);b.setOnClickListener(v->{v.setSelected(true);action.onClick(v);});return b;}
    private SharedPreferences prefs(){return getSharedPreferences("hud_mirror",MODE_PRIVATE);}
    public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);build();
        if(!CaptureService.active&&prefs().getBoolean("sharingWasActive",false)){CaptureService.status="The previous session ended. Start sharing again.";prefs().edit().putBoolean("sharingWasActive",false).apply();}
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},71);
    }
    private void build(){
        state=pair=link=null;start=null;
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(BG);
        content=new LinearLayout(this);content.setOrientation(1);content.setPadding(dp(24),dp(18),dp(24),dp(24));scroll.addView(content);
        scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        ImageView logo=new ImageView(this);logo.setAdjustViewBounds(true);logo.setScaleType(ImageView.ScaleType.FIT_START);
        logo.setBackgroundColor(Color.TRANSPARENT);logo.setPadding(0,0,0,0);
        try(InputStream in=getAssets().open("max-mods-logo.png")){logo.setImageBitmap(BitmapFactory.decodeStream(in));}catch(IOException ignored){}
        content.addView(logo,new LinearLayout.LayoutParams(dp(280),dp(112)));
        content.addView(text("HUD Mirror",32,Color.WHITE));content.addView(text("Your phone. Your display.",16,MUTED));
        LinearLayout tabs=new LinearLayout(this);tabs.setPadding(0,dp(17),0,dp(8));content.addView(tabs);
        String[] names={"Connect","Display","Updates"};
        for(int i=0;i<3;i++){final int index=i;Button b=new Button(this);b.setText(names[i]);b.setAllCaps(false);b.setTextSize(18);b.setPadding(dp(4),0,dp(4),0);b.setTextColor(Color.WHITE);b.setBackground(background(i==tab?RED:PANEL));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(52),1);p.setMargins(dp(3),0,dp(3),0);tabs.addView(b,p);b.setOnClickListener(v->{tab=index;guideOpen=false;build();});}
        if(guideOpen){
            connectionGuide();
        }else if(tab==0){
            LinearLayout c=card();c.addView(text("CONNECTION",12,MUTED));state=text("Ready",20,Color.WHITE);c.addView(state);link=text("",14,MUTED);c.addView(link);
            start=button("Start sharing",true,v->begin());
            button("Stop sharing",false,v->{stopService(new Intent(this,CaptureService.class));render();});
            LinearLayout fallback=card();fallback.addView(text("PAIR ONCE · SIX-DIGIT CODE",12,MUTED));pair=text("",32,Color.WHITE);pair.setTypeface(Typeface.MONOSPACE);pair.setTextIsSelectable(true);fallback.addView(pair);
            button("Manual pairing address",false,v->{if(!CaptureService.active){Toast.makeText(this,"Start sharing first",Toast.LENGTH_LONG).show();return;}TextView address=text(CaptureService.manualPairingText+"\n\nIn the car: Settings > Manual pairing.",20,Color.WHITE);address.setTextIsSelectable(true);address.setPadding(dp(24),dp(20),dp(24),dp(20));new AlertDialog.Builder(this).setTitle("Manual pairing").setView(address).setPositiveButton("Close",null).show();});
            button("Connection guide",false,v->{guideOpen=true;build();});
            content.addView(text("Picture needs BMW Wi-Fi. Sound uses BMW Bluetooth media or your working Android Auto connection.\n\nStart sharing above, approve the entire screen, then choose Pair phone in the car and enter just the six-digit code. The car finds this phone on Wi-Fi. After pairing, starting on the phone starts the chosen car display.\n\nIf discovery is blocked by the car's Wi-Fi, use Manual pairing address.",14,MUTED));
        }else if(tab==1){
            LinearLayout c=card();c.addView(text("VIDEO QUALITY",12,MUTED));boolean smooth="smooth".equals(prefs().getString("videoProfile","sharp"));
            c.addView(text(smooth?"Smooth · target 60 fps":"Sharp · target 30 fps",22,Color.WHITE));c.addView(text(smooth?"576 × 324 · smaller frames for a faster link":"768 × 432 · more picture detail",14,MUTED));
            button("Choose video quality",true,v->{if(CaptureService.active){Toast.makeText(this,"Stop sharing before changing quality",Toast.LENGTH_LONG).show();return;}new AlertDialog.Builder(this).setTitle("Video quality").setItems(new String[]{"Sharp · 768 × 432 · target 30 fps","Smooth · 576 × 324 · target 60 fps"},(d,n)->{prefs().edit().putString("videoProfile",n==1?"smooth":"sharp").apply();build();}).show();});
            button("Sound coexistence: "+modeName(),false,v->new AlertDialog.Builder(this).setTitle("Sound coexistence").setItems(new String[]{"Auto - adapt to the connection","Audio priority - use less video bandwidth","Quality priority - prefer more detail"},(d,n)->{prefs().edit().putString("videoMode",n==1?TransportPolicy.BLUETOOTH:n==2?TransportPolicy.QUALITY:TransportPolicy.AUTO).apply();build();}).show());
            button("Forget linked car",false,v->{stopService(new Intent(this,CaptureService.class));prefs().edit().remove("trustedCarKey").apply();Toast.makeText(this,"Car unlinked. Pair again after starting sharing.",Toast.LENGTH_LONG).show();});
            content.addView(text("Choose HUD, instrument cluster or iDrive, using the BMW selection menus in the car. Only one screen mirrors at a time. The complete phone picture always fits. Turn the phone landscape for a wider picture.\n\nReceived fps is the phone link rate. Install the optional Max Mods Display60 tool in the car Store for a 60 fps renderer clock. Actual projector speed still needs a car check.\n\nThe car can use the installed Waze hardware decoder for HUD/cluster video. iDrive playback uses the GPU video surface. JPEG is the compatibility fallback.\n\nSharing continues when this app is in the background. Share your entire screen for that behaviour. Locking or force-stopping the phone ends sharing. Android asks permission each session. Sharing sessions last 10 minutes.",14,MUTED));
        }else{
            content.addView(text("What's new",25,Color.WHITE));
            try(InputStream in=getAssets().open("release_notes.json")){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[2048];for(int n;(n=in.read(buffer))>0;)bytes.write(buffer,0,n);
                JSONObject r=new JSONObject(bytes.toString("UTF-8")).getJSONArray("releases").getJSONObject(0);content.addView(text("Version "+r.getString("version"),16,MUTED));JSONArray changes=r.getJSONArray("changes");for(int i=0;i<changes.length();i++){LinearLayout c=card();c.addView(text(changes.getString(i),16,Color.WHITE));}
            }catch(Exception ignored){}
        }
        content.addView(text("MAX MODS iDrive Apps  /  v0.8.0",12,MUTED));setContentView(scroll);render();
    }
    private void connectionGuide(){
        content.addView(text("Connection guide",26,Color.WHITE));
        button("Open phone Wi-Fi settings",false,v->startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS)));
        button("Open phone Bluetooth settings",false,v->startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
        try(InputStream in=getAssets().open("connection_guide.json")){
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[2048];for(int n;(n=in.read(buffer))>0;)bytes.write(buffer,0,n);
            JSONObject guide=new JSONObject(bytes.toString("UTF-8"));JSONArray pages=guide.getJSONArray("pages");
            for(int i=0;i<pages.length();i++){JSONObject page=pages.getJSONObject(i);LinearLayout c=card();c.addView(text(page.getString("title"),22,Color.WHITE));JSONArray lines=page.getJSONArray("lines");for(int j=0;j<lines.length();j++)c.addView(text(lines.getString(j),16,MUTED));}
            JSONArray notes=guide.getJSONArray("notes");for(int i=0;i<notes.length();i++)content.addView(text(notes.getString(i),14,MUTED));
        }catch(Exception ignored){content.addView(text("Connect to BMW Wi-Fi, keep Bluetooth media connected for sound, then start sharing and pair once in the car.",18,Color.WHITE));}
        button("Back to Connect",true,v->{guideOpen=false;tab=0;build();});
    }
    public void onBackPressed(){if(guideOpen){guideOpen=false;build();}else super.onBackPressed();}
    private String modeName(){String m=prefs().getString("videoMode",TransportPolicy.AUTO);return TransportPolicy.BLUETOOTH.equals(m)?"Audio priority":TransportPolicy.QUALITY.equals(m)?"Quality priority":"Auto";}
    private void begin(){
        Inet4Address address=wifiAddress(this);if(address==null){Toast.makeText(this,"Connect to BMW Wi-Fi first",Toast.LENGTH_LONG).show();return;}if(CaptureService.active)return;selectedAddress=address.getHostAddress();
        MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
        Intent consent=Build.VERSION.SDK_INT>=34?manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay()):manager.createScreenCaptureIntent();
        startActivityForResult(consent,CAPTURE);
    }
    protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(result!=RESULT_OK||data==null)return;
        if(request==CAPTURE){Intent service=new Intent(this,CaptureService.class);service.putExtra("result",result);service.putExtra("projection",data);service.putExtra("address",selectedAddress);startForegroundService(service);}
    }
    private void updateText(TextView view,String value){if(view!=null&&!value.equals(view.getText().toString()))view.setText(value);}
    private void render(){if(state==null)return;updateText(state,CaptureService.status);updateText(pair,CaptureService.active?CaptureService.pairingText:"Available after you start sharing");updateText(link,CaptureService.active?CaptureService.linkStatus:RadioStatus.read(this).description());start.setSelected(CaptureService.active);start.setClickable(!CaptureService.active);updateText(start,CaptureService.active?"Sharing is on":"Start sharing");}
    protected void onResume(){super.onResume();handler.post(update);}
    protected void onPause(){handler.removeCallbacks(update);super.onPause();}
}
