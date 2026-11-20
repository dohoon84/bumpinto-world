#!/usr/bin/env python3
# [depot] 디자인 자산(/workspace/depot-design) → public/depot/*.webp (지연 로드용으로 작게)
# 상품 아틀라스 1024²: 왼쪽 위 = 앞(±z), 오른쪽 위 = 옆(±x), 왼쪽 아래 = 윗면(±y), 오른쪽 아래 = 예비(계란판 빈 윗면)
import sys, os
from PIL import Image, ImageDraw
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/depot-design'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'depot'); os.makedirs(OUT, exist_ok=True)
PK, SG, FX = f'{SRC}/packages', f'{SRC}/moodboard/signage', f'{SRC}/fx'
Q = 512
def load(p): return Image.open(p).convert('RGBA')
def flat(im, bg):
    b = Image.new('RGBA', im.size, bg); b.alpha_composite(im); return b.convert('RGB')
def fit(im, bg='#F3EADA'): return flat(im, bg).resize((Q, Q), Image.LANCZOS)
def crop(im, box, bg='#F3EADA'):
    w, h = im.size; return fit(im.crop((int(box[0]*w), int(box[1]*h), int(box[2]*w), int(box[3]*h))), bg)
def solid(c): return Image.new('RGB', (Q, Q), c)
def bottles(bg, cap, nx, ny):
    im = Image.new('RGB', (Q, Q), bg); d = ImageDraw.Draw(im)
    for i in range(nx):
        for j in range(ny):
            cx, cy, r = (i + .5) * Q / nx, (j + .5) * Q / ny, min(Q / nx, Q / ny) * .34
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill='#cfe6f5', outline='#8fbfe0', width=6)
            d.ellipse((cx - r * .38, cy - r * .38, cx + r * .38, cy + r * .38), fill=cap)
    return im
def atlas(name, front, side, top, spare=None):
    a = Image.new('RGB', (Q * 2, Q * 2), '#C8965A')
    a.paste(front, (0, 0)); a.paste(side, (Q, 0)); a.paste(top, (0, Q)); a.paste(spare or top, (Q, Q))
    a.save(f'{OUT}/pk-{name}.webp', quality=80, method=6)
