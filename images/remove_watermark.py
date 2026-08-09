"""去除图片右下角的'AI生成 WORKBUDDY'水印。

策略：读图片右下角 ROI，对每个像素用其左上方几个像素的颜色均值做 inpaint。
水印大致位于右下角 width-160~width-10, height-100~height-10 区域。
"""
from PIL import Image
from pathlib import Path

IMG_DIR = Path(r"C:\Users\qiaod\WorkBuddy\20260808213149\images")

def inpaint_bottom_right(img_path):
    img = Image.open(img_path).convert("RGBA")
    w, h = img.size
    pix = img.load()

    # 水印大致在右下角约 180x90 的区域
    # 从左/上三个方向外一定距离取色填充
    # 水印右上角起点 (start_x, start_y)，水印宽度水印高度
    # 先保守估计：水印区域起点 (w*0.78, h*0.78) 到 (w-4, h-4)
    x0 = int(w * 0.74)
    y0 = int(h * 0.78)
    x1 = w - 4
    y1 = h - 4

    if x1 <= x0 or y1 <= y0:
        print(f"  skip (no watermark area): {img_path.name}")
        return

    # 用水印区域上方的颜色（y0-5 这一行）作为参考填充色
    # 同时考虑左上颜色。简单做法：从左/上 10px 之外取色
    # 这里做法：对每个水印位置像素，用 (x-5, y) 和 (x, y-5) 两个像素的颜色均值。
    # 边界外则用最近的有效像素。
    for y in range(y0, y1):
        for x in range(x0, x1):
            # 取左边 6/上边 6 像素的均值，更靠左上
            samples = []
            for ox, oy in [(-6, 0), (0, -6), (-6, -6), (-12, 0)]:
                sx = x + ox
                sy = y + oy
                if 0 <= sx < w and 0 <= sy < h:
                    samples.append(pix[sx, sy])
            if samples:
                r = sum(s[0] for s in samples) // len(samples)
                g = sum(s[1] for s in samples) // len(samples)
                b = sum(s[2] for s in samples) // len(samples)
                # 对 stella.png 水印在颜色更暗处，不需保留 alpha
                pix[x, y] = (r, g, b, 255)

    img.save(img_path)
    print(f"  removed watermark: {img_path.name}")

print("Removing watermarks...")
for f in IMG_DIR.glob("*.png"):
    if f.name in ("steve.png", "alex.png", "rain.png", "stella.png", "zephyr.png", "sirius.png", "dragon.png"):
        inpaint_bottom_right(f)

print("Done.")
