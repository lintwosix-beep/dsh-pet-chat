"""Render the vertical (1080x1920, 9:16) Douyin-style frame set for dsh-pet-chat.

Usage: python make-promo-v.py
Outputs PNGs into bili-pet/release/promo-v/ (1080x1920 each).

NOTE: this file contains Chinese text. Edit it with the editor, never with
PowerShell Get-Content/Set-Content round-trips (GBK decode destroys it).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SS = 2  # supersample factor
W, H = 1080 * SS, 1920 * SS

HERE = Path(__file__).resolve().parent
SHOTS = HERE.parent / "data" / "shots"
OUT = HERE / "promo-v"
OUT.mkdir(parents=True, exist_ok=True)

FONTS = {
    "xl": ("C:/Windows/Fonts/msyhbd.ttc", 118 * SS),
    "hero": ("C:/Windows/Fonts/msyhbd.ttc", 86 * SS),
    "h2": ("C:/Windows/Fonts/msyhbd.ttc", 58 * SS),
    "h3": ("C:/Windows/Fonts/msyhbd.ttc", 44 * SS),
    "lead": ("C:/Windows/Fonts/msyh.ttc", 40 * SS),
    "body": ("C:/Windows/Fonts/msyh.ttc", 35 * SS),
    "small": ("C:/Windows/Fonts/msyh.ttc", 27 * SS),
    "mono": ("C:/Windows/Fonts/consolab.ttf", 32 * SS),
}
_fc = {}


def font(name):
    if name not in _fc:
        path, size = FONTS[name]
        _fc[name] = ImageFont.truetype(path, size)
    return _fc[name]


def size_of(name):
    return FONTS[name][1] / SS


INK = (240, 246, 255, 255)
MUTED = (162, 184, 210, 255)
DIM = (124, 145, 174, 255)
CYAN = (86, 184, 255, 255)
PINK = (255, 134, 184, 255)
GREEN = (110, 231, 168, 255)
WARN = (255, 196, 92, 255)


def sc(v):
    return int(round(v * SS))


def gradient(size, top, bottom):
    strip = Image.new("RGB", (1, size[1]))
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        strip.putpixel((0, y), tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return strip.resize(size)


def background(top=(8, 13, 28), bottom=(14, 22, 40)):
    img = gradient((W, H), top, bottom).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([sc(-240), sc(-260), sc(560), sc(520)], fill=(58, 122, 255, 78))
    g.ellipse([sc(700), sc(1180), sc(1400), sc(2000)], fill=(255, 92, 162, 62))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(sc(140))))
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, sc(54)):
        gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 7), width=1)
    for y in range(0, H, sc(54)):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 7), width=1)
    return Image.alpha_composite(img, grid)


def rect(img, xy, radius, fill=None, outline=None, width=1.6):
    """Translucent rounded box drawn on its own layer (ImageDraw does not blend)."""
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rounded_rectangle(
        [sc(xy[0]), sc(xy[1]), sc(xy[2]), sc(xy[3])], radius=sc(radius), fill=fill,
        outline=outline, width=sc(width) if outline else 0)
    return Image.alpha_composite(img, ov)


def text(d, xy, s, fname, fill=INK):
    d.text((sc(xy[0]), sc(xy[1])), s, font=font(fname), fill=fill)


def measure(s, fname):
    return font(fname).getbbox(s)[2] / SS


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


def para(d, xy, s, fname, maxw, fill=INK, lh=1.44):
    y = xy[1]
    for line in wrap(s, fname, maxw):
        text(d, (xy[0], y), line, fname, fill)
        y += size_of(fname) * lh
    return y


def pill(img, xy, s, accent=CYAN):
    w = measure(s, "small") + 52
    img = rect(img, (xy[0], xy[1], xy[0] + w, xy[1] + 54), 27,
               (86, 184, 255, 40), (86, 184, 255, 110), 1.8)
    text(ImageDraw.Draw(img), (xy[0] + 26, xy[1] + 10), s, "small", accent)
    return img


def bullet(img, xy, title, desc, accent=CYAN, maxw=820):
    d = ImageDraw.Draw(img)
    cx, cy = xy
    d.ellipse([sc(cx), sc(cy + 12), sc(cx + 24), sc(cy + 36)], fill=accent)
    text(d, (cx + 46, cy), title, "h3", INK)
    y = cy + size_of("h3") + 8
    for line in wrap(desc, "body", maxw):
        text(d, (cx + 46, y), line, "body", MUTED)
        y += size_of("body") * 1.36
    return y


def screenshot(path, box, width):
    im = Image.open(path).convert("RGB")
    if box:
        im = im.crop(box)
    w_target = int(width * SS)
    im = im.resize((w_target, int(im.height * w_target / im.width)), Image.LANCZOS)
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=sc(26), fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    ImageDraw.Draw(out).rounded_rectangle([0, 0, w - 1, h - 1], radius=sc(26),
                                          outline=(255, 255, 255, 70), width=sc(1.6))
    return out


def place_shot(img, shot, x, y):
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [sc(x), sc(y + 24), sc(x) + shot.width, sc(y + 24) + shot.height],
        radius=sc(30), fill=(0, 0, 0, 165))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(sc(40))))
    img.alpha_composite(shot, (sc(x), sc(y)))
    return img


def footer(img, idx, total):
    d = ImageDraw.Draw(img)
    text(d, (72, 1780), "dsh-pet-chat", "small", DIM)
    label = f"{idx}/{total}"
    text(d, (1008 - measure(label, "small"), 1780), label, "small", DIM)
    for i in range(total):
        cx = 74 + i * 30
        d.ellipse([sc(cx), sc(1834), sc(cx + 10), sc(1844)],
                  fill=(255, 255, 255, 200) if i == idx - 1 else (255, 255, 255, 55))
    return img


# 角色 + 面板（含小女仆本体），从 2048x1152 桌面截图里裁
PANEL = (384, 398, 978, 916)
# 标签栏 + 右键菜单
BRANCH = (30, 118, 640, 470)
TOTAL = 6


def f1_cover():
    img = background((7, 11, 26), (16, 26, 48))
    img = pill(img, (72, 176), "DSH 插件 · 桌宠增强")
    d = ImageDraw.Draw(img)
    text(d, (72, 268), "我给桌宠", "xl")
    text(d, (72, 404), "装了个 QQ", "xl", CYAN)
    para(d, (72, 580), "聊一句的 token 砍掉 75%；收藏、分支、合并转发——她终于有聊天记录了。",
         "lead", 930, MUTED, 1.46)

    shot = screenshot(SHOTS / "panel-dock-branch.png", PANEL, 660)
    place_shot(img, shot, 210, 790)

    # 三个标签横排
    xs = 72
    for t, acc in (("QQ 风格记录", CYAN), ("右键收藏", WARN), ("＋ 分支", PINK)):
        w = measure(t, "body") + 44
        img = rect(img, (xs, 1430, xs + w, 1492), 31, (255, 255, 255, 24), (255, 255, 255, 58), 1.4)
        text(ImageDraw.Draw(img), (xs + 22, 1442), t, "body", acc)
        xs += w + 18

    img = rect(img, (72, 1586, 1008, 1662), 22, (255, 255, 255, 18), (86, 184, 255, 96), 1.6)
    text(ImageDraw.Draw(img), (100, 1602), "开源 · 基于 dsh-pet（MIT）二次开发", "small", MUTED)
    return footer(img, 1, TOTAL)


def f2_problem():
    img = background((12, 12, 24), (26, 16, 34))
    img = pill(img, (72, 176), "问题在哪", WARN)
    d = ImageDraw.Draw(img)
    text(d, (72, 268), "聊一句", "hero")
    text(d, (72, 380), "要 560 个 token", "hero", WARN)

    y = 560
    for name, val, note, hot in (
        ("人设 system", "84", "每轮都发", False),
        ("5 轮历史", "116", "每轮都发", False),
        ("10 张表情包清单", "340", "占 61%", True),
    ):
        img = rect(img, (72, y, 1008, y + 128), 22, (255, 255, 255, 20))
        d = ImageDraw.Draw(img)
        text(d, (106, y + 24), name, "h3", INK)
        text(d, (106, y + 82), note, "small", DIM)
        text(d, (1008 - 40 - measure(val, "hero"), y + 18), val, "hero", WARN if hot else MUTED)
        y += 148

    d = ImageDraw.Draw(img)
    para(d, (72, 1030), "表情包指令每轮重发，还破坏了前缀缓存——光配图就吃掉一半以上的钱。",
         "body", 900, MUTED, 1.44)

    img = rect(img, (72, 1250, 1008, 1466), 24, (255, 196, 92, 30), (255, 196, 92, 120), 1.8)
    d = ImageDraw.Draw(img)
    text(d, (108, 1276), "≈ 1 元 / 1000 句", "h2", WARN)
    text(d, (108, 1368), "DeepSeek 价，按每句 560 输入 token 估", "small", MUTED)
    text(d, (108, 1510), "再加上每 5 分钟一次的碎碎念，一天又是 1.4 万 token", "small", DIM)
    return footer(img, 2, TOTAL)


def f3_fix():
    img = background((8, 14, 28), (10, 26, 40))
    img = pill(img, (72, 176), "改了什么", GREEN)
    d = ImageDraw.Draw(img)
    text(d, (72, 268), "三件事", "hero")
    text(d, (72, 380), "560 → 140", "xl", CYAN)

    y = 580
    for t, s in (
        ("配图默认关", "想开再开，清单不再每轮重发"),
        ("记忆 5 轮 → 2 轮", "闲聊用不上那么长的上下文"),
        ("寒暄走本地规则", "「在吗」「晚安」「好累」0 token、0 延迟"),
    ):
        y = bullet(img, (72, y), t, s, GREEN, 860) + 52

    img = rect(img, (72, 1230, 1008, 1440), 24, (110, 231, 168, 30), (110, 231, 168, 120), 1.8)
    d = ImageDraw.Draw(img)
    text(d, (108, 1256), "一天聊 50 句", "h3", INK)
    text(d, (108, 1324), "28,000 → 7,000 token", "h2", GREEN)
    text(d, (108, 1390), "约 0.14 元 → 0.03 元，降 80%", "small", MUTED)
    text(d, (108, 1490), "一句闲聊 ≈ 140 token —— 正常聊天，基本不花钱", "small", DIM)
    return footer(img, 3, TOTAL)


def f4_dock():
    img = background((8, 13, 28), (14, 24, 42))
    img = pill(img, (72, 176), "面板不挡脸", CYAN)
    d = ImageDraw.Draw(img)
    text(d, (72, 268), "她让到左边", "hero")
    text(d, (72, 372), "面板贴右边", "hero", CYAN)

    shot = screenshot(SHOTS / "panel-dock-branch.png", PANEL, 940)
    place_shot(img, shot, 70, 490)

    y = 1384
    for t in ("双击开面板，宠物自动左移让位", "八向边缘拖拽改大小，像普通窗口", "尺寸记进设置，下次还一样"):
        d = ImageDraw.Draw(img)
        d.ellipse([sc(76), sc(y + 10), sc(96), sc(y + 30)], fill=CYAN)
        text(d, (116, y), t, "body", MUTED)
        y += 66
    text(ImageDraw.Draw(img), (72, 1614), "宠物贴窗口左缘，面板落她右边固定 10px，右侧不够就压窄面板", "small", DIM)
    return footer(img, 4, TOTAL)


def f5_branch():
    img = background((12, 12, 26), (24, 16, 36))
    img = pill(img, (72, 176), "分支对话", PINK)
    d = ImageDraw.Draw(img)
    text(d, (72, 268), "聊完的支线", "hero")
    text(d, (72, 372), "变成一条记录", "hero", PINK)

    shot = screenshot(SHOTS / "panel-branch-menu.png", BRANCH, 940)
    place_shot(img, shot, 70, 500)

    d = ImageDraw.Draw(img)
    text(d, (72, 1082), "合并后，主记录里是这样一张卡片", "small", MUTED)

    x, y0, w, h = 72, 1126, 936, 224
    img = rect(img, (x, y0, x + w, y0 + h), 24, (248, 251, 255, 255), (214, 228, 244, 255), 2)
    d = ImageDraw.Draw(img)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([sc(x + 26), sc(y0 + 26), sc(x + 74), sc(y0 + 74)], radius=sc(12),
                        fill=(226, 238, 255, 255))
    for dy, ww in ((18, 26), (30, 18)):
        d.rounded_rectangle([sc(x + 38), sc(y0 + 26 + dy), sc(x + 38 + ww), sc(y0 + 31 + dy)],
                            radius=sc(3), fill=(74, 140, 220, 255))
    text(d, (x + 92, y0 + 24), "矩阵初等变换", "h3", (34, 48, 68, 255))
    text(d, (x + 92, y0 + 88), "姬：初等变换有哪三类", "small", (118, 134, 158, 255))
    text(d, (x + 92, y0 + 128), "小女仆：换两行、一行乘非零数…", "small", (118, 134, 158, 255))
    d.line([sc(x + 26), sc(y0 + 176), sc(x + w - 26), sc(y0 + 176)],
           fill=(226, 234, 244, 255), width=sc(1.4))
    text(d, (x + 26, y0 + 186), "查看 2 条聊天记录 ›", "small", (58, 130, 214, 255))

    para(d, (72, 1420), "分支里聊的不进主记录；点「合并到主对话」才落成卡片。右键可改名或删除——删了只是撤卡，那几句回到主记录。",
         "body", 930, MUTED, 1.44)
    return footer(img, 5, TOTAL)


def f6_cta():
    img = background((7, 11, 26), (18, 20, 40))
    img = pill(img, (72, 176), "怎么装", GREEN)
    d = ImageDraw.Draw(img)
    text(d, (72, 268), "一行命令", "hero")
    text(d, (72, 372), "不用 npm", "hero", GREEN)

    img = rect(img, (72, 520, 1008, 700), 22, (255, 255, 255, 22), (86, 184, 255, 120), 2)
    d = ImageDraw.Draw(img)
    for i, line in enumerate(("dsh plugin add \\", "  github:lintwosix-beep/dsh-pet-chat")):
        text(d, (106, 556 + i * 52), line, "mono", CYAN)

    y = 780
    for t, s, acc in (
        ("从 GitHub 直接装", "不用发布 npm，也不用本地构建", CYAN),
        ("和原版二选一", "两者共用同一份数据目录与桌面窗口，同装会冲突", WARN),
        ("开源可改", "基于 dsh-pet（MIT）二次开发，保留原署名", GREEN),
    ):
        y = bullet(img, (72, y), t, s, acc, 880) + 44

    img = rect(img, (72, 1290, 1008, 1470), 24, (255, 255, 255, 20), (255, 255, 255, 55), 1.6)
    d = ImageDraw.Draw(img)
    text(d, (108, 1314), "已上架 awesome-dsh-plugin", "h3", INK)
    text(d, (108, 1378), "插件市场搜「宠物聊天」或 dsh-pet-chat", "body", MUTED)
    text(d, (108, 1428), "站点：awesome-dsh-plugin.com", "small", DIM)

    text(d, (72, 1550), "github.com/lintwosix-beep/dsh-pet-chat", "body", DIM)
    return footer(img, 6, TOTAL)


def main():
    frames = {
        "01-cover.png": f1_cover,
        "02-problem.png": f2_problem,
        "03-fix.png": f3_fix,
        "04-dock.png": f4_dock,
        "05-branch.png": f5_branch,
        "06-install.png": f6_cta,
    }
    for name, fn in frames.items():
        fn().convert("RGB").resize((1080, 1920), Image.LANCZOS).save(OUT / name, quality=95)
        print("wrote", name)


if __name__ == "__main__":
    main()
