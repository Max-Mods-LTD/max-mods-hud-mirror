// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;
import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.hardware.Camera;
import android.os.*;
import android.view.*;
import android.widget.*;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import java.util.*;

@SuppressWarnings("deprecation")
public final class ScannerActivity extends Activity implements SurfaceHolder.Callback,Camera.PreviewCallback {
    private Camera camera; private SurfaceView preview;private HandlerThread thread;private Handler decoder;
    private volatile boolean busy,done;private long sampled;private TextView message;
    public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.BLACK);
        final int margin=Math.round(18*getResources().getDisplayMetrics().density);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(margin+insets.getSystemWindowInsetLeft(),margin+insets.getSystemWindowInsetTop(),margin+insets.getSystemWindowInsetRight(),margin+insets.getSystemWindowInsetBottom());return insets;});
        message=new TextView(this);message.setText("Scan the QR shown in the car\nCamera images stay on this phone.");message.setTextSize(20);message.setTextColor(Color.WHITE);message.setPadding(8,10,8,24);root.addView(message);
        FrameLayout cameraBox=new FrameLayout(this);root.addView(cameraBox,new LinearLayout.LayoutParams(-1,0,1));
        preview=new SurfaceView(this);cameraBox.addView(preview,new FrameLayout.LayoutParams(-1,-1));preview.getHolder().addCallback(this);
        cameraBox.addView(new View(this){protected void onDraw(Canvas canvas){super.onDraw(canvas);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);p.setColor(0xffdf2933);p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(5);float side=Math.min(getWidth(),getHeight())*0.76f,x=(getWidth()-side)/2,y=(getHeight()-side)/2;canvas.drawRoundRect(x,y,x+side,y+side,18,18,p);}},new FrameLayout.LayoutParams(-1,-1));
        Button cancel=new Button(this);cancel.setText("Cancel");cancel.setAllCaps(false);cancel.setOnClickListener(v->finish());root.addView(cancel);setContentView(root);
        thread=new HandlerThread("maxmods-qr");thread.start();decoder=new Handler(thread.getLooper());
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},74);
    }
    public void onRequestPermissionsResult(int code,String[] p,int[] result){super.onRequestPermissionsResult(code,p,result);if(code==74){if(result.length==0||result[0]!=PackageManager.PERMISSION_GRANTED)finish();else open();}}
    public void surfaceCreated(SurfaceHolder holder){open();}
    public void surfaceChanged(SurfaceHolder holder,int f,int w,int h){}
    public void surfaceDestroyed(SurfaceHolder holder){release();}
    private void open(){
        if(camera!=null||done||checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED||!preview.getHolder().getSurface().isValid())return;
        try{
            camera=Camera.open();Camera.Parameters p=camera.getParameters();Camera.Size best=null;
            for(Camera.Size s:p.getSupportedPreviewSizes())if(s.width<=1280&&(best==null||Math.abs(s.width-640)<Math.abs(best.width-640)))best=s;
            if(best!=null)p.setPreviewSize(best.width,best.height);
            if(p.getSupportedFocusModes().contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE))p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            p.setPreviewFormat(android.graphics.ImageFormat.NV21);camera.setParameters(p);
            Camera.CameraInfo info=new Camera.CameraInfo();Camera.getCameraInfo(0,info);
            int rotation=getWindowManager().getDefaultDisplay().getRotation()*90;camera.setDisplayOrientation((info.orientation-rotation+360)%360);
            camera.setPreviewDisplay(preview.getHolder());camera.setPreviewCallback(this);camera.startPreview();
        }catch(Exception e){release();message.setText("Camera unavailable. Use manual pairing in the car.");}
    }
    public void onPreviewFrame(byte[] bytes,Camera source){
        if(done||busy||SystemClock.elapsedRealtime()-sampled<200)return;
        sampled=SystemClock.elapsedRealtime();busy=true;Camera.Size size=source.getParameters().getPreviewSize();byte[] frame=bytes.clone();
        decoder.post(()->{
            try{
                MultiFormatReader reader=new MultiFormatReader();Map<DecodeHintType,Object> hints=new EnumMap<>(DecodeHintType.class);hints.put(DecodeHintType.POSSIBLE_FORMATS,Collections.singletonList(BarcodeFormat.QR_CODE));
                PlanarYUVLuminanceSource luma=new PlanarYUVLuminanceSource(frame,size.width,size.height,0,0,size.width,size.height,false);
                Result result=reader.decode(new BinaryBitmap(new HybridBinarizer(luma)),hints);String value=result.getText();
                if(value.startsWith("maxmods://pair?")){done=true;runOnUiThread(()->{setResult(RESULT_OK,new Intent().putExtra("qr",value));finish();});}
            }catch(Exception ignored){}finally{busy=false;}
        });
    }
    private void release(){Camera old=camera;camera=null;if(old!=null){try{old.setPreviewCallback(null);old.stopPreview();}catch(RuntimeException ignored){}finally{try{old.release();}catch(RuntimeException ignored){}}}}
    protected void onPause(){release();super.onPause();}
    protected void onResume(){super.onResume();if(preview!=null)open();}
    protected void onDestroy(){done=true;release();if(thread!=null)thread.quitSafely();super.onDestroy();}
}
