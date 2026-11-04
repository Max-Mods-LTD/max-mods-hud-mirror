// SPDX-License-Identifier: GPL-3.0-or-later
package uk.maxmods.hudmirror;

import java.nio.ByteBuffer;
import java.util.Arrays;

/** Fit the entire capture on the HUD canvas; never crop or stretch it.
 * The renderer's native video format is Y, then U/V side by side. */
public final class FrameEncoder {
    private FrameEncoder() { }
    public static int[] fit(int width, int height) {
        return fit(width, height, FrameStore.WIDTH, FrameStore.HEIGHT);
    }
    public static int[] fit(int width, int height, int maxWidth, int maxHeight) {
        if (width <= 0 || height <= 0) throw new IllegalArgumentException("Invalid capture size");
        double scale = Math.min((double) maxWidth / width, (double) maxHeight / height);
        return new int[] { Math.max(4, (int) (width * scale) / 4 * 4), Math.max(2, (int) (height * scale) / 2 * 2) };
    }
    public static byte[] encode(ByteBuffer rgba, int width, int height, int rowStride, int pixelStride) {
        if (width < 2 || height < 2 || pixelStride < 4 || rowStride < width * pixelStride ||
                (long) rgba.position() + (long) (height - 1) * rowStride + (long) (width - 1) * pixelStride + 4 > rgba.limit())
            throw new IllegalArgumentException("Invalid capture plane");
        int[] fit = fit(width, height);
        int w = fit[0], h = fit[1], ox = (FrameStore.WIDTH - w) / 4 * 2, oy = (FrameStore.HEIGHT - h) / 4 * 2;
        int base = rgba.position(), uvBase = FrameStore.WIDTH * FrameStore.HEIGHT;
        int lowW = Math.min(width, w) / 2 * 2, lowH = Math.min(height, h) / 2 * 2;
        int lowY = lowW * lowH, lowC = lowY / 4;
        byte[] small = new byte[lowY + lowC * 2];
        byte[] atlas = new byte[FrameStore.BYTES];
        Arrays.fill(atlas, uvBase, atlas.length, (byte) 128);
        // Convert at capture resolution before expanding the separate planes.
        // Repeating RGBA first creates needless chroma detail, CPU work and
        // network entropy when Bluetooth priority reduces capture resolution.
        for (int y = 0; y < lowH; y += 2) for (int x = 0; x < lowW; x += 2) {
            int red = 0, green = 0, blue = 0;
            for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++) {
                int sx = sample(x + dx, lowW, width), sy = sample(y + dy, lowH, height);
                int p = base + sy * rowStride + sx * pixelStride;
                int r = rgba.get(p) & 255, g = rgba.get(p + 1) & 255, b = rgba.get(p + 2) & 255;
                small[(y + dy) * lowW + x + dx] = (byte) ((77 * r + 150 * g + 29 * b + 128) >> 8);
                red += r; green += g; blue += b;
            }
            red = (red + 2) / 4; green = (green + 2) / 4; blue = (blue + 2) / 4;
            int uv = y / 2 * (lowW / 2) + x / 2;
            small[lowY + uv] = (byte) Math.max(0, Math.min(255, ((-43 * red - 85 * green + 128 * blue + 128) >> 8) + 128));
            small[lowY + lowC + uv] = (byte) Math.max(0, Math.min(255, ((128 * red - 107 * green - 21 * blue + 128) >> 8) + 128));
        }
        for (int y = 0; y < h; y++) {
            int src = sample(y, h, lowH) * lowW, dst = (oy + y) * FrameStore.WIDTH + ox;
            for (int x = 0; x < w; x++) atlas[dst + x] = small[src + sample(x, w, lowW)];
        }
        for (int y = 0; y < h / 2; y++) {
            int src = sample(y, h / 2, lowH / 2) * (lowW / 2), dst = uvBase + (oy / 2 + y) * FrameStore.WIDTH + ox / 2;
            for (int x = 0; x < w / 2; x++) {
                int index = src + sample(x, w / 2, lowW / 2);
                atlas[dst + x] = small[lowY + index]; atlas[dst + FrameStore.WIDTH / 2 + x] = small[lowY + lowC + index];
            }
        }
        return atlas;
    }
    private static int sample(int position, int outputSize, int inputSize) {
        return outputSize <= 1 ? 0 : (position * (inputSize - 1) + (outputSize - 1) / 2) / (outputSize - 1);
    }
}
