# [depot] 계산대 구역 자산: 디자이너 원본(/workspace/depot-design) → public/depot/co-*.webp
from PIL import Image
SRC = '/workspace/depot-design'; OUT = 'public/depot'
def save(im, name, w=None, q=82):
    if w and im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(f'{OUT}/{name}.webp', 'WEBP', quality=q, method=6); print(name, im.size)
save(Image.open(f'{SRC}/moodboard/signage/membership-card-goldbeom.png').convert('RGBA'), 'co-member-card', 480)
save(Image.open(f'{SRC}/moodboard/signage/floor-arrow-checkout.png').convert('RGBA'), 'co-floor-arrow', 512)
save(Image.open(f'{SRC}/moodboard/logo-icon-boxbeom.png').convert('RGBA'), 'co-stamp-beom', 256)
