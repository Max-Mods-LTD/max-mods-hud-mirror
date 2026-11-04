// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import java.nio.ByteBuffer;
import java.util.Arrays;

/** Fit the entire capture on the HUD canvas; never crop or stretch it.
 * The renderer's native video format is Y, then U/V side by side. */
public final class FrameEncoder {
    private FrameEncoder() { }
    public static int[] fit(int width, int height) {
        if (width <= 0 || height <= 0) throw new IllegalArgumentException("Invalid capture size");
        double scale = Math.min((double) FrameStore.WIDTH / width, (double) FrameStore.HEIGHT / height);
        return new int[] { Math.max(4, (int) (width * scale) / 4 * 4), Math.max(2, (int) (height * scale) / 2 * 2) };
    }
    public static byte[] encode(ByteBuffer rgba, int width, int height, int rowStride, int pixelStride) {
        if (width < 2 || height < 2 || pixelStride < 4 || rowStride < width * pixelStride ||
                (long) rgba.position() + (long) (height - 1) * rowStride + (long) (width - 1) * pixelStride + 4 > rgba.limit())
            throw new IllegalArgumentException("Invalid capture plane");
        int[] fit = fit(width, height);
        int w = fit[0], h = fit[1], ox = (FrameStore.WIDTH - w) / 4 * 2, oy = (FrameStore.HEIGHT - h) / 4 * 2;
        int base = rgba.position(), uvBase = FrameStore.WIDTH * FrameStore.HEIGHT;
        byte[] atlas = new byte[FrameStore.BYTES];
        Arrays.fill(atlas, uvBase, atlas.length, (byte) 128);
        for (int y = 0; y < h; y += 2) for (int x = 0; x < w; x += 2) {
            int red = 0, green = 0, blue = 0;
            for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
                int sx = (x + dx) * width / w, sy = (y + dy) * height / h;
                int p = base + sy * rowStride + sx * pixelStride;
                int r = rgba.get(p) & 255, g = rgba.get(p + 1) & 255, b = rgba.get(p + 2) & 255;
                atlas[(oy + y + dy) * FrameStore.WIDTH + ox + x + dx] = (byte) ((77 * r + 150 * g + 29 * b + 128) >> 8);
                red += r; green += g; blue += b;
            }
            red = (red + 2) / 4; green = (green + 2) / 4; blue = (blue + 2) / 4;
            int uv = uvBase + (oy + y) / 2 * FrameStore.WIDTH + (ox + x) / 2;
            atlas[uv] = (byte) Math.max(0, Math.min(255, ((-43 * red - 85 * green + 128 * blue + 128) >> 8) + 128));
            atlas[uv + FrameStore.WIDTH / 2] = (byte) Math.max(0, Math.min(255, ((128 * red - 107 * green - 21 * blue + 128) >> 8) + 128));
        }
        return atlas;
    }
}
