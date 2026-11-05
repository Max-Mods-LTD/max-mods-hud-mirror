// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.media.projection.*;
import android.net.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.net.*;
import java.io.*;
import org.json.*;

public final class MainActivity extends Activity {
    private static final int CAPTURE=70,SCAN=73;
    private static final int BG=0xff0c0d10,PANEL=0xff191b21,MUTED=0xffa1a5af,RED=0xffc8121b;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private TextView state,pair,link;private Button start,scan;private String selectedAddress;private int tab;
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
    private TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setPadding(0,dp(7),0,dp(7));return v;}
    private GradientDrawable background(int color){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(15));return d;}
    private LinearLayout card(){LinearLayout v=new LinearLayout(this);v.setOrientation(1);v.setPadding(dp(20),dp(15),dp(20),dp(15));v.setBackground(background(PANEL));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(15),0,dp(12));content.addView(v,p);return v;}
    private Button button(String label,boolean primary,View.OnClickListener action){Button b=new Button(this);b.setText(label);b.setTextSize(17);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setBackground(background(primary?RED:PANEL));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(56));p.setMargins(0,dp(7),0,dp(7));content.addView(b,p);b.setOnClickListener(action);return b;}
    private SharedPreferences prefs(){return getSharedPreferences("hud_mirror",MODE_PRIVATE);}
    public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().setStatusBarColor(BG);getWindow().setNavigationBarColor(BG);build();
        if(!CaptureService.active&&prefs().getBoolean("sharingWasActive",false)){CaptureService.status="The previous session ended. Start sharing again.";prefs().edit().putBoolean("sharingWasActive",false).apply();}
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},71);
    }
    private void build(){
        state=pair=link=null;start=scan=null;
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(BG);
        content=new LinearLayout(this);content.setOrientation(1);content.setPadding(dp(24),dp(18),dp(24),dp(24));scroll.addView(content);
        scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        ImageView logo=new ImageView(this);logo.setAdjustViewBounds(true);logo.setScaleType(ImageView.ScaleType.FIT_START);
        try(InputStream in=getAssets().open("max-mods-logo.png")){logo.setImageBitmap(BitmapFactory.decodeStream(in));}catch(IOException ignored){}
        content.addView(logo,new LinearLayout.LayoutParams(dp(280),dp(52)));
        content.addView(text("HUD Mirror",32,Color.WHITE));content.addView(text("Your phone. Your display.",16,MUTED));
        LinearLayout tabs=new LinearLayout(this);tabs.setPadding(0,dp(17),0,dp(8));content.addView(tabs);
        String[] names={"Connect","Display","Updates"};
        for(int i=0;i<3;i++){final int index=i;Button b=new Button(this);b.setText(names[i]);b.setAllCaps(false);b.setTextSize(14);b.setTextColor(Color.WHITE);b.setBackground(background(i==tab?RED:PANEL));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(44),1);p.setMargins(dp(3),0,dp(3),0);tabs.addView(b,p);b.setOnClickListener(v->{tab=index;build();});}
        if(tab==0){
            LinearLayout c=card();c.addView(text("CONNECTION",12,MUTED));state=text("Ready",20,Color.WHITE);c.addView(state);link=text("",14,MUTED);c.addView(link);
            start=button("Start sharing",true,v->begin());
            scan=button("Scan car QR",false,v->startActivityForResult(new Intent(this,ScannerActivity.class),SCAN));
            button("Stop sharing",false,v->{stopService(new Intent(this,CaptureService.class));render();});
            LinearLayout fallback=card();fallback.addView(text("MANUAL PAIRING",12,MUTED));pair=text("",18,Color.WHITE);pair.setTextIsSelectable(true);fallback.addView(pair);
            content.addView(text("Park in P. Connect to BMW Wi-Fi, start sharing, then scan Pair with QR in the car app.\n\nKeep your existing BMW Bluetooth or Android Auto sound connection.",14,MUTED));
        }else if(tab==1){
            LinearLayout c=card();c.addView(text("VIDEO QUALITY",12,MUTED));boolean smooth="smooth".equals(prefs().getString("videoProfile","sharp"));
            c.addView(text(smooth?"Smooth · target 60 fps":"Sharp · target 30 fps",22,Color.WHITE));c.addView(text(smooth?"576 × 324 · smaller frames for a faster link":"768 × 432 · more picture detail",14,MUTED));
            button("Choose video quality",true,v->{if(CaptureService.active){Toast.makeText(this,"Stop sharing before changing quality",Toast.LENGTH_LONG).show();return;}new AlertDialog.Builder(this).setTitle("Video quality").setItems(new String[]{"Sharp · 768 × 432 · target 30 fps","Smooth · 576 × 324 · target 60 fps"},(d,n)->{prefs().edit().putString("videoProfile",n==1?"smooth":"sharp").apply();build();}).show();});
            button("Sound coexistence: "+modeName(),false,v->new AlertDialog.Builder(this).setTitle("Sound coexistence").setItems(new String[]{"Auto","Bluetooth priority","Quality priority"},(d,n)->{prefs().edit().putString("videoMode",n==1?TransportPolicy.BLUETOOTH:n==2?TransportPolicy.QUALITY:TransportPolicy.AUTO).apply();build();}).show());
            content.addView(text("Choose HUD or instrument cluster, Compact or Full screen, in the car app. The complete phone picture always fits. Turn the phone landscape for a wider picture.\n\nReceived fps is the phone link rate. Install the optional Max Mods Display60 tool in the car Store for a 60 fps renderer clock. Actual projector speed still needs a car check.\n\nSharing continues when this app is in the background. Share your entire screen for that behaviour. Locking or force-stopping the phone ends sharing. Android asks permission each session. Sharing sessions last 10 minutes.",14,MUTED));
        }else{
            content.addView(text("What's new",25,Color.WHITE));
            try(InputStream in=getAssets().open("release_notes.json")){ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[2048];for(int n;(n=in.read(buffer))>0;)bytes.write(buffer,0,n);
                JSONObject r=new JSONObject(bytes.toString("UTF-8")).getJSONArray("releases").getJSONObject(0);content.addView(text("Version "+r.getString("version"),16,MUTED));JSONArray changes=r.getJSONArray("changes");for(int i=0;i<changes.length();i++){LinearLayout c=card();c.addView(text(changes.getString(i),16,Color.WHITE));}
            }catch(Exception ignored){}
        }
        content.addView(text("MAX MODS iDrive Apps  /  v0.4.0",12,MUTED));setContentView(scroll);render();
    }
    private String modeName(){String m=prefs().getString("videoMode",TransportPolicy.AUTO);return TransportPolicy.BLUETOOTH.equals(m)?"Bluetooth priority":TransportPolicy.QUALITY.equals(m)?"Quality priority":"Auto";}
    private void begin(){
        Inet4Address address=wifiAddress(this);if(address==null){Toast.makeText(this,"Connect to BMW Wi-Fi first",Toast.LENGTH_LONG).show();return;}if(CaptureService.active)return;selectedAddress=address.getHostAddress();
        MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
        Intent consent=Build.VERSION.SDK_INT>=34?manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay()):manager.createScreenCaptureIntent();
        startActivityForResult(consent,CAPTURE);
    }
    protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);if(result!=RESULT_OK||data==null)return;
        if(request==CAPTURE){Intent service=new Intent(this,CaptureService.class);service.putExtra("result",result);service.putExtra("projection",data);service.putExtra("address",selectedAddress);startForegroundService(service);}
        else if(request==SCAN){String qr=data.getStringExtra("qr");CaptureService.status="Connecting to the car...";new Thread(()->{String message;try{message=QrConnector.connect(this,qr);}catch(Exception e){message="QR pairing: "+e.getMessage()+" Use manual pairing if the car blocks this connection.";}CaptureService.status=message;runOnUiThread(()->Toast.makeText(this,CaptureService.status,Toast.LENGTH_LONG).show());},"maxmods-pair").start();}
    }
    private void updateText(TextView view,String value){if(view!=null&&!value.equals(view.getText().toString()))view.setText(value);}
    private void render(){if(state==null)return;updateText(state,CaptureService.status);updateText(pair,CaptureService.active?CaptureService.pairingText:"Available after you start sharing");updateText(link,CaptureService.active?CaptureService.linkStatus:RadioStatus.read(this).description());start.setEnabled(!CaptureService.active);scan.setEnabled(CaptureService.active);}
    protected void onResume(){super.onResume();handler.post(update);}
    protected void onPause(){handler.removeCallbacks(update);super.onPause();}
}