kraft = fit(load(f'{PK}/kraft-box-top-tile.png'))
egg_side = fit(load(f'{PK}/egg-30-tray-side.png'))
egg_top = load(f'{PK}/egg-30-tray-top.png'); st = load(f'{PK}/egg-30-label-sticker.png'); st = st.resize((620, int(620 * st.size[1] / st.size[0])), Image.LANCZOS)
egg_top.alpha_composite(st, ((1024 - st.size[0]) // 2, (1024 - st.size[1]) // 2))
atlas('egg', egg_side, egg_side, fit(egg_top, '#d9c08f'), solid('#cdb48a'))
atlas('water', fit(load(f'{PK}/water-2Lx6-front.png'), '#e4f1f8'), fit(load(f'{PK}/water-2Lx6-side.png'), '#e4f1f8'), bottles('#e4f1f8', '#1e6fb8', 3, 2))
rice = load(f'{PK}/rice-20kg-front.png')
atlas('rice', crop(rice, (0, .80, 1, .95)), crop(rice, (0, .80, 1, .95)), fit(rice))
tf = load(f'{PK}/tissue-30roll-front.png')
atlas('tissue', fit(tf), fit(load(f'{PK}/tissue-30roll-side.png')), crop(tf, (0, 0, 1, .3), '#ffffff'))
atlas('ramen', fit(load(f'{PK}/ramen-40-box-front.png')), fit(load(f'{PK}/ramen-40-box-side.png')), kraft)
ch = load(f'{PK}/chips-bigbag-front.png')
atlas('chips', fit(ch, '#3b1d5c'), solid('#42265f'), solid('#3a2257'))
atlas('soda', fit(load(f'{PK}/cola-1.5Lx12-box-front.png')), fit(load(f'{PK}/cola-1.5Lx12-box-side.png')), kraft)
def save(src, name, size, alpha=True):
    im = load(src).resize(size, Image.LANCZOS)
    (im if alpha else im.convert('RGB')).save(f'{OUT}/{name}.webp', quality=85, method=6)
for n in ['01', '02', '03', '05']: save(f'{SG}/aisle-{n}.png', f'aisle-{n}', (512, 256), False)
for n in ['eggs-dairy', 'water-drinks', 'rice-grain', 'ramen-snack', 'household']: save(f'{SG}/hanging-{n}.png', f'hang-{n}', (1024, 256))
save(f'{SG}/rack-safety-upper-stock.png', 'rack-safety', (256, 512), False)
save(f'{SG}/floor-cart-only.png', 'floor-cart-only', (512, 256))
save(f'{SG}/floor-forklift-stencil.png', 'floor-forklift', (512, 512))
save(f'{SG}/floor-hazard-tile.png', 'floor-hazard', (256, 256))
save(f'{SG}/facade-bumpdepot-jeongja.png', 'facade', (1024, 256), False)
save(f'{FX}/decal-egg-crack-1.png', 'egg-crack-1', (128, 128))
save(f'{FX}/decal-egg-crack-2.png', 'egg-crack-2', (128, 128))
save(f'{FX}/decal-yolk-puddle.png', 'yolk-puddle', (256, 256))
save(f'{FX}/decal-yolk-drip.png', 'yolk-drip', (128, 256))
print('ok')

# ---- 2차: 상자 아닌 모양용 (수박·고기 트레이·병 묶음) ----
import random, math
random.seed(7)
def melon():
    im = Image.new('RGB', (Q, Q), '#3f8f3a'); d = ImageDraw.Draw(im)
    for k in range(9):  # 세로(경선) 줄무늬 — 구 UV 에서 u 가 둘레
        x0 = k * Q / 9
        pts = [(x0 + 10 * math.sin(y / 23 + k) + 8 * math.sin(y / 9), y) for y in range(0, Q + 8, 8)]
        d.line(pts, fill='#173f1b', width=26)
    for _ in range(900):
        x, y = random.randrange(Q), random.randrange(Q); d.point((x, y), fill='#5aa84e')
    return im
def meat_top():
    im = Image.new('RGB', (Q, Q), '#f4f4f0'); d = ImageDraw.Draw(im)
    d.rounded_rectangle((30, 40, Q - 30, Q - 40), 40, fill='#c9454a')
    for k in range(5):
        y = 70 + k * 85
        d.rectangle((40, y, Q - 40, y + 14 + (k % 2) * 8), fill='#f3d9cc')
        for _ in range(30):
            x = random.randrange(50, Q - 50); d.ellipse((x, y + 20, x + random.randrange(8, 30), y + 26 + random.randrange(4, 12)), fill='#eabfb3')
    d.rounded_rectangle((Q - 200, Q - 150, Q - 40, Q - 50), 14, fill='#1E5A45')
    d.text((Q - 186, Q - 135), 'BUMP PORK', fill='#F3EADA'); d.text((Q - 186, Q - 110), '1.0kg  25,900', fill='#F2C230')
    return im
def foam_side():
    im = Image.new('RGB', (Q, Q), '#f5f5f2'); d = ImageDraw.Draw(im)
    for y in range(0, Q, 24): d.line((0, y, Q, y), fill='#e6e6e1', width=3)
    return im
atlas('melon', melon(), melon(), melon())
atlas('meat', foam_side(), foam_side(), meat_top())
cf = load(f'{PK}/cola-1.5Lx12-box-front.png')
atlas('soda', crop(cf, (0.04, 0.12, 0.96, 0.72), '#4a1410'), fit(load(f'{PK}/cola-1.5Lx12-box-side.png')), solid('#c62828'))
print('ok2')
