// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import android.graphics.*;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/** Android's native JPEG encoder replaces the Java RGB/YUV + deflate loop. */
final class JpegEncoder {
    private Bitmap source, target;
    private Canvas canvas;
    private ByteBuffer paddedPixels;
    private final Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final ByteArrayOutputStream output = new ByteArrayOutputStream(60000);
    byte[] encode(ByteBuffer pixels, int width, int height, int row, int stride, int w, int h, int quality) {
        if (stride != 4 || row % 4 != 0) throw new IllegalArgumentException("Unsupported capture pixels");
        int padded = row / 4;
        if (source == null || source.getWidth() != padded || source.getHeight() != height) {
            if (source != null) source.recycle();
            source = Bitmap.createBitmap(padded, height, Bitmap.Config.ARGB_8888);
        }
        if (target == null || target.getWidth() != w || target.getHeight() != h) {
            if (target != null) target.recycle();
            target = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); canvas = new Canvas(target);
        }
        // Some ImageReaders omit padding after the final row. Copy that row
        // separately rather than reading past the last valid captured pixel.
        int need = row * height;
        if (pixels.remaining() >= need) source.copyPixelsFromBuffer(pixels);
        else {
            if(paddedPixels==null||paddedPixels.capacity()!=need)paddedPixels=ByteBuffer.allocateDirect(need);
            paddedPixels.clear();paddedPixels.put(pixels);paddedPixels.position(0);source.copyPixelsFromBuffer(paddedPixels);
        }
        target.eraseColor(Color.BLACK);
        float scale = Math.min((float)w / width, (float)h / height);
        float dw = width * scale, dh = height * scale;
        canvas.drawBitmap(source, new Rect(0,0,width,height), new RectF((w-dw)/2,(h-dh)/2,(w+dw)/2,(h+dh)/2), paint);
        output.reset();
        if (!target.compress(Bitmap.CompressFormat.JPEG, quality, output)) throw new IllegalStateException("Video encoding failed");
        return output.toByteArray();
    }
    void close() { if(source!=null)source.recycle();if(target!=null)target.recycle();source=target=null;paddedPixels=null; }
}
