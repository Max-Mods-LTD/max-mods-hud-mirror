/* SPDX-License-Identifier: GPL-3.0-or-later
 * A bounded, unprivileged JPEG -> full-range BT.601 YUV420 atlas worker.
 * One process per authenticated phone stream. No files or network access.
 * stdin: u32le JPEG bytes followed by JPEG; stdout: u32le atlas bytes + atlas.
 */
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#define STBI_MAX_DIMENSIONS 768
#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/resource.h>
#include <signal.h>

static int read_all(void *p, size_t n) {
    unsigned char *b=p; while(n) { size_t k=fread(b,1,n,stdin); if(!k)return 0; b+=k;n-=k; } return 1;
}
static unsigned char clamp(int v) { return v<0?0:v>255?255:(unsigned char)v; }
int main(void) {
    struct rlimit mem={96*1024*1024,96*1024*1024}, core={0,0};
    setrlimit(RLIMIT_AS,&mem);setrlimit(RLIMIT_CORE,&core);signal(SIGPIPE,SIG_DFL);
    unsigned char head[4];
    while(read_all(head,4)) {
        uint32_t n=(uint32_t)head[0]|(uint32_t)head[1]<<8|(uint32_t)head[2]<<16|(uint32_t)head[3]<<24;
        if(n<4||n>600000)return 2;
        unsigned char *jpeg=malloc(n);if(!jpeg||!read_all(jpeg,n))return 3;
        int w,h,c;
        if(!stbi_info_from_memory(jpeg,n,&w,&h,&c)||!((w==768&&h==432)||(w==576&&h==324)))return 4;
        unsigned char *rgb=stbi_load_from_memory(jpeg,n,&w,&h,&c,3);free(jpeg);if(!rgb)return 5;
        size_t size=(size_t)w*h*3/2;unsigned char *out=malloc(size);if(!out)return 6;
        for(int y=0;y<h;y+=2)for(int x=0;x<w;x+=2) {
            int rs=0,gs=0,bs=0;
            for(int dy=0;dy<2;dy++)for(int dx=0;dx<2;dx++) {
                size_t a=((size_t)(y+dy)*w+x+dx)*3;int r=rgb[a],g=rgb[a+1],b=rgb[a+2];
                out[(y+dy)*w+x+dx]=clamp((77*r+150*g+29*b+128)>>8);rs+=r;gs+=g;bs+=b;
            }
            size_t uv=(size_t)w*h+(y/2)*w+x/2;
            out[uv]=clamp(128+((-43*rs-85*gs+128*bs+512)>>10));
            out[uv+w/2]=clamp(128+((128*rs-107*gs-21*bs+512)>>10));
        }
        stbi_image_free(rgb);for(int i=0;i<4;i++)head[i]=(size>>(i*8))&255;
        int ok=fwrite(head,1,4,stdout)==4&&fwrite(out,1,size,stdout)==size&&fflush(stdout)==0;
        free(out);if(!ok)return 7;
    }
    return 0;
}
