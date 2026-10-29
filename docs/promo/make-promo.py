"""Render promo cards for dsh-pet-chat (宠物聊天).

Usage: python make-promo.py
Outputs PNGs into bili-pet/release/promo/ (1600x1000 each).

NOTE: this file contains Chinese text. Edit it with the editor/Node, never with
PowerShell Get-Content/Set-Content round-trips (GBK decode destroys it).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 2  # supersample: draw at 2x then downscale
W, H = 1600 * S, 1000 * S

HERE = Path(__file__).resolve().parent
SHOTS = HERE.parent / "data" / "shots"
OUT = HERE / "promo"
OUT.mkdir(parents=True, exist_ok=True)

FONTS = {
    "h1": ("C:/Windows/Fonts/msyhbd.ttc", 92 * S),
    "h2": ("C:/Windows/Fonts/msyhbd.ttc", 54 * S),
    "h3": ("C:/Windows/Fonts/msyhbd.ttc", 34 * S),
    "lead": ("C:/Windows/Fonts/msyh.ttc", 31 * S),
    "body": ("C:/Windows/Fonts/msyh.ttc", 27 * S),
    "small": ("C:/Windows/Fonts/msyh.ttc", 22 * S),
    "mono": ("C:/Windows/Fonts/consola.ttf", 26 * S),
    "monob": ("C:/Windows/Fonts/consolab.ttf", 30 * S),
}
_fc = {}


def font(name):
    if name not in _fc:
        path, size = FONTS[name]
        _fc[name] = ImageFont.truetype(path, size)
    return _fc[name]


INK = (236, 243, 255, 255)
MUTED = (163, 183, 208, 255)
DIM = (124, 145, 172, 255)
CYAN = (86, 184, 255, 255)
PINK = (255, 134, 184, 255)
GREEN = (110, 231, 168, 255)


def sc(v):
    return int(round(v * S))


def gradient(size, top, bottom):
    img = Image.new("RGB", (1, size[1]))
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        img.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return img.resize(size)


def background():
    img = gradient((W, H), (9, 15, 30), (16, 26, 46)).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([sc(-260), sc(-300), sc(760), sc(560)], fill=(58, 122, 255, 70))
    g.ellipse([sc(980), sc(560), sc(1980), sc(1350)], fill=(255, 92, 162, 55))
    g.ellipse([sc(1080), sc(-320), sc(1820), sc(360)], fill=(86, 184, 255, 45))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(sc(150))))
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, sc(64)):
        gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 8), width=1)
    for y in range(0, H, sc(64)):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 8), width=1)
    return Image.alpha_composite(img, grid)


def text(d, xy, s, fname, fill=INK):
    d.text((sc(xy[0]), sc(xy[1])), s, font=font(fname), fill=fill)


def measure(s, fname):
    return font(fname).getbbox(s)[2] / S


def wrap(s, fname, maxw):
    lines, cur = [], ""
    for ch in s:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        if measure(cur + ch, fname) > maxw and cur:
            lines.append(cur)
            cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    orphan = "。，、；：！？）」』…·%"
    fixed = []
    for line in lines:
        if fixed and line and line[0] in orphan:
            fixed[-1] += line[0]
            line = line[1:]
        if line:
            fixed.append(line)
    return fixed


def para(d, xy, s, fname, maxw, fill=INK, lh=1.4):
    y = xy[1]
    for line in wrap(s, fname, maxw):
        text(d, (xy[0], y), line, fname, fill)
        y += FONTS[fname][1] / S * lh
    return y


def badge(img, xy, s):
    d = ImageDraw.Draw(img)
    w = measure(s, "small") + 46
    d.rounded_rectangle([sc(xy[0]), sc(xy[1]), sc(xy[0] + w), sc(xy[1] + 44)],
                        radius=sc(22), fill=(86, 184, 255, 34),
                        outline=(86, 184, 255, 90), width=sc(1.5))
    text(d, (xy[0] + 23, xy[1] + 9), s, "small", CYAN)


def bullet(d, xy, title, desc, accent=CYAN, maxw=640):
    cx, cy = xy
    d.ellipse([sc(cx), sc(cy + 8), sc(cx + 22), sc(cy + 30)], fill=accent)
    d.ellipse([sc(cx + 7), sc(cy + 15), sc(cx + 15), sc(cy + 23)], fill=(9, 15, 30, 255))
    text(d, (cx + 42, cy), title, "h3", INK)
    y = cy + 56
    for line in wrap(desc, "body", maxw):
        text(d, (cx + 42, y), line, "body", MUTED)
        y += FONTS["body"][1] / S * 1.34
    return y


def screenshot(path, box, width):
    """width is in final pixels; the returned tile is supersampled by S."""
    im = Image.open(path).convert("RGB")
    if box:
        im = im.crop(box)
    w_target = int(width * S)
    im = im.resize((w_target, int(im.height * w_target / im.width)), Image.LANCZOS)
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=sc(18), fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    ImageDraw.Draw(out).rounded_rectangle([0, 0, w - 1, h - 1], radius=sc(18),
                                          outline=(255, 255, 255, 60), width=sc(1.5))
    return out


def place_shot(img, shot, x, y):
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    box = [sc(x), sc(y + 20), sc(x) + shot.width, sc(y + 20) + shot.height]
    ImageDraw.Draw(sh).rounded_rectangle(box, radius=sc(20), fill=(0, 0, 0, 150))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(sc(34))))
    img.alpha_composite(shot, (sc(x), sc(y)))


def foot(d, s="dsh-pet-chat  ·  github.com/lintwosix-beep/dsh-pet-chat", y=944):
    text(d, (90, y), s, "small", DIM)


SCENE = (330, 350, 1000, 930)  # 宠物 + 面板 同框


def forward_mock(img, x, y, w):
    """A QQ-style merged-forward card mock (result of 合并到主对话)."""
    h = 186
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([sc(x), sc(y + 16), sc(x + w), sc(y + h + 16)],
                                         radius=sc(18), fill=(0, 0, 0, 140))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(sc(26))))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([sc(x), sc(y), sc(x + w), sc(y + h)], radius=sc(18),
                        fill=(248, 251, 255, 255), outline=(214, 228, 244, 255), width=sc(1.5))
    # icon: two stacked bars (merge glyph) instead of an emoji
    d.rounded_rectangle([sc(x + 22), sc(y + 22), sc(x + 62), sc(y + 62)], radius=sc(10),
                        fill=(226, 238, 255, 255))
    for dy, ww in ((16, 22), (26, 16)):
        d.rounded_rectangle([sc(x + 32), sc(y + 22 + dy), sc(x + 32 + ww), sc(y + 26 + dy)],
                            radius=sc(2), fill=(74, 140, 220, 255))
    text(d, (x + 78, y + 20), "矩阵初等变换", "h3", (34, 48, 68, 255))
    text(d, (x + 78, y + 70), "姬：初等变换有哪三类", "small", (118, 134, 158, 255))
    text(d, (x + 78, y + 100), "小女仆：换两行、一行乘非零数、一行加到另一行", "small", (118, 134, 158, 255))
    d.line([sc(x + 22), sc(y + 138), sc(x + w - 22), sc(y + 138)], fill=(226, 234, 244, 255), width=sc(1))
    text(d, (x + 22, y + 148), "查看 2 条聊天记录 ›", "small", (58, 130, 214, 255))
    return h


def hotzone_mock(img, x, y, w, h):
    """A small diagram: a window with 8 drag handles."""
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([sc(x), sc(y), sc(x + w), sc(y + h)], radius=sc(14),
                        fill=(255, 255, 255, 26), outline=(120, 190, 255, 150), width=sc(2))
    d.line([sc(x), sc(y + 44), sc(x + w), sc(y + 44)], fill=(120, 190, 255, 90), width=sc(1.5))
    d.ellipse([sc(x + 16), sc(y + 16), sc(x + 30), sc(y + 30)], fill=(255, 134, 184, 200))
    pts = [(x, y), (x + w / 2, y), (x + w, y), (x, y + h / 2), (x + w, y + h / 2),
           (x, y + h), (x + w / 2, y + h), (x + w, y + h)]
    for cx, cy in pts:
        d.rounded_rectangle([sc(cx - 9), sc(cy - 9), sc(cx + 9), sc(cy + 9)], radius=sc(5),
                            fill=(110, 231, 168, 255))
    text(d, (x, y + h + 18), "八个热区都能拖，角落也能拉", "small", GREEN)
    return d


def card_hero():
    img = background()
    d = ImageDraw.Draw(img)
    badge(img, (90, 92), "DSH 插件 · 桌宠增强")
    text(d, (90, 168), "宠物聊天", "h1")
    text(d, (90, 298), "dsh-pet-chat", "monob", CYAN)
    para(d, (90, 356), "给小女仆装一个 QQ 级的聊天面板：记录、收藏、支线对话，聊完还能合并成转发卡片。",
         "lead", 660, INK, 1.42)

    y = 500
    for t, s in (
        ("面板停在宠物右侧", "双击宠物开面板，她自动让位到左边，不再被挡住。"),
        ("聊天不再一闪而过", "QQ 风格记录 + 关键词搜索 + 日历筛选，随时回看。"),
        ("一条对话约 140 token", "原版约 560；寒暄走本地规则，不花一分钱。"),
    ):
        y = bullet(d, (90, y), t, s) + 36

    shot = screenshot(SHOTS / "panel-dock-branch.png", SCENE, 690)
    place_shot(img, shot, 820, 118)

    chip = [820, 726, 1510, 846]
    d.rounded_rectangle([sc(chip[0]), sc(chip[1]), sc(chip[2]), sc(chip[3])], radius=sc(18),
                        fill=(86, 184, 255, 30), outline=(86, 184, 255, 90), width=sc(1.5))
    text(d, (866, 746), "568 → 140 token / 条", "h3", CYAN)
    text(d, (866, 800), "关掉配图 · 记忆 5→2 轮 · 本地寒暄", "small", MUTED)
    foot(d)
    return img


def card_compare():
    img = background()
    d = ImageDraw.Draw(img)
    badge(img, (90, 74), "为什么换它")
    text(d, (90, 144), "原版 vs 加强版", "h2")
    text(d, (90, 218), "同一只小女仆，多出来的是这些", "lead", MUTED)

    rows = [
        ("对话记录", "气泡一闪即逝", "QQ 列表：头像 / 时间 / 日期分隔"),
        ("搜索筛选", "没有", "关键词搜索 + 自绘月历按天筛"),
        ("收藏", "没有", "右键收藏任意一条，收藏页集中回看"),
        ("支线对话", "没有", "＋分支 → 起名 → 合并成转发卡片"),
        ("面板位置", "盖住宠物本体", "停靠宠物右侧，宠物自动让位"),
        ("调整大小", "固定小窗", "八向边缘拖拽，像正常窗口一样"),
        ("聊天成本", "≈ 560 token / 条", "≈ 140 token / 条（-75%）"),
        ("表情包配图", "每轮重发 10 张清单", "默认关闭，想开再开"),
    ]

    x0, x1, x2 = 90, 440, 900
    y = 300
    text(d, (x0, y), "能力", "small", DIM)
    text(d, (x1, y), "原版 dsh-pet 0.3.8", "small", DIM)
    text(d, (x2, y), "宠物聊天 dsh-pet-chat", "small", CYAN)
    y += 44
    d.line([sc(90), sc(y), sc(1510), sc(y)], fill=(255, 255, 255, 30), width=sc(1.5))
    y += 30
    for i, (name, old, new) in enumerate(rows):
        text(d, (x0, y), name, "body", INK)
        text(d, (x1, y), old, "body", DIM)
        text(d, (x2, y), new, "body", INK if i != 6 else CYAN)
        y += 68
        if i < len(rows) - 1:
            d.line([sc(90), sc(y - 22), sc(1510), sc(y - 22)], fill=(255, 255, 255, 14), width=sc(1))
    foot(d)
    return img


def card_branch():
    img = background()
    d = ImageDraw.Draw(img)
    badge(img, (90, 92), "分支对话")
    text(d, (90, 168), "聊完的支线，", "h2")
    text(d, (90, 238), "变成一条聊天记录", "h2")
    y = 356
    for t, s in (
        ("＋ 分支：先起个名", "标签栏点 ＋，黄条里写名字，这条支线不进主记录。"),
        ("合并成 QQ 转发卡片", "点「合并到主对话」，主记录里落一张「查看 N 条」卡片。"),
        ("右键改名 / 删除", "改名同步卡片标题；删掉只是撤卡，内容回到主记录不丢。"),
    ):
        y = bullet(d, (90, y), t, s, PINK) + 34
    shot = screenshot(SHOTS / "panel-branch-menu.png", (0, 40, 650, 470), 690)
    place_shot(img, shot, 830, 150)
    text(d, (830, 636), "合并后落在「对话记录」里，就是这张卡片", "small", MUTED)
    forward_mock(img, 830, 676, 690)
    foot(d)
    return img


def card_dock():
    img = background()
    d = ImageDraw.Draw(img)
    badge(img, (90, 92), "停靠与缩放")
    text(d, (90, 168), "贴在小女仆右边，", "h2")
    text(d, (90, 238), "八向随便拖", "h2")
    y = 356
    for t, s in (
        ("双击开面板，宠物让位", "精灵按本体宽度左移，面板落在她右边，永远不重叠。"),
        ("八个热区改大小", "上下左右 + 四角，像普通窗口；停靠时左/上边钉住。"),
        ("尺寸记进设置", "下次打开还是你上次拖的大小，也能在设置里输数字。"),
    ):
        y = bullet(d, (90, y), t, s, GREEN) + 34
    shot = screenshot(SHOTS / "panel-dock-branch.png", SCENE, 690)
    place_shot(img, shot, 820, 150)
    text(d, (820, 762), "宠物在左、面板在右，间距固定 10px", "small", MUTED)
    hotzone_mock(img, 112, 728, 318, 132)
    foot(d)
    return img


def card_install():
    img = background()
    d = ImageDraw.Draw(img)
    badge(img, (90, 92), "安装")
    text(d, (90, 168), "装它", "h1")
    text(d, (90, 300), "一行命令，从 GitHub 直接装（不需要 npm 发布）", "lead", MUTED)

    box = [90, 386, 1510, 486]
    d.rounded_rectangle([sc(box[0]), sc(box[1]), sc(box[2]), sc(box[3])], radius=sc(20),
                        fill=(255, 255, 255, 16), outline=(86, 184, 255, 110), width=sc(2))
    text(d, (120, 414), "dsh plugin add github:lintwosix-beep/dsh-pet-chat", "monob", CYAN)

    notes = [
        ("和原版二选一", "两者都注册同一个入口 id，同时装会冲突 —— 先卸 dsh-pet 再装它。"),
        ("MIT 二次开发", "基于 PC2005-cloud/dsh-pet 0.3.8，保留原署名；改动全部在插件内部。"),
        ("市场也能搜到", "已提交 awesome-dsh-plugin 精选列表，合并后在 fun 分类搜「宠物聊天」。"),
    ]
    y = 552
    for t, s in notes:
        d.ellipse([sc(96), sc(y + 10), sc(110), sc(y + 24)], fill=CYAN)
        text(d, (128, y), t, "h3", INK)
        para(d, (128, y + 56), s, "body", 1000, MUTED, 1.32)
        y += 124

    text(d, (128, 936), "github.com/lintwosix-beep/dsh-pet-chat", "small", DIM)
    return img


def main():
    cards = {
        "01-hero.png": card_hero,
        "02-compare.png": card_compare,
        "03-branch.png": card_branch,
        "04-dock.png": card_dock,
        "05-install.png": card_install,
    }
    for name, fn in cards.items():
        fn().resize((1600, 1000), Image.LANCZOS).save(OUT / name)
        print("wrote", name)


if __name__ == "__main__":
    main()
