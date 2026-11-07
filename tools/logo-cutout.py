import sys, numpy as np
from PIL import Image, ImageFilter
src, out, T = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32)
r,g,b = a[...,0],a[...,1],a[...,2]
mx = a.max(axis=2)
# gold = bright AND warm (red >= blue); excludes neutral/brown-black haze
solid = (mx > T) & (r > b + 12)
# sparkle glow under the bottom-right rim: trace the rim's bottom edge per column, drop everything below it
X0, X1, Y0, Y1 = 780, 952, 1140, 1330
edge = []
for x in range(X0, X1 + 1):
    col = mx[Y0:Y1, x]
    ys = np.where(col > int(sys.argv[5]))[0]
    edge.append(Y0 + (ys.max() if len(ys) else 0))
edge = np.array(edge, float)
xs = np.arange(X0, X1 + 1, dtype=float)
keep = np.ones_like(edge, bool)
for _ in range(4):                                  # robust cubic fit: drop outliers and refit
    c = np.polyfit(xs[keep], edge[keep], 3)
    res = edge - np.polyval(c, xs)
    keep = np.abs(res) < max(2.5, 2 * np.std(res[keep]))
edge = np.polyval(c, xs)
print("edge fit y range", edge.min().round(1), edge.max().round(1))
for i, x in enumerate(range(X0, X1 + 1)):
    solid[int(round(edge[i])) + 2:Y1, x] = False
def flood_border(free):
    bg = np.zeros_like(free)
    bg[0,:]=free[0,:]; bg[-1,:]=free[-1,:]; bg[:,0]=free[:,0]; bg[:,-1]=free[:,-1]
    while True:
        n = bg.copy()
        n[1:,:] |= bg[:-1,:]; n[:-1,:] |= bg[1:,:]; n[:,1:] |= bg[:,:-1]; n[:,:-1] |= bg[:,1:]
        n &= free
        if (n == bg).all(): return bg
        bg = n
# fill holes inside the seal
filled = ~flood_border(~solid)
# keep only the largest blob (drops stray glow specks)
m = Image.fromarray((filled*255).astype(np.uint8))
m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # remove 1px fuzz
m = m.filter(ImageFilter.GaussianBlur(1.1))                                 # smooth anti-aliased edge
alpha = np.asarray(m).astype(np.float32)
alpha = np.clip((alpha - 40) * 255 / 175, 0, 255)
rgba = np.dstack([a, alpha]).astype(np.uint8)
img = Image.fromarray(rgba, "RGBA")
img = img.crop(img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
full = img.copy()
img.thumbnail((720, 720), Image.LANCZOS); img.save(out, optimize=True)
fav = full.copy(); fav.thumbnail((128,128), Image.LANCZOS)
sq = Image.new("RGBA",(128,128),(0,0,0,0)); sq.paste(fav,((128-fav.width)//2,(128-fav.height)//2)); sq.save(out.replace(".png","-icon.png"))
# previews on dark + checker
for name,bgc in [("dark",(7,6,11,255)),("light",(235,235,235,255))]:
    bgim = Image.new("RGBA", full.size, bgc); bgim.alpha_composite(full)
    bgim.convert("RGB").save(sys.argv[4]+f"/prev-{name}.jpg", quality=90)
print(full.size, img.size)
