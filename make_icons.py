"""Génère les icônes de Dépanne (clé à molette sur fond dégradé bleu nuit)."""
from PIL import Image, ImageDraw
import math

def gradient(size):
    img = Image.new("RGB", (size, size))
    top = (13, 26, 46)      # #0d1a2e
    bot = (24, 42, 73)      # #182a49
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bot[0]-top[0]) * t)
        g = int(top[1] + (bot[1]-top[1]) * t)
        b = int(top[2] + (bot[2]-top[2]) * t)
        for x in range(size):
            img.putpixel((x, y), (r, g, b))
    return img

def make(size, path):
    img = gradient(size).convert("RGBA")
    d = ImageDraw.Draw(img)
    # halo accent
    cx, cy = size*0.5, size*0.42
    for i, rad in enumerate(range(int(size*0.42), 0, -6)):
        a = int(10 * (1 - i/ (size*0.42/6)))
        d.ellipse([cx-rad, cy-rad, cx+rad, cy+rad], fill=(61,139,255, max(0,a)))

    accent = (77, 171, 255, 255)
    # Corps de la clé (barre diagonale)
    w = size*0.10
    x1, y1 = size*0.30, size*0.68
    x2, y2 = size*0.66, size*0.32
    d.line([(x1,y1),(x2,y2)], fill=accent, width=int(w))
    # Têtes (anneaux) aux deux bouts
    r = size*0.115
    for (hx,hy) in [(size*0.28,size*0.70),(size*0.68,size*0.30)]:
        d.ellipse([hx-r,hy-r,hx+r,hy+r], outline=accent, width=int(size*0.045))
    # Éclair (idée / solution)
    lc = (49, 208, 170, 255)
    bx, by = size*0.60, size*0.60
    s = size*0.16
    bolt = [(bx, by), (bx-s*0.5, by+s*0.55), (bx-s*0.08, by+s*0.55),
            (bx-s*0.35, by+s*1.1), (bx+s*0.5, by+s*0.4), (bx+s*0.05, by+s*0.4)]
    d.polygon(bolt, fill=lc)

    img.save(path)
    print("écrit", path)

make(192, "icons/icon-192.png")
make(512, "icons/icon-512.png")
