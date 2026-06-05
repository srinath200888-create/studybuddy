"""Generate StudyBuddy + ZeroScroll extension icons."""

from PIL import Image, ImageDraw


def lerp(a, b, t):
    return int(a + (b - a) * t)


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = max(1, round(size * 0.08))
    radius = max(2, round(size * 0.22))

    # Rounded square background with subtle vertical gradient
    for y in range(size):
        t = y / max(size - 1, 1)
        r = lerp(109, 139, t)
        g = lerp(40, 92, t)
        b = lerp(217, 246, t)
        draw.line([(margin, y), (size - margin - 1, y)], fill=(r, g, b, 255))

    # Mask into rounded rect
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle(
        [margin, margin, size - margin - 1, size - margin - 1],
        radius=radius,
        fill=255,
    )
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / max(size - 1, 1)
        r = lerp(109, 139, t)
        g = lerp(40, 92, t)
        b = lerp(217, 246, t)
        bg_draw.line([(margin, y), (size - margin - 1, y)], fill=(r, g, b, 255))
    img = Image.composite(bg, img, mask)
    draw = ImageDraw.Draw(img)

    cx = size / 2
    book_w = size * 0.52
    book_h = size * 0.38
    book_top = size * 0.30
    book_left = cx - book_w / 2
    book_right = cx + book_w / 2
    book_bottom = book_top + book_h
    spine_x = cx
    cover_radius = max(1, round(size * 0.04))
    stroke = max(1, round(size * 0.045))

    white = (255, 255, 255, 245)
    white_soft = (255, 255, 255, 210)

    # Open book — left page
    draw.rounded_rectangle(
        [book_left, book_top, spine_x - stroke * 0.3, book_bottom],
        radius=cover_radius,
        fill=white,
    )

    # Right page
    draw.rounded_rectangle(
        [spine_x + stroke * 0.3, book_top, book_right, book_bottom],
        radius=cover_radius,
        fill=white,
    )

    # Spine
    draw.rectangle(
        [spine_x - stroke * 0.45, book_top, spine_x + stroke * 0.45, book_bottom],
        fill=(255, 255, 255, 255),
    )

    # Page lines (minimal detail, only on larger sizes)
    if size >= 48:
        line_color = (139, 92, 246, 90)
        line_w = max(1, round(size * 0.018))
        line_gap = size * 0.055
        line_len = size * 0.14
        base_y = book_top + size * 0.12

        for i in range(3):
            y = base_y + i * line_gap
            draw.rounded_rectangle(
                [book_left + size * 0.07, y, book_left + size * 0.07 + line_len, y + line_w],
                radius=line_w,
                fill=line_color,
            )
            draw.rounded_rectangle(
                [spine_x + size * 0.08, y, spine_x + size * 0.08 + line_len, y + line_w],
                radius=line_w,
                fill=line_color,
            )

    # ZeroScroll pause bar — minimal pill at bottom
    bar_w = size * 0.34
    bar_h = max(2, round(size * 0.07))
    bar_top = size * 0.72
    bar_left = cx - bar_w / 2
    draw.rounded_rectangle(
        [bar_left, bar_top, bar_left + bar_w, bar_top + bar_h],
        radius=bar_h,
        fill=white_soft,
    )

    # Two pause segments
    seg_gap = max(1, round(size * 0.04))
    seg_w = max(1, round(size * 0.05))
    seg_h = max(2, round(size * 0.11))
    seg_top = bar_top - (seg_h - bar_h) / 2
    draw.rounded_rectangle(
        [cx - seg_gap / 2 - seg_w, seg_top, cx - seg_gap / 2, seg_top + seg_h],
        radius=max(1, round(size * 0.02)),
        fill=white,
    )
    draw.rounded_rectangle(
        [cx + seg_gap / 2, seg_top, cx + seg_gap / 2 + seg_w, seg_top + seg_h],
        radius=max(1, round(size * 0.02)),
        fill=white,
    )

    return img


def main():
    out_dir = "assets"
    sizes = [16, 48, 128]
    for size in sizes:
        icon = draw_icon(size)
        path = f"{out_dir}/icon{size}.png"
        icon.save(path, "PNG", optimize=True)
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
